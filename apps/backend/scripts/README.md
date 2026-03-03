# Backend Test Scripts

All scripts are run from `apps/backend/` with `tsx` and require a `.env` file at that path.

## Prerequisites

- Backend environment configured (`.env` with `DATABASE_URL`, `CRYPTO_SECRET`)
- Coros credentials saved to the database (`POST /api/settings` with `corosEmail` + `corosPassword`)

---

## Scripts

### `test-coros-auth.ts` – Direct Coros API tests

Tests connectivity and authentication directly against `https://teamapi.coros.com`.
Does **not** require the backend server to be running.

```bash
npm run test:coros
```

**What it checks:**
- API reachability (HEAD request to base URL)
- Login with stored credentials → token acquisition
- Activity list for the past 7 days
- Activity detail for the first activity found
- Token validity after multiple requests

---

### `test-api.ts` – Local backend REST API tests

Tests the Express API endpoints. **Requires the backend to be running.**

```bash
# Start backend in another terminal first:
npm run dev

# Then run tests:
npm run test:api

# Override base URL:
BASE_URL=http://localhost:3001 npm run test:api
```

**What it checks:**
| Endpoint | Test |
|---|---|
| `GET /api/ping` | 200 + `status: "ok"` |
| `GET /api/settings` | Config present, fields populated |
| `GET /api/activities` | Array returned, summary block |
| `GET /api/activities?days=7` | Date filter accepted |
| `GET /api/health` | Metrics array, `isMock` flagging |
| `GET /api/schedule` | Upcoming workouts array |
| `GET /api/predictions` | AI predictions object |
| `POST /api/settings` | Write path (no-op goal update) |
| `POST /api/sync` | Triggers Coros sync, checks result |
| Unknown route | 404 response |

---

## Run all tests

```bash
npm run test:all
```

This runs `test-coros-auth.ts` then `test-api.ts` (requires the backend server running for the second one).
