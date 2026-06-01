import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestDishDetailEndpoint:
    def test_valid_dish_id_returns_200(self):
        resp = client.get("/api/dish/in_001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["dish"]["id"] == "in_001"
        assert data["dish"]["name"] == "Butter Chicken"

    def test_response_has_image_url(self):
        resp = client.get("/api/dish/jp_002")
        assert resp.json()["image_url"].startswith("https://")

    def test_response_has_practical_details(self):
        resp = client.get("/api/dish/it_002")
        pd = resp.json()["practical_details"]
        assert pd["estimated_price"] > 0
        assert pd["calories"] > 0
        assert 0 <= pd["health_score"] <= 10

    def test_response_has_restaurant(self):
        resp = client.get("/api/dish/mx_001")
        rest = resp.json()["restaurant"]
        assert rest["name"]
        assert 0 <= rest["rating"] <= 5
        assert rest["delivery_time_min"] > 0

    def test_response_has_alternatives_with_dish_ids(self):
        resp = client.get("/api/dish/in_004")
        alts = resp.json()["alternatives"]
        assert len(alts) == 2
        types = {a["type"] for a in alts}
        assert types == {"healthier_swap", "budget_swap"}
        for alt in alts:
            assert alt["dish_id"]
            assert alt["name"]
            assert alt["reason"]

    def test_alternative_dish_ids_are_valid(self):
        resp = client.get("/api/dish/in_004")
        alts = resp.json()["alternatives"]
        for alt in alts:
            detail_resp = client.get(f"/api/dish/{alt['dish_id']}")
            assert detail_resp.status_code == 200
            assert detail_resp.json()["success"] is True

    def test_response_has_pairing_suggestions(self):
        resp = client.get("/api/dish/th_001")
        pairings = resp.json()["pairing_suggestions"]
        assert len(pairings) >= 1
        assert pairings[0]["type"]
        assert pairings[0]["name"]

    def test_unknown_dish_id_returns_404_data(self):
        resp = client.get("/api/dish/nonexistent_999")
        assert resp.status_code == 200  # HTTP 200, but success=False
        data = resp.json()
        assert data["success"] is False
        assert "not found" in data["error"].lower()

    def test_all_cuisines_reachable(self):
        sample_ids = ["in_001", "it_001", "mx_001", "jp_001", "am_001", "md_001", "cn_001", "th_001"]
        for dish_id in sample_ids:
            resp = client.get(f"/api/dish/{dish_id}")
            assert resp.status_code == 200
            assert resp.json()["success"] is True
