"""Pack sizes and purchasable-combination optimization for KitchenCircle carts.

`parse_pack` turns a provider pack label ("2 x 200 g", "1 kg", "6 pcs", "1 pc (approx. 400-600 g)")
into a base quantity: grams, millilitres, or a count. `optimize` then picks how many of each
available pack to buy so the household's requirement is covered at the lowest cost, then the
least surplus, then the fewest packs. It never rounds to an arbitrary quantity: every plan is a
real combination of packs the provider sells.
"""

from __future__ import annotations

import itertools
import math
import re
from dataclasses import dataclass
from typing import Optional

MASS_UNITS = {"g": 1.0, "gm": 1.0, "gms": 1.0, "gram": 1.0, "grams": 1.0, "kg": 1000.0, "kgs": 1000.0}
VOLUME_UNITS = {"ml": 1.0, "l": 1000.0, "ltr": 1000.0, "litre": 1000.0, "liter": 1000.0, "litres": 1000.0, "liters": 1000.0}
_UNIT = r"(kg|kgs|gms|gm|grams|gram|g|ml|ltr|litres|liters|litre|liter|l)"

# Typical Indian-market weights, used only to compare a count requirement with a weight pack (or the reverse).
AVG_PIECE_GRAMS = {
    "onion": 150, "tomato": 100, "potato": 150, "lemon": 50, "green chilli": 5, "carrot": 80, "cucumber": 250,
    "capsicum": 150, "cauliflower": 600, "cabbage": 800, "banana": 120, "egg": 55, "garlic": 5, "ginger": 30,
}
AVG_BUNCH_GRAMS = 100
SPRIGS_PER_BUNCH = 10
AVG_SPRIG_GRAMS = 1
AVG_CLOVE_GRAMS = 5
MAX_PACKS_PER_VARIANT = 20


@dataclass(frozen=True)
class PackSize:
    dimension: str  # mass | volume | piece | bunch
    base: float     # grams, millilitres, or count per pack
    approx_grams: Optional[float] = None  # for count packs with a stated weight


def parse_pack(label: Optional[str]) -> Optional[PackSize]:
    if not label:
        return None
    text = label.lower().replace("×", "x")
    approx = None
    am = re.search(r"(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*" + _UNIT + r"\b", text)

    def amount(value: str, unit: str) -> tuple[str, float]:
        return ("mass", float(value) * MASS_UNITS[unit]) if unit in MASS_UNITS else ("volume", float(value) * VOLUME_UNITS[unit])

    count = re.match(r"\s*(\d+)\s*(pcs|pc|pieces|piece|units|unit|nos|no|n)\b", text) or re.search(r"pack of (\d+)()", text)
    dozen = re.search(r"(\d+)\s*dozen", text)
    if count or dozen:
        n = int(dozen.group(1)) * 12 if dozen else int(count.group(1))
        if am:  # "1 pc (approx. 400-600 g)" → count pack with an approximate weight
            low = float(am.group(1))
            high = float(am.group(2)) if am.group(2) else low
            dim, grams = amount(str((low + high) / 2), am.group(3))
            approx = grams if dim == "mass" else None
        return PackSize("piece", float(n), approx)
    if re.search(r"\bbunch\b", text):
        n = re.search(r"(\d+)\s*bunch", text)
        return PackSize("bunch", float(n.group(1)) if n else 1.0)
    multi = re.search(r"(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*" + _UNIT + r"\b", text) or re.search(r"(\d+(?:\.\d+)?)\s*" + _UNIT + r"\s*x\s*(\d+)\b", text)
    if multi:
        if multi.re.pattern.startswith(r"(\d+)\s*x"):
            n, value, unit = int(multi.group(1)), multi.group(2), multi.group(3)
        else:
            value, unit, n = multi.group(1), multi.group(2), int(multi.group(3))
        dim, base = amount(value, unit)
        return PackSize(dim, base * n)
    if am:
        dim, base = amount(am.group(1), am.group(3))
        return PackSize(dim, base)
    return None


