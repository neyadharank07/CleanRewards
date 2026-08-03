"""CleanRewards backend — FastAPI + MongoDB.
JWT email/password auth, missions, cleanups w/ AI verification via Emergent LLM
(Gemini vision), litter reports, leaderboard, rewards, badges, push tokens.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header, status
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


class GoogleLoginIn(BaseModel):
    id_token: str = ""
    email: EmailStr
    name: str = ""
    picture: str = ""


class ResetPasswordIn(BaseModel):
    email: EmailStr
    new_password: str


class MissionOut(BaseModel):
    id: str
    title: str
    location: str
    lat: float
    lng: float
    difficulty: str  # easy | medium | hard
    est_minutes: int
    points: int
    image_url: str
    status: str = "open"  # open | completed


class ReportIn(BaseModel):
    description: str
    lat: float
    lng: float
    photo_base64: str  # small compressed image


class CleanupSubmitIn(BaseModel):
    mission_id: Optional[str] = None
    lat: float
    lng: float
    before_photo: str  # base64
    after_photo: str  # base64
    difficulty: str = "medium"


class PushTokenIn(BaseModel):
    token: str


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None  # base64


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
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


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    except Exception:
        user = None
    if not user:
        raise HTTPException(401, "Invalid or expired token")
    return user


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
        "created_at": u.get("created_at", ""),
    }


BADGE_DEFS = [
    {"id": "first_cleanup", "name": "First Cleanup", "description": "Complete your first cleanup", "icon": "leaf"},
    {"id": "neighborhood_hero", "name": "Neighborhood Hero", "description": "Complete 10 cleanups", "icon": "home"},
    {"id": "park_protector", "name": "Park Protector", "description": "Complete 5 park missions", "icon": "tree"},
    {"id": "points_1000", "name": "1000 Points Club", "description": "Earn 1000 points", "icon": "trophy"},
    {"id": "cleanups_50", "name": "50 Cleanups", "description": "Complete 50 cleanups", "icon": "flame"},
    {"id": "community_champion", "name": "Community Champion", "description": "Reach top 10 on the leaderboard", "icon": "ribbon"},
]

REWARD_DEFS = [
    {"id": "coffee_5", "title": "$5 Coffee Gift Card", "cost": 500, "image": "coffee", "description": "Redeemable at partner cafes"},
    {"id": "restaurant_drink", "title": "Free Local Restaurant Drink", "cost": 300, "image": "drink", "description": "One free drink at partners"},
    {"id": "movie_ticket", "title": "Movie Ticket", "cost": 1200, "image": "movie", "description": "One general admission ticket"},
    {"id": "park_pass", "title": "Day Park Pass", "cost": 800, "image": "park", "description": "One day access to city parks"},
]


async def maybe_award_badges(user: dict) -> List[str]:
    """Return list of newly awarded badge ids."""
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


def strip_data_url(s: str) -> str:
    """Strip 'data:image/xxx;base64,' prefix from a base64 image string."""
    if s.startswith("data:"):
        return s.split(",", 1)[-1]
    return s


async def verify_cleanup_with_ai(before_b64: str, after_b64: str) -> dict:
    """Ask Gemini vision to compare before/after cleanup photos. Returns dict.
    Falls back to permissive verified=True if the AI is unreachable.
    """
    before_b64 = strip_data_url(before_b64)
    after_b64 = strip_data_url(after_b64)
    if not EMERGENT_LLM_KEY:
        return {"verified": True, "confidence": 0.6, "reason": "AI key missing — fallback verified"}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        from emergentintegrations.llm.chat import ImageContent  # type: ignore
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
        msg = UserMessage(
            text=prompt,
            file_contents=[ImageContent(before_b64), ImageContent(after_b64)],
        )
        raw = await chat.send_message(msg)
        text = raw if isinstance(raw, str) else str(raw)
        # Try to extract JSON
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
        else:
            data = {"verified": True, "confidence": 0.5, "reason": text[:120]}
        data.setdefault("verified", True)
        data.setdefault("confidence", 0.7)
        data.setdefault("reason", "OK")
        return data
    except Exception as e:
        log.exception("AI verification error")
        return {"verified": True, "confidence": 0.5, "reason": f"AI error: {e}"}


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
SEED_MISSIONS = [
    {
        "id": "m1",
        "title": "Riverside Park Cleanup",
        "location": "Riverside Park, Downtown",
        "lat": 37.7699,
        "lng": -122.4677,
        "difficulty": "easy",
        "est_minutes": 20,
        "points": 50,
        "image_url": "https://images.unsplash.com/photo-1655718859450-cc98464b82ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHx0cmFzaCUyMGxpdHRlciUyMG9uJTIwZ3Jhc3MlMjBwYXJrfGVufDB8fHx8MTc4NTc3NDg5N3ww&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
    {
        "id": "m2",
        "title": "Beachfront Bottle Sweep",
        "location": "Ocean Beach, West Pier",
        "lat": 37.7594,
        "lng": -122.5107,
        "difficulty": "medium",
        "est_minutes": 45,
        "points": 100,
        "image_url": "https://images.unsplash.com/photo-1640287807682-b3195cc6b320?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwxfHxjbGVhbiUyMGNpdHklMjBwYXJrJTIwdHJlZXN8ZW58MHx8fHwxNzgzMjY1NDA3fDA&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
    {
        "id": "m3",
        "title": "Neighborhood Alleyway Cleanup",
        "location": "Mission District Alley",
        "lat": 37.7620,
        "lng": -122.4192,
        "difficulty": "hard",
        "est_minutes": 90,
        "points": 250,
        "image_url": "https://images.unsplash.com/photo-1599059813005-11265ba4b4ce?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBwZW9wbGUlMjBoZWxwaW5nfGVufDB8fHx8MTc4NTc3NDkxMXww&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
    {
        "id": "m4",
        "title": "School Playground Refresh",
        "location": "Lincoln Elementary Playground",
        "lat": 37.7749,
        "lng": -122.4194,
        "difficulty": "easy",
        "est_minutes": 25,
        "points": 60,
        "image_url": "https://images.unsplash.com/photo-1592859600972-1b0834d83747?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwxfHxmb3Jlc3QlMjBuYXR1cmUlMjB0cmFpbHxlbnwwfHx8fDE3ODI5ODQwNzV8MA&ixlib=rb-4.1.0&q=85",
        "status": "open",
    },
]


@app.on_event("startup")
async def seed_data() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username")
    await db.missions.create_index("id", unique=True)
    for m in SEED_MISSIONS:
        await db.missions.update_one({"id": m["id"]}, {"$setOnInsert": m}, upsert=True)
    log.info("Seeded %d missions", len(SEED_MISSIONS))


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()


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
        "name": body.name,
        "username": body.username,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "provider": "password",
        "bio": "Making my community cleaner, one bag at a time.",
        "profile_picture": "",
        "points": 0,
        "total_cleanups": 0,
        "volunteer_hours": 0.0,
        "current_streak": 0,
        "badges": [],
        "push_tokens": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = make_jwt(user["id"])
    return {"access_token": token, "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": make_jwt(user["id"]), "user": public_user(user)}


@api.post("/auth/google")
async def google_login(body: GoogleLoginIn):
    """Emergent-managed Google login. Frontend sends user info from Emergent Auth."""
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "name": body.name or email.split("@")[0],
            "username": email.split("@")[0],
            "email": email,
            "password_hash": "",
            "provider": "google",
            "bio": "Making my community cleaner, one bag at a time.",
            "profile_picture": body.picture,
            "points": 0,
            "total_cleanups": 0,
            "volunteer_hours": 0.0,
            "current_streak": 0,
            "badges": [],
            "push_tokens": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    return {"access_token": make_jwt(user["id"]), "user": public_user(user)}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    """Simple demo reset — in production this would email a reset link."""
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
# Missions
# ---------------------------------------------------------------------------
@api.get("/missions", response_model=List[MissionOut])
async def list_missions():
    missions = await db.missions.find({}, {"_id": 0}).to_list(200)
    return missions


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
    """Submit before/after photos. Runs AI verification and awards points."""
    ai = await verify_cleanup_with_ai(body.before_photo, body.after_photo)
    verified = bool(ai.get("verified", True))
    points = DIFFICULTY_POINTS.get(body.difficulty, 100) if verified else 0
    minutes = DIFFICULTY_MINUTES.get(body.difficulty, 30)
    hours = minutes / 60.0
    cleanup_id = str(uuid.uuid4())
    cleanup_doc = {
        "id": cleanup_id,
        "user_id": user["id"],
        "mission_id": body.mission_id,
        "lat": body.lat,
        "lng": body.lng,
        "difficulty": body.difficulty,
        "before_photo": body.before_photo,
        "after_photo": body.after_photo,
        "ai_result": ai,
        "verified": verified,
        "points": points,
        "minutes": minutes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "approved" if verified else "pending_review",
    }
    await db.cleanups.insert_one(cleanup_doc)

    new_badges: List[str] = []
    if verified:
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {
                    "points": points,
                    "total_cleanups": 1,
                    "volunteer_hours": hours,
                    "current_streak": 1,
                }
            },
        )
        if body.mission_id:
            await db.missions.update_one(
                {"id": body.mission_id}, {"$set": {"status": "completed"}}
            )
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        new_badges = await maybe_award_badges(fresh)

    return {
        "cleanup_id": cleanup_id,
        "verified": verified,
        "ai_result": ai,
        "points_awarded": points,
        "new_badges": new_badges,
    }


@api.get("/cleanups/mine")
async def my_cleanups(user: dict = Depends(current_user)):
    items = (
        await db.cleanups.find(
            {"user_id": user["id"]},
            {"_id": 0, "before_photo": 0, "after_photo": 0},
        )
        .sort("created_at", -1)
        .to_list(50)
    )
    return items


@api.get("/cleanups/all")
async def all_cleanups():
    """For map pins - completed cleanups (no photo payload)."""
    items = (
        await db.cleanups.find(
            {"verified": True},
            {"_id": 0, "before_photo": 0, "after_photo": 0},
        )
        .sort("created_at", -1)
        .to_list(500)
    )
    return items


# ---------------------------------------------------------------------------
# Reports (litter reports)
# ---------------------------------------------------------------------------
@api.post("/reports")
async def create_report(body: ReportIn, user: dict = Depends(current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "description": body.description,
        "lat": body.lat,
        "lng": body.lng,
        "photo_base64": body.photo_base64,
        "status": "reported",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reports.insert_one(doc)
    return {"id": doc["id"], "status": doc["status"]}


@api.get("/reports")
async def list_reports():
    items = (
        await db.reports.find({}, {"_id": 0, "photo_base64": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return items


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
@api.get("/leaderboard")
async def leaderboard(period: str = "all"):
    """period: weekly | monthly | all"""
    now = datetime.now(timezone.utc)
    if period == "weekly":
        since = now - timedelta(days=7)
    elif period == "monthly":
        since = now - timedelta(days=30)
    else:
        since = None

    if since is None:
        users = (
            await db.users.find(
                {}, {"_id": 0, "password_hash": 0, "push_tokens": 0, "email": 0}
            )
            .sort("points", -1)
            .to_list(100)
        )
        result = []
        for i, u in enumerate(users, start=1):
            result.append(
                {
                    "rank": i,
                    "id": u["id"],
                    "name": u.get("name", ""),
                    "username": u.get("username", ""),
                    "profile_picture": u.get("profile_picture", ""),
                    "points": u.get("points", 0),
                    "total_cleanups": u.get("total_cleanups", 0),
                    "volunteer_hours": u.get("volunteer_hours", 0.0),
                }
            )
        return result

    # Aggregate cleanups since window
    pipeline = [
        {"$match": {"verified": True, "created_at": {"$gte": since.isoformat()}}},
        {
            "$group": {
                "_id": "$user_id",
                "points": {"$sum": "$points"},
                "total_cleanups": {"$sum": 1},
                "minutes": {"$sum": "$minutes"},
            }
        },
        {"$sort": {"points": -1}},
        {"$limit": 100},
    ]
    agg = await db.cleanups.aggregate(pipeline).to_list(100)
    result = []
    for i, row in enumerate(agg, start=1):
        u = await db.users.find_one(
            {"id": row["_id"]}, {"_id": 0, "password_hash": 0, "email": 0}
        )
        if not u:
            continue
        result.append(
            {
                "rank": i,
                "id": u["id"],
                "name": u.get("name", ""),
                "username": u.get("username", ""),
                "profile_picture": u.get("profile_picture", ""),
                "points": row["points"],
                "total_cleanups": row["total_cleanups"],
                "volunteer_hours": row["minutes"] / 60.0,
            }
        )
    return result


# ---------------------------------------------------------------------------
# Rewards, badges, notifications, push
# ---------------------------------------------------------------------------
@api.get("/rewards")
async def rewards_catalog():
    return REWARD_DEFS


@api.get("/badges")
async def badges_catalog():
    return BADGE_DEFS


@api.get("/notifications")
async def notifications(user: dict = Depends(current_user)):
    # Placeholder notifications — could later query a real collection.
    return [
        {
            "id": "n1",
            "title": "New mission nearby",
            "body": "A new cleanup mission is available at Riverside Park!",
            "type": "mission",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": "n2",
            "title": "Daily streak reminder",
            "body": f"Keep your {user.get('current_streak', 0)}-day streak alive — clean up today!",
            "type": "streak",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": "n3",
            "title": "Weekly challenge",
            "body": "Complete 3 cleanups this week to earn a bonus 100 points.",
            "type": "challenge",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]


@api.post("/push-token")
async def save_push_token(body: PushTokenIn, user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"push_tokens": body.token}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
