# CleanRewards — PRD

## Overview
CleanRewards is a mobile app that rewards residents for picking up litter. Users
complete cleanup missions, submit before/after photos which get AI-verified,
earn points, and compete on leaderboards.

## Stack
- Frontend: Expo SDK 54, React Native, TypeScript, expo-router (file-based)
- Backend: FastAPI + MongoDB (motor)
- Auth: JWT email/password + mocked Google login
- AI verification: Emergent LLM key -> Gemini 2.5 Flash via `emergentintegrations`
- Storage: Base64 images in MongoDB (small compressed photos)

## Screens implemented
- Auth: Login, Signup, Forgot Password
- Tabs: Home, Map (list-based, no native map dep), Leaderboard (weekly/monthly/all), Rewards, Profile
- Flows: Cleanup (intro → before → after → verify → result), Report Litter, Notifications, Settings

## Backend endpoints (`/api/...`)
- POST /auth/signup, /auth/login, /auth/google, /auth/reset-password
- GET/PATCH /me
- GET /missions, /missions/{id}
- POST /cleanups/submit (AI verification), GET /cleanups/mine, /cleanups/all
- POST /reports, GET /reports
- GET /leaderboard?period=weekly|monthly|all
- GET /rewards, /badges, /notifications
- POST /push-token

## Points model
- easy: 50pts / 15min, medium: 100pts / 30min, hard: 250pts / 60min
- Cleanup awarded points, cleanup count, volunteer hours, streak++ on success.
- Badges auto-awarded: first_cleanup, neighborhood_hero (10), park_protector (5),
  points_1000, cleanups_50.

## Notes
- Map screen uses a scrollable card-list to avoid requiring Google Maps API key.
- Push notifications endpoint stores Expo push tokens; sending requires production build.
- AI verification is permissive if Gemini is unreachable (falls back verified=true).
