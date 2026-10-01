# MoodFood Onboarding Guide

## 1. What to know before coding

This repo is a multi-layer product, not a single app. Before making changes, understand which layer owns the feature:

- web UI: [../apps/frontend](../apps/frontend)
- backend API: [../apps/backend](../apps/backend)
- AI recommendations and personalization: [../apps/intelligence](../apps/intelligence)
- mobile app: [../apps/mobile](../apps/mobile)

## 2. Prerequisites

You will likely need:

- Node.js
- npm or yarn
- Python 3
- access to environment variables for backend and AI services
- a database option for local or cloud use

## 3. Local setup

From the repo root:

```bash
npm install
cd frontend && npm install
cd ../apps/backend && npm install
```

For the AI service:

```bash
cd ../apps/intelligence
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 4. Run services locally

Root scripts:

```bash
npm run dev
```

This starts:

- frontend dev server
- backend server

If needed, run the intelligence service separately:

```bash
cd intelligence
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 5. How the system is organized

### Frontend

Entry point:

- [../apps/frontend/src/App.tsx](../apps/frontend/src/App.tsx)

Main responsibilities:

- navigation
- game selection
- mood check-in
- quiz and recommendation display

### Backend

Entry point:

- [../apps/backend/server.js](../apps/backend/server.js)

Main responsibilities:

- HTTP routing
- session and auth
- database calls
- analytics / waitlist
- Swiggy and Instamart forwarding

### AI service

Entry point:

- [../apps/intelligence/app/main.py](../apps/intelligence/app/main.py)

Main responsibilities:

- rank and explain recommendations
- apply personalization logic
- process live discovery data
- route recipe and moderation tasks

## 6. Common entry points to understand first

When new to the repo, read these in this order:

1. [../README.md](../README.md)
2. [../apps/frontend/src/App.tsx](../apps/frontend/src/App.tsx)
3. [../apps/backend/server.js](../apps/backend/server.js)
4. [../apps/intelligence/app/main.py](../apps/intelligence/app/main.py)
5. [../apps/backend/db.js](../apps/backend/db.js)

These files explain the app behavior, request flow, and data model more quickly than chasing feature folders one by one.

## 7. Typical feature ownership

### Web UI feature work

Usually lives in:

- [../apps/frontend/src/components](../apps/frontend/src/components)
- [../apps/frontend/src/services](../apps/frontend/src/services)

### API work

Usually lives in:

- [../apps/backend/routes](../apps/backend/routes)
- [../apps/backend/middleware](../apps/backend/middleware)

### Recommendation and personalization work

Usually lives in:

- [../apps/intelligence/app/routes](../apps/intelligence/app/routes)
- [../apps/intelligence/app/services](../apps/intelligence/app/services)
- [../apps/intelligence/app/learning](../apps/intelligence/app/learning)

### Mobile work

Usually lives in:

- [../apps/mobile/app](../apps/mobile/app)

## 8. Developer workflow

During feature work:

1. Identify the owning layer.
2. Read the route or screen entry point.
3. Trace the request to the DB or AI service.
4. Confirm whether the feature is UI-only, backend-only, or cross-service.
5. Keep data contracts and signal payloads consistent across layers.

## 9. Practical tips

- Do not assume frontend-only logic when the product depends on AI ranking.
- Do not change personalization signal shapes without checking the learning consumer.
- Respect the separation between the backend and intelligence service.
- Treat Swiggy, Instamart, and recipe paths as integration-heavy features that need broader validation.

## 10. Good first tasks for onboarding

Good exercises for new contributors:

- trace one recommendation request from frontend to backend to AI service
- inspect how a game result becomes a signal
- understand how a user profile is inferred from action history
- explore the DIY recipe process from recipe generation to stored session
- follow a waitlist or analytics event from browser to database

## 11. Suggested next steps

Before making large changes, read:

- [architecture.md](architecture.md)
- [gaps.md](gaps.md)

That gives the context needed to work safely in this repo without creating layer inconsistencies.
