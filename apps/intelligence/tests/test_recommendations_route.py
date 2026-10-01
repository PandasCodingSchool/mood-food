"""Tests for the GPT-first + progressive-enrichment recommendation pipeline.

Architecture under test:
  shortlist -> GPT ranks pool_size candidates (no live_facts) ->
  progressive wave enrichment (stop when enough matches) ->
  final selection preserving GPT order, live-first.
"""

from unittest.mock import AsyncMock, MagicMock, call, patch

from fastapi.testclient import TestClient

from app.main import app
from app.data.dishes import DISHES
from app.schemas.response import (
    AiMetadata,
    AiReasoning,
    DishSummary,
    PracticalDetails,
    Recommendation,
    RecommendationResponse,
    Restaurant,
)
from app.schemas.swiggy import EnrichedMatch, SwiggyMenuItem, SwiggyRestaurant

client = TestClient(app)


def _rec(dish_id: str, name: str, rank: int = 1) -> Recommendation:
    return Recommendation(
        id=f"rec_{dish_id}",
        rank=rank,
        confidence=0.9,
        dish=DishSummary(id=dish_id, name=name, cuisine="indian", category="comfort_food", tags=[]),
        image_url="https://images.unsplash.com/x",
        ai_reasoning=AiReasoning(mood_match="m", context_fit="c", psychological_hook="p"),
        practical_details=PracticalDetails(estimated_price=250, preparation_time=20, calories=400, health_score=6.0),
        restaurant=Restaurant(name="R", rating=4.2, distance_km=1.0, delivery_time_min=25, is_open=True),
    )


def _pool_response(dishes) -> RecommendationResponse:
    return RecommendationResponse(
        success=True,
        recommendations=[_rec(d.id, d.name, i + 1) for i, d in enumerate(dishes)],
    )


def _payload(**extra):
    body = {
        "user_context": {"mood": {"primary": "happy"}},
        "recommendation_config": {"count": 3},
        "swiggy_address_id": "addr_1",
    }
    body.update(extra)
    return body


def _match(dish_id: str, name: str) -> EnrichedMatch:
    return EnrichedMatch(
        dish_id=dish_id,
        matched=True,
        item=SwiggyMenuItem(id=f"i_{dish_id}", name=name, price=299),
        restaurant=SwiggyRestaurant(id=f"r_{dish_id}", name="Test Kitchen", eta_min=25),
    )


# ---------------------------------------------------------------------------
# GPT-first architecture: GPT called once WITHOUT live_facts
# ---------------------------------------------------------------------------

