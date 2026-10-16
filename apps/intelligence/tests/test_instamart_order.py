"""Instamart cart normalisation against the documented get_cart shape."""

from app.services.instamart_order import _normalize_cart


def test_normalize_cart_reads_documented_shape():
    raw = {
        "success": True,
        "data": {
            "items": [
                {"spinId": "s1", "itemName": "Paneer 200g", "quantity": 2, "mrp": 120, "discountedFinalPrice": 99},
                {"spinId": "s2", "itemName": "Tomatoes 1kg", "quantity": 1, "mrp": 60},
            ],
            "cartTotalAmount": "₹258",
            "billBreakdown": {"lineItems": [], "toPay": {"label": "To Pay", "value": "₹1,283.50"}},
            "availablePaymentMethods": ["COD"],
        },
    }
    cart = _normalize_cart(raw)
    assert [(i.spin_id, i.name, i.price, i.quantity) for i in cart.items] == [
        ("s1", "Paneer 200g", 99, 2),
        ("s2", "Tomatoes 1kg", 60, 1),
    ]
    assert cart.total == 1283.5
    assert cart.subtotal == 258
    assert cart.available_payment_methods == ["COD"]
    assert cart.below_minimum is False
