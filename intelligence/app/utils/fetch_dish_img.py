"""One-off utility: fetch Unsplash URLs for unprocessed dishes and write to dishes.json."""

from __future__ import annotations

import json
import logging
import sys
import time
from dataclasses import asdict
from pathlib import Path

logger = logging.getLogger(__name__)

# Allow: python app/utils/fetch_dish_img.py  (from project root)
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import requests

from app.config import settings
from app.data.dishes import DishRecord

DISHES_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "dishes.json"


def _load_dishes() -> list[DishRecord]:
    with DISHES_JSON_PATH.open(encoding="utf-8") as f:
        return [DishRecord(**record) for record in json.load(f)]


def _save_dishes(dishes: list[DishRecord]) -> None:
    with DISHES_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump([asdict(d) for d in dishes], f, indent=2)
        f.write("\n")


def fetch_dish_img(dish_name: str) -> str | None:
    url = "https://api.unsplash.com/search/photos"
    params = {"query": dish_name, "per_page": 10}
    headers = {"Authorization": f"Client-ID {settings.unsplash_access_key}"}

    response = requests.get(url, params=params, headers=headers, timeout=30)
    response.raise_for_status()

    data = response.json()
    if data["results"]:
        return data["results"][0]["urls"]["regular"]
    return None


def persist_image_urls_to_json(*, dry_run: bool = False, delay_sec: float = 1.0) -> None:
    if not settings.unsplash_access_key:
        raise RuntimeError("Set UNSPLASH_ACCESS_KEY in .env before running.")

    dishes = _load_dishes()
    total = len(dishes)
    skipped = 0
    updated = 0
    failed = 0

    for i, dish in enumerate(dishes, start=1):
        if dish.img_processed:
            skipped += 1
            logger.info("[%d/%d] SKIP %s %s (already processed)", i, total, dish.id, dish.name)
            continue

        logger.info("[%d/%d] FETCH %s %s", i, total, dish.id, dish.name)
        img_url = fetch_dish_img(dish.name)
        if not img_url:
            failed += 1
            logger.warning("No Unsplash results for %r", dish.name)
            continue

        dish.image_url = img_url
        dish.img_processed = True
        updated += 1
        logger.info("Fetched image URL: %s", img_url)

        if not dry_run:
            _save_dishes(dishes)
            logger.info("Saved to %s", DISHES_JSON_PATH)

        if delay_sec > 0 and i < total:
            time.sleep(delay_sec)

    logger.info(
        "Done: %d updated, %d skipped, %d failed (%d total)",
        updated,
        skipped,
        failed,
        total,
    )
    if dry_run:
        logger.info("dry_run=True — dishes.json not written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    persist_image_urls_to_json()
