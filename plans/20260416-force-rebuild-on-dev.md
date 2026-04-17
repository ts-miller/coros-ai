# 20260416-force-rebuild-on-dev.md

## Context
The user wants `npm run dev` to rebuild Docker images instead of using cached ones to ensure changes are picked up immediately.

## Proposed Changes

### Root `package.json`
- Update the `dev` script from `docker compose up` to `docker compose up --build`.

## Verification Plan
1. Run `npm run dev` and verify that Docker Compose starts the build process for the services.