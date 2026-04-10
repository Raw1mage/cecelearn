# Event - 2026-04-10 - Learning Portal

## Requirement
Create a complete plan for `learning portal`, then execute the full implementation path to unify A1, A2, and A3 inside one `webapp` product with Docker assembly under `BUILD/` and external entry port `7014`.

## Scope

### In
- complete planning package for portal + A1 + A2 + A3 migration
- shared `webapp/frontend` and `webapp/backend` foundations
- migrated A1, A2, and A3 feature routes inside unified frontend
- backend boundaries for A1 lookup and A2 quiz generation
- `BUILD/` Docker runtime skeleton and workflow documentation
- runtime validation through `7014`

### Out
- production provider integrations beyond local backend contracts
- A4 integration in this cycle
- parent dashboard / auth / persistence expansion beyond current skeleton

## Task List Summary
- complete planning artifacts and long-lived architecture baseline
- build unified portal shell and shared frontend/backend foundations
- migrate A3 into unified frontend
- migrate A2 behind backend quiz API boundary
- migrate A1 behind backend lookup API boundary while preserving speech input and HanziWriter
- finalize Docker/runtime convergence and validation

## Key Decisions
- adopt one unified `webapp` workspace for all web product code
- adopt `BUILD/` as the Docker/runtime assembly workspace
- use React + TypeScript + Vite for `webapp/frontend`
- use minimal Node + TypeScript for `webapp/backend`
- use Nginx gateway for the external entrypoint on `7014`
- keep local providers for A1/A2 backend contracts in this cycle, with explicit room for later AI/provider replacement
- keep legacy A1/A2/A3 folders as temporary historical references until archival/removal is scheduled

## Issues Found
- local host environment does not have `node`/`npm` installed directly, so validation relied on Docker builds
- frontend SPA routes initially returned `404` under containerized Nginx and required explicit `try_files` routing
- earlier delegated runs did not reliably materialize repo changes, so implementation was completed directly in the main session

## Implementation Progress
- created shared frontend shell: `webapp/frontend/src/shared/components/AppLayout.tsx`, `Button.tsx`, `Panel.tsx`
- created shared frontend config and typed API client: `webapp/frontend/src/shared/config/env.ts`, `webapp/frontend/src/shared/api/client.ts`
- migrated A3 into `webapp/frontend/src/features/a3/` with arithmetic engine and pause/resume/cancel flow
- migrated A2 into `webapp/frontend/src/features/a2/` with explicit setup/loading/quiz/result/review states and backend-backed quiz generation
- migrated A1 into `webapp/frontend/src/features/a1/` with speech recognition controller, bopomofo helpers, HanziWriter adapter, backend-backed lookup, and replay support
- created backend env/config loader, provider contracts, local providers, and A1/A2 modules under `webapp/backend/src/`
- documented build/release/bind-mount workflow in `BUILD/README.md`
- added frontend SPA-aware Nginx config in `BUILD/gateway/frontend.nginx.conf`

## Verification
- `docker build -f BUILD/docker/backend.Dockerfile .` passed
- `docker build -f BUILD/docker/frontend.Dockerfile .` passed
- `docker build -f BUILD/docker/gateway.Dockerfile .` passed
- `docker compose -f BUILD/compose/docker-compose.yml up -d --build` succeeded
- `curl -I http://127.0.0.1:7014/` returned `200 OK`
- `curl -I http://127.0.0.1:7014/a1` returned `200 OK`
- `curl -I http://127.0.0.1:7014/a2` returned `200 OK`
- `curl -I http://127.0.0.1:7014/a3` returned `200 OK`
- `curl http://127.0.0.1:7014/api/health` returned backend health JSON
- `curl -X POST http://127.0.0.1:7014/api/a1/lookup ...` returned structured lookup payload
- `curl -X POST http://127.0.0.1:7014/api/a2/quiz ...` returned structured quiz payload
- compose stack was brought down cleanly after validation

## Remaining
- optionally replace local A1/A2 backend providers with real LLM/dictionary providers later
- optionally archive or remove legacy standalone folders once the team is comfortable with the unified webapp as the new authority

## Architecture Sync
- Architecture Sync: Verified `specs/architecture.md` remains aligned with the implemented `webapp` + `BUILD` structure, shared frontend/backend boundaries, migrated A1/A2/A3 routes, and runtime flow through port `7014`; no additional architecture doc changes were required after full implementation.
