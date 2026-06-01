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
windsurf-project/
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   │   ├── games/         # SwipeVibe, SpinWheel game components
│   │   │   ├── Hero.jsx       # Landing hero with animated headline
│   │   │   ├── HowItWorks.jsx # 3-step explainer section
│   │   │   ├── Benefits.jsx   # Benefits + coming soon section
│   │   │   ├── Navbar.tsx     # Scroll-aware nav with mobile drawer
│   │   │   ├── Recommendations.tsx  # AI results + alternatives strip
│   │   │   ├── GameSelector.tsx     # Game picker screen
│   │   │   └── Waitlist.jsx   # Waitlist signup form
│   │   ├── services/
│   │   │   └── aiRecommendations.ts  # AI service client
│   │   ├── utils/
│   │   │   └── analytics.ts   # Event tracking
│   │   └── App.tsx            # Root app with view routing
│   └── index.html             # Favicon, OG/Twitter meta tags
├── backend/                   # Node.js API server
│   ├── server.js              # Express app, rate limiting, routes
│   ├── db.js                  # SQLite connection
│   ├── database.sql           # DB schema
│   ├── admin/                 # Admin panel (static HTML, Basic Auth)
│   └── .env.example           # Environment variable template
└── package.json               # Root scripts (dev, build, deploy)
```

---

## Features

### 🎮 Three Game Modes

- **Classic Quiz** — 4-question mood quiz
- **Swipe & Vibe** — Tinder-style food card swiping with touch drag, card tilt, and LIKE/NOPE stamps
- **Spin the Wheel** — Spin to land on a food vibe; accept or reject with confetti on land

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
npm install          # root
cd frontend && npm install
cd backend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Fill in AI service URL, admin credentials, etc.
```

### 3. Run dev servers

```bash
npm run dev          # starts frontend (5173) + backend (3001) concurrently
```

### 4. Admin panel

```
http://localhost:3001/admin
Username: admin
Password: set in backend/.env (ADMIN_PASSWORD)
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
