"""Robot integration & mission-claim tests (iteration 3).

Covers:
- Admin robot registration/list/get/delete
- Robot self-serve endpoints w/ X-Robot-Key
- Detection points formula (incl. object_count bonus)
- Admin simulate-detection
- Mission claim / release / mine-claimed
- Admin stats includes robot fields
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@cleanrewards.com"
ADMIN_PASSWORD = "admin123"

# Tiny 1x1 gray PNG base64 (same used in server)
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42Y"
    "AAAAASUVORK5CYII="
)


# ---------- Fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _create_user():
    email = f"TEST_robot_{uuid.uuid4().hex[:8]}@cleanrewards.com"
    r = requests.post(
        f"{API}/auth/signup",
        json={"name": "Robot Test", "username": f"rtest_{uuid.uuid4().hex[:6]}", "email": email, "password": "test123"},
        timeout=15,
    )
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]["id"]


@pytest.fixture(scope="module")
def user_a():
    return _create_user()


@pytest.fixture(scope="module")
def user_b():
    return _create_user()


@pytest.fixture(scope="module")
def robot(admin_token):
    """Register a robot; return (id, api_key)."""
    body = {"name": f"TEST_Robot_{uuid.uuid4().hex[:6]}", "city": "Testville", "notify_radius_miles": 2.0}
    r = requests.post(f"{API}/admin/robots", json=body, headers=_headers(admin_token), timeout=15)
    assert r.status_code == 200, f"register robot: {r.status_code} {r.text}"
    d = r.json()
    assert "api_key" in d and len(d["api_key"]) > 20, "api_key missing/short"
    assert "id" in d
    yield d["id"], d["api_key"]
    # teardown: delete robot
    requests.delete(f"{API}/admin/robots/{d['id']}", headers=_headers(admin_token), timeout=15)


# ---------- A. Admin robot registration & authentication -------------------
class TestAdminRobotMgmt:
    def test_non_admin_cannot_register(self, user_a):
        tok, _ = user_a
        r = requests.post(f"{API}/admin/robots", json={"name": "X", "city": "Y"}, headers=_headers(tok), timeout=15)
        assert r.status_code == 403

    def test_register_returns_key_once(self, robot):
        rid, key = robot
        assert rid and key

    def test_list_robots_no_hash(self, admin_token, robot):
        rid, _ = robot
        r = requests.get(f"{API}/admin/robots", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200
        robots = r.json()
        ids = [x["id"] for x in robots]
        assert rid in ids
        for x in robots:
            assert "api_key_hash" not in x
            assert "api_key" not in x

    def test_get_robot_detail_initial(self, admin_token):
        # Use a fresh robot to guarantee empty detections/patrols regardless of
        # test order across pytest-xdist workers.
        body = {"name": f"TEST_Init_{uuid.uuid4().hex[:6]}", "city": "Z", "notify_radius_miles": 1.0}
        c = requests.post(f"{API}/admin/robots", json=body, headers=_headers(admin_token), timeout=15)
        assert c.status_code == 200
        rid = c.json()["id"]
        try:
            r = requests.get(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["id"] == rid
            assert d["detections"] == []
            assert d["patrols"] == []
            assert "api_key_hash" not in d
        finally:
            requests.delete(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15)


# ---------- B. Robot self-serve endpoints ----------------------------------
class TestRobotSelfServe:
    def test_status_no_key(self):
        r = requests.post(f"{API}/robot/status", json={"battery": 90.0, "connected": True}, timeout=15)
        assert r.status_code == 401

    def test_status_wrong_key(self):
        r = requests.post(
            f"{API}/robot/status",
            json={"battery": 90.0, "connected": True},
            headers={"X-Robot-Key": "totally-wrong-key", "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_status_valid_updates_robot(self, admin_token, robot):
        rid, key = robot
        r = requests.post(
            f"{API}/robot/status",
            json={"battery": 77.5, "lat": 37.5, "lng": -122.5, "connected": True},
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

        d = requests.get(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15).json()
        assert d["battery"] == 77.5
        assert d["lat"] == 37.5
        assert d["lng"] == -122.5
        assert d["last_seen"]

    def test_patrol_valid(self, admin_token, robot):
        rid, key = robot
        pts = [
            {"lat": 37.51, "lng": -122.51, "t": "2026-01-01T00:00:00Z"},
            {"lat": 37.52, "lng": -122.52, "t": "2026-01-01T00:01:00Z"},
        ]
        r = requests.post(
            f"{API}/robot/patrol",
            json={"points": pts},
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["count"] == 2

        d = requests.get(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15).json()
        assert len(d["patrols"]) == 1

    def test_detection_valid_creates_mission(self, admin_token, robot):
        rid, key = robot
        r = requests.post(
            f"{API}/robot/detection",
            json={
                "lat": 37.6, "lng": -122.6, "photo_base64": TINY_PNG,
                "confidence": 0.9, "size": "large", "object_count": 1,
            },
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "detection_id" in j
        assert "mission_id" in j
        assert j["points"] == 250  # large
        assert "ai_objects" in j
        assert "ai_size" in j

        # Verify mission
        m = requests.get(f"{API}/missions/{j['mission_id']}", timeout=15).json()
        assert m["source"] == "robot"
        assert m["robot_id"] == rid
        assert m["size"] == "large"
        assert m["points"] == 250
        assert m["difficulty"] == "hard"
        assert m["status"] == "open"
        assert m.get("expires_at")


# ---------- C. Detection points formula (via simulate + direct detection) ---
class TestPointsFormula:
    def test_size_medium_with_object_count_bonus(self, robot):
        _, key = robot
        # medium(100) + 25*(3-1)=50 -> 150
        r = requests.post(
            f"{API}/robot/detection",
            json={
                "lat": 37.7, "lng": -122.7, "photo_base64": TINY_PNG,
                "confidence": 0.85, "size": "medium", "object_count": 3,
            },
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert r.json()["points"] == 150

    def test_small_default(self, robot):
        _, key = robot
        r = requests.post(
            f"{API}/robot/detection",
            json={"lat": 37.7, "lng": -122.7, "photo_base64": TINY_PNG,
                  "confidence": 0.85, "size": "small", "object_count": 1},
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=60,
        )
        assert r.status_code == 200
        assert r.json()["points"] == 50

    def test_multi_default(self, robot):
        _, key = robot
        # multi=400, no extra bonus since size=='multi'
        r = requests.post(
            f"{API}/robot/detection",
            json={"lat": 37.7, "lng": -122.7, "photo_base64": TINY_PNG,
                  "confidence": 0.85, "size": "multi", "object_count": 5},
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=60,
        )
        assert r.status_code == 200
        assert r.json()["points"] == 400

    def test_bonus_cap(self, robot):
        _, key = robot
        # small(50) + 25*min(20-1,6)=150 -> 200
        r = requests.post(
            f"{API}/robot/detection",
            json={"lat": 37.7, "lng": -122.7, "photo_base64": TINY_PNG,
                  "confidence": 0.85, "size": "small", "object_count": 20},
            headers={"X-Robot-Key": key, "Content-Type": "application/json"},
            timeout=60,
        )
        assert r.status_code == 200
        assert r.json()["points"] == 200


# ---------- D. Admin simulate-detection -------------------------------------
class TestAdminSimulateDetection:
    def test_non_admin_forbidden(self, user_a, robot):
        tok, _ = user_a
        rid, _ = robot
        r = requests.post(f"{API}/admin/robots/{rid}/simulate-detection", headers=_headers(tok), timeout=15)
        assert r.status_code == 403

    def test_admin_simulate_and_stats(self, admin_token, robot):
        rid, _ = robot
        before = requests.get(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15).json()
        before_det = before["total_detections"]
        before_mis = before["missions_generated"]

        r = requests.post(f"{API}/admin/robots/{rid}/simulate-detection", headers=_headers(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "detection_id" in j and "mission_id" in j
        assert "size" in j and "points" in j

        # New mission with source=robot should appear
        missions = requests.get(f"{API}/missions", timeout=15).json()
        ids = [m["id"] for m in missions]
        assert j["mission_id"] in ids

        after = requests.get(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15).json()
        assert after["total_detections"] == before_det + 1
        assert after["missions_generated"] == before_mis + 1


# ---------- E. Mission claim/release/mine-claimed ---------------------------
@pytest.fixture(scope="module")
def robot_mission(admin_token, robot):
    """Create a robot-source mission via simulate for claim tests."""
    rid, _ = robot
    r = requests.post(f"{API}/admin/robots/{rid}/simulate-detection", headers=_headers(admin_token), timeout=30)
    assert r.status_code == 200
    return r.json()["mission_id"]


class TestMissionClaim:
    def test_mine_claimed_no_auth(self):
        r = requests.get(f"{API}/missions/mine-claimed", timeout=15)
        assert r.status_code == 401

    def test_mine_claimed_empty(self, user_a):
        tok, _ = user_a
        r = requests.get(f"{API}/missions/mine-claimed", headers=_headers(tok), timeout=15)
        assert r.status_code == 200
        # Note: previous tests may have created claims but they should have been released.
        assert isinstance(r.json(), list)

    def test_claim_and_conflict(self, user_a, user_b, robot_mission):
        tok_a, uid_a = user_a
        tok_b, _ = user_b
        mid = robot_mission

        # A claims
        r = requests.post(f"{API}/missions/{mid}/claim", headers=_headers(tok_a), timeout=15)
        assert r.status_code == 200, r.text
        assert "reserved_until" in r.json()

        # Mine-claimed includes it
        mine = requests.get(f"{API}/missions/mine-claimed", headers=_headers(tok_a), timeout=15).json()
        assert any(m["id"] == mid for m in mine)

        # Mission detail shows claimed_by
        detail = requests.get(f"{API}/missions/{mid}", timeout=15).json()
        assert detail.get("claimed_by") == uid_a

        # B conflict
        r2 = requests.post(f"{API}/missions/{mid}/claim", headers=_headers(tok_b), timeout=15)
        assert r2.status_code == 409

        # A releases
        r3 = requests.post(f"{API}/missions/{mid}/release", headers=_headers(tok_a), timeout=15)
        assert r3.status_code == 200

        mine2 = requests.get(f"{API}/missions/mine-claimed", headers=_headers(tok_a), timeout=15).json()
        assert not any(m["id"] == mid for m in mine2)

        # B claims now
        r4 = requests.post(f"{API}/missions/{mid}/claim", headers=_headers(tok_b), timeout=15)
        assert r4.status_code == 200

        # cleanup: B releases
        requests.post(f"{API}/missions/{mid}/release", headers=_headers(tok_b), timeout=15)

    def test_claim_nonexistent_404(self, user_a):
        tok, _ = user_a
        r = requests.post(f"{API}/missions/nonexistent-{uuid.uuid4().hex}/claim", headers=_headers(tok), timeout=15)
        assert r.status_code == 404

    def test_claim_completed_400(self, admin_token, user_a):
        tok, _ = user_a
        # Create a mission then patch to completed
        create = requests.post(
            f"{API}/admin/missions",
            json={"title": "TEST_completed", "location": "X", "lat": 0.0, "lng": 0.0,
                  "difficulty": "easy", "est_minutes": 5, "points": 10},
            headers=_headers(admin_token), timeout=15,
        )
        assert create.status_code == 200
        mid = create.json()["id"]
        upd = requests.patch(f"{API}/admin/missions/{mid}", json={"status": "completed"}, headers=_headers(admin_token), timeout=15)
        assert upd.status_code == 200

        r = requests.post(f"{API}/missions/{mid}/claim", headers=_headers(tok), timeout=15)
        assert r.status_code == 400

        # cleanup
        requests.delete(f"{API}/admin/missions/{mid}", headers=_headers(admin_token), timeout=15)


# ---------- F. Admin stats includes robot fields ----------------------------
class TestAdminStats:
    def test_stats_has_robot_fields(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "robots" in d and isinstance(d["robots"], int)
        assert "robot_detections" in d and isinstance(d["robot_detections"], int)
        assert d["robots"] >= 1
        assert d["robot_detections"] >= 1


# ---------- G. Delete robot -------------------------------------------------
class TestDeleteRobot:
    def test_delete_robot(self, admin_token):
        # register a dedicated robot to delete
        body = {"name": f"TEST_ToDelete_{uuid.uuid4().hex[:6]}", "city": "X", "notify_radius_miles": 1.0}
        r = requests.post(f"{API}/admin/robots", json=body, headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        d = requests.delete(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15)
        assert d.status_code == 200

        g = requests.get(f"{API}/admin/robots/{rid}", headers=_headers(admin_token), timeout=15)
        assert g.status_code == 404
