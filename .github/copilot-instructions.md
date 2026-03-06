# Coros-AI — GitHub Copilot Workspace Instructions

## Session Start Protocol

**Always begin every response by skimming `MEMORY.md`** in the workspace root for relevant context — recent decisions, architectural changes, or pasted API shapes. Do this before writing any code.

---

## MEMORY.md — Keeping It Current

Whenever a decision is made that affects project architecture, data models, API integration, or technology choices, **append a brief summary to `MEMORY.md`**. Use this format:

```markdown
## YYYY-MM-DD — <Short Title>
<One or two sentences describing the decision or change made.>
```

Keep entries concise. This file serves as the single source of truth for project decisions across sessions.

---

## API Payloads → Type Files

When the user pastes a raw API request or response (from Coros, Gemini, or any external service), **always create a TypeScript interface/type definition file** for it, even if not explicitly asked. Use the following conventions:

- **Location:** `apps/backend/src/types/<domain>.ts` (e.g. `coros.ts` already exists — add to it unless it belongs in a new domain)
- **Naming:** Prefix with the API name (e.g. `CorosTrainingAnalysisResponse`, `GeminiCoachingRequest`)
- **Shape:** Model the exact JSON structure as TypeScript interfaces with field comments noting units or special encodings
- **Pattern example:**
  ```typescript
  /** Returned by GET /analyse/query */
  export interface CorosTrainingAnalysisResponse {
    result: string;
    message: string;
    data?: {
      hrvValue: number;        // HRV in ms
      overnightHrvAvg: number; // nightly average
      // ...
    };
  }
  ```

---

## Project Overview

Self-hosted, AI-powered running coach. Single-user. Deployed via Docker Compose on Proxmox.

**Monorepo layout:**
- `apps/backend` — Express + Prisma + Node.js (runs with `tsx`, no compile step)
- `apps/frontend` — Angular 21 standalone components
- `prisma/schema.prisma` — PostgreSQL schema (Prisma 5)

---

## Backend Conventions

### TypeScript & Module System
- Strict TypeScript (`"strict": true`), target `ES2022`, `NodeNext` module resolution
- **All local imports must use `.js` extensions** (e.g. `import { foo } from './bar.js'`)
- Use `async/await` exclusively — no raw Promise chains
- `Promise.all()` for concurrent independent async calls

### File & Code Organization
- Use visual section separators to divide logical blocks:
  ```typescript
  // ─── Section Name ───────────────────────────────────────────────────────────
  ```
- Classes for stateful services (`CorosClient`, `CorosWorkoutClient`)
- Plain `async function` exports for single-purpose workers (`runActivitySync`, `runAiCoaching`)
- Export singleton instances at the bottom of client files:
  ```typescript
  export const corosClient = new CorosClient();
  ```

### API Response Pattern
**Every route must return one of these two shapes — no exceptions:**
```typescript
// Success
res.json({ success: true, data: <payload> });

// Failure
res.status(<code>).json({ success: false, error: '<message>' });
```
Use the `ok(res, data)` and `fail(res, status, message)` helpers defined in `router.ts`.

### Route & Middleware
- All async route handlers wrapped in `asyncHandler` HOF to catch thrown errors
- Auth middleware `requireApiKey` applied at the router mount level — never add it per-route
- Do not leak raw error messages to the client (mask with generic "An error occurred" for 500s)

### Dates
- **All dates stored and passed as `YYYYMMDD` integers** — never ISO strings or Date objects at API boundaries
- Use `getDateIntDaysAgo(n)` / `getDateIntDaysAhead(n)` helpers for date arithmetic

### Logging
- Use bracket-prefixed `console.error` / `console.log`:
  ```typescript
  console.error('[ActivitySync] Failed to fetch:', err);
  ```
- Never log user credentials, tokens, or personal health data

### Error Handling
- Validate input at route boundaries (query params, request bodies) — reject malformed input with `fail(res, 400, ...)`
- Validate numeric bounds on query parameters (e.g. `days` must be between 1–90)
- Do not pass raw Prisma or Coros API errors to the client

---

## Frontend Conventions

### Angular Components
- **Standalone only** — never use `NgModule`
- Use `inject()` function for dependency injection — never constructor injection for services:
  ```typescript
  private readonly api = inject(CorosApiService);
  ```
- Manage state with Angular **Signals**:
  ```typescript
  loading = signal(true);
  error = signal<string | null>(null);
  data = signal<Activity[]>([]);
  ```
- Implement `OnInit`; call a `loadData()` method from `ngOnInit()`
- Use `forkJoin` for batching parallel HTTP calls in `loadData()`
- Component class name matches route (no `Component` suffix): class `Dashboard`, selector `app-dashboard`
- Always use `templateUrl` + `styleUrl` (separate files) — not inline templates

### Angular Services
- `@Injectable({ providedIn: 'root' })` for all services
- All methods return `Observable<T>` — never `Promise<T>`
- Use a private `unwrap<T>()` helper to translate `ApiResponse<T>` payload to `Observable<T>`

### Types
- Frontend re-declares its own interfaces in `coros-api.ts` — there is no shared types package between frontend and backend
- Mirror the `ApiResponse<T>` discriminated union:
  ```typescript
  type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };
  ```

---

## Coros API Integration

- **Base URL:** `https://teamapi.coros.com`
- **Auth headers:** `accessToken` header + `yfheader: JSON.stringify({ userId })`
- **Password hashing:** MD5 before sending to Coros (protocol requirement, not a choice)
- **Token expiry codes:** `1019` and `1030` signal expired token → re-login and retry once
- **Pagination:** `getAllRunningActivities()` uses a `do...while` loop
- Never expose raw Coros API error details to the frontend

---

## Security Rules

- Never store or log the `ENCRYPTION_KEY` or `API_KEY` environment variables
- Validate and sanitize all user-supplied strings before including in AI prompts (prevent prompt injection via `goal` field)
- Do not expose PostgreSQL port to the host in `docker-compose.yml` (internal Docker network only)
- Apply request body size limits (`express.json({ limit: '10kb' })`)
- The Coros access token is stored in plaintext in DB (it rotates); the Coros password is AES-256-GCM encrypted

---

## Technology Versions (Do Not Upgrade Without Explicit Request)

| Package | Version |
|---|---|
| Angular | 21 |
| Angular Material | 21 |
| Express | 4 |
| Prisma | 5 |
| TypeScript | 5.7 |
| `@google/genai` SDK | latest stable |
| Node.js runtime (tsx) | ESM, NodeNext |
