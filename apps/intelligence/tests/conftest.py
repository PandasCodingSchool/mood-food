import os
import uuid

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from app.main import app
import app.services.recommender as _recommender_svc


@pytest.fixture(autouse=True)
def no_network_keys(monkeypatch):
    """Tests never spend money or hit the network: real keys from .env are blanked."""
    from app.config import settings
    from app.decisions import jev

    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "jev_api_key", "")
    monkeypatch.setattr(settings, "ranker_provider", "off")
    monkeypatch.setattr(jev, "_client", None)


@pytest.fixture(autouse=True)
def tmp_sqlite_store(tmp_path, monkeypatch):
    """Every test gets a throwaway SQLite store (tests may override the path)."""
    from app.config import settings
    import app.learning.store as store_mod

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "store.db"))
    store_mod.close()
    yield
    store_mod.close()


@pytest.fixture(autouse=True)
def postgres_store(monkeypatch):
    """With TEST_DATABASE_URL set, every test runs on Postgres in a fresh schema.

        TEST_DATABASE_URL=postgresql://moodfood:moodfood@localhost:55432/moodfood pytest
    """
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        yield
        return
    import psycopg
    from app.config import settings
    import app.learning.store as store_mod

    schema = f"t_{uuid.uuid4().hex[:12]}"
    monkeypatch.setattr(settings, "database_url", url)
    monkeypatch.setattr(settings, "database_schema", schema)
    store_mod.close()
    yield
    store_mod.close()
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


@pytest.fixture(autouse=True)
def clear_recommendation_cache():
    _recommender_svc._CACHE.clear()
    from app.services import swiggy_discovery
    swiggy_discovery._ENRICH_CACHE.clear()
    yield
    _recommender_svc._CACHE.clear()
    swiggy_discovery._ENRICH_CACHE.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def minimal_payload():
    return {
        "user_context": {
            "mood": {"primary": "stressed", "energy_level": 3}
        }
    }


@pytest.fixture
def full_payload():
    return {
        "user_context": {
            "mood": {"primary": "happy", "energy_level": 7, "social_context": "friends"},
            "preferences": {
                "cuisine_types": ["indian", "italian"],
                "dietary_restrictions": ["vegetarian"],
                "allergies": ["nuts"],
                "spice_tolerance": "medium",
            },
            "situational": {
                "time_of_day": "dinner",
                "weather": "rainy",
                "budget": {"max": 500, "currency": "INR"},
                "time_available": 40,
                "delivery_preferred": True,
            },
            "game_data": {
                "slider_values": {"adventurous": 5, "health_conscious": 7, "spicy": 4}
            },
            "history": {
                "avoid_these": ["sushi"]
            },
        },
        "recommendation_config": {
            "count": 3,
            "temperature": 0.7,
            "include_explanations": True,
            "include_alternatives": True,
        },
    }


@pytest.fixture
def mock_llm_response():
    """Returns a mock LangChain AIMessage with 3 valid dish IDs."""
    mock_resp = MagicMock()
    mock_resp.content = """{
        "ranked_dishes": [
            {"dish_id": "in_002", "confidence": 0.91, "mood_match": "Dal Makhani is ultimate comfort for a stressed mind", "context_fit": "Vegetarian, within budget, delivery-ready", "psychological_hook": "Creamy warmth triggers serotonin release", "nostalgia_factor": "Reminds of home-cooked meals"},
            {"dish_id": "in_010", "confidence": 0.85, "mood_match": "Palak Paneer soothes stress with familiar warmth", "context_fit": "Vegetarian, budget-friendly, quick delivery", "psychological_hook": "Green colour signals health, reducing guilt", "nostalgia_factor": null},
            {"dish_id": "it_008", "confidence": 0.78, "mood_match": "Minestrone soup is liquid comfort on a rainy day", "context_fit": "Vegan, light, fast to prepare", "psychological_hook": "Warm broth mimics a comforting hug", "nostalgia_factor": "Soup is universally nostalgic"}
        ],
        "mood_profile": "Comfort-seeking, mildly stressed, craving warmth",
        "preference_evolution": "Trending toward lighter, health-conscious choices",
        "restaurant_suggestions": [
            {"name": "Spice Garden", "rating": 4.4, "distance_km": 1.2, "delivery_time_min": 25, "is_open": true},
            {"name": "Green Bowl", "rating": 4.1, "distance_km": 2.0, "delivery_time_min": 30, "is_open": true},
            {"name": "Italian Corner", "rating": 4.3, "distance_km": 1.8, "delivery_time_min": 28, "is_open": true}
        ]
    }"""
    mock_resp.response_metadata = {"token_usage": {"total_tokens": 1250}}
    return mock_resp
