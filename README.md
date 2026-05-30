# MoodFood - Phase 0 Implementation

A mood-based food recommendation platform that helps users decide what to eat in under 2 minutes.

## Phase 0: Market Validation

This is the initial validation phase built with minimal resources to test product-market fit before investing in Phase 1.

### Success Criteria

- 500+ visitors
- 25%+ quiz completion rate
- 10%+ waitlist conversion
- Positive user feedback
- Users voluntarily share the product

## Tech Stack

**Frontend:**
- React + Vite
- Tailwind CSS
- Lucide React (icons)

**Backend:**
- Node.js + Express
- PostgreSQL
- CORS enabled for API access

**Hosting:**
- Frontend: Vercel
- Backend: Railway/Heroku

## Project Structure

```
mood-food-platform/
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── utils/       # Analytics & recommendation engine
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/            # Node.js backend
│   ├── admin/          # Admin panel (static HTML)
│   ├── server.js       # Express server
│   ├── db.js           # PostgreSQL connection
│   ├── database.sql    # Database schema
│   └── package.json
├── package.json        # Root package.json with scripts
└── README.md
```

## Features Implemented

### Landing Page
- Hero section with compelling headline
- How It Works section (3 steps)
- Benefits section (5 key benefits)
- Waitlist signup form

### Mood Quiz MVP
- 4-question interactive quiz:
  1. How are you feeling? (Happy, Tired, Stressed, Celebrating, Relaxed, Adventurous)
  2. What sounds good? (Spicy, Sweet, Comfort Food, Healthy, Light, Indulgent)
  3. Budget (Low, Medium, High)
  4. Food preference (Veg, Non-Veg, Both)

### Recommendation Engine (Rule-Based)
- No AI - uses smart rule matching
- Mood + craving combination matrix
- Generates 3 personalized recommendations
- Includes cuisine type, budget category, and reasoning

### Analytics Tracking
Tracks:
- Landing page views
- Quiz started
- Quiz completed
- Recommendations viewed
- Waitlist joined
- Shares

### Waitlist System
- Collects: Name, Email, City, Favorite Cuisine (optional)
- Prevents duplicate emails
- Success confirmation

### Admin Panel
- Login protected (Basic Auth)
- Analytics dashboard with stats
- Event breakdown
- Daily stats (last 7 days)
- Waitlist viewer

## Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd backend && npm install
```

### 2. Setup Database

```bash
# Create PostgreSQL database
createdb moodfood

# Run schema
psql moodfood < backend/database.sql
```

### 3. Configure Environment

```bash
# Copy example env file
cp backend/.env.example backend/.env

# Edit backend/.env with your credentials
```

### 4. Run Development Server

```bash
# Run both frontend and backend
npm run dev

# Or run separately:
npm run dev:frontend  # Frontend on port 5173
npm run dev:backend   # Backend on port 3001
```

### 5. Access Admin Panel

```
http://localhost:3001/admin
Username: admin
Password: changeme (change in .env)
```

## Deployment

### Frontend (Vercel)

```bash
cd frontend
vercel
```

### Backend (Railway)

```bash
cd backend
railway init
railway up
```

Don't forget to:
1. Add PostgreSQL database in Railway dashboard
2. Set environment variables
3. Update frontend API URL

## API Endpoints

### Public
- `GET /api/health` - Health check
- `POST /api/waitlist` - Join waitlist
- `POST /api/analytics` - Track event
- `POST /api/quiz-complete` - Track quiz completion

### Admin (Requires Basic Auth)
- `GET /api/admin/analytics` - Get analytics summary
- `GET /api/admin/waitlist` - Get all waitlist entries

## Recommendation Engine Logic

The rule-based engine uses a mood × craving matrix to recommend foods:

```javascript
// Example: Happy + Comfort Food
moodDatabase.happy.comfort = [
  'Pizza', 'Burger', 'Pasta', 'Tacos', 'Fried Chicken'
]

// Example: Tired + Healthy
moodDatabase.tired.healthy = [
  'Chicken Soup', 'Steamed Fish', 'Vegetable Stir-fry'
]
```

Each recommendation includes:
- Food name
- Cuisine type (based on preference)
- Budget category
- Reasoning explanation
- Tags (mood, craving, characteristics)

## Analytics Schema

Events stored in `analytics_events` table:
- `landing_page_viewed` - User visited landing page
- `quiz_started` - User clicked "Find My Meal"
- `quiz_completed` - User finished all questions
- `recommendation_viewed` - User saw recommendations
- `waitlist_joined` - User joined waitlist
- `recommendation_shared` - User shared a recommendation
- `recommendation_liked` - User liked a recommendation
- `recommendation_refreshed` - User requested new recommendations

## Next Steps (Phase 1)

If Phase 0 validation succeeds:

1. **User Accounts**
   - Google OAuth login
   - Profile management
   - Preference history

2. **AI Integration**
   - LLM-based recommendations
   - Explanation generation
   - Better personalization

3. **Metrics to Track**
   - Weekly Active Users
   - Returning users
   - Recommendation acceptance rate
   - Session duration

## License

MIT

---

**Built with ❤️ for food lovers everywhere**
