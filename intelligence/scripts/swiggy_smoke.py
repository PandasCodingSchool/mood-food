"""Swiggy MCP connectivity smoke test.

Opens an MCP session to the Swiggy Food server with the configured token and
lists the available tools. Expect to see the 13 Food tools (search_restaurants,
get_restaurant_menu, search_menu, place_food_order, track_food_order, ...).

Usage:
    cd intelligence
    SWIGGY_BOOTSTRAP_TOKEN=... python -m scripts.swiggy_smoke
    # optional: also probe a search
    SWIGGY_BOOTSTRAP_TOKEN=... python -m scripts.swiggy_smoke --query "Butter Chicken" --city bangalore
"""

import argparse
import asyncio

from app.config import settings
from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import SwiggyMCPClient, _import_mcp


async def list_tools() -> None:
    ClientSession, streamablehttp_client = _import_mcp()
    headers = {"Authorization": f"Bearer {settings.swiggy_bootstrap_token}"}
    async with streamablehttp_client(settings.swiggy_mcp_url, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = [t.name for t in tools.tools]
            print(f"Connected to {settings.swiggy_mcp_url}")
            print(f"{len(names)} tools exposed:")
            for n in sorted(names):
                print(f"  - {n}")


async def probe_search(query: str, city: str | None, cuisine: str | None) -> None:
    from app.schemas.swiggy import EnrichDishInput

    svc = SwiggyDiscoveryService(SwiggyMCPClient())
    addr = await svc.resolve_address_id(city=city)

    # 1. Raw search_restaurants — note dish queries return dish-cards (no rating).
    _, raw_results = await svc.search_restaurants(query, address_id=addr)
    print(f"\n[raw search_restaurants] addressId={addr} | {len(raw_results)} results for '{query}':")
    for r in raw_results[:5]:
        print(f"  - {r.name} | rating={r.rating} | eta={r.eta_min}min")

    # 2. enrich — exactly what the recommendation card receives (real restaurant + item).
    _, matches = await svc.enrich(
        [EnrichDishInput(id="q", name=query, cuisine=cuisine)], address_id=addr
    )
    m = matches[0]
    print(f"\n[enrich → card] dish='{query}' cuisine='{cuisine}'")
    if not m.matched:
        print("  matched=False (no real restaurant found)")
        return
    r = m.restaurant
    print(f"  restaurant: {r.name} | ★{r.rating} | {r.eta_min}min | ₹{r.cost_for_two} for two")
    if m.item:
        print(f"  real dish:  {m.item.name} | ₹{m.item.price} | itemId={m.item.id}")
    else:
        print("  real dish:  (none extracted from menu)")


async def dump_raw(query: str, city: str | None) -> None:
    """Print the raw structuredContent of search_menu and search_restaurants."""
    import json

    svc = SwiggyDiscoveryService(SwiggyMCPClient())
    addr = await svc.resolve_address_id(city=city)
    client = SwiggyMCPClient()
    for tool, args in (
        ("search_menu", {"addressId": addr, "query": query}),
        ("search_restaurants", {"addressId": addr, "query": query}),
    ):
        print(f"\n===== RAW {tool} (query={query!r}, addressId={addr}) =====")
        data = await client.call_tool(tool, args)
        print(json.dumps(data, indent=2, default=str)[:4000])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default=None)
    parser.add_argument("--city", default=None)
    parser.add_argument("--cuisine", default=None,
                        help="dish cuisine (e.g. italian) — improves the enrich fallback")
    parser.add_argument("--raw", action="store_true",
                        help="dump raw search_menu + search_restaurants JSON for --query")
    args = parser.parse_args()

    if not settings.swiggy_bootstrap_token:
        raise SystemExit("Set SWIGGY_BOOTSTRAP_TOKEN before running this smoke test.")

    if args.raw and args.query:
        asyncio.run(dump_raw(args.query, args.city))
        return

    asyncio.run(list_tools())
    if args.query:
        asyncio.run(probe_search(args.query, args.city, args.cuisine))


if __name__ == "__main__":
    main()
