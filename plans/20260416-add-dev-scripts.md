# Plan: Add Dev Scripts

Add convenience scripts to the root `package.json` for starting and stopping the development environment.

## Proposed Changes

### Root `package.json`
- Add `dev`: `docker compose up -d`
- Add `dev:stop`: `docker compose down`

## Rationale
The user wants a quick way to start and stop the servers. Since the project uses Docker Compose (as seen in the root directory and mentioned in `MEMORY.md`), these commands are the most appropriate for "starting up the servers" in this context.
