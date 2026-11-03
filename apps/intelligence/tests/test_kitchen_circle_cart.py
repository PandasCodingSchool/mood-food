from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.kitchen_circle.cart import build_preview
from app.kitchen_circle.cart_schemas import CartItem, CartPreviewRequest
from app.kitchen_circle.grocery_provider import FixtureGroceryProvider, InstamartKitchenCircleAdapter
from app.kitchen_circle.packs import PackOption, optimize, parse_pack
from app.main import app

client = TestClient(app)


def line(name, quantity=None, unit=None, dimension=None, base=None, line_id=None):
    return {"line_id": line_id or name, "name": name, "canonical_name": name, "quantity": quantity, "unit": unit, "dimension": dimension, "base_quantity": base}


def test_parse_pack_labels():
    assert (parse_pack("500 g").dimension, parse_pack("500 g").base) == ("mass", 500)
    assert parse_pack("1.5 kg").base == 1500
    assert parse_pack("2 x 200 g").base == 400
    assert parse_pack("200 g x 3").base == 600
    assert (parse_pack("1 l").dimension, parse_pack("1 Ltr").base) == ("volume", 1000)
    assert (parse_pack("6 pcs").dimension, parse_pack("6 pcs").base) == ("piece", 6)
    assert parse_pack("1 dozen").base == 12
    approx = parse_pack("1 pc (approx. 400-600 g)")
    assert (approx.dimension, approx.base, approx.approx_grams) == ("piece", 1, 500)
    assert parse_pack("1 bunch").dimension == "bunch"
    assert parse_pack("assorted") is None


def test_plan_example_1_65_kg_chicken_with_300_g_packs():
    plan = optimize(1650, [PackOption("s", None, "300 g", 300, 179.0)])
    assert [(o.label, n) for o, n in plan.counts] == [("300 g", 6)]
    assert (plan.purchased, plan.surplus) == (1800, 150)


def test_optimizer_prefers_cheapest_real_combination_then_least_surplus():
    options = [PackOption("a", None, "500 g", 500, 92.0), PackOption("b", None, "1 kg", 1000, 176.0)]
    plan = optimize(1200, options)  # 1 kg + 500 g = ₹268 beats 3 × 500 g = ₹276
    assert sorted((o.label, n) for o, n in plan.counts) == [("1 kg", 1), ("500 g", 1)]
    assert plan.cost == 268.0
    unpriced = optimize(700, [PackOption("a", None, "500 g", 500, None), PackOption("b", None, "1 kg", 1000, None)])
    assert [(o.label, n) for o, n in unpriced.counts] == [("1 kg", 1)] and unpriced.cost is None
    capped = optimize(2000, [PackOption("a", None, "500 g", 500, 50.0, max_quantity=2), PackOption("b", None, "1 kg", 1000, 120.0)])
    assert sum(n * o.per_pack for o, n in capped.counts) >= 2000 and all(n <= 2 for o, n in capped.counts if o.spin_id == "a")


async def test_fixture_preview_matches_converts_and_explains():
    req = CartPreviewRequest.model_validate({"provider": "fixture", "lines": [
        line("chicken", 1.65, "kg", "mass", 1650),
        line("onion", 3, "piece", "piece", 3),
        line("toor dal", 99.6, "g", "mass", 99.6),
        line("cauliflower", 1, "piece", "piece", 1),
        line("dragon fruit jam", 1, "piece", "piece", 1),
        line("bread"),
    ]})
    res = await build_preview(req, FixtureGroceryProvider())
    by = {l.line_id: l for l in res.lines}
    chicken = by["chicken"]
    assert chicken.status == "matched" and [(p.label, p.count) for p in chicken.product.packs] == [("300 g", 6)]
    assert (chicken.product.purchased, chicken.product.surplus, chicken.product.cost) == ("1.8 kg", "150 g", 1074.0)
    assert chicken.explanation.startswith("Need 1.65 kg; 6 × 300 g = 1.8 kg (150 g extra)")
    onion = by["onion"]  # 3 pieces ≈ 450 g → one 500 g bag, approximate
    assert onion.approximate and [(p.label, p.count) for p in onion.product.packs] == [("500 g", 1)]
    assert by["cauliflower"].product.packs[0].label.startswith("1 pc") and not by["cauliflower"].approximate
    assert by["dragon fruit jam"].status == "unmatched"
    assert by["bread"].status == "matched" and by["bread"].product.packs[0].count == 1
    assert res.totals.over_cap and any("₹1000" in w for w in res.warnings)
    assert any("Sample catalogue" in w for w in res.warnings)


