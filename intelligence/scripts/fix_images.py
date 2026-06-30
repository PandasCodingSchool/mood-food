"""
One-time script to fix broken image URLs in dishes.json using the Unsplash API.

Usage:
  UNSPLASH_ACCESS_KEY=your_key python3 scripts/fix_images.py

Get a free key at https://unsplash.com/developers (50 req/hr on free tier).
Only patches dishes whose current image_url returns non-200.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

DISHES_PATH = Path(__file__).parent.parent / "app" / "data" / "dishes.json"
ACCESS_KEY = os.environ.get("UNSPLASH_ACCESS_KEY")


def is_broken(url: str) -> bool:
    if not url:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        return urllib.request.urlopen(req, timeout=6).getcode() != 200
    except Exception:
        return True


def fetch_unsplash_url(query: str, access_key: str) -> str | None:
    encoded = urllib.parse.quote(query)
    api_url = f"https://api.unsplash.com/search/photos?query={encoded}&per_page=1&orientation=landscape"
    req = urllib.request.Request(api_url, headers={"Authorization": f"Client-ID {access_key}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            results = data.get("results", [])
            if results:
                return results[0]["urls"]["regular"]
    except Exception as e:
        print(f"  API error for '{query}': {e}")
    return None


import urllib.parse

if not ACCESS_KEY:
    print("ERROR: Set UNSPLASH_ACCESS_KEY environment variable.")
    sys.exit(1)

dishes = json.loads(DISHES_PATH.read_text())
patched = 0

for dish in dishes:
    if not is_broken(dish.get("image_url", "")):
        continue
    print(f"Fixing: {dish['name']} ({dish['id']})")
    new_url = fetch_unsplash_url(dish["name"], ACCESS_KEY)
    if new_url:
        dish["image_url"] = new_url
        print(f"  -> {new_url}")
        patched += 1
    else:
        print(f"  -> no result found, leaving as-is")

DISHES_PATH.write_text(json.dumps(dishes, indent=2, ensure_ascii=False))
print(f"\nDone. Patched {patched} dishes.")
