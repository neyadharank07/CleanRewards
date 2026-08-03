# CleanRewards — PRD

## Overview
CleanRewards rewards residents for picking up litter. Users complete cleanup
missions, submit before/after photos which are AI-verified, earn points,
compete on leaderboards, and redeem rewards. Admins manage submissions,
missions, rewards, redemptions, and users through an in-app dashboard.

## Stack
- Frontend: Expo SDK 54, React Native, TypeScript, expo-router
- Backend: FastAPI + MongoDB (motor)
- Auth: JWT email/password + **real** Emergent-managed Google Auth (session_token)
- AI verification: Emergent LLM key → Gemini 2.5 Flash vision (`emergentintegrations`)
- Push notifications: Emergent-managed relay (SuprSend) — real key auto-set on deploy
- Storage: base64 images in MongoDB (compressed)

## Screens
- Auth: Login, Signup, Forgot Password (real Google button via WebBrowser + `/api/auth/session`)
- Tabs: Home, Map, Leaderboard (weekly/monthly/all), Rewards, Profile
- Flows: Cleanup (5-step w/ AI verify), Report Litter, Notifications, Settings, My Redemptions
- Admin (visible only if `user.is_admin`): Overview, Submissions, Missions, Rewards, Redemptions, Users

## Backend endpoints
### Auth
- POST `/api/auth/signup`, `/api/auth/login`, `/api/auth/reset-password`
- POST `/api/auth/session` — exchanges Emergent `session_id` → 7-day `session_token`
- GET/PATCH `/api/me`

### Core
- GET `/api/missions`, `/api/missions/{id}`
- POST `/api/cleanups/submit` (AI verification, awards points/badges, push on success)
- GET `/api/cleanups/mine`, `/api/cleanups/all`
- POST `/api/reports`, GET `/api/reports`
- GET `/api/leaderboard?period=weekly|monthly|all`
- GET `/api/rewards`, `/api/badges`, `/api/notifications`

### Redemptions
- POST `/api/redemptions` — user redeems (deducts points immediately)
- GET `/api/redemptions/mine`

### Push
- POST `/api/register-push` — relays to Emergent SuprSend

### Admin (require `is_admin`)
- GET `/api/admin/stats`
- GET `/api/admin/cleanups`, POST `/api/admin/cleanups/{id}/review`
- POST/PATCH/DELETE `/api/admin/missions[/id]`
- POST/DELETE `/api/admin/rewards[/id]`
- GET `/api/admin/redemptions`, POST `/admin/redemptions/{id}/fulfill|reject`
- GET `/api/admin/users`, POST `/api/admin/users/{id}/toggle-admin`

## Push event triggers (server-side)
- Cleanup verified (AI or admin approval) → push to user with "+N points"
- Cleanup rejected by admin → push to user with note
- Admin creates mission → push to all non-admin users
- Redemption fulfilled → push to user with code
- Redemption rejected → push to user "points refunded"

## Points model
- easy: 50pts / 15min • medium: 100pts / 30min • hard: 250pts / 60min
- Streak & badges auto-computed on verified cleanup.

## Notes
- Google Auth WORKS in preview via WebBrowser flow; also fully-supported after Publish.
- Push notifications require deployed native build (real `EMERGENT_PUSH_KEY` set at deploy).
- Admin is seeded at startup: `admin@cleanrewards.com` / `admin123`.
