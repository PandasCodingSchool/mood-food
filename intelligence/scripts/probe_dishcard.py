"""Diagnostic: figure out how to turn a dish-search result into restaurant+price.

Run:  cd intelligence && .venv/bin/python -m scripts.probe_dishcard
"""

import asyncio
import json

from app.services.swiggy_mcp import SwiggyMCPClient
from app.services.swiggy_discovery import SwiggyDiscoveryService

QUERY = "Spaghetti Carbonara"


async def go() -> None:
    svc = SwiggyDiscoveryService()
    c = SwiggyMCPClient()
    addr = await svc.resolve_address_id(city="pune")

    # 1. Raw search_restaurants (dish-cards for a specific dish)
    sr = await c.call_tool("search_restaurants", {"addressId": addr, "query": QUERY})
    cards = sr.get("restaurants", []) if isinstance(sr, dict) else []
    print("=== search_restaurants dish-cards (first 3, FULL fields) ===")
    print(json.dumps(cards[:3], indent=2, default=str))

    # 2. Is the dish-card id a restaurantId? Try get_restaurant_menu on it.
    if cards:
        first_id = cards[0]["id"]
        print(f"\n=== get_restaurant_menu(restaurantId={first_id}) ===")
        try:
            menu = await c.call_tool(
                "get_restaurant_menu",
                {"restaurantId": first_id, "addressId": addr, "page": 1, "pageSize": 3},
            )
            print(json.dumps(menu, indent=2, default=str)[:2500])
        except Exception as e:  # noqa: BLE001
            print("ERROR -> id is NOT a restaurantId:", e)

    # 3. Does search_menu return anything for this dish?
    print(f"\n=== search_menu(query={QUERY!r}) ===")
    try:
        sm = await c.call_tool("search_menu", {"addressId": addr, "query": QUERY})
        print(json.dumps(sm, indent=2, default=str)[:2000])
    except Exception as e:  # noqa: BLE001
        print("ERROR:", e)


if __name__ == "__main__":
    asyncio.run(go())
