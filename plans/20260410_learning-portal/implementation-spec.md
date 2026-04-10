# Learning Portal

## Goal
Build a deployable web product centered on a single `webapp` workspace that hosts a portal homepage plus three child learning features migrated from A1, A2, and A3. The product must be able to leave this repo later as a Docker-deliverable package, while the current repo keeps all build inputs under `BUILD/`.

## Product Direction
- Runtime target: one externally reachable web entrypoint
- Development structure: all web frontend/backend code lives under `webapp/`
- Build/deployment assembly: all Docker-related build assets live under `BUILD/`
- First external listen port target: `7014`
- Portal homepage is the first user-facing milestone

## Scope

### In
- Define target `webapp/` application structure for frontend and backend code
- Define `BUILD/` structure for Docker build context, compose files, env, and runtime assembly
- Refactor strategy for A1, A2, A3 into three child features under one portal
- Milestone breakdown from portal shell to feature migration
- Feature decomposition for A1, A2, and A3
- Routing, shared UI, shared services, and backend boundary planning
- Validation plan for structure, routing, runtime, and containerization readiness

### Out
- Immediate full rewrite of all A1/A2/A3 internals in this planning step
- Authentication, parent dashboard, reporting backend, and full AI orchestration implementation
- Production hardening beyond development-stage Docker packaging plan
- A4 integration in the first execution milestones

## Non-Goals
- Do not keep long-term product code split across repo root feature folders
- Do not leave provider API keys in frontend code
- Do not rely on silent fallback routing between standalone pages and portal routes

## Target Repository Layout

```text
webapp/
  frontend/
    src/
      app/
        portal/
        a1/
        a2/
        a3/
      components/
      layouts/
      services/
      styles/
      assets/
    public/
    package.json
  backend/
    src/
      modules/
        a1/
        a2/
        a3/
        portal/
      shared/
      config/
    package.json

BUILD/
  docker/
    frontend.Dockerfile
    backend.Dockerfile
    gateway.Dockerfile
  compose/
    docker-compose.yml
  env/
    frontend.env
    backend.env
    gateway.env
  gateway/
    nginx.conf
```

## Runtime Topology
- Browser -> exposed port `7014`
- Gateway/container entrypoint serves frontend static assets and proxies backend API
- Frontend provides portal shell and `/a1`, `/a2`, `/a3` routes
- Backend owns provider secrets, AI calls, and future persistence APIs
- `webapp/` is mounted or copied into container build flow from `BUILD/`

## Primary Architecture Decisions
1. Create a unified `webapp` workspace instead of adding more standalone apps at repo root.
2. Treat A1, A2, and A3 as child features under one portal, not as unrelated websites.
3. Move all provider-facing requests out of frontend code over time, especially A1 and A2 Gemini calls.
4. Use `BUILD/` as the single collection point for Docker build and local deployment assets.
5. Plan for one external port (`7014`) with explicit reverse-proxy or gateway behavior.

## Functional Decomposition

### Portal Shell
#### Responsibilities
- Landing page with three cards
- Global navigation and back-home path
- Shared theme/layout primitives
- Feature route registration
- Entry experience for children/parents

#### Subfunctions
- Page header and portal intro
- A1/A2/A3 feature cards
- Route mapping
- Shared error/empty/loading presentation
- Common metadata and favicon/app name

### A1 Child Feature: Chinese Word Lookup
#### Current capability to preserve
- Speech-based query input
- Character lookup and interpretation
- Bopomofo rendering
- Word list generation
- Hanzi stroke-order animation

#### Planned subfunctions
1. Input capture
   - microphone trigger
   - speech recognition lifecycle
   - manual query fallback input if intentionally designed later
2. Query interpretation
   - user utterance normalization
   - prompt construction
   - structured response parsing
3. Result rendering
   - main character display
   - bopomofo visualization
   - related words list
   - conversation/history log
4. Hanzi animation
   - writer initialization
   - replay control
   - responsive sizing
5. Backend boundary
   - frontend sends query request
   - backend/provider service resolves dictionary response
   - frontend receives typed response model

#### Refactor notes
- Separate speech state, query service, and rendering logic
- Remove direct provider call from browser code
- Keep HanziWriter as feature-local dependency behind an adapter

### A2 Child Feature: Chinese Idiom Practice
#### Current capability to preserve
- editable/default idiom bank
- random idiom selection
- AI-generated quiz creation
- multi-question answer flow
- scoring and review

#### Planned subfunctions
1. Setup screen
   - editable idiom source
   - question count
   - random-fill behavior
2. Quiz generation
   - request payload construction
   - backend/provider invocation
   - structured schema validation
3. Quiz runtime state machine
   - setup
   - loading
   - quiz-in-progress
   - submit-validation
   - result
   - review
   - retry
