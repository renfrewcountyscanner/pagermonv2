import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("PUBLIC_MAP_API_KEY", "test-map-key")
os.environ.setdefault("PG_HOST", "localhost")
os.environ.setdefault("PG_DATABASE", "pagermon")
os.environ.setdefault("PG_USER", "pagermon")
os.environ.setdefault("PG_PASSWORD", "test")

import app as map_app


class BuildCallObjectTest(unittest.TestCase):
    def test_corrected_coordinates_override_geocoded_coordinates(self):
        call = map_app.build_call_obj({
            "call_id": 1,
            "created_at": 1_700_000_000,
            "lat": 45.0,
            "lng": -75.0,
            "corrected_lat": 45.1,
            "corrected_lng": -75.1,
        })

        self.assertEqual(call["lat"], 45.1)
        self.assertEqual(call["lng"], -75.1)
        self.assertTrue(call["is_corrected"])


class PushCallTest(unittest.TestCase):
    def setUp(self):
        self.client = map_app.app.test_client()

    def test_push_requires_api_key(self):
        response = self.client.post("/api/push-call", json={"calls": []})
        self.assertEqual(response.status_code, 401)

    def test_push_broadcasts_valid_call(self):
        payload = {"calls": [{"call_id": 7, "created_at": 1_700_000_000, "lat": 45.0, "lng": -75.0}]}
        with patch.object(map_app.socketio, "emit") as emit:
            response = self.client.post("/api/push-call", json=payload, headers={"X-API-Key": "test-map-key"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["broadcasted"], 1)
        emit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
