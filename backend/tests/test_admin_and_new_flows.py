"""CleanRewards iteration 2 backend tests.

Covers ONLY new/changed endpoints (A-I):
- Admin auth guard (/api/admin/stats)
- Emergent Google Auth session exchange (/api/auth/session)
- Signup / login is_admin field
- Admin missions CRUD
- Admin rewards CRUD
- User redemption flow (create, list, insufficient points)
- Admin redemption flow (list, fulfill, reject with refund)
- Admin users list + toggle-admin (incl. self-toggle 400)
- Push relay register endpoint (graceful failure w/ placeholder key)

Uses only public EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env.
"""
import os
import uuid
from pathlib import Path

import pytest
import requests

# Load EXPO_PUBLIC_BACKEND_URL from frontend .env if not present in env
def _load_backend_url() -> str:
    v = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if v:
        return v.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admin@cleanrewards.com"
ADMIN_PASSWORD = "admin123"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_ctx(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    d = r.json()
    return {"token": d["access_token"], "user": d["user"]}


@pytest.fixture(scope="module")
def user_ctx(api):
    tag = uuid.uuid4().hex[:8]
    email = f"TEST_user_{tag}@example.com"
    payload = {"name": f"Test User {tag}", "username": f"tuser{tag}",
               "email": email, "password": "userpass123"}
    r = api.post(f"{BASE_URL}/api/auth/signup", json=payload)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    d = r.json()
    return {"token": d["access_token"], "user": d["user"], "email": email}


def h(token): return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# A. Admin auth guard
# ---------------------------------------------------------------------------
class TestAdminAuthGuard:
    def test_stats_no_token_401(self, api):
        r = api.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 401

    def test_stats_non_admin_403(self, api, user_ctx):
        r = api.get(f"{BASE_URL}/api/admin/stats", headers=h(user_ctx["token"]))
        assert r.status_code == 403

    def test_stats_admin_200(self, api, admin_ctx):
        r = api.get(f"{BASE_URL}/api/admin/stats", headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["users", "missions", "cleanups", "verified_cleanups",
                  "pending_review", "reports", "pending_redemptions",
                  "total_points_awarded"]:
            assert k in d, f"missing field {k}"
            assert isinstance(d[k], int)


# ---------------------------------------------------------------------------
# B. Emergent Google Auth session exchange
# ---------------------------------------------------------------------------
class TestSessionExchange:
    def test_empty_body_422_or_400(self, api):
        # FastAPI returns 422 for missing required field, but spec says 400
        # for empty session_id string. Test both cases.
        r = api.post(f"{BASE_URL}/api/auth/session", json={})
        assert r.status_code in (400, 422), f"unexpected {r.status_code}: {r.text}"

    def test_empty_session_id_400(self, api):
        r = api.post(f"{BASE_URL}/api/auth/session", json={"session_id": ""})
        assert r.status_code == 400

    def test_bogus_session_id_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/session",
                     json={"session_id": f"bogus-{uuid.uuid4().hex}"})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# C. Signup / login return is_admin field
# ---------------------------------------------------------------------------
class TestIsAdminField:
    def test_signup_is_admin_false(self, user_ctx):
        assert user_ctx["user"].get("is_admin") is False

    def test_admin_login_is_admin_true(self, admin_ctx):
        assert admin_ctx["user"].get("is_admin") is True


# ---------------------------------------------------------------------------
# D. Admin missions CRUD
# ---------------------------------------------------------------------------
class TestAdminMissions:
    mission_id = None

    def test_create_mission_as_non_admin_403(self, api, user_ctx):
        payload = {"title": "TEST_mission", "location": "TEST loc",
                   "lat": 37.0, "lng": -122.0, "difficulty": "easy",
                   "est_minutes": 15, "points": 50}
        r = api.post(f"{BASE_URL}/api/admin/missions", json=payload,
                     headers=h(user_ctx["token"]))
        assert r.status_code == 403

    def test_create_mission_as_admin_200(self, api, admin_ctx):
        payload = {"title": "TEST_mission_new", "location": "TEST loc",
                   "lat": 37.5, "lng": -122.5, "difficulty": "medium",
                   "est_minutes": 30, "points": 120}
        r = api.post(f"{BASE_URL}/api/admin/missions", json=payload,
                     headers=h(admin_ctx["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and d["title"] == "TEST_mission_new"
        assert d["points"] == 120
        TestAdminMissions.mission_id = d["id"]

    def test_missions_list_includes_new(self, api):
        assert TestAdminMissions.mission_id, "prev test must run"
        r = api.get(f"{BASE_URL}/api/missions")
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert TestAdminMissions.mission_id in ids

    def test_patch_mission(self, api, admin_ctx):
        assert TestAdminMissions.mission_id
        r = api.patch(
            f"{BASE_URL}/api/admin/missions/{TestAdminMissions.mission_id}",
            json={"title": "TEST_mission_edited"},
            headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_mission_edited"

    def test_delete_mission(self, api, admin_ctx):
        assert TestAdminMissions.mission_id
        r = api.delete(
            f"{BASE_URL}/api/admin/missions/{TestAdminMissions.mission_id}",
            headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        assert r.json().get("ok") is True
        r2 = api.get(f"{BASE_URL}/api/missions/{TestAdminMissions.mission_id}")
        assert r2.status_code == 404


# ---------------------------------------------------------------------------
# E. Admin rewards
# ---------------------------------------------------------------------------
class TestAdminRewards:
    reward_id = None

    def test_create_reward(self, api, admin_ctx):
        payload = {"title": "TEST_reward_cheap", "cost": 10,
                   "image": "coffee", "description": "cheap test reward"}
        r = api.post(f"{BASE_URL}/api/admin/rewards", json=payload,
                     headers=h(admin_ctx["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["cost"] == 10 and d["title"] == "TEST_reward_cheap"
        assert d.get("active") is True
        TestAdminRewards.reward_id = d["id"]

    def test_rewards_catalog_includes_new(self, api):
        r = api.get(f"{BASE_URL}/api/rewards")
        assert r.status_code == 200
        ids = [rw["id"] for rw in r.json()]
        assert TestAdminRewards.reward_id in ids

    def test_delete_reward_removes_from_catalog(self, api, admin_ctx):
        rid = TestAdminRewards.reward_id
        r = api.delete(f"{BASE_URL}/api/admin/rewards/{rid}",
                       headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        r2 = api.get(f"{BASE_URL}/api/rewards")
        ids = [rw["id"] for rw in r2.json()]
        assert rid not in ids


# ---------------------------------------------------------------------------
# F/G. Redemption flow (user + admin)
# ---------------------------------------------------------------------------
class TestRedemptionFlow:
    """End-to-end: cleanup -> admin approve (award points) -> create reward
    -> redeem -> admin fulfill -> create 2nd redemption -> admin reject (refund).
    """
    cheap_reward_id = None
    redemption_id = None
    second_redemption_id = None

    def test_insufficient_points_400(self, api, user_ctx):
        r = api.post(f"{BASE_URL}/api/redemptions",
                     json={"reward_id": "coffee_5"},
                     headers=h(user_ctx["token"]))
        assert r.status_code == 400

    def test_create_cheap_reward(self, api, admin_ctx):
        payload = {"title": "TEST_flow_reward", "cost": 10,
                   "image": "coffee", "description": "flow test"}
        r = api.post(f"{BASE_URL}/api/admin/rewards", json=payload,
                     headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        TestRedemptionFlow.cheap_reward_id = r.json()["id"]

    def test_earn_points_via_admin_approval(self, api, user_ctx, admin_ctx):
        # User submits cleanup with tiny dummy photo -> likely rejected by AI
        tiny_b64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQ"
                    "VR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=")
        submit = api.post(f"{BASE_URL}/api/cleanups/submit",
                          json={"lat": 37.7, "lng": -122.4,
                                "before_photo": tiny_b64,
                                "after_photo": tiny_b64,
                                "difficulty": "easy"},
                          headers=h(user_ctx["token"]),
                          timeout=45)
        assert submit.status_code == 200, submit.text
        cleanup_id = submit.json()["cleanup_id"]
        verified = submit.json().get("verified")

        # If AI happened to verify, user already has points; skip approval path
        if not verified:
            # Admin approves the pending_review cleanup
            r = api.post(
                f"{BASE_URL}/api/admin/cleanups/{cleanup_id}/review",
                json={"approved": True, "note": "manual approve"},
                headers=h(admin_ctx["token"]))
            assert r.status_code == 200
            assert r.json().get("status") == "approved"

        # Give user 500+ points: repeat approval flow if needed
        me = api.get(f"{BASE_URL}/api/me", headers=h(user_ctx["token"]))
        assert me.status_code == 200
        while me.json().get("points", 0) < 20:
            s = api.post(f"{BASE_URL}/api/cleanups/submit",
                         json={"lat": 37.7, "lng": -122.4,
                               "before_photo": tiny_b64,
                               "after_photo": tiny_b64,
                               "difficulty": "easy"},
                         headers=h(user_ctx["token"]),
                         timeout=45)
            assert s.status_code == 200
            cid = s.json()["cleanup_id"]
            if not s.json().get("verified"):
                api.post(f"{BASE_URL}/api/admin/cleanups/{cid}/review",
                         json={"approved": True, "note": "approve"},
                         headers=h(admin_ctx["token"]))
            me = api.get(f"{BASE_URL}/api/me", headers=h(user_ctx["token"]))
        assert me.json()["points"] >= 20

    def test_redeem_cheap_reward(self, api, user_ctx):
        me_before = api.get(f"{BASE_URL}/api/me",
                            headers=h(user_ctx["token"])).json()
        pts_before = me_before["points"]

        r = api.post(f"{BASE_URL}/api/redemptions",
                     json={"reward_id": TestRedemptionFlow.cheap_reward_id},
                     headers=h(user_ctx["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending"
        assert d["cost"] == 10
        assert "id" in d
        TestRedemptionFlow.redemption_id = d["id"]

        me_after = api.get(f"{BASE_URL}/api/me",
                           headers=h(user_ctx["token"])).json()
        assert me_after["points"] == pts_before - 10

    def test_redemptions_mine_shows_pending(self, api, user_ctx):
        r = api.get(f"{BASE_URL}/api/redemptions/mine",
                    headers=h(user_ctx["token"]))
        assert r.status_code == 200
        found = [x for x in r.json()
                 if x["id"] == TestRedemptionFlow.redemption_id]
        assert found and found[0]["status"] == "pending"

    def test_admin_lists_pending_redemption(self, api, admin_ctx):
        r = api.get(f"{BASE_URL}/api/admin/redemptions?status=pending",
                    headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestRedemptionFlow.redemption_id in ids

    def test_admin_fulfill_redemption(self, api, admin_ctx):
        rid = TestRedemptionFlow.redemption_id
        r = api.post(f"{BASE_URL}/api/admin/redemptions/{rid}/fulfill",
                     headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert d.get("code", "").startswith("CR-")

    def test_user_sees_fulfilled_with_code(self, api, user_ctx):
        r = api.get(f"{BASE_URL}/api/redemptions/mine",
                    headers=h(user_ctx["token"]))
        assert r.status_code == 200
        found = [x for x in r.json()
                 if x["id"] == TestRedemptionFlow.redemption_id]
        assert found
        assert found[0]["status"] == "fulfilled"
        assert found[0].get("code", "").startswith("CR-")

    def test_second_redemption_and_reject_refunds(self, api, user_ctx,
                                                  admin_ctx):
        # Ensure user has enough points; if not, top up
        me = api.get(f"{BASE_URL}/api/me",
                     headers=h(user_ctx["token"])).json()
        if me["points"] < 10:
            tiny_b64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0"
                        "lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=")
            s = api.post(f"{BASE_URL}/api/cleanups/submit",
                         json={"lat": 37.7, "lng": -122.4,
                               "before_photo": tiny_b64,
                               "after_photo": tiny_b64,
                               "difficulty": "easy"},
                         headers=h(user_ctx["token"]),
                         timeout=45)
            cid = s.json()["cleanup_id"]
            if not s.json().get("verified"):
                api.post(f"{BASE_URL}/api/admin/cleanups/{cid}/review",
                         json={"approved": True, "note": ""},
                         headers=h(admin_ctx["token"]))
            me = api.get(f"{BASE_URL}/api/me",
                         headers=h(user_ctx["token"])).json()

        pts_before = me["points"]
        r = api.post(f"{BASE_URL}/api/redemptions",
                     json={"reward_id": TestRedemptionFlow.cheap_reward_id},
                     headers=h(user_ctx["token"]))
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        TestRedemptionFlow.second_redemption_id = rid

        # Points deducted
        me2 = api.get(f"{BASE_URL}/api/me",
                      headers=h(user_ctx["token"])).json()
        assert me2["points"] == pts_before - 10

        # Reject -> refund
        rj = api.post(f"{BASE_URL}/api/admin/redemptions/{rid}/reject?note=test",
                      headers=h(admin_ctx["token"]))
        assert rj.status_code == 200, rj.text

        me3 = api.get(f"{BASE_URL}/api/me",
                      headers=h(user_ctx["token"])).json()
        assert me3["points"] == pts_before, "refund did not restore points"

        # And status is rejected on user side
        mine = api.get(f"{BASE_URL}/api/redemptions/mine",
                       headers=h(user_ctx["token"])).json()
        found = [x for x in mine if x["id"] == rid]
        assert found and found[0]["status"] == "rejected"


# ---------------------------------------------------------------------------
# H. Admin users list + toggle-admin
# ---------------------------------------------------------------------------
class TestAdminUsers:
    def test_list_users(self, api, admin_ctx, user_ctx):
        r = api.get(f"{BASE_URL}/api/admin/users",
                    headers=h(admin_ctx["token"]))
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert user_ctx["user"]["id"] in ids

    def test_toggle_other_user_admin(self, api, admin_ctx, user_ctx):
        uid = user_ctx["user"]["id"]
        r1 = api.post(f"{BASE_URL}/api/admin/users/{uid}/toggle-admin",
                      headers=h(admin_ctx["token"]))
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1.get("ok") is True
        assert d1.get("is_admin") is True

        r2 = api.post(f"{BASE_URL}/api/admin/users/{uid}/toggle-admin",
                      headers=h(admin_ctx["token"]))
        assert r2.status_code == 200
        assert r2.json().get("is_admin") is False

    def test_toggle_self_admin_400(self, api, admin_ctx):
        aid = admin_ctx["user"]["id"]
        r = api.post(f"{BASE_URL}/api/admin/users/{aid}/toggle-admin",
                     headers=h(admin_ctx["token"]))
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# I. Push registration relay - expected graceful failure with placeholder key
# ---------------------------------------------------------------------------
class TestPushRegister:
    def test_register_push_graceful(self, api, user_ctx):
        payload = {"user_id": user_ctx["user"]["id"],
                   "platform": "ios",
                   "device_token": f"fake-token-{uuid.uuid4().hex[:8]}"}
        try:
            r = api.post(f"{BASE_URL}/api/register-push", json=payload,
                         timeout=15)
        except requests.RequestException as e:
            pytest.fail(f"Client-side crash (not graceful): {e}")
        # Expected: 500 (placeholder key) or 502 (provider unreachable) or 201
        # Absolutely NOT allowed: 5xx with HTML stack trace / 200-with-error
        assert r.status_code in (201, 400, 500, 502), \
            f"unexpected {r.status_code}: {r.text[:200]}"
        # Response should be JSON with a "detail" or "status" field
        try:
            j = r.json()
        except Exception:
            pytest.fail(f"Non-JSON response body: {r.text[:200]}")
        assert isinstance(j, dict)
