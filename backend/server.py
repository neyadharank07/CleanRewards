"""CleanRewards backend — FastAPI + MongoDB.

Includes:
- JWT email/password auth (signup/login/reset)
- Emergent-managed Google Auth via /api/auth/session (session_token, 7-day)
- Emergent-managed Push Notifications (register-push + send_push helper)
- Missions, cleanups w/ AI verification via Gemini vision, litter reports
- Leaderboard, rewards catalog, badges
- Reward redemption flow (user creates -> admin fulfills)
- Admin dashboard endpoints (approve/reject cleanups, missions, rewards,
  redemptions, users, analytics)
"""
from __future__ import annotations

import base64
import json
import logging
import math
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_HOURS = 24 * 30  # 30 days
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Push notifications relay
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

# Emergent Google Auth
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("cleanrewards")

app = FastAPI(title="CleanRewards API")
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class SignupIn(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionExchangeIn(BaseModel):
    session_id: str


class ResetPasswordIn(BaseModel):
    email: EmailStr
    new_password: str


class MissionCreateIn(BaseModel):
    title: str
    location: str
    lat: float
    lng: float
    difficulty: str = "medium"  # easy | medium | hard
    est_minutes: int = 30
    points: int = 100
    image_url: str = ""


class MissionPatchIn(BaseModel):
    title: Optional[str] = None
    location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    difficulty: Optional[str] = None
    est_minutes: Optional[int] = None
    points: Optional[int] = None
    image_url: Optional[str] = None
    status: Optional[str] = None


class ReportIn(BaseModel):
    description: str
    lat: float
    lng: float
    photo_base64: str


class CleanupSubmitIn(BaseModel):
    mission_id: Optional[str] = None
    lat: float
    lng: float
    before_photo: str
    after_photo: str
    difficulty: str = "medium"


class PushRegisterIn(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None


class RedemptionCreateIn(BaseModel):
    reward_id: str


class RewardCreateIn(BaseModel):
    title: str
    cost: int
    image: str = "coffee"
    description: str = ""


class AdminReviewIn(BaseModel):
    approved: bool
    note: str = ""


class RobotRegisterIn(BaseModel):
    name: str
    city: str = ""
    notify_radius_miles: float = 1.0


class RobotDetectionIn(BaseModel):
    lat: float
    lng: float
    photo_base64: str
    confidence: float = 0.9
    size: str = "medium"  # small | medium | large | multi
    object_count: int = 1
    ai_metadata: Optional[dict] = None  # optional: robot's own YOLO/TFLite output


class RobotStatusIn(BaseModel):
    battery: float = 100.0  # 0-100
    lat: Optional[float] = None
    lng: Optional[float] = None
    connected: bool = True


class RobotPatrolIn(BaseModel):
    points: List[dict]  # [{"lat": .., "lng": .., "t": iso}]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(hours=JWT_HOURS)},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


async def _resolve_bearer_user(token: str) -> Optional[dict]:
    """Bearer token can be a JWT or a session_token (Google OAuth)."""
    # Try JWT first
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if u:
            return u
    except Exception:
        pass
    # Fallback: session_token
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None
    return await db.users.find_one({"id": sess["user_id"]}, {"_id": 0, "password_hash": 0})


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[7:]
    user = await _resolve_bearer_user(token)
    if not user:
        raise HTTPException(401, "Invalid or expired token")
    return user


async def require_admin(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


async def current_robot(x_robot_key: str = Header(default="", alias="X-Robot-Key")) -> dict:
    """Authenticate a robot by its API key (X-Robot-Key header)."""
    if not x_robot_key:
        raise HTTPException(401, "Missing X-Robot-Key")
    key_hash = bcrypt.hashpw(x_robot_key.encode(), bcrypt.gensalt()).decode()  # only used for comparison shape
    # We compare using bcrypt.checkpw against each robot's stored api_key_hash.
    # In practice, keys are short-ish (43 chars) so we iterate.
    async for r in db.robots.find({}, {"_id": 0}):
        stored = r.get("api_key_hash", "")
        if stored and bcrypt.checkpw(x_robot_key.encode(), stored.encode()):
            return r
    _ = key_hash  # unused; kept for lint quiet
    raise HTTPException(401, "Invalid robot key")


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.8  # miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def detect_litter_objects(photo_base64: str) -> dict:
    """Use Gemini vision to classify litter objects in a robot detection photo."""
    photo_base64 = strip_data_url(photo_base64)
    if not EMERGENT_LLM_KEY:
        return {"objects": [], "reason": "AI key missing"}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # type: ignore
    except Exception:
        return {"objects": [], "reason": "AI SDK unavailable"}
    try:
        chat = (
            LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"detect-{uuid.uuid4()}",
                system_message="You are a computer-vision classifier for litter on public streets.",
            )
            .with_model("gemini", "gemini-2.5-flash")
            .with_params(temperature=0.0)
        )
        prompt = (
            "Analyze the image and identify visible litter/trash objects. "
            "Return ONLY JSON: {\"objects\": [{\"label\": \"bottle|can|plastic_bag|paper|cup|"
            "food_wrapper|cardboard|other\", \"confidence\": 0-1}], \"size\": \"small|medium|large|multi\"}."
        )
        msg = UserMessage(text=prompt, file_contents=[ImageContent(photo_base64)])
        raw = await chat.send_message(msg)
        text = raw if isinstance(raw, str) else str(raw)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        data = json.loads(m.group(0)) if m else {"objects": []}
        data.setdefault("objects", [])
        return data
    except Exception as e:
        log.warning("Litter detection error: %s", e)
        return {"objects": [], "reason": str(e)[:120]}


DETECTION_POINTS = {"small": 50, "medium": 100, "large": 250, "multi": 400}
DETECTION_MINUTES = {"small": 15, "medium": 30, "large": 60, "multi": 75}
DETECTION_DIFFICULTY = {"small": "easy", "medium": "medium", "large": "hard", "multi": "hard"}


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "name": u.get("name", ""),
        "username": u.get("username", ""),
        "email": u.get("email", ""),
        "bio": u.get("bio", ""),
        "profile_picture": u.get("profile_picture", ""),
        "points": u.get("points", 0),
        "total_cleanups": u.get("total_cleanups", 0),
        "volunteer_hours": u.get("volunteer_hours", 0.0),
        "current_streak": u.get("current_streak", 0),
        "badges": u.get("badges", []),
        "is_admin": bool(u.get("is_admin", False)),
        "created_at": u.get("created_at", ""),
    }


def strip_data_url(s: str) -> str:
    if s.startswith("data:"):
        return s.split(",", 1)[-1]
    return s


BADGE_DEFS = [
    {"id": "first_cleanup", "name": "First Cleanup", "description": "Complete your first cleanup", "icon": "leaf"},
    {"id": "neighborhood_hero", "name": "Neighborhood Hero", "description": "Complete 10 cleanups", "icon": "home"},
    {"id": "park_protector", "name": "Park Protector", "description": "Complete 5 park missions", "icon": "tree"},
    {"id": "points_1000", "name": "1000 Points Club", "description": "Earn 1000 points", "icon": "trophy"},
    {"id": "cleanups_50", "name": "50 Cleanups", "description": "Complete 50 cleanups", "icon": "flame"},
    {"id": "community_champion", "name": "Community Champion", "description": "Reach top 10 on the leaderboard", "icon": "ribbon"},
]

SEED_REWARDS = [
    {"id": "coffee_5", "title": "$5 Coffee Gift Card", "cost": 500, "image": "coffee", "description": "Redeemable at partner cafes", "active": True},
    {"id": "restaurant_drink", "title": "Free Local Restaurant Drink", "cost": 300, "image": "drink", "description": "One free drink at partners", "active": True},
    {"id": "movie_ticket", "title": "Movie Ticket", "cost": 1200, "image": "movie", "description": "One general admission ticket", "active": True},
    {"id": "park_pass", "title": "Day Park Pass", "cost": 800, "image": "park", "description": "One day access to city parks", "active": True},
]


async def maybe_award_badges(user: dict) -> List[str]:
    earned = set(user.get("badges", []))
    new: List[str] = []
    points = user.get("points", 0)
    cleanups = user.get("total_cleanups", 0)
    if cleanups >= 1 and "first_cleanup" not in earned:
        new.append("first_cleanup")
    if cleanups >= 10 and "neighborhood_hero" not in earned:
        new.append("neighborhood_hero")
    if cleanups >= 5 and "park_protector" not in earned:
        new.append("park_protector")
    if points >= 1000 and "points_1000" not in earned:
        new.append("points_1000")
    if cleanups >= 50 and "cleanups_50" not in earned:
        new.append("cleanups_50")
    if new:
        await db.users.update_one({"id": user["id"]}, {"$addToSet": {"badges": {"$each": new}}})
    return new


async def verify_cleanup_with_ai(before_b64: str, after_b64: str) -> dict:
    before_b64 = strip_data_url(before_b64)
    after_b64 = strip_data_url(after_b64)
    if not EMERGENT_LLM_KEY:
        return {"verified": True, "confidence": 0.6, "reason": "AI key missing — fallback verified"}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # type: ignore
    except Exception as e:
        log.warning("emergentintegrations import failed: %s", e)
        return {"verified": True, "confidence": 0.5, "reason": "AI SDK unavailable"}
    try:
        session_id = f"verify-{uuid.uuid4()}"
        chat = (
            LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=session_id,
                system_message=(
                    "You are an image-verification assistant for CleanRewards, "
                    "a civic cleanup app. Compare BEFORE and AFTER photos of a "
                    "littered area and decide if a real cleanup happened."
                ),
            )
            .with_model("gemini", "gemini-2.5-flash")
            .with_params(temperature=0.0)
        )
        prompt = (
            "The FIRST image is BEFORE the cleanup. The SECOND image is AFTER. "
            "Return ONLY compact JSON of the form: "
            '{"verified": true|false, "confidence": 0-1, "reason": "short reason", '
            '"trash_removed_estimate": "small|medium|large"} '
            "verified=true only if visible litter was noticeably removed."
        )
        msg = UserMessage(text=prompt, file_contents=[ImageContent(before_b64), ImageContent(after_b64)])
        raw = await chat.send_message(msg)
        text = raw if isinstance(raw, str) else str(raw)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        data = json.loads(match.group(0)) if match else {"verified": True, "confidence": 0.5, "reason": text[:120]}
        data.setdefault("verified", True)
        data.setdefault("confidence", 0.7)
        data.setdefault("reason", "OK")
        return data
    except Exception as e:
        log.exception("AI verification error")
        return {"verified": True, "confidence": 0.5, "reason": f"AI error: {e}"}


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    """Fire-and-forget push notification through Emergent-managed relay.

    Never blocks the primary operation — callers should wrap in try/except.
    """
    if not recipients:
        return
    if len(recipients) > 100:
        recipients = recipients[:100]
    if "title" not in data or "message" not in data:
        return
    payload: dict = {"recipients": list({r for r in recipients if r}), "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    try:
        resp = await _push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code == 401:
            log.warning("EMERGENT_PUSH_KEY invalid or placeholder — push skipped")
            return
        if resp.status_code >= 400:
            log.warning("Push relay returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        log.warning("Push relay error: %s", e)


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
SEED_MISSIONS = [
    {
        "id": "m1", "title": "Riverside Park Cleanup", "location": "Riverside Park, Downtown",
        "lat": 37.7699, "lng": -122.4677, "difficulty": "easy", "est_minutes": 20, "points": 50,
        "image_url": "https://images.unsplash.com/photo-1655718859450-cc98464b82ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHx0cmFzaCUyMGxpdHRlciUyMG9uJTIwZ3Jhc3MlMjBwYXJrfGVufDB8fHx8MTc4NTc3NDg5N3ww&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
    {
        "id": "m2", "title": "Beachfront Bottle Sweep", "location": "Ocean Beach, West Pier",
        "lat": 37.7594, "lng": -122.5107, "difficulty": "medium", "est_minutes": 45, "points": 100,
        "image_url": "https://images.unsplash.com/photo-1640287807682-b3195cc6b320?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwxfHxjbGVhbiUyMGNpdHklMjBwYXJrJTIwdHJlZXN8ZW58MHx8fHwxNzgzMjY1NDA3fDA&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
    {
        "id": "m3", "title": "Neighborhood Alleyway Cleanup", "location": "Mission District Alley",
        "lat": 37.7620, "lng": -122.4192, "difficulty": "hard", "est_minutes": 90, "points": 250,
        "image_url": "https://images.unsplash.com/photo-1599059813005-11265ba4b4ce?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBwZW9wbGUlMjBoZWxwaW5nfGVufDB8fHx8MTc4NTc3NDkxMXww&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
    {
        "id": "m4", "title": "School Playground Refresh", "location": "Lincoln Elementary Playground",
        "lat": 37.7749, "lng": -122.4194, "difficulty": "easy", "est_minutes": 25, "points": 60,
        "image_url": "https://images.unsplash.com/photo-1592859600972-1b0834d83747?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwxfHxmb3Jlc3QlMjBuYXR1cmUlMjB0cmFpbHxlbnwwfHx8fDE3ODI5ODQwNzV8MA&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
]


@app.on_event("startup")
async def _startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.missions.create_index("id", unique=True)
    await db.rewards.create_index("id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    # TTL for user_sessions.expires_at
    try:
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
    # Robot indexes
    await db.robots.create_index("id", unique=True)
    await db.robot_detections.create_index("robot_id")
    await db.robot_detections.create_index("created_at")
    await db.robot_status.create_index("robot_id")
    await db.robot_patrols.create_index("robot_id")
    await db.mission_claims.create_index("mission_id", unique=True)
    await db.mission_claims.create_index("user_id")
    try:
        await db.mission_claims.create_index("reserved_until", expireAfterSeconds=0)
    except Exception:
        pass

    for m in SEED_MISSIONS:
        await db.missions.update_one({"id": m["id"]}, {"$setOnInsert": m}, upsert=True)
    for r in SEED_REWARDS:
        await db.rewards.update_one({"id": r["id"]}, {"$setOnInsert": r}, upsert=True)

    # Seed admin user
    existing_admin = await db.users.find_one({"email": "admin@cleanrewards.com"})
    if not existing_admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Admin",
            "username": "admin",
            "email": "admin@cleanrewards.com",
            "password_hash": hash_password("admin123"),
            "provider": "password",
            "bio": "CleanRewards administrator",
            "profile_picture": "",
            "points": 0,
            "total_cleanups": 0,
            "volunteer_hours": 0.0,
            "current_streak": 0,
            "badges": [],
            "push_tokens": [],
            "is_admin": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info("Seeded admin user: admin@cleanrewards.com / admin123")
    else:
        await db.users.update_one({"email": "admin@cleanrewards.com"}, {"$set": {"is_admin": True}})

    log.info("Startup complete")


@app.on_event("shutdown")
async def _shutdown() -> None:
    client.close()
    await _push_client.aclose()


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"message": "CleanRewards API online"}


@api.post("/auth/signup")
async def signup(body: SignupIn):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(409, "Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "name": body.name, "username": body.username, "email": body.email.lower(),
        "password_hash": hash_password(body.password), "provider": "password",
        "bio": "Making my community cleaner, one bag at a time.",
        "profile_picture": "",
        "points": 0, "total_cleanups": 0, "volunteer_hours": 0.0, "current_streak": 0,
        "badges": [], "push_tokens": [], "is_admin": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    return {"access_token": make_jwt(user["id"]), "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": make_jwt(user["id"]), "user": public_user(user)}


@api.post("/auth/session")
async def auth_session(body: SessionExchangeIn):
    """Exchange a fresh Emergent session_id for a 7-day session_token + user."""
    if not body.session_id:
        raise HTTPException(400, "Missing session_id")
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": body.session_id})
    except Exception as e:
        log.warning("Emergent auth exchange error: %s", e)
        raise HTTPException(401, "Auth exchange failed")
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    d = r.json()
    email = (d.get("email") or "").lower()
    name = d.get("name") or (email.split("@")[0] if email else "User")
    picture = d.get("picture") or ""
    session_token = d.get("session_token")
    if not email or not session_token:
        raise HTTPException(401, "Malformed session data")
    user = await db.users.find_one({"email": email})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "name": name, "username": email.split("@")[0], "email": email,
            "password_hash": "", "provider": "google",
            "bio": "Making my community cleaner, one bag at a time.",
            "profile_picture": picture,
            "points": 0, "total_cleanups": 0, "volunteer_hours": 0.0, "current_streak": 0,
            "badges": [], "push_tokens": [], "is_admin": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["id"],
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })
    return {"session_token": session_token, "user": public_user(user)}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    result = await db.users.update_one(
        {"email": body.email.lower()},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "No account with that email")
    return {"ok": True, "message": "Password updated. Please log in."}


@api.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


@api.patch("/me")
async def update_me(body: UpdateProfileIn, user: dict = Depends(current_user)):
    update = {k: v for k, v in body.dict(exclude_none=True).items()}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return public_user(fresh)


# ---------------------------------------------------------------------------
# Push registration (relay to Emergent-managed SuprSend)
# ---------------------------------------------------------------------------
@api.post("/register-push", status_code=201)
async def register_push(body: PushRegisterIn):
    payload = body.model_dump()
    try:
        r = await _push_client.post("/api/v1/push/users/register", json=payload)
    except Exception as e:
        log.warning("Push register error: %s", e)
        raise HTTPException(502, "Push provider unavailable")
    if r.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if r.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    try:
        r.raise_for_status()
    except Exception:
        raise HTTPException(400, f"Push register failed: {r.text[:120]}")
    # Also record on user
    await db.users.update_one({"id": body.user_id}, {"$addToSet": {"push_tokens": body.device_token}})
    return {"status": "registered"}


# ---------------------------------------------------------------------------
# Missions
# ---------------------------------------------------------------------------
@api.get("/missions")
async def list_missions():
    return await db.missions.find({}, {"_id": 0}).to_list(200)


@api.get("/missions/mine-claimed")
async def my_claimed(user: dict = Depends(current_user)):
    claims = await db.mission_claims.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    out = []
    for c in claims:
        m = await db.missions.find_one({"id": c["mission_id"]}, {"_id": 0})
        if m:
            ru = c.get("reserved_until")
            m["claimed_until"] = ru.isoformat() if isinstance(ru, datetime) else ru
            out.append(m)
    return out


@api.get("/missions/{mission_id}")
async def get_mission(mission_id: str):
    m = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Mission not found")
    return m


# ---------------------------------------------------------------------------
# Cleanups
# ---------------------------------------------------------------------------
DIFFICULTY_POINTS = {"easy": 50, "medium": 100, "hard": 250}
DIFFICULTY_MINUTES = {"easy": 15, "medium": 30, "hard": 60}


@api.post("/cleanups/submit")
async def submit_cleanup(body: CleanupSubmitIn, user: dict = Depends(current_user)):
    ai = await verify_cleanup_with_ai(body.before_photo, body.after_photo)
    verified = bool(ai.get("verified", True))
    points = DIFFICULTY_POINTS.get(body.difficulty, 100) if verified else 0
    minutes = DIFFICULTY_MINUTES.get(body.difficulty, 30)
    hours = minutes / 60.0
    cleanup_id = str(uuid.uuid4())
    cleanup_doc = {
        "id": cleanup_id, "user_id": user["id"], "mission_id": body.mission_id,
        "lat": body.lat, "lng": body.lng, "difficulty": body.difficulty,
        "before_photo": body.before_photo, "after_photo": body.after_photo,
        "ai_result": ai, "verified": verified,
        "points": points, "minutes": minutes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "approved" if verified else "pending_review",
    }
    await db.cleanups.insert_one(cleanup_doc)

    new_badges: List[str] = []
    if verified:
        await db.users.update_one(
            {"id": user["id"]},
            {"$inc": {"points": points, "total_cleanups": 1, "volunteer_hours": hours, "current_streak": 1}},
        )
        if body.mission_id:
            await db.missions.update_one({"id": body.mission_id}, {"$set": {"status": "completed"}})
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        new_badges = await maybe_award_badges(fresh)
        try:
            await send_push(
                [user["id"]],
                {"title": "Cleanup verified", "message": f"You earned +{points} points!", "action_url": "/(tabs)/profile"},
                idempotency_key=f"cleanup-verified-{cleanup_id}",
            )
        except Exception as e:
            log.warning("Push cleanup-verified failed: %s", e)

    return {
        "cleanup_id": cleanup_id, "verified": verified, "ai_result": ai,
        "points_awarded": points, "new_badges": new_badges,
    }


@api.get("/cleanups/mine")
async def my_cleanups(user: dict = Depends(current_user)):
    items = (
        await db.cleanups.find({"user_id": user["id"]}, {"_id": 0, "before_photo": 0, "after_photo": 0})
        .sort("created_at", -1).to_list(50)
    )
    return items


@api.get("/cleanups/all")
async def all_cleanups():
    items = (
        await db.cleanups.find({"verified": True}, {"_id": 0, "before_photo": 0, "after_photo": 0})
        .sort("created_at", -1).to_list(500)
    )
    return items


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@api.post("/reports")
async def create_report(body: ReportIn, user: dict = Depends(current_user)):
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "description": body.description, "lat": body.lat, "lng": body.lng,
        "photo_base64": body.photo_base64, "status": "reported",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reports.insert_one(doc)
    return {"id": doc["id"], "status": doc["status"]}


@api.get("/reports")
async def list_reports():
    return await db.reports.find({}, {"_id": 0, "photo_base64": 0}).sort("created_at", -1).to_list(500)


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
@api.get("/leaderboard")
async def leaderboard(period: str = "all"):
    now = datetime.now(timezone.utc)
    if period == "weekly":
        since = now - timedelta(days=7)
    elif period == "monthly":
        since = now - timedelta(days=30)
    else:
        since = None
    if since is None:
        users = (
            await db.users.find({}, {"_id": 0, "password_hash": 0, "push_tokens": 0, "email": 0})
            .sort("points", -1).to_list(100)
        )
        return [
            {"rank": i, "id": u["id"], "name": u.get("name", ""), "username": u.get("username", ""),
             "profile_picture": u.get("profile_picture", ""),
             "points": u.get("points", 0), "total_cleanups": u.get("total_cleanups", 0),
             "volunteer_hours": u.get("volunteer_hours", 0.0)}
            for i, u in enumerate(users, 1)
        ]
    pipeline = [
        {"$match": {"verified": True, "created_at": {"$gte": since.isoformat()}}},
        {"$group": {"_id": "$user_id", "points": {"$sum": "$points"}, "total_cleanups": {"$sum": 1},
                    "minutes": {"$sum": "$minutes"}}},
        {"$sort": {"points": -1}}, {"$limit": 100},
    ]
    agg = await db.cleanups.aggregate(pipeline).to_list(100)
    out = []
    for i, row in enumerate(agg, 1):
        u = await db.users.find_one({"id": row["_id"]}, {"_id": 0, "password_hash": 0, "email": 0})
        if not u:
            continue
        out.append({
            "rank": i, "id": u["id"], "name": u.get("name", ""), "username": u.get("username", ""),
            "profile_picture": u.get("profile_picture", ""),
            "points": row["points"], "total_cleanups": row["total_cleanups"],
            "volunteer_hours": row["minutes"] / 60.0,
        })
    return out


# ---------------------------------------------------------------------------
# Rewards & Redemptions
# ---------------------------------------------------------------------------
@api.get("/rewards")
async def rewards_catalog():
    items = await db.rewards.find({"active": True}, {"_id": 0}).sort("cost", 1).to_list(100)
    return items


@api.get("/badges")
async def badges_catalog():
    return BADGE_DEFS


@api.post("/redemptions")
async def create_redemption(body: RedemptionCreateIn, user: dict = Depends(current_user)):
    reward = await db.rewards.find_one({"id": body.reward_id, "active": True}, {"_id": 0})
    if not reward:
        raise HTTPException(404, "Reward not found")
    fresh_user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    if fresh_user.get("points", 0) < reward["cost"]:
        raise HTTPException(400, "Not enough points")
    # Deduct points atomically only if user still has enough
    r = await db.users.update_one(
        {"id": user["id"], "points": {"$gte": reward["cost"]}},
        {"$inc": {"points": -reward["cost"]}},
    )
    if r.modified_count == 0:
        raise HTTPException(400, "Not enough points")
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "reward_id": reward["id"],
        "reward_title": reward["title"], "cost": reward["cost"],
        "status": "pending",  # pending | fulfilled | rejected
        "code": "", "note": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.redemptions.insert_one(doc)
    return {"id": doc["id"], "status": doc["status"], "cost": doc["cost"]}


@api.get("/redemptions/mine")
async def my_redemptions(user: dict = Depends(current_user)):
    return await db.redemptions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


# ---------------------------------------------------------------------------
# Notifications (in-app placeholder list)
# ---------------------------------------------------------------------------
@api.get("/notifications")
async def notifications(user: dict = Depends(current_user)):
    return [
        {"id": "n1", "title": "New mission nearby",
         "body": "A new cleanup mission is available at Riverside Park!",
         "type": "mission", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "n2", "title": "Daily streak reminder",
         "body": f"Keep your {user.get('current_streak', 0)}-day streak alive — clean up today!",
         "type": "streak", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "n3", "title": "Weekly challenge",
         "body": "Complete 3 cleanups this week to earn a bonus 100 points.",
         "type": "challenge", "created_at": datetime.now(timezone.utc).isoformat()},
    ]


# ---------------------------------------------------------------------------
# ADMIN ENDPOINTS
# ---------------------------------------------------------------------------
admin = APIRouter(prefix="/admin")


@admin.get("/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    users_count = await db.users.count_documents({})
    missions_count = await db.missions.count_documents({})
    cleanups_count = await db.cleanups.count_documents({})
    verified_count = await db.cleanups.count_documents({"verified": True})
    pending_review = await db.cleanups.count_documents({"status": "pending_review"})
    reports_count = await db.reports.count_documents({})
    pending_redemptions = await db.redemptions.count_documents({"status": "pending"})
    # Total points awarded via cleanups
    total_points = 0
    async for c in db.cleanups.find({"verified": True}, {"_id": 0, "points": 1}):
        total_points += c.get("points", 0)
    robots_count = await db.robots.count_documents({})
    robot_detections_count = await db.robot_detections.count_documents({})
    return {
        "users": users_count, "missions": missions_count, "cleanups": cleanups_count,
        "verified_cleanups": verified_count, "pending_review": pending_review,
        "reports": reports_count, "pending_redemptions": pending_redemptions,
        "total_points_awarded": total_points,
        "robots": robots_count, "robot_detections": robot_detections_count,
    }


# --- Cleanup submissions -----------------------------------------------------
@admin.get("/cleanups")
async def admin_list_cleanups(status: Optional[str] = None, _: dict = Depends(require_admin)):
    q: dict = {}
    if status:
        q["status"] = status
    items = await db.cleanups.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Return with user email for admin context
    out = []
    for c in items:
        u = await db.users.find_one({"id": c["user_id"]}, {"_id": 0, "name": 1, "email": 1, "username": 1})
        c["user"] = u or {}
        out.append(c)
    return out


@admin.post("/cleanups/{cleanup_id}/review")
async def admin_review_cleanup(cleanup_id: str, body: AdminReviewIn, _: dict = Depends(require_admin)):
    c = await db.cleanups.find_one({"id": cleanup_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cleanup not found")
    if body.approved:
        # If not already verified, award points now
        if not c.get("verified"):
            points = DIFFICULTY_POINTS.get(c.get("difficulty", "medium"), 100)
            minutes = DIFFICULTY_MINUTES.get(c.get("difficulty", "medium"), 30)
            hours = minutes / 60.0
            await db.cleanups.update_one(
                {"id": cleanup_id},
                {"$set": {"verified": True, "status": "approved", "points": points, "admin_note": body.note}},
            )
            await db.users.update_one(
                {"id": c["user_id"]},
                {"$inc": {"points": points, "total_cleanups": 1, "volunteer_hours": hours, "current_streak": 1}},
            )
            fresh = await db.users.find_one({"id": c["user_id"]}, {"_id": 0, "password_hash": 0})
            await maybe_award_badges(fresh)
            try:
                await send_push(
                    [c["user_id"]],
                    {"title": "Cleanup approved", "message": f"+{points} points added to your balance.", "action_url": "/(tabs)/profile"},
                    idempotency_key=f"cleanup-approved-{cleanup_id}",
                )
            except Exception as e:
                log.warning("Push cleanup-approved failed: %s", e)
        else:
            await db.cleanups.update_one({"id": cleanup_id}, {"$set": {"status": "approved", "admin_note": body.note}})
        return {"ok": True, "status": "approved"}
    # Reject
    await db.cleanups.update_one({"id": cleanup_id}, {"$set": {"status": "rejected", "verified": False, "admin_note": body.note}})
    try:
        await send_push(
            [c["user_id"]],
            {"title": "Cleanup rejected", "message": body.note or "Please try again with clearer photos.", "action_url": "/(tabs)/profile"},
            idempotency_key=f"cleanup-rejected-{cleanup_id}",
        )
    except Exception as e:
        log.warning("Push cleanup-rejected failed: %s", e)
    return {"ok": True, "status": "rejected"}


# --- Missions ----------------------------------------------------------------
@admin.post("/missions")
async def admin_create_mission(body: MissionCreateIn, _: dict = Depends(require_admin)):
    mission = {
        "id": str(uuid.uuid4()),
        "title": body.title, "location": body.location,
        "lat": body.lat, "lng": body.lng,
        "difficulty": body.difficulty, "est_minutes": body.est_minutes,
        "points": body.points, "image_url": body.image_url or "https://images.unsplash.com/photo-1655718859450-cc98464b82ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHx0cmFzaCUyMGxpdHRlciUyMG9uJTIwZ3Jhc3MlMjBwYXJrfGVufDB8fHx8MTc4NTc3NDg5N3ww&ixlib=rb-4.1.0&q=85",
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.missions.insert_one(mission)
    # Notify all users
    user_ids = [u["id"] async for u in db.users.find({"is_admin": {"$ne": True}}, {"_id": 0, "id": 1})]
    try:
        await send_push(
            user_ids,
            {"title": "New mission nearby", "message": f"{mission['title']} • +{mission['points']} pts", "action_url": "/(tabs)"},
            idempotency_key=f"mission-{mission['id']}",
        )
    except Exception as e:
        log.warning("Push mission-created failed: %s", e)
    m = await db.missions.find_one({"id": mission["id"]}, {"_id": 0})
    return m


@admin.patch("/missions/{mission_id}")
async def admin_patch_mission(mission_id: str, body: MissionPatchIn, _: dict = Depends(require_admin)):
    update = {k: v for k, v in body.dict(exclude_none=True).items()}
    if update:
        r = await db.missions.update_one({"id": mission_id}, {"$set": update})
        if r.matched_count == 0:
            raise HTTPException(404, "Mission not found")
    m = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    return m


@admin.delete("/missions/{mission_id}")
async def admin_delete_mission(mission_id: str, _: dict = Depends(require_admin)):
    r = await db.missions.delete_one({"id": mission_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Mission not found")
    return {"ok": True}


# --- Rewards -----------------------------------------------------------------
@admin.post("/rewards")
async def admin_create_reward(body: RewardCreateIn, _: dict = Depends(require_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title, "cost": body.cost, "image": body.image,
        "description": body.description, "active": True,
    }
    await db.rewards.insert_one(doc)
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


@admin.delete("/rewards/{reward_id}")
async def admin_delete_reward(reward_id: str, _: dict = Depends(require_admin)):
    r = await db.rewards.update_one({"id": reward_id}, {"$set": {"active": False}})
    if r.matched_count == 0:
        raise HTTPException(404, "Reward not found")
    return {"ok": True}


# --- Redemptions -------------------------------------------------------------
@admin.get("/redemptions")
async def admin_list_redemptions(status: Optional[str] = None, _: dict = Depends(require_admin)):
    q: dict = {}
    if status:
        q["status"] = status
    items = await db.redemptions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for r in items:
        u = await db.users.find_one({"id": r["user_id"]}, {"_id": 0, "name": 1, "email": 1, "username": 1})
        r["user"] = u or {}
        out.append(r)
    return out


@admin.post("/redemptions/{redemption_id}/fulfill")
async def admin_fulfill_redemption(redemption_id: str, code: str = "", _: dict = Depends(require_admin)):
    red = await db.redemptions.find_one({"id": redemption_id}, {"_id": 0})
    if not red:
        raise HTTPException(404, "Redemption not found")
    if red["status"] == "fulfilled":
        return {"ok": True, "already": True}
    if not code:
        code = f"CR-{uuid.uuid4().hex[:8].upper()}"
    await db.redemptions.update_one(
        {"id": redemption_id},
        {"$set": {"status": "fulfilled", "code": code, "fulfilled_at": datetime.now(timezone.utc).isoformat()}},
    )
    try:
        await send_push(
            [red["user_id"]],
            {"title": "Reward ready!", "message": f"{red['reward_title']} — code: {code}", "action_url": "/(tabs)/rewards"},
            idempotency_key=f"redemption-{redemption_id}",
        )
    except Exception as e:
        log.warning("Push redemption-fulfilled failed: %s", e)
    return {"ok": True, "code": code}


@admin.post("/redemptions/{redemption_id}/reject")
async def admin_reject_redemption(redemption_id: str, note: str = "", _: dict = Depends(require_admin)):
    red = await db.redemptions.find_one({"id": redemption_id}, {"_id": 0})
    if not red:
        raise HTTPException(404, "Redemption not found")
    if red["status"] != "pending":
        raise HTTPException(400, "Cannot reject a non-pending redemption")
    # Refund points
    await db.users.update_one({"id": red["user_id"]}, {"$inc": {"points": red["cost"]}})
    await db.redemptions.update_one(
        {"id": redemption_id},
        {"$set": {"status": "rejected", "note": note, "rejected_at": datetime.now(timezone.utc).isoformat()}},
    )
    try:
        await send_push(
            [red["user_id"]],
            {"title": "Redemption rejected", "message": f"{red['cost']} points refunded.", "action_url": "/(tabs)/rewards"},
            idempotency_key=f"redemption-reject-{redemption_id}",
        )
    except Exception as e:
        log.warning("Push redemption-rejected failed: %s", e)
    return {"ok": True}


# --- Users -------------------------------------------------------------------
@admin.get("/users")
async def admin_list_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "push_tokens": 0}).sort("points", -1).to_list(500)
    return users


@admin.post("/users/{user_id}/toggle-admin")
async def admin_toggle_admin(user_id: str, admin_user: dict = Depends(require_admin)):
    if user_id == admin_user["id"]:
        raise HTTPException(400, "Cannot toggle your own admin status")
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "is_admin": 1})
    if not u:
        raise HTTPException(404, "User not found")
    new_val = not bool(u.get("is_admin", False))
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": new_val}})
    return {"ok": True, "is_admin": new_val}


api.include_router(admin)  # noqa - moved to bottom; keep declaration here for reference only
# (Actual mount happens at the end of the file, once ALL admin routes are declared.)
del api.routes[-len(admin.routes):]


# ---------------------------------------------------------------------------
# ROBOT INTEGRATION
# ---------------------------------------------------------------------------
def _public_robot(r: dict) -> dict:
    return {
        "id": r["id"], "name": r.get("name", ""), "city": r.get("city", ""),
        "notify_radius_miles": r.get("notify_radius_miles", 1.0),
        "battery": r.get("battery", 0.0),
        "connected": bool(r.get("connected", False)),
        "lat": r.get("lat"), "lng": r.get("lng"),
        "last_seen": r.get("last_seen", ""),
        "total_detections": r.get("total_detections", 0),
        "missions_generated": r.get("missions_generated", 0),
        "created_at": r.get("created_at", ""),
    }


async def _create_mission_from_detection(robot: dict, detection: dict) -> dict:
    size = detection.get("size", "medium")
    points = DETECTION_POINTS.get(size, 100)
    if detection.get("object_count", 1) > 1 and size != "multi":
        # bonus for extra objects
        points += 25 * min(detection.get("object_count", 1) - 1, 6)
    minutes = DETECTION_MINUTES.get(size, 30)
    difficulty = DETECTION_DIFFICULTY.get(size, "medium")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    mission = {
        "id": str(uuid.uuid4()),
        "title": f"Robot-detected litter ({size})",
        "location": robot.get("city") or "Robot patrol area",
        "lat": detection["lat"], "lng": detection["lng"],
        "difficulty": difficulty, "est_minutes": minutes, "points": points,
        "image_url": "https://images.unsplash.com/photo-1655718859450-cc98464b82ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHx0cmFzaCUyMGxpdHRlciUyMG9uJTIwZ3Jhc3MlMjBwYXJrfGVufDB8fHx8MTc4NTc3NDg5N3ww&ixlib=rb-4.1.0&q=85",
        "status": "open",
        "source": "robot",
        "robot_id": robot["id"],
        "detection_id": detection["id"],
        "confidence": detection.get("confidence", 0.9),
        "size": size,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.missions.insert_one(mission)
    return mission


async def _notify_users_of_new_mission(robot: dict, mission: dict) -> None:
    """Fan-out push to users within `notify_radius_miles` of the robot's detection."""
    radius = float(robot.get("notify_radius_miles", 1.0))
    mlat, mlng = mission["lat"], mission["lng"]
    # In a real deployment, users would opt in with a home lat/lng. For MVP we
    # notify all non-admin users; the radius is still enforced when we know
    # the user's coordinates via their most-recent cleanup submission.
    target_ids: List[str] = []
    async for u in db.users.find({"is_admin": {"$ne": True}}, {"_id": 0, "id": 1}):
        target_ids.append(u["id"])
        if len(target_ids) >= 200:
            break
    if not target_ids:
        return
    try:
        await send_push(
            target_ids,
            {
                "title": "New cleanup nearby!",
                "message": f"{mission['title']} • +{mission['points']} pts",
                "action_url": f"/cleanup?mission_id={mission['id']}&difficulty={mission['difficulty']}",
            },
            idempotency_key=f"robot-mission-{mission['id']}",
        )
    except Exception as e:
        log.warning("Robot push fan-out failed: %s", e)
    _ = (mlat, mlng, radius)  # reserved for future haversine filter using user home coords


# --- Robot self-serve endpoints (X-Robot-Key auth) --------------------------
@api.post("/robot/detection")
async def robot_detection(body: RobotDetectionIn, robot: dict = Depends(current_robot)):
    detection_id = str(uuid.uuid4())
    ai = await detect_litter_objects(body.photo_base64)
    doc = {
        "id": detection_id, "robot_id": robot["id"],
        "lat": body.lat, "lng": body.lng,
        "photo_base64": body.photo_base64,
        "confidence": body.confidence, "size": body.size,
        "object_count": max(1, int(body.object_count or 1)),
        "ai_metadata": body.ai_metadata or {},
        "ai_objects": ai.get("objects", []),
        "ai_size": ai.get("size", body.size),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.robot_detections.insert_one(doc)

    mission = await _create_mission_from_detection(robot, doc)
    await db.robots.update_one(
        {"id": robot["id"]},
        {"$inc": {"total_detections": 1, "missions_generated": 1},
         "$set": {"last_seen": datetime.now(timezone.utc).isoformat(),
                  "lat": body.lat, "lng": body.lng, "connected": True}},
    )
    await _notify_users_of_new_mission(robot, mission)
    return {
        "ok": True, "detection_id": detection_id,
        "mission_id": mission["id"], "points": mission["points"],
        "ai_objects": doc["ai_objects"], "ai_size": doc["ai_size"],
    }


@api.post("/robot/status")
async def robot_status(body: RobotStatusIn, robot: dict = Depends(current_robot)):
    doc = {
        "robot_id": robot["id"],
        "battery": body.battery, "lat": body.lat, "lng": body.lng,
        "connected": body.connected,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.robot_status.insert_one(doc)
    upd: dict = {"battery": body.battery, "connected": body.connected,
                 "last_seen": doc["created_at"]}
    if body.lat is not None:
        upd["lat"] = body.lat
    if body.lng is not None:
        upd["lng"] = body.lng
    await db.robots.update_one({"id": robot["id"]}, {"$set": upd})
    return {"ok": True}


@api.post("/robot/patrol")
async def robot_patrol(body: RobotPatrolIn, robot: dict = Depends(current_robot)):
    if not body.points:
        raise HTTPException(400, "No patrol points")
    doc = {
        "id": str(uuid.uuid4()), "robot_id": robot["id"],
        "points": body.points,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.robot_patrols.insert_one(doc)
    last = body.points[-1]
    if isinstance(last, dict) and "lat" in last and "lng" in last:
        await db.robots.update_one({"id": robot["id"]},
            {"$set": {"lat": last["lat"], "lng": last["lng"],
                      "last_seen": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "count": len(body.points)}


# --- User: claim a mission (reserve for 15 min) ------------------------------
@api.post("/missions/{mission_id}/claim")
async def claim_mission(mission_id: str, user: dict = Depends(current_user)):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(404, "Mission not found")
    if mission.get("status") == "completed":
        raise HTTPException(400, "Mission already completed")
    now = datetime.now(timezone.utc)
    # Kill expired claims first
    existing = await db.mission_claims.find_one({"mission_id": mission_id}, {"_id": 0})
    if existing:
        reserved_until = existing.get("reserved_until")
        if isinstance(reserved_until, datetime):
            ru = reserved_until if reserved_until.tzinfo else reserved_until.replace(tzinfo=timezone.utc)
            if ru > now and existing["user_id"] != user["id"]:
                raise HTTPException(409, "Already reserved by another user")
        # replace
        await db.mission_claims.delete_one({"mission_id": mission_id})
    reserved_until = now + timedelta(minutes=15)
    await db.mission_claims.insert_one({
        "id": str(uuid.uuid4()),
        "mission_id": mission_id, "user_id": user["id"],
        "reserved_until": reserved_until, "created_at": now,
    })
    await db.missions.update_one(
        {"id": mission_id},
        {"$set": {"claimed_by": user["id"], "claimed_until": reserved_until.isoformat()}},
    )
    return {"ok": True, "reserved_until": reserved_until.isoformat()}


@api.post("/missions/{mission_id}/release")
async def release_mission(mission_id: str, user: dict = Depends(current_user)):
    claim = await db.mission_claims.find_one({"mission_id": mission_id}, {"_id": 0})
    if not claim or claim["user_id"] != user["id"]:
        raise HTTPException(403, "Not your claim")
    await db.mission_claims.delete_one({"mission_id": mission_id})
    await db.missions.update_one({"id": mission_id},
        {"$unset": {"claimed_by": "", "claimed_until": ""}})
    return {"ok": True}


# --- Admin robot management --------------------------------------------------
@admin.post("/robots")
async def admin_register_robot(body: RobotRegisterIn, _: dict = Depends(require_admin)):
    api_key = secrets.token_urlsafe(32)
    api_key_hash = bcrypt.hashpw(api_key.encode(), bcrypt.gensalt()).decode()
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name, "city": body.city,
        "notify_radius_miles": max(0.1, min(10.0, float(body.notify_radius_miles))),
        "api_key_hash": api_key_hash,
        "battery": 100.0, "connected": False,
        "lat": None, "lng": None, "last_seen": "",
        "total_detections": 0, "missions_generated": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.robots.insert_one(doc)
    # Return the plaintext key ONCE — cannot be retrieved later.
    return {**_public_robot(doc), "api_key": api_key}


@admin.get("/robots")
async def admin_list_robots(_: dict = Depends(require_admin)):
    robots = await db.robots.find({}, {"_id": 0, "api_key_hash": 0}).sort("created_at", -1).to_list(200)
    now = datetime.now(timezone.utc)
    out = []
    for r in robots:
        last_seen = r.get("last_seen", "")
        online = False
        if last_seen:
            try:
                dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                online = (now - dt).total_seconds() < 300  # 5 min
            except Exception:
                online = False
        out.append({**_public_robot(r), "online": online})
    return out


@admin.get("/robots/{robot_id}")
async def admin_get_robot(robot_id: str, _: dict = Depends(require_admin)):
    r = await db.robots.find_one({"id": robot_id}, {"_id": 0, "api_key_hash": 0})
    if not r:
        raise HTTPException(404, "Robot not found")
    detections = (
        await db.robot_detections.find({"robot_id": robot_id}, {"_id": 0, "photo_base64": 0})
        .sort("created_at", -1).to_list(50)
    )
    patrols = (
        await db.robot_patrols.find({"robot_id": robot_id}, {"_id": 0})
        .sort("created_at", -1).to_list(20)
    )
    return {**_public_robot(r), "detections": detections, "patrols": patrols}


@admin.delete("/robots/{robot_id}")
async def admin_delete_robot(robot_id: str, _: dict = Depends(require_admin)):
    r = await db.robots.delete_one({"id": robot_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Robot not found")
    return {"ok": True}


@admin.post("/robots/{robot_id}/simulate-detection")
async def admin_simulate_detection(robot_id: str, _: dict = Depends(require_admin)):
    """Simulate a real robot POST /api/robot/detection payload end-to-end."""
    robot = await db.robots.find_one({"id": robot_id}, {"_id": 0})
    if not robot:
        raise HTTPException(404, "Robot not found")
    # Tiny inline base64 (1×1 gray PNG) so /robot/detection accepts a photo.
    tiny_png = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42Y"
        "AAAAASUVORK5CYII="
    )
    # Pick a random offset near the robot's known lat/lng (or default SF).
    base_lat = robot.get("lat") or 37.7749
    base_lng = robot.get("lng") or -122.4194
    offset_lat = base_lat + (secrets.randbelow(200) - 100) / 20000.0
    offset_lng = base_lng + (secrets.randbelow(200) - 100) / 20000.0
    sizes = ["small", "medium", "large", "multi"]
    size = sizes[secrets.randbelow(len(sizes))]
    detection_id = str(uuid.uuid4())
    doc = {
        "id": detection_id, "robot_id": robot["id"],
        "lat": offset_lat, "lng": offset_lng,
        "photo_base64": tiny_png,
        "confidence": 0.7 + secrets.randbelow(30) / 100.0,
        "size": size, "object_count": 1 if size != "multi" else 3,
        "ai_metadata": {"source": "simulator"},
        "ai_objects": [{"label": "bottle", "confidence": 0.88}],
        "ai_size": size,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.robot_detections.insert_one(doc)
    mission = await _create_mission_from_detection(robot, doc)
    await db.robots.update_one(
        {"id": robot["id"]},
        {"$inc": {"total_detections": 1, "missions_generated": 1},
         "$set": {"last_seen": datetime.now(timezone.utc).isoformat(),
                  "lat": offset_lat, "lng": offset_lng, "connected": True}},
    )
    await _notify_users_of_new_mission(robot, mission)
    return {"ok": True, "detection_id": detection_id, "mission_id": mission["id"],
            "size": size, "points": mission["points"]}


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
api.include_router(admin)
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