4. Question navigation
   - previous/next
   - selected answer state
   - progress display
5. Result and review
   - total score
   - wrong-answer review
   - retry from generated dataset
6. Backend boundary
   - move Gemini calls and retry logic backend-side where possible
   - frontend consumes typed quiz API

#### Refactor notes
- Extract the state machine before changing UI framework
- Keep quiz logic pure where possible
- Treat review and retry as explicit states, not ad-hoc flags

### A3 Child Feature: Math Four Operations Learn
#### Current capability to preserve
- numeric keypad input
- operator selection
- animated long-form calculation display
- pause/play/cancel controls
- speed control

#### Planned subfunctions
1. Input panel
   - active field tracking
   - keypad interactions
   - operator selection
2. Execution controller
   - validate operands/operator
   - start/cancel flow
   - pause/resume flow
3. Arithmetic engines
   - addition
   - subtraction
   - multiplication
   - division
4. Renderers
   - column arithmetic renderer
   - multiplication renderer
   - division grid renderer
5. Result panel
   - final answer
   - animated step history
   - validation errors

#### Refactor notes
- Split pure arithmetic progression logic from DOM rendering
- Keep animation timing in a controller layer
- Make renderers feature-local and swappable

## Shared Infrastructure Plan

### Frontend Shared
- App router
- page layout shell
- portal card component
- common button/panel styles
- error/loading states
- environment config loader
- typed API client
- feature registry for A1/A2/A3 cards and routes

### Backend Shared
- provider adapters
- request validation
- response schema validation
- env/config management
- health endpoint
- future persistence abstraction

### Build Shared
- Dockerfiles
- compose file
- gateway config
- env files
- startup documentation
- port ownership (`7014`)

## Migration Strategy

### Milestone 0 - Planning and skeleton definition
- finalize plan documents
- define target tree
- define route and backend boundaries
- define Docker assembly approach

### Milestone 1 - Portal shell and deployable skeleton
- create `webapp/frontend`
- create `webapp/backend` skeleton
- create `BUILD/` skeleton
- implement portal home with three cards
- add placeholder routes `/a1`, `/a2`, `/a3`
- prepare Docker/dev runtime listening on `7014`

### Milestone 2 - A3 migration first
- move A3 into `webapp` as first migrated child feature
- separate logic from rendering where needed
- validate route-level embedding in portal

### Milestone 3 - A2 migration
- migrate A2 UI flow into `webapp`
- preserve setup/quiz/result/review states
- move provider call behind backend endpoint

### Milestone 4 - A1 migration
- migrate A1 UI into `webapp`
- wrap speech recognition and HanziWriter dependencies
- move dictionary/provider call behind backend endpoint

### Milestone 5 - hardening and convergence
- remove old direct frontend provider usage
- align styles/navigation across all features
- verify Docker packaging flow can leave repo cleanly

## Route Plan
- `/` -> portal home
- `/a1` -> Chinese Word Lookup
- `/a2` -> Chinese Idiom Practice
- `/a3` -> Math Four Operations Learn
- `/api/health` -> backend health endpoint
- `/api/a1/*`, `/api/a2/*`, `/api/a3/*` -> feature APIs

## Data and Control Boundaries
- Frontend owns view state and user interaction
- Backend owns secrets, provider calls, schema enforcement, and future data persistence
- Gateway owns port exposure and static/API routing
- `BUILD/` owns container assembly, not product source code

## Risks
1. A1 and A2 currently call providers from browser code and must be re-bordered.
2. A1 speech recognition depends on browser support and needs graceful explicit capability handling.
3. A2 state transitions are currently spread across global flags and require state normalization.
4. A3 rendering and arithmetic logic are tightly coupled and need careful extraction.
5. Shared router adoption may surface asset path and script-loading issues during migration.

## Assumptions
- The unified web product will ultimately be extracted or packaged independently from this repo.
- `webapp` is the authoritative location for future web code.
- The old A1/A2/A3 folders remain temporary references during migration.
- Docker runtime may use bind mount in development and copy mode in release builds.

## Open Questions
- frontend framework choice inside `webapp/frontend` remains open, though React/TypeScript is still the default direction.
- gateway choice may be Nginx or equivalent reverse proxy.
- backend language/runtime may remain TypeScript-aligned with existing system-design direction.

## Validation Plan
- Verify plan covers portal shell, A1, A2, A3, backend, and Docker build assembly.
- Verify each feature has explicit preserved capability list and migration boundary.
- Verify `webapp` and `BUILD` responsibilities are separated clearly.
- Verify first executable milestone can produce a page with three cards on port `7014`.
- Verify architecture doc and event log are synchronized with this plan.
