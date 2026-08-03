# CleanRewards — PRD

## Overview
CleanRewards rewards residents for picking up litter. Users complete cleanup
missions, submit before/after photos which are AI-verified, earn points,
compete on leaderboards, and redeem rewards. Admins manage submissions,
missions, rewards, redemptions, users, and now **autonomous robot fleets**
that patrol public spaces and auto-generate cleanup missions.

## Stack
- Frontend: Expo SDK 54, React Native, TypeScript, expo-router
- Backend: FastAPI + MongoDB (motor)
- Auth: JWT email/password + Emergent-managed Google Auth (session_token)
- AI vision: Emergent LLM key → Gemini 2.5 Flash (cleanup verify + litter classify)
- Push: Emergent-managed relay (SuprSend), fan-out on server events
- Robot auth: `X-Robot-Key` API-key header (bcrypt-hashed at rest)

## Screens
- **Auth**: Login, Signup, Forgot Password (real Google button)
- **Tabs**: Home, Map, Leaderboard, Rewards, Profile
- **Flows**: Cleanup (5-step w/ optional 15-min reserve), Report Litter, Notifications, Settings, My Redemptions
- **Admin** (visible only if `user.is_admin`): Overview, Submissions, Missions, Rewards, Redemptions, **Robots** (list + register + detail + simulate detection), Users

## Robot integration
### Data model
- `robots` — id, name, city, notify_radius_miles, api_key_hash, battery, connected, lat/lng, last_seen, total_detections, missions_generated
- `robot_detections` — id, robot_id, lat, lng, photo_base64, confidence, size (small/medium/large/multi), object_count, ai_metadata, ai_objects, ai_size
- `robot_status` — battery + connection heartbeat log
- `robot_patrols` — patrol path breadcrumb batches
- `mission_claims` — mission_id, user_id, reserved_until (15-min TTL index)

### Robot endpoints (`X-Robot-Key`)
- POST `/api/robot/detection` — uploads photo + GPS + confidence + size; auto-creates a mission with `source="robot"`, fans push to nearby users, updates robot stats.
- POST `/api/robot/status` — battery + gps + connected heartbeat.
- POST `/api/robot/patrol` — batch of {lat, lng, t} points.

### Admin robot endpoints
- POST `/api/admin/robots` — register; returns plaintext `api_key` ONCE.
- GET  `/api/admin/robots` — fleet list with online/offline (last-seen < 5 min).
- GET  `/api/admin/robots/{id}` — details + recent detections + patrol logs.
- DELETE `/api/admin/robots/{id}` — remove.
- POST `/api/admin/robots/{id}/simulate-detection` — trigger full loop without a real robot.

### Mission generation
- Detection size → points: small=50 / medium=100 / large=250 / multi=400
- object_count > 1 (non-multi) → +25pts per extra, capped at +150.
- Mission also gets `expires_at` (7 days) so the map can gray-out stale ones.

### Mission claims (reservation)
- POST `/api/missions/{id}/claim` → 15-min lock, 409 if another user already holds it.
- POST `/api/missions/{id}/release` → free it.
- GET  `/api/missions/mine-claimed` → my active reservations.

### Map pin semantics
- Green = completed cleanup
- Red = robot-detected / open needs-cleanup / user-reported litter
- Blue = reserved (claimed by a user)
- Gray = expired (past `expires_at`)

## Core endpoints
- Auth: signup / login / session (Google) / reset-password / me (JWT + session_token both accepted)
- Missions: list / get / claim / release / mine-claimed
- Cleanups: submit (Gemini verify), mine, all
- Reports: create / list
- Leaderboard: weekly / monthly / all
- Rewards: list / create-redemption / my-redemptions
- Admin: stats, submissions review, missions CRUD, rewards CRUD, redemptions fulfill/reject, users toggle-admin, **robots CRUD + simulate**

## Push event triggers
- Cleanup verified/approved → user
- Cleanup rejected → user
- Admin creates mission → all users
- **Robot detection → all users (radius-filter TODO once we track user home coords)**
- Redemption fulfilled (with code) → user
- Redemption rejected (points refunded) → user

## Test creds
- Admin: `admin@cleanrewards.com` / `admin123`
- Demo: `demo@cleanrewards.com` / `demo123`

## Backend test coverage
- Iteration 1 (24) + Iteration 2 (29) + Iteration 3 (22) = **75/75 backend tests PASS**.

## Post-deploy only
- Real Emergent-managed push delivery (`EMERGENT_PUSH_KEY` set at deploy).
- Real Google OAuth on native (already works on web preview).
- Android push additionally needs `google-services.json` provided by user.
