"""End-to-end tests for CleanRewards backend."""
import base64
import os
import uuid
import time
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 red pixel PNG base64
RED_PIXEL_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/Pchi7wAAAABJRU5ErkJggg=="
)


@pytest.fixture(scope="module")
def unique_user():
    tag = uuid.uuid4().hex[:8]
    return {
        "name": f"TEST User {tag}",
        "username": f"test_{tag}",
        "email": f"TEST_{tag}@example.com",
        "password": "testpass123",
    }


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Shared state across ordered tests
STATE: dict = {}


# ---------- Auth ----------
def test_01_signup(session, unique_user):
    r = session.post(f"{API}/auth/signup", json=unique_user, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and data["access_token"]
    u = data["user"]
    for k in ("id", "name", "username", "email"):
        assert u[k]
    assert u["points"] == 0
    assert u["total_cleanups"] == 0
    assert u["badges"] == []
    STATE["token"] = data["access_token"]
    STATE["user_id"] = u["id"]
    STATE["email"] = unique_user["email"]
    STATE["password"] = unique_user["password"]


def test_02_signup_duplicate_email(session, unique_user):
    r = session.post(f"{API}/auth/signup", json=unique_user, timeout=15)
    assert r.status_code == 409, r.text


def test_03_login_correct(session):
    r = session.post(
        f"{API}/auth/login",
        json={"email": STATE["email"], "password": STATE["password"]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


def test_04_login_wrong_password(session):
    r = session.post(
        f"{API}/auth/login",
        json={"email": STATE["email"], "password": "wrong-password"},
        timeout=15,
    )
    assert r.status_code == 401, r.text


def test_05_google_login_creates_new_user(session):
    email = f"TEST_google_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(
        f"{API}/auth/google",
        json={"email": email, "name": "Google Test", "picture": ""},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["user"]["email"] == email.lower()


def test_06_reset_password(session):
    new_pw = "newpass456"
    r = session.post(
        f"{API}/auth/reset-password",
        json={"email": STATE["email"], "new_password": new_pw},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # Old password fails
    r2 = session.post(
        f"{API}/auth/login",
        json={"email": STATE["email"], "password": STATE["password"]},
        timeout=15,
    )
    assert r2.status_code == 401
    # New password succeeds
    r3 = session.post(
        f"{API}/auth/login",
        json={"email": STATE["email"], "password": new_pw},
        timeout=15,
    )
    assert r3.status_code == 200
    STATE["password"] = new_pw
    STATE["token"] = r3.json()["access_token"]


# ---------- /me ----------
def _auth_headers():
    return {"Authorization": f"Bearer {STATE['token']}", "Content-Type": "application/json"}


def test_07_get_me_with_token(session):
    r = session.get(f"{API}/me", headers=_auth_headers(), timeout=15)
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["id"] == STATE["user_id"]


def test_08_get_me_without_token(session):
    r = requests.get(f"{API}/me", timeout=15)
    assert r.status_code == 401


def test_09_patch_me(session):
    updates = {"name": "Updated Name", "username": "updated_user", "bio": "new bio"}
    r = session.patch(f"{API}/me", headers=_auth_headers(), json=updates, timeout=15)
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["name"] == "Updated Name"
    assert u["username"] == "updated_user"
    assert u["bio"] == "new bio"


# ---------- Missions ----------
def test_10_list_missions(session):
    r = session.get(f"{API}/missions", timeout=15)
    assert r.status_code == 200
    missions = r.json()
    assert isinstance(missions, list) and len(missions) >= 4
    ids = {m["id"] for m in missions}
    assert {"m1", "m2", "m3", "m4"}.issubset(ids)
    m = missions[0]
    for k in ("title", "location", "lat", "lng", "difficulty", "est_minutes", "points", "image_url", "status"):
        assert k in m


def test_11_get_mission_m1(session):
    r = session.get(f"{API}/missions/m1", timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == "m1"


def test_12_get_mission_unknown(session):
    r = session.get(f"{API}/missions/doesnotexist_xyz", timeout=15)
    assert r.status_code == 404


# ---------- Cleanup submission (AI slow) ----------
def test_13_submit_cleanup(session):
    body = {
        "mission_id": "m1",
        "lat": 37.7699,
        "lng": -122.4677,
        "before_photo": RED_PIXEL_B64,
        "after_photo": RED_PIXEL_B64,
        "difficulty": "easy",
    }
    r = session.post(
        f"{API}/cleanups/submit",
        headers=_auth_headers(),
        json=body,
        timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("cleanup_id", "verified", "ai_result", "points_awarded", "new_badges"):
        assert k in data
    STATE["cleanup_verified"] = data["verified"]
    STATE["points_awarded"] = data["points_awarded"]
    STATE["new_badges"] = data["new_badges"]


def test_14_me_reflects_cleanup(session):
    r = session.get(f"{API}/me", headers=_auth_headers(), timeout=15)
    assert r.status_code == 200
    u = r.json()
    if STATE.get("cleanup_verified"):
        assert u["total_cleanups"] >= 1
        assert u["points"] >= STATE["points_awarded"]
        assert u["volunteer_hours"] > 0
        assert "first_cleanup" in u["badges"]
    else:
        pytest.skip("AI did not verify cleanup — skipping increment check")


def test_15_cleanups_mine(session):
    r = session.get(f"{API}/cleanups/mine", headers=_auth_headers(), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) >= 1
    for it in items:
        assert "before_photo" not in it
        assert "after_photo" not in it


def test_16_cleanups_all(session):
    r = session.get(f"{API}/cleanups/all", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    for it in items:
        assert "before_photo" not in it
        assert "after_photo" not in it


# ---------- Reports ----------
def test_17_create_report(session):
    body = {
        "description": "TEST litter pile",
        "lat": 37.77,
        "lng": -122.42,
        "photo_base64": RED_PIXEL_B64,
    }
    r = session.post(f"{API}/reports", headers=_auth_headers(), json=body, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "id" in data and "status" in data


def test_18_list_reports(session):
    r = session.get(f"{API}/reports", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) >= 1
    for it in items:
        assert "photo_base64" not in it


# ---------- Leaderboard ----------
@pytest.mark.parametrize("period", ["all", "weekly", "monthly"])
def test_19_leaderboard(session, period):
    r = session.get(f"{API}/leaderboard", params={"period": period}, timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list)
    for row in rows:
        for k in ("rank", "id", "name", "points", "total_cleanups", "volunteer_hours"):
            assert k in row


# ---------- Rewards / Badges / Notifications / Push ----------
def test_20_rewards(session):
    r = session.get(f"{API}/rewards", timeout=15)
    assert r.status_code == 200
    rewards = r.json()
    assert len(rewards) == 4
    for rw in rewards:
        for k in ("id", "title", "cost", "image", "description"):
            assert k in rw


def test_21_badges(session):
    r = session.get(f"{API}/badges", timeout=15)
    assert r.status_code == 200
    badges = r.json()
    assert len(badges) == 6
    ids = {b["id"] for b in badges}
    expected = {"first_cleanup", "neighborhood_hero", "park_protector", "points_1000", "cleanups_50", "community_champion"}
    assert expected.issubset(ids)


def test_22_notifications(session):
    r = session.get(f"{API}/notifications", headers=_auth_headers(), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) >= 3


def test_23_push_token_dedup(session):
    tok = f"ExponentPushToken[TEST_{uuid.uuid4().hex[:8]}]"
    r1 = session.post(f"{API}/push-token", headers=_auth_headers(), json={"token": tok}, timeout=15)
    assert r1.status_code == 200
    r2 = session.post(f"{API}/push-token", headers=_auth_headers(), json={"token": tok}, timeout=15)
    assert r2.status_code == 200
    # Verify no duplicate - inspect DB via /me? push_tokens not exposed; call twice must succeed.
    # The $addToSet guarantees no duplicate in Mongo; here we just assert idempotency of endpoint.
