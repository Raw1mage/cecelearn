# Tasks - Learning Portal

## Milestone 0 - Planning and architecture baseline
- [x] Define `webapp/` as the future home of all web frontend/backend code
- [x] Define `BUILD/` as the Docker assembly workspace
- [x] Define external runtime port target as `7014`
- [x] Document portal + A1 + A2 + A3 target architecture
- [x] Document migration order and feature boundaries
- [x] Sync event log and architecture baseline

## Milestone 1 - Portal shell and deployable skeleton
- [x] Create `webapp/frontend/` project skeleton
- [x] Create `webapp/backend/` project skeleton
- [x] Create `BUILD/docker/`, `BUILD/compose/`, `BUILD/env/`, and gateway config skeleton
- [x] Define frontend app shell, router, and route registration
- [x] Implement portal home page layout container
- [x] Add A1 feature card with title, description, and route target
- [x] Add A2 feature card with title, description, and route target
- [x] Add A3 feature card with title, description, and route target
- [x] Implement responsive three-card styling
- [x] Add placeholder child routes for `/a1`, `/a2`, and `/a3`
- [x] Add backend health endpoint and route namespace skeleton
- [x] Add local Docker/dev runtime exposing port `7014`
- [x] Validate portal render and route navigation

## Milestone 2 - Shared foundations
- [x] Create shared layout, header, and navigation primitives
- [x] Create shared card/button/panel UI primitives
- [x] Create shared frontend config loader
- [x] Create shared typed API client
- [x] Define shared backend config/env loader
- [x] Define provider adapter interfaces and response contracts

## Milestone 3 - A3 migration into webapp
- [x] Extract A3 input controller responsibilities
- [x] Extract A3 arithmetic engines from DOM-heavy flow
- [x] Extract A3 animation controller
- [x] Port A3 renderers into `webapp/frontend/src/features/a3/`
- [x] Wire A3 route into portal shell
- [x] Validate addition, subtraction, multiplication, and division flows
- [x] Validate pause/resume/cancel/speed behavior after migration

## Milestone 4 - A2 migration into webapp
- [x] Model A2 explicit runtime states: setup, loading, quiz, submit-check, result, review, retry
- [x] Extract A2 idiom source parsing and random selection utilities
- [x] Extract A2 quiz data contracts and validation
- [x] Port A2 setup screen into `webapp/frontend/src/features/a2/`
- [x] Port A2 quiz screen into `webapp/frontend/src/features/a2/`
- [x] Port A2 result/review screens into `webapp/frontend/src/features/a2/`
- [x] Create backend endpoint for quiz generation
- [x] Remove direct frontend provider call from migrated A2 path
- [x] Validate end-to-end quiz generation and scoring flow

## Milestone 5 - A1 migration into webapp
- [x] Extract A1 speech recognition controller
- [x] Extract A1 query parsing and response-mapping service
- [x] Extract A1 bopomofo rendering helpers
- [x] Wrap HanziWriter behind a feature-local adapter
- [x] Port A1 main result screen into `webapp/frontend/src/features/a1/`
- [x] Port A1 conversation log into `webapp/frontend/src/features/a1/`
- [x] Create backend endpoint for dictionary/query generation
- [x] Remove direct frontend provider call from migrated A1 path
- [x] Validate speech-trigger, lookup, result display, and replay flow

## Milestone 6 - Docker convergence and cleanup
- [x] Add frontend Dockerfile under `BUILD/docker/`
- [x] Add backend Dockerfile under `BUILD/docker/`
- [x] Add gateway Dockerfile/config under `BUILD/docker/` and `BUILD/gateway/`
- [x] Add compose file under `BUILD/compose/`
- [x] Define bind-mount development flow for `webapp/`
- [x] Define copy/build release flow for extracted package
- [x] Validate container startup and external access on port `7014`
- [x] Document migration status of old A1/A2/A3 folders
- [x] Plan disposal or archival path for legacy standalone folders after migration