async def test_brand_preferences_and_out_of_stock():
    req = CartPreviewRequest.model_validate({"provider": "fixture", "lines": [line("paneer", 200, "g", "mass", 200)],
                                             "preferences": {"avoid_brands": ["Amul"]}})
    res = await build_preview(req, FixtureGroceryProvider())
    assert res.lines[0].status == "unmatched"  # the only paneer is avoided
    from app.kitchen_circle.grocery_provider import ProviderProduct, ProviderVariation
    stockout = FixtureGroceryProvider([ProviderProduct("Paneer", "Milky", True, [ProviderVariation("x", None, "200 g", 80.0, in_stock=False)])])
    res = await build_preview(CartPreviewRequest.model_validate({"provider": "fixture", "lines": [line("paneer", 200, "g", "mass", 200)]}), stockout)
    assert res.lines[0].status == "out_of_stock"


async def test_instamart_adapter_uses_documented_fields_and_drops_phone():
    mcp = AsyncMock()
    mcp.call_tool.side_effect = [
        {"success": True, "data": {"products": [{"displayName": "Chicken Breast", "brand": "Licious", "inStock": True, "isAvail": True, "variations": [
            {"spinId": "sp1", "skuId": "sk1", "quantityDescription": "450 g", "price": {"mrp": 300, "offerPrice": 279}, "isInStockAndAvailable": True, "maxQuantity": 4},
            {"spinId": "sp2", "skuId": "sk2", "quantityDescription": "1 kg", "price": {"mrp": 600, "offerPrice": 560}, "isInStockAndAvailable": False},
        ]}]}},
        {"success": True, "data": {"addresses": [{"id": "a1", "addressLine": "12 MG Road", "phoneNumber": "9999999999", "addressTag": "Home"}]}},
    ]
    adapter = InstamartKitchenCircleAdapter(token="t", client=mcp)
    [product] = await adapter.search("chicken", "a1")
    assert mcp.call_tool.await_args_list[0].args == ("search_products", {"addressId": "a1", "query": "chicken"})
    v1, v2 = product.variations
    assert (v1.spin_id, v1.sku_id, v1.label, v1.price, v1.in_stock, v1.max_quantity) == ("sp1", "sk1", "450 g", 279.0, True, 4)
    assert v2.in_stock is False
    [address] = await adapter.addresses()
    assert address.model_dump() == {"id": "a1", "label": "12 MG Road", "tag": "Home"}


async def test_instamart_write_replaces_cart_with_documented_item_fields():
    mcp = AsyncMock()
    mcp.call_tool.side_effect = [
        {"success": True, "data": {"reducedQuantityItems": [{"spinId": "sp1", "itemName": "Chicken", "requestedQuantity": 6, "cappedQuantity": 4}]}},
        {"success": True, "data": {"items": [], "pricing": {"to_pay": 0}}},
    ]
    res = await InstamartKitchenCircleAdapter(token="t", client=mcp).write_cart("a1", [CartItem(spin_id="sp1", sku_id="sk1", quantity=6)])
    assert mcp.call_tool.await_args_list[0].args == ("update_cart", {"selectedAddressId": "a1", "items": [{"spinId": "sp1", "quantity": 6, "skuId": "sk1"}]})
    assert res.reduced_quantity[0]["capped"] == 4


def test_routes_mounted_and_checkout_requires_confirmation():
    preview = client.post("/api/kitchen-circle/cart/preview", json={"provider": "fixture", "lines": [line("onion", 1, "kg", "mass", 1000)]})
    assert preview.status_code == 200, preview.text
    assert preview.json()["lines"][0]["status"] == "matched"
    unconfirmed = client.post("/api/kitchen-circle/cart/checkout", json={"address_id": "a1", "confirmed": False})
    assert unconfirmed.status_code == 200 and unconfirmed.json()["success"] is False


async def test_sprigs_compare_with_bunches_and_counts_round_up():
    req = CartPreviewRequest.model_validate({"provider": "fixture", "lines": [
        line("curry leaves", 3, "sprig", "sprig", 3), line("tomato", 1.33, "piece", "piece", 1.33),
    ]})
    res = await build_preview(req, FixtureGroceryProvider())
    by = {l.line_id: l for l in res.lines}
    assert by["curry leaves"].status == "matched" and by["curry leaves"].product.packs[0].label == "1 bunch"
    assert by["tomato"].required == "2 pieces"
    lemons = (await build_preview(CartPreviewRequest.model_validate({"provider": "fixture", "lines": [line("lemon", 1.33, "piece", "piece", 1.33)]}), FixtureGroceryProvider())).lines[0]
    assert (lemons.product.purchased, lemons.product.surplus) == ("4 pieces", "2 pieces")
