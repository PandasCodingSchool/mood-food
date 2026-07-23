"""
One-off/re-runnable script to classify dishes.json entries into main/starter/
complimentary tiers via a cheap LLM call (see app/services/dish_tier.py).

Only classifies dishes that don't already have an explicit non-default "tier"
key in the JSON (so re-running after adding new dishes only classifies the new
ones). Writes the result back into dishes.json in place.

Usage:
  cd intelligence && python3 scripts/classify_dish_tiers.py
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.dish_tier import TierClassifyInput, classify_tiers  # noqa: E402

DISHES_PATH = Path(__file__).parent.parent / "app" / "data" / "dishes.json"


async def main() -> None:
    with DISHES_PATH.open() as f:
        dishes = json.load(f)

    todo = [d for d in dishes if "tier" not in d]
    if not todo:
        print("All dishes already have a tier — nothing to do.")
        return

    print(f"Classifying {len(todo)} dish(es)...")
    inputs = [TierClassifyInput(id=d["id"], name=d["name"]) for d in todo]

    # Batch in chunks of 40 to keep prompts small and reliable.
    results: dict[str, str] = {}
    for i in range(0, len(inputs), 40):
        chunk = inputs[i:i + 40]
        results.update(await classify_tiers(chunk))

    by_id = {d["id"]: d for d in dishes}
    for dish_id, tier in results.items():
        by_id[dish_id]["tier"] = tier
        print(f"  {dish_id}: {by_id[dish_id]['name']} -> {tier}")

    with DISHES_PATH.open("w") as f:
        json.dump(dishes, f, indent=2)
        f.write("\n")
    print(f"Wrote tiers for {len(results)} dish(es) to {DISHES_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