class TestGptFirstPipeline:
    def test_gpt_called_first_without_live_facts(self):
        """GPT ranks the pool BEFORE enrichment; live_facts arg must be None."""
        sample = DISHES[:6]
        final_count = 3
        # pool_size = max(3*2, 3+3) = 6, capped at len(sample)=6
        gpt_pool_dishes = sample[:6]

        gpt_response = _pool_response(gpt_pool_dishes)
        recommender_calls: list[dict] = []

        def fake_get_recommendations(request, candidate_dishes=None, live_facts=None, llm=None):
            recommender_calls.append({
                "count": request.recommendation_config.count,
                "live_facts_keys": list((live_facts or {}).keys()),
            })
            return gpt_response

        async def fake_enrich(dishes, address_id=None, city=None):
            # All 4 match in first wave (wave_size = 4 = final_count+1)
            return "addr_1", [_match(d.id, d.name) for d in dishes]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", side_effect=fake_get_recommendations), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        assert len(recommender_calls) == 1, "exactly one GPT call"
        assert recommender_calls[0]["live_facts_keys"] == [], "GPT called WITHOUT live_facts"
        # GPT was asked for pool_size, not just final_count
        assert recommender_calls[0]["count"] >= final_count

    def test_only_gpt_pool_enriched_not_full_shortlist(self):
        """Enrichment must only process the small GPT-ranked pool, never the full shortlist."""
        shortlist = DISHES[:16]
        final_count = 3
        pool_size = min(max(final_count * 2, final_count + 3), len(shortlist))  # 6
        gpt_pool_dishes = shortlist[:pool_size]

        gpt_response = _pool_response(gpt_pool_dishes)
        enrich_call_sizes: list[int] = []

        async def fake_enrich(dishes, address_id=None, city=None):
            enrich_call_sizes.append(len(dishes))
            return "addr_1", [_match(d.id, d.name) for d in dishes[:final_count]]

        with patch("app.routes.recommendations.build_shortlist", return_value=shortlist), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        total_enriched = sum(enrich_call_sizes)
        assert total_enriched <= pool_size, (
            f"enriched {total_enriched} dishes but shortlist has {len(shortlist)}; "
            f"must not enrich beyond GPT pool ({pool_size})"
        )

    def test_progressive_probing_stops_early(self):
        """First wave finds enough matches → no second wave needed."""
        sample = DISHES[:8]
        final_count = 3
        pool_size = min(max(final_count * 2, final_count + 3), len(sample))  # 6
        gpt_response = _pool_response(sample[:pool_size])
        enrich_call_count = 0

        async def fake_enrich(dishes, address_id=None, city=None):
            nonlocal enrich_call_count
            enrich_call_count += 1
            # Wave 1: final_count+1 = 4 dishes; all match → stop
            return "addr_1", [_match(d.id, d.name) for d in dishes]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        assert enrich_call_count == 1, "should stop after first wave with enough matches"

    def test_progressive_probing_continues_on_few_matches(self):
        """When wave 1 is insufficient, probing continues into wave 2."""
        sample = DISHES[:8]
        final_count = 3
        pool_size = min(max(final_count * 2, final_count + 3), len(sample))  # 6
        gpt_response = _pool_response(sample[:pool_size])
        enrich_calls: list[list[str]] = []

        async def fake_enrich(dishes, address_id=None, city=None):
            ids = [d.id for d in dishes]
            enrich_calls.append(ids)
            # Wave 1: only 1 match (< final_count=3) → probe wave 2
            if len(enrich_calls) == 1:
                return "addr_1", [_match(dishes[0].id, dishes[0].name)] + [
                    EnrichedMatch(dish_id=d.id, matched=False) for d in dishes[1:]
                ]
            # Wave 2: provide remaining matches
            return "addr_1", [_match(d.id, d.name) for d in dishes]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        assert len(enrich_calls) == 2, "should probe wave 2 when wave 1 insufficient"
        # Wave 2 should not re-enrich dishes already attempted in wave 1
        wave1_ids = set(enrich_calls[0])
        wave2_ids = set(enrich_calls[1])
        assert wave1_ids.isdisjoint(wave2_ids), "wave 2 must not repeat wave 1 dishes"

    def test_final_order_is_gpt_ranked(self):
        """Final selection must preserve GPT ranking order (live first, then unmatched)."""
        sample = DISHES[:8]
        final_count = 3
        pool_size = min(max(final_count * 2, final_count + 3), len(sample))
        pool_dishes = sample[:pool_size]
        gpt_response = _pool_response(pool_dishes)  # GPT rank: 0,1,2,3,4,5

        async def fake_enrich(dishes, address_id=None, city=None):
            # Only dishes at GPT positions 1 and 2 match (not position 0)
            matched_ids = {pool_dishes[1].id, pool_dishes[2].id}
            return "addr_1", [
                _match(d.id, d.name) if d.id in matched_ids
                else EnrichedMatch(dish_id=d.id, matched=False)
                for d in dishes
            ]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        data = resp.json()
        recs = data["recommendations"]
        assert len(recs) == final_count
        # Live-matched dishes must come first (positions 1 and 2 from GPT ranking)
        live_ids = set(data.get("swiggy_matches", {}).keys())
        assert recs[0]["dish"]["id"] in live_ids
        assert recs[1]["dish"]["id"] in live_ids
        # Unmatched fills remaining slot, still from GPT pool (position 0)
        assert recs[2]["dish"]["id"] == pool_dishes[0].id

    def test_swiggy_matches_only_includes_final_selection(self):
        """swiggy_matches must only contain matches for dishes in the response."""
        sample = DISHES[:8]
        final_count = 3
        pool_size = min(max(final_count * 2, final_count + 3), len(sample))
        pool_dishes = sample[:pool_size]
        gpt_response = _pool_response(pool_dishes)

        async def fake_enrich(dishes, address_id=None, city=None):
            # All pool dishes match — response must only include final_count of them
            return "addr_1", [_match(d.id, d.name) for d in dishes]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        data = resp.json()
        rec_ids = {r["dish"]["id"] for r in data["recommendations"]}
        match_ids = set(data.get("swiggy_matches", {}).keys())
        assert match_ids.issubset(rec_ids), "swiggy_matches must only include selected recommendations"
        assert len(data["recommendations"]) == final_count

    def test_offline_when_no_address(self):
        sample = DISHES[:6]
        gpt_response = _pool_response(sample[:6])
        enrich = AsyncMock()

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich", new=enrich):
            resp = client.post("/api/ai-recommendations", json={
                "user_context": {"mood": {"primary": "happy"}},
                "recommendation_config": {"count": 3},
            })

        assert resp.status_code == 200
        data = resp.json()
        enrich.assert_not_called()
        assert data["live_status"] == "offline"
        assert data.get("swiggy_matches") in (None, {})

    def test_partial_live_status_when_some_unmatched(self):
        """Partial when live matches < final_count so unmatched dishes fill the response."""
        sample = DISHES[:8]
        final_count = 3
        pool_size = min(max(final_count * 2, final_count + 3), len(sample))
        pool_dishes = sample[:pool_size]
        gpt_response = _pool_response(pool_dishes)

        async def fake_enrich(dishes, address_id=None, city=None):
            # Only the very first dish in each wave matches → never accumulates final_count
            return "addr_1", [_match(dishes[0].id, dishes[0].name)] + [
                EnrichedMatch(dish_id=d.id, matched=False) for d in dishes[1:]
            ]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        data = resp.json()
        # Some matches found (live-first) + unmatched fill the rest → partial
        assert data["live_status"] == "partial", (
            f"expected partial, got {data['live_status']}; "
            f"swiggy_matches={data.get('swiggy_matches')}"
        )
        assert 0 < len(data.get("swiggy_matches") or {}) < final_count

    def test_live_data_injected_into_recommendation(self):
        """Live restaurant name/price/eta must appear in the final recommendation."""
        sample = DISHES[:6]
        pool_dishes = sample[:6]
        gpt_response = _pool_response(pool_dishes)

        live_rest = SwiggyRestaurant(id="r1", name="Live Biryani House", rating=4.5, eta_min=20)

        async def fake_enrich(dishes, address_id=None, city=None):
            return "addr_1", [
                EnrichedMatch(
                    dish_id=dishes[0].id, matched=True,
                    item=SwiggyMenuItem(id="i1", name=dishes[0].name, price=399),
                    restaurant=live_rest,
                )
            ] + [EnrichedMatch(dish_id=d.id, matched=False) for d in dishes[1:]]

        with patch("app.routes.recommendations.build_shortlist", return_value=sample), \
             patch("app.services.recommender.get_recommendations", return_value=gpt_response), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich",
                   new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        data = resp.json()
        live_rec = next(
            r for r in data["recommendations"] if r["dish"]["id"] == pool_dishes[0].id
        )
        assert live_rec["restaurant"]["name"] == "Live Biryani House"
        assert live_rec["restaurant"]["delivery_time_min"] == 20
        assert live_rec["practical_details"]["estimated_price"] == 399.0
