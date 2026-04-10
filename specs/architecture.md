# Architecture

## Overview
This repository is evolving from multiple standalone learning demos into a unified web product centered on a single `webapp` workspace. The future deployable unit is a Docker-packaged web system assembled from `webapp/` source code and `BUILD/` runtime/build assets.

## Current major directories
- `A1_Chinese_word_lookup/`: legacy standalone frontend for word lookup with speech input and Hanzi animation
- `A2_Chinese_idiom_practice/`: legacy standalone frontend for idiom quiz generation and review
- `A3_Math_4ops_learn/`: legacy standalone frontend for four-operations teaching and animation
- `A4_local_ai/`: local AI/backend exploration area
- `docs/`: requirements, design notes, and event records
- `plans/`: active dated implementation plans
- `specs/`: long-lived architecture source of truth

## Target authoritative product structure
```text
webapp/
  frontend/
  backend/
BUILD/
  docker/
  compose/
  env/
  gateway/
```

## Module boundaries

### webapp/frontend
Owns:
- portal homepage
- feature routes `/a1`, `/a2`, `/a3`
- shared UI/layout/navigation
- user interaction state
- typed requests to backend

Does not own:
- provider secrets
- direct production provider calls
- Docker assembly rules

### webapp/backend
Owns:
- feature API namespaces for A1/A2/A3
- provider adapters and schema validation
- env/config loading
- health endpoints
- future persistence and authentication expansion

Does not own:
- browser-only interaction logic
- static presentation concerns

### BUILD
Owns:
- Dockerfiles
- compose/runtime definitions
- gateway/reverse proxy config
- env/runtime assembly for container execution
- external port exposure (`7014`)

Does not own:
- product feature source code

## Feature map

### Portal
- single entrypoint for the web product
- exposes A1/A2/A3 cards
- hosts shared navigation and route registry

### A1 feature
- speech-driven Chinese word lookup
- character result rendering
- bopomofo display
- HanziWriter integration
- backend-backed lookup/generation boundary required during migration

### A2 feature
- idiom bank input and random selection
- quiz generation flow
- explicit quiz/result/review states
- backend-backed quiz generation boundary required during migration

### A3 feature
- four-operations teaching tool
- keypad-driven inputs
- arithmetic animation engine
- feature can migrate earlier because it has no provider-secret dependency

## Migration strategy
1. Build unified portal shell in `webapp/frontend`
2. Add `webapp/backend` skeleton and API namespaces
3. Assemble initial Docker runtime in `BUILD`
4. Migrate A3 first
5. Migrate A2 second
6. Migrate A1 third
7. Retire or archive legacy standalone folders after parity is confirmed

## Runtime flow
1. User reaches external port `7014`
2. Gateway serves frontend assets and proxies API traffic
3. Frontend routes user to portal, A1, A2, or A3
4. Backend handles health/config/provider-backed endpoints
5. Future persistence and reporting expand behind backend without changing frontend route ownership

## Key architecture rules
- `webapp/` is the long-term home for all web product code
- `BUILD/` is the long-term home for Docker assembly and runtime packaging assets
- legacy A1/A2/A3 folders are migration sources, not final authoritative product locations
- provider calls must move out of browser code for deployable product paths
- fail fast on unsupported capabilities instead of adding silent fallbacks
