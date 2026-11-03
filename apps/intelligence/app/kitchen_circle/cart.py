"""Grocery requirement → pack-optimized, explainable cart proposal (read-only).

For each line: search the provider, keep confident in-stock matches (brand preferences applied),
convert packs into the line's unit, optimize real pack combinations, and explain the choice.
Nothing is written to any cart here.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Optional

from app.lab import trace
from app.schemas.instamart import INSTAMART_MIN_CART_INR, INSTAMART_ORDER_VALUE_CAP_INR
from app.services.instamart_discovery import ingredient_match_confidence

from .cart_schemas import CartLine, CartPreviewRequest, CartPreviewResponse, CartTotals, ChosenPack, ProductChoice, RequirementLine
from .grocery_provider import KitchenCircleGroceryProvider, ProviderProduct
from .packs import PackOption, PackPlan, fmt, optimize, parse_pack, requirement_in

logger = logging.getLogger("kitchen_circle.cart")
MATCH_THRESHOLD = 1.5
SEARCH_CONCURRENCY = 4


def _plan_for(product: ProviderProduct, line: RequirementLine) -> tuple[Optional[PackPlan], bool, Optional[str], str]:
    """Best plan for one product: (plan, approximate, compared_dimension, reason when no plan)."""
    groups: dict[tuple[str, bool], list[PackOption]] = {}
    required_in: dict[tuple[str, bool], float] = {}
    stocked = [v for v in product.variations if v.in_stock]
    if not stocked:
        return None, False, None, "out_of_stock"
    for v in stocked:
        pack = parse_pack(v.label)
        if not pack:
            continue
        if line.base_quantity is None or not line.dimension:
            # Manual items without a quantity: one pack of the cheapest size.
            groups.setdefault(("piece", False), []).append(PackOption(v.spin_id, v.sku_id, v.label, 1.0, v.price, v.max_quantity or 20))
            continue
        conv = requirement_in(pack, line.canonical_name, line.dimension, line.base_quantity)
        if conv:
            required, per_pack, approx, compared = conv
            required_in[(compared, approx)] = required
            groups.setdefault((compared, approx), []).append(PackOption(v.spin_id, v.sku_id, v.label, per_pack, v.price, v.max_quantity or 20))
    if not groups:
        return None, False, None, "unit_mismatch"
    # Prefer an exact unit match over an approximate conversion.
    (compared, approx), options = sorted(groups.items(), key=lambda g: g[0][1])[0]
    if line.base_quantity is None or not line.dimension:
        plan = optimize(1.0, options)
        return plan, False, None, ""
    return optimize(required_in[(compared, approx)], options), approx, compared, ""


def _choice(product: ProviderProduct, plan: PackPlan, compared: Optional[str]) -> ProductChoice:
    packs = [ChosenPack(spin_id=o.spin_id, sku_id=o.sku_id, label=o.label, count=n, unit_price=o.price) for o, n in plan.counts]
    if compared in {"mass", "volume"}:
        purchased, surplus = fmt(plan.purchased, compared), fmt(plan.surplus, compared)
    elif compared:
        # Counts: the need is bought whole (1.33 → 2), so extra is measured against that.
        needed = math.ceil(round(plan.purchased - plan.surplus, 6))
        purchased, surplus = fmt(plan.purchased, compared), fmt(plan.purchased - needed, compared)
    else:
        purchased, surplus = " + ".join(f"{n} × {o.label}" for o, n in plan.counts), "—"
    required = plan.purchased - plan.surplus
    ratio = round(plan.surplus / required, 3) if compared and required > 0 else None
    return ProductChoice(name=product.name, brand=product.brand, packs=packs, purchased=purchased, surplus=surplus, cost=plan.cost, surplus_ratio=ratio)


def _explain(line: RequirementLine, choice: ProductChoice, plan: PackPlan, compared: Optional[str], approx: bool) -> str:
    combo = " + ".join(f"{p.count} × {p.label}" for p in choice.packs)
    need = f"{line.quantity:g} {line.unit}" if line.quantity is not None and line.unit else "as needed"
    text = f"Need {need}; {combo} = {choice.purchased}"
    if compared and choice.surplus not in {"0 g", "0 ml"} and not choice.surplus.startswith("0 "):
        text += f" ({choice.surplus} extra)"
    text += ". Cheapest pack combination that covers it" if plan.cost is not None else ". Smallest pack combination that covers it"
    if approx:
        text += "; sizes compared using typical weights, so check quantities"
    return text + "."


def _brand_score(product: ProviderProduct, line: RequirementLine, req: CartPreviewRequest) -> float:
    brand = (product.brand or "").strip().lower()
    score = ingredient_match_confidence(product.name, line.canonical_name or line.name)
    if brand and brand in {b.lower() for b in req.preferences.prefer_brands}:
        score += 1.0
    return score


async def _line(provider: KitchenCircleGroceryProvider, req: CartPreviewRequest, line: RequirementLine) -> CartLine:
    required = fmt(line.base_quantity, line.dimension) if line.base_quantity is not None and line.dimension else "as needed"
    try:
        products = await provider.search(line.name, req.address_id)
    except Exception as exc:  # noqa: BLE001 — one failed search must not sink the whole cart
        logger.warning("cart search %r failed: %s", line.name, exc)
        return CartLine(line_id=line.line_id, name=line.name, status="unmatched", required=required, explanation="Search failed for this item; add it manually.")
    avoid = {b.lower() for b in req.preferences.avoid_brands}
    candidates = sorted(
        ((_brand_score(p, line, req), p) for p in products if (p.brand or "").strip().lower() not in avoid),
        key=lambda c: -c[0],
    )
    candidates = [(s, p) for s, p in candidates if s >= MATCH_THRESHOLD][:3]
    if not candidates:
        return CartLine(line_id=line.line_id, name=line.name, status="unmatched", required=required, explanation="No confident product match; add it manually or skip it.")

    planned: list[tuple[float, ProviderProduct, PackPlan, bool, Optional[str]]] = []
    reasons: set[str] = set()
    for score, product in candidates:
        plan, approx, compared, reason = _plan_for(product, line)
        if plan:
            planned.append((score, product, plan, approx, compared))
        else:
            reasons.add(reason)
    if not planned:
        status = "out_of_stock" if reasons == {"out_of_stock"} else "unit_mismatch"
        note = "The matching products are out of stock." if status == "out_of_stock" else "Pack sizes can't be compared with the recipe quantity; choose a pack manually."
        return CartLine(line_id=line.line_id, name=line.name, status=status, required=required, confidence=candidates[0][0], explanation=note)
    # Most confident match wins; within 1 point of it, the cheaper plan wins.
    top = planned[0][0]
    close = [p for p in planned if p[0] >= top - 1.0]
    best = min(close, key=lambda p: (p[2].cost if p[2].cost is not None else float("inf"), -p[0]))
    _, product, plan, approx, compared = best
    choice = _choice(product, plan, compared)
    alternatives = [_choice(p, pl, c) for _, p, pl, _, c in planned if p is not product][:2]
    return CartLine(line_id=line.line_id, name=line.name, status="matched", required=required, product=choice, alternatives=alternatives,
                    approximate=approx, confidence=best[0], explanation=_explain(line, choice, plan, compared, approx))


async def build_preview(req: CartPreviewRequest, provider: KitchenCircleGroceryProvider) -> CartPreviewResponse:
    gate = asyncio.Semaphore(SEARCH_CONCURRENCY)

    async def one(line: RequirementLine) -> CartLine:
        async with gate:
            return await _line(provider, req, line)

    lines = await asyncio.gather(*(one(line) for line in req.lines))
    matched = [l for l in lines if l.status == "matched"]
    priced = [l for l in matched if l.product and l.product.cost is not None]
    total = round(sum(l.product.cost for l in priced if l.product and l.product.cost is not None), 2)
    warnings: list[str] = []
    if req.provider == "fixture":
        warnings.append("Sample catalogue and prices — connect Instamart for live products.")
    if any(l.approximate for l in matched):
        warnings.append("Some sizes were compared using typical weights; check those quantities.")
    if total >= INSTAMART_ORDER_VALUE_CAP_INR:
        warnings.append(f"Orders of ₹{INSTAMART_ORDER_VALUE_CAP_INR} or more can't be placed through the app yet; split the list (e.g. buy now vs later) or order part of it.")
    trace.emit("kitchen_circle.cart", provider=req.provider, lines=len(lines), matched=len(matched), total=total)
    return CartPreviewResponse(
        provider=req.provider,
        lines=list(lines),
        totals=CartTotals(estimated_cost=total, priced_lines=len(priced), matched=len(matched), unmatched=len(lines) - len(matched),
                          below_minimum=bool(priced) and total < INSTAMART_MIN_CART_INR, over_cap=total >= INSTAMART_ORDER_VALUE_CAP_INR,
                          minimum_amount=INSTAMART_MIN_CART_INR, cap_amount=INSTAMART_ORDER_VALUE_CAP_INR),
        warnings=warnings,
    )
