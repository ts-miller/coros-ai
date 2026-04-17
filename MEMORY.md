# COROS-AI Memory File

## 2026-03-05 — Initial Copilot Instructions Created
Created `.github/copilot-instructions.md` capturing all codebase conventions: ESM NodeNext `.js` imports, `ok()`/`fail()` response helpers, `asyncHandler` pattern, Angular signals + `inject()`, Coros auth headers and token-expiry retry codes (1019/1030), YYYYMMDD integer date convention, and security rules from the audit.

## 2026-03-05 — Training Schedule Types Added
Added `CorosScheduleQueryResponse`, `CorosScheduleData`, `ScheduleEntity`, `ScheduleProgram`, `ScheduleExercise`, `ScheduleExerciseBarChartItem`, `ScheduleSportData`, `ScheduleSubPlan`, `WeekStage`, `WeekStageTrainSum` to `apps/backend/src/types/coros.ts`. Endpoint: GET `/training/schedule/query?startDate=YYYYMMDD&endDate=YYYYMMDD&supportRestExercise=1`. `entities` are the per-day scheduled workouts; `programs` are the full structured definitions keyed by `idInPlan`.

## 2026-03-05 — Security Audit Completed
Full security audit run against the monorepo. Key findings: no API authentication on any route (C-1), Postgres port exposed to host (C-2), internal errors leaked to client (H-1), prompt injection via `goal` field (H-2), backend port bypasses nginx (H-3), no rate limiting on trigger endpoints (H-4), no security headers (H-5), `--accept-data-loss` in production startup (H-6). See `security/audit-2026-03-05.md` for full remediation details.

## 2026-04-15 — Agent Development Instructions
Redefined `AGENTS.md` as the primary instruction set for AI developers, consolidating coding conventions (ESM imports, signals, error handling) and project-specific patterns into a single authoritative guide.

## 2026-04-15 — Structured Goal System
Replaced the simple `goal: String` + `goalDate` fields on `Settings` with a dedicated `Goal` Prisma model. Goal has: `goalType` (RACE | BASE_BUILDING | JUST_RUN), `raceDistance` (5K/10K/HALF_MARATHON/MARATHON/50K/50_MILE/100K/100_MILE), `targetTimeSeconds` (optional), `raceDate`, `experienceLevel` (BEGINNER/INTERMEDIATE/ADVANCED), `daysPerWeek` (3–7). New backend endpoints: `GET /goal` and `POST /goal` (with full validation). `POST /settings` no longer handles goal/goalDate. `CoachingService` reads from `prisma.goal.findFirst()` and passes enriched goal context (including `weeksUntilRace`) to Gemini. `SYSTEM_INSTRUCTION` expanded with goal-type-specific periodization (base→build→peak→taper for RACE, aerobic-only for BASE_BUILDING, maintenance for JUST_RUN), experience level calibration, and exact daysPerWeek scheduling. Frontend settings page has a new structured goal card: 3-button goal type selector, conditional race fields (distance, date, target time H:M:S), experience level toggle, days-per-week circle buttons. Schema applied at container startup via `prisma db push`.


## 2026-04-16 — Added Development Scripts
Added `dev` (`docker compose up -d`) and `dev:stop` (`docker compose down`) to the root `package.json` for easier environment management.

## 2026-04-16 — Forced Rebuild on Dev
Updated root `package.json` `dev` script to use `docker compose up --build` to ensure images are always rebuilt and cache is bypassed for local development.
