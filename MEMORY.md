# COROS-AI Memory File

## 2026-03-05 — Initial Copilot Instructions Created
Created `.github/copilot-instructions.md` capturing all codebase conventions: ESM NodeNext `.js` imports, `ok()`/`fail()` response helpers, `asyncHandler` pattern, Angular signals + `inject()`, Coros auth headers and token-expiry retry codes (1019/1030), YYYYMMDD integer date convention, and security rules from the audit.

## 2026-03-05 — Training Schedule Types Added
Added `CorosScheduleQueryResponse`, `CorosScheduleData`, `ScheduleEntity`, `ScheduleProgram`, `ScheduleExercise`, `ScheduleExerciseBarChartItem`, `ScheduleSportData`, `ScheduleSubPlan`, `WeekStage`, `WeekStageTrainSum` to `apps/backend/src/types/coros.ts`. Endpoint: GET `/training/schedule/query?startDate=YYYYMMDD&endDate=YYYYMMDD&supportRestExercise=1`. `entities` are the per-day scheduled workouts; `programs` are the full structured definitions keyed by `idInPlan`.

## 2026-03-05 — Security Audit Completed
Full security audit run against the monorepo. Key findings: no API authentication on any route (C-1), Postgres port exposed to host (C-2), internal errors leaked to client (H-1), prompt injection via `goal` field (H-2), backend port bypasses nginx (H-3), no rate limiting on trigger endpoints (H-4), no security headers (H-5), `--accept-data-loss` in production startup (H-6). See `security/audit-2026-03-05.md` for full remediation details.

## 2026-04-15 — Agent Development Instructions
Redefined `AGENTS.md` as the primary instruction set for AI developers, consolidating coding conventions (ESM imports, signals, error handling) and project-specific patterns into a single authoritative guide.

