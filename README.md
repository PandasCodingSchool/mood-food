# MoodFood 🍽️

> **From "I'm hungry" to eating in 90 seconds.**

AI-powered, mood-based food recommendations. Answer a few quick questions (or play a game), and get personalized meal picks — with healthier swaps and budget alternatives included.

---

## What It Does

Most food apps answer "How do I order?" — MoodFood answers **"What should I eat?"**

Users pick a game, share their mood & cravings, and receive 3 AI-curated meal recommendations tailored to their budget, dietary preferences, and current vibe.

---

## Tech Stack

| Layer      | Tech                                                    |
| ---------- | ------------------------------------------------------- |
| Frontend   | React 18 + Vite, TypeScript, Tailwind CSS, Lucide React |
| Backend    | Node.js + Express, SQLite (via better-sqlite3)          |
| AI Service | Python FastAPI (intelligence service, separate process) |
| Animations | CSS keyframes (no external animation libraries)         |

---

## Project Structure

```
mood-food/
├── apps/
│   ├── backend/        # Express API (v1). Being replaced by apps/api (NestJS)
│   ├── frontend/       # Vite + React web app (v1). Replaced by Expo web + apps/site
│   ├── mobile/         # Expo app (iOS, Android, product web)
│   └── intelligence/   # Python FastAPI: recommender, learning, Swiggy MCP
├── packages/           # Shared packages (tokens, ui, contracts, api-client), added in 2.0
├── docs/               # Architecture, gaps, redesign reference
├── pnpm-workspace.yaml
└── turbo.json          # Pipeline: pnpm build | typecheck | test
```

---

## Features

### 🎮 Three Game Modes

- **Classic Quiz** — 4-question mood quiz
- **Swipe & Vibe** — Tinder-style food card swiping with touch drag, card tilt, and LIKE/NOPE stamps
- **Meal Roulette** — Spin to land on a food vibe; accept or reject with confetti on land

### 🤖 AI Recommendations

- 3 personalized meal picks powered by the intelligence service
- Each pick includes an explanation and mood-match score
- **Healthier swap** (🥦) and **Budget pick** (💰) alternatives in a horizontal scroll strip

### 🏠 Landing Page

- Word-by-word animated hero headline
- Floating food emoji particles + animated background blobs
- Shimmer effect on CTA button
- Scroll-triggered staggered fade-in on all sections
- "The difference" panel: _Other apps ask how to order. We answer what to eat._
- **Coming Soon** grid: Restaurant Finder, Group Decisions, Meal Memories, and more

### 🧭 Navbar

- Scroll-aware shadow + blur
- "Join Waitlist" + "Find My Meal" buttons
- Mobile hamburger drawer

### 📋 Waitlist

- Name, email, city, favourite cuisine
- Duplicate email prevention
- Backend-persisted in SQLite

### 🔧 Admin Panel

- Basic Auth protected at `/admin`
- Analytics dashboard: events, daily stats, waitlist viewer

---

## Quick Start

### 1. Install dependencies

```bash
corepack enable
pnpm install         # installs every app in apps/*
```

### 2. Configure environment

```bash
cp apps/backend/.env.example apps/backend/.env
# Fill in AI service URL, admin credentials, etc.
```

### 3. Run dev servers

```bash
pnpm dev             # starts frontend (5173) + backend (3001) concurrently
```

### 4. Admin panel

```
http://localhost:3001/admin
Username: admin
Password: set in apps/backend/.env (ADMIN_PASSWORD)
```

---

## API Endpoints

### Public

| Method | Route                     | Description           |
| ------ | ------------------------- | --------------------- |
| GET    | `/api/health`             | Health check          |
| POST   | `/api/waitlist`           | Join waitlist         |
| POST   | `/api/analytics`          | Track event           |
| POST   | `/api/ai-recommendations` | Get AI meal picks     |
| POST   | `/api/quiz-complete`      | Track quiz completion |

### Admin (Basic Auth)

| Method | Route                  | Description          |
| ------ | ---------------------- | -------------------- |
| GET    | `/api/admin/analytics` | Analytics summary    |
| GET    | `/api/admin/waitlist`  | All waitlist entries |

---

## Analytics Events

| Event                      | Triggered when             |
| -------------------------- | -------------------------- |
| `landing_page_viewed`      | User visits landing page   |
| `quiz_started`             | User clicks "Find My Meal" |
| `game_selected`            | User picks a game mode     |
| `quiz_completed`           | Quiz answers submitted     |
| `recommendation_viewed`    | AI results displayed       |
| `recommendation_liked`     | User likes a result        |
| `recommendation_refreshed` | User requests new picks    |
| `recommendation_shared`    | User shares a result       |
| `waitlist_joined`          | Waitlist form submitted    |
| `wheel_spun`               | SpinWheel spin triggered   |
| `wheel_landed`             | SpinWheel stops on segment |

---

## Coming Soon (Roadmap)

| Feature                                                        | ETA     |
| -------------------------------------------------------------- | ------- |
| 📍 Restaurant Finder — nearby spots for your picked dish       | Q3 2026 |
| 👥 Group Decisions — vote with friends via one link            | Q3 2026 |
| 📸 Meal Memories — snap what you ate, build your taste profile | Q4 2026 |
| 🔔 Meal Reminders — "Hungry yet?" nudges based on your routine | Q4 2026 |
| 🏆 Taste Streaks — try new things daily & earn badges          | Q1 2027 |
| 🌍 Global Palette — explore cuisines from 50+ countries        | Q1 2027 |

---

## License

MIT

---

**Built with ❤️ for people who hate deciding what to eat.**