def requirement_in(pack: PackSize, key: str, dimension: str, base: float) -> Optional[tuple[float, float, bool, str]]:
    """Requirement and one pack in a shared unit: (required, per_pack, approximate, compared_dimension) or None."""
    piece_g = AVG_PIECE_GRAMS.get(key) or next((g for k, g in AVG_PIECE_GRAMS.items() if key.endswith(f" {k}")), None)
    if dimension == pack.dimension:
        return base, pack.base, False, dimension
    if dimension in {"mass", "volume"} and pack.dimension in {"mass", "volume"}:
        return base, pack.base, True, dimension  # ml ≈ g for kitchen liquids and pastes
    if dimension in {"piece", "clove"} and pack.dimension == "mass":
        grams = AVG_CLOVE_GRAMS if dimension == "clove" else piece_g
        return (base * grams, pack.base, True, "mass") if grams else None
    if dimension == "sprig" and pack.dimension == "bunch":
        return base, pack.base * SPRIGS_PER_BUNCH, True, "sprig"
    if dimension == "sprig" and pack.dimension == "mass":
        return base * AVG_SPRIG_GRAMS, pack.base, True, "mass"
    if dimension == "bunch" and pack.dimension == "mass":
        return base * AVG_BUNCH_GRAMS, pack.base, True, "mass"
    if dimension in {"mass", "volume"} and pack.dimension == "piece":
        per = pack.approx_grams or (piece_g * pack.base if piece_g else None)
        return (base, per, True, dimension) if per else None
    if dimension == "piece" and pack.dimension == "piece":
        return base, pack.base, False, "piece"
    return None


@dataclass
class PackOption:
    spin_id: str
    sku_id: Optional[str]
    label: str
    per_pack: float      # in the requirement's comparison unit
    price: Optional[float]
    max_quantity: int = MAX_PACKS_PER_VARIANT


@dataclass
class PackPlan:
    counts: list[tuple[PackOption, int]]
    purchased: float
    surplus: float
    cost: Optional[float]

    @property
    def packs(self) -> int:
        return sum(n for _, n in self.counts)


def optimize(required: float, options: list[PackOption]) -> Optional[PackPlan]:
    """Cheapest real pack combination covering `required` (then least surplus, then fewest packs)."""
    if required <= 0 or not options:
        return None
    # Keep the four best-value sizes so the search stays tiny (≤ 21⁴ combinations).
    def value(o: PackOption) -> float:
        return (o.price / o.per_pack) if o.price is not None and o.per_pack else math.inf
    pool = sorted([o for o in options if o.per_pack > 0], key=lambda o: (value(o), -o.per_pack))[:4]
    ranges = [range(0, min(o.max_quantity, math.ceil(required / o.per_pack) + 1, MAX_PACKS_PER_VARIANT) + 1) for o in pool]
    best: Optional[tuple[tuple, PackPlan]] = None
    for combo in itertools.product(*ranges):
        purchased = sum(n * o.per_pack for n, o in zip(combo, pool))
        if purchased + 1e-9 < required or not any(combo):
            continue
        priced = all(o.price is not None for n, o in zip(combo, pool) if n)
        cost = sum(n * o.price for n, o in zip(combo, pool) if n and o.price is not None) if priced else None
        key = (cost if cost is not None else math.inf, round(purchased - required, 6), sum(combo))
        if best is None or key < best[0]:
            best = (key, PackPlan([(o, n) for n, o in zip(combo, pool) if n], purchased, purchased - required, cost))
    return best[1] if best else None


def fmt(base: float, dimension: str) -> str:
    """Human quantity in the requirement's unit: 1650 mass → '1.65 kg', 3 piece → '3 pieces'."""
    r = lambda v: f"{round(v, 2):g}"  # noqa: E731
    if dimension == "mass":
        return f"{r(base / 1000)} kg" if base >= 1000 else f"{r(base)} g"
    if dimension == "volume":
        return f"{r(base / 1000)} l" if base >= 1000 else f"{r(base)} ml"
    # Counts are bought whole, so a scaled need of 4.67 pieces reads as 5.
    count = math.ceil(round(base, 6))
    unit = {"piece": "piece", "clove": "clove", "bunch": "bunch", "sprig": "sprig"}.get(dimension, dimension)
    plural = "es" if unit == "bunch" else "s"
    return f"{count} {unit}{'' if count == 1 else plural}"
