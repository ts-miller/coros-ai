# Coros AI — AI-Powered Running Coach

> **Note:** This project is primarily coded using AI.

A self-hosted, AI-powered running coach that integrates directly with the Coros ecosystem. Syncs training data and sleep metrics, generates personalised rolling 7-day schedules using Gemini, and pushes workouts directly to your Coros watch via the Training Hub.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express (TypeScript strict) |
| Database | PostgreSQL + Prisma ORM |
| AI | Google Gemini (`@google/genai`) |
| Frontend | Angular 21 + Angular Material |
| Deployment | Docker Compose |

## Project Structure

```
apps/
  backend/
    prisma/schema.prisma         # DB schema
    src/
      api/router.ts              # REST API routes
      ai/CoachingService.ts      # Gemini integration
      coros/CorosClient.ts       # Coros data API client
      coros/CorosWorkoutClient.ts # Coros workout push client
      sync/ActivitySyncService.ts
      sync/HealthMetricSyncService.ts
      sync/WorkoutPushService.ts
      jobs/scheduler.ts          # Cron jobs
      lib/{prisma,crypto}.ts
  frontend/
    src/app/
      pages/{dashboard,schedule,predictions,settings}/
      services/coros-api.ts      # Angular HTTP service
docker-compose.yml
```

## Quick Start

### 1. Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `POSTGRES_PASSWORD` — any strong password
- `ENCRYPTION_KEY` — 64-char hex string (encrypts Coros credentials at rest in the DB)
- `API_KEY` — 64-char hex string (authenticates all API requests between nginx and the backend)
- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)

Generate `ENCRYPTION_KEY` and `API_KEY` with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Coros credentials are stored encrypted in the database via the Settings page.

> **Security:** All `/api` requests require the `X-API-Key` header matching `API_KEY`. nginx injects this automatically when proxying — the Angular frontend requires no changes. Direct requests to port 3000 (if exposed) without the header will receive `401 Unauthorized`.

### 2. Docker

```bash
docker compose up -d
```

The frontend runs at **http://localhost:4200**, the backend API at **http://localhost:3000/api**.

### 3. Local Development

```bash
# Backend
cd apps/backend
npm install
npx prisma migrate dev   # creates tables
npm run dev              # tsx watch on port 3000

# Frontend (separate terminal)
cd apps/frontend
npm install
npm start                # Angular dev server on port 4200 with /api proxy
```

### 4. First Use

1. Open **http://localhost:4200/settings**
2. Enter your Coros email and password — these are encrypted and stored in the DB
3. Click **Sync Activities** to pull your last 30 days of running data
4. Click **Generate AI Plan** to create your first 7-day schedule
5. Click **Push to Watch** to send workouts to your Coros Training Hub

The watch will sync the workouts automatically over the next Coros sync.

## Automated Jobs

| Schedule | Job |
|---|---|
| Daily 02:00 | Sync activities + health metrics |
| Monday 03:00 | Generate AI plan + push to Coros |

## Notes

- **Session conflict**: Logging in via the API signs you out of the Coros web browser session, and vice versa. The app handles 401s by automatically re-logging in.
- **Sleep data**: No sleep API endpoint has been found in the Coros reverse-engineered API. Health metrics are currently generated as plausible placeholder values (flagged in the UI). Real data will be used automatically when an endpoint is discovered.
- **Running workout push**: The Coros workout push API is only documented for strength training. The running payload structure is a best-effort reverse-engineering; push errors are logged to the DB (`WorkoutPlan.pushError`) for debugging against a real account.

## Database Migrations

```bash
# Dev
cd apps/backend && npx prisma migrate dev --name <migration_name>

# Production (run automatically on Docker startup)
npx prisma migrate deploy
```

## Credits

This project adapts patterns from the following open-source repositories to integrate with the undocumented Coros API:

- **[jmn8718/coros-connect](https://github.com/jmn8718/coros-connect)** — HTTP patterns for authenticating with Coros and fetching activity/health data.
- **[rowlando/coros-workout-mcp](https://github.com/rowlando/coros-workout-mcp)** — Reverse-engineered endpoint structures for pushing workouts to the Coros Training Hub.
AI integration for Coros Fitness Watches
