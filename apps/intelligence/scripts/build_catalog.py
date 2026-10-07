"""Build catalog v2 (the food graph) into app/data/dishes.json.

    python scripts/build_catalog.py           # validate + write
    python scripts/build_catalog.py --check   # validate only

Adds sensory / protein / cooking_method / region to the original dishes,
applies India-availability renames, retires duplicates, adds soy allergens,
and appends the new dishes from scripts/catalog/new_dishes.py. Idempotent:
re-running produces the same file.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.catalog.existing import ATTRS, RENAMES, RETIRED, SOY  # noqa: E402
from scripts.catalog.new_dishes import ROWS  # noqa: E402

DISHES_JSON = ROOT / "app" / "data" / "dishes.json"

SENSORY_DIMS = ("sweet", "salty", "sour", "spicy", "umami", "rich", "crunchy", "creamy", "warm", "heavy")
CUISINE_PREFIX = {
    "indian": "in", "chinese": "cn", "italian": "it", "american": "am", "mexican": "mx",
    "thai": "th", "japanese": "jp", "mediterranean": "md", "korean": "kr",
}
DIET = {"v": ["vegetarian"], "vg": ["vegetarian", "vegan"], "nv": ["non_veg"]}
ALLERGEN = {"d": "dairy", "g": "gluten", "e": "eggs", "n": "nuts", "s": "shellfish", "y": "soy"}
SPICE = {"m": "mild", "md": "medium", "h": "hot", "vh": "very_hot"}
MEAL = {"b": "breakfast", "l": "lunch", "d": "dinner", "n": "late_night"}
MOOD = {
    "c": "comfort", "h": "happy", "s": "stressed", "sd": "sad", "e": "energetic", "cb": "celebratory",
    "r": "romantic", "n": "nostalgic", "sk": "sick", "a": "adventurous", "rx": "relaxed", "hl": "healthy",
    "cd": "cold", "rn": "rainy", "hw": "hot_weather",
}
TIER = {"m": "main", "s": "starter", "c": "complimentary"}
CATEGORIES = {"comfort_food", "light_meal", "indulgent", "snack", "dessert", "street_food", "beverage"}
PREP = {"street_food": 15, "snack": 20, "dessert": 15, "beverage": 10, "light_meal": 20}


def sensory(digits: str) -> dict[str, float]:
    if len(digits) != 10 or not digits.isdigit():
        raise ValueError(f"sensory must be 10 digits, got {digits!r}")
    return {dim: round(int(c) / 9, 2) for dim, c in zip(SENSORY_DIMS, digits)}


def weather_for(s: dict[str, float]) -> list[str]:
    if s["warm"] >= 0.75:
        return ["rainy", "cold", "any"]
    if s["warm"] <= 0.25:
        return ["hot", "sunny", "any"]
    return ["any"]


def energy_for(s: dict[str, float], adv: int) -> int:
    # Lighter, fresher, bolder food suits higher-energy moments; heavy comfort suits tired ones.
    return max(1, min(10, round(2 + (1 - s["heavy"]) * 4 + (1 if adv >= 6 else 0))))


def parse_row(line: str) -> dict:
    f = [x.strip() for x in line.split("|")]
    if len(f) != 17:
        raise ValueError(f"expected 17 fields, got {len(f)}: {line}")
    (name, cuisine, category, diet, allergens, spice, price, kcal, meals, moods,
     adv, health, tier, sens, protein, method, region) = f
    if cuisine not in CUISINE_PREFIX:
        raise ValueError(f"{name}: unknown cuisine {cuisine}")
    if category not in CATEGORIES:
        raise ValueError(f"{name}: unknown category {category}")
    s = sensory(sens)
    adv_i = int(adv)
    social = ["solo", "friends", "family"] + (["date"] if category in ("indulgent", "dessert") else [])
    return {
        "name": name,
        "cuisine": cuisine,
        "category": category,
        "mood_tags": [MOOD[m] for m in moods.split(",")],
        "dietary_tags": DIET[diet],
        "allergens": [] if allergens == "-" else [ALLERGEN[a] for a in allergens.split(",")],
        "spice_level": SPICE[spice],
        "energy_requirement": energy_for(s, adv_i),
        "social_context_tags": social,
        "weather_tags": weather_for(s),
        "meal_time": [MEAL[m] for m in meals],
        "delivery_friendly": True,
        "adventurousness_score": adv_i,
        "price_inr": int(price),
        "calories": int(kcal),
        "prep_time_min": PREP.get(category, 40 if method == "dum" else 30),
        "health_score": float(health),
        "image_url": "",
        "img_processed": False,
        "tier": TIER[tier],
        "swiggy_aliases": [name],
        "sensory": s,
        "protein": protein,
        "cooking_method": method,
        "region": region,
    }


def build() -> list[dict]:
    dishes = json.loads(DISHES_JSON.read_text())
    original = [d for d in dishes if d["id"] in ATTRS]
    missing = {d["id"] for d in dishes if d["id"] not in ATTRS and not d.get("catalog_v2")}
    if missing:
        raise ValueError(f"original dishes without attributes: {sorted(missing)}")

    out: list[dict] = []
    for d in original:
        d = dict(d)
        digits, protein, method, region = ATTRS[d["id"]]
        d.update(sensory=sensory(digits), protein=protein, cooking_method=method, region=region)
        if d["id"] in RENAMES:
            d["name"], d["swiggy_aliases"] = RENAMES[d["id"]][0], list(RENAMES[d["id"]][1])
        if d["id"] in SOY and "soy" not in d["allergens"]:
            d["allergens"] = [*d["allergens"], "soy"]
        if d["id"] in RETIRED:
            d["retired"] = True
        out.append(d)

    used_ids = {d["id"] for d in out}
    names = {d["name"].lower() for d in out if not d.get("retired")}
    counters: dict[str, int] = {}
    for line in (r for r in ROWS.strip().splitlines() if r.strip()):
        rec = parse_row(line)
        if rec["name"].lower() in names:
            raise ValueError(f"duplicate dish name: {rec['name']}")
        names.add(rec["name"].lower())
        prefix = CUISINE_PREFIX[rec["cuisine"]]
        n = counters.get(prefix, 100)
        while f"{prefix}_{n + 1:03d}" in used_ids:
            n += 1
        counters[prefix] = n + 1
        rec = {"id": f"{prefix}_{n + 1:03d}", **rec, "catalog_v2": True}
        used_ids.add(rec["id"])
        out.append(rec)
    return out


def main() -> int:
    dishes = build()
    live = [d for d in dishes if not d.get("retired")]
    print(f"{len(live)} live dishes ({sum(1 for d in dishes if d.get('catalog_v2'))} new, "
          f"{sum(1 for d in dishes if d.get('retired'))} retired)")
    if "--check" not in sys.argv:
        DISHES_JSON.write_text(json.dumps(dishes, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {DISHES_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
