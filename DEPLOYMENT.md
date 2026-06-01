# MoodFood — Deployment Guide

MoodFood has **three deployable services**:

| Service         | Stack                      | Port                         |
| --------------- | -------------------------- | ---------------------------- |
| Frontend        | React + Vite               | 5173 (dev) / Vercel (prod)   |
| Backend API     | Node.js + Express + SQLite | 3001                         |
| AI Intelligence | Python FastAPI             | 8000 (separate repo/process) |

> **Note:** The backend uses **SQLite** (file-based, zero config). No PostgreSQL or external database is required.

---

## Local Development

```bash
# Install all dependencies
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env (see Environment Variables section below)

# Start both frontend + backend together
npm run dev
# Frontend → http://localhost:5173
# Backend  → http://localhost:3001
# Admin    → http://localhost:3001/admin
```

---

## Production Deployment

### 1. Deploy Backend to Railway

```bash
cd backend

# Login (install CLI first: npm i -g @railway/cli)
railway login
railway init

# Deploy — no database plugin needed (SQLite is file-based)
railway up
```

Get your backend URL:

```bash
railway domain
# e.g. https://moodfood-api.up.railway.app
```

> **Important:** SQLite writes to a local file. On Railway, use a Volume to persist the database file across deploys. Go to **Service → Volumes** and mount `/app/data`.

### 2. Configure Frontend API URL

Create (or update) `frontend/.env.production`:

```
VITE_API_URL=https://your-railway-app.up.railway.app
```

### 3. Deploy Frontend to Vercel

```bash
cd frontend
npm i -g vercel   # if not installed
vercel            # follow prompts, framework: Vite
```

Or connect your GitHub repo in the Vercel dashboard — it auto-detects Vite.

**Your app is live! 🎉**

---

## Alternative: Deploy Backend to Render

1. Go to [render.com](https://render.com) → New Web Service
2. Connect GitHub repo, set root directory to `backend`
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Add a **Persistent Disk** and set mount path to `/app/data` (for SQLite)
5. Add environment variables (see below)

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Server
NODE_ENV=production
PORT=3001

# Admin panel credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# SQLite DB path (defaults to ./moodfood.db)
DATABASE_PATH=./data/moodfood.db

# AI Intelligence Service
AI_SERVICE_URL=https://your-intelligence-service.com
AI_SERVICE_API_KEY=your-api-key

# Rate limiting (requests per 15 min window)
RATE_LIMIT_GENERAL=100
RATE_LIMIT_AI=10

# CORS — set to your frontend URL in production
CORS_ORIGIN=https://your-frontend.vercel.app
```

### Frontend (`frontend/.env.production`)

```env
VITE_API_URL=https://your-backend-url.up.railway.app
```

---

## AI Intelligence Service

The AI recommendations endpoint (`POST /api/ai-recommendations`) proxies to a separate Python FastAPI service. To deploy it:

1. Navigate to the `intelligence/` directory
2. Follow its own deployment instructions
3. Set `AI_SERVICE_URL` and `AI_SERVICE_API_KEY` in your backend `.env`

If the AI service is unavailable, the backend returns a graceful error to the frontend.

---

## Post-Deployment Checklist

- [ ] `GET https://your-api.com/api/health` returns `{ status: "ok" }`
- [ ] Admin panel loads at `https://your-api.com/admin`
- [ ] Full game → recommendation flow works end-to-end
- [ ] Waitlist form submits and persists
- [ ] Analytics events are tracked
- [ ] AI recommendations return results (check `AI_SERVICE_URL`)
- [ ] CORS origin matches your frontend domain
- [ ] SQLite volume/disk is mounted (data persists across redeploys)
- [ ] Custom domain configured (optional)

---

## Custom Domain

### Frontend (Vercel)

1. Project Settings → Domains → Add domain
2. Follow Vercel's DNS instructions

### Backend (Railway)

1. Service Settings → Networking → Add custom domain
2. Add a CNAME record pointing to Railway's domain

---

## Monitoring

| Resource     | URL                                 |
| ------------ | ----------------------------------- |
| Admin panel  | `https://your-api.com/admin`        |
| Health check | `https://your-api.com/api/health`   |
| Railway logs | `railway logs` or Railway dashboard |
| Vercel logs  | Vercel dashboard → Functions tab    |

---

## Troubleshooting

### Backend won't start

```bash
railway logs   # or check Render/Heroku logs
curl https://your-api.com/api/health
```

- Verify all required env vars are set
- Ensure `DATABASE_PATH` directory is writable

### Frontend can't reach backend

1. Check `VITE_API_URL` is set correctly in `.env.production`
2. Verify `CORS_ORIGIN` in backend env matches frontend domain exactly
3. Confirm backend is running (`/api/health`)

### AI recommendations failing

1. Verify `AI_SERVICE_URL` and `AI_SERVICE_API_KEY` in backend env
2. Check the intelligence service is deployed and reachable
3. The frontend shows a user-friendly error on 429 (rate limit) or 503

### SQLite data lost after redeploy

- Ensure a **persistent volume/disk** is mounted at the path set in `DATABASE_PATH`
- Railway: Service → Volumes; Render: Add Persistent Disk

---

## Cost Estimate

| Service              | Free Tier            | Paid              |
| -------------------- | -------------------- | ----------------- |
| Vercel (frontend)    | ✅ Free (Hobby)      | $20/mo (Pro)      |
| Railway (backend)    | ✅ $5 free credit/mo | ~$5–10/mo         |
| Render (alternative) | ✅ Free (spins down) | $7/mo (always-on) |
| **Total**            | **~$0/mo**           | **~$10–15/mo**    |
