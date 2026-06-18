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
- exposes primary learning cards; A3 is no longer a visible Portal card because arithmetic is taught through A1 dialogue
- hosts shared navigation and route registry

### A1 feature (dialogue tutor)
- evolved from single-shot word lookup into a conversational Chinese tutor ("小雞老師")
- full-duplex voice on desktop: continuous mic, no wake word; any final transcript becomes a turn (Android Chrome full-duplex is out of scope → Samsung manual path retained)
- echo soft-gate (DD-11): during TTS playback + 700ms tail, recognition results are discarded (Web Speech API does not guarantee AEC between SpeechSynthesis↔SpeechRecognition) — kills the self-feedback loop without pausing the mic. Trade-off: no barge-in while the tutor speaks.
- intent routing (lookup / make_words / make_sentence / tell_story / draw / solve_arithmetic / chat / unclear) via backend Gemini chat provider; `draw` = direct "draw me X" request → auto-illustrated; `solve_arithmetic` parses natural-language math into typed payload only
- single-column chat layout: input row on top + full-width conversation stream. No persistent left-column canvas — stroke animation (HanziWriter) and scene illustration both render INLINE per-message in the stream, appearing only when needed
- per-message illustration history: each tutor turn carries its own illustration state (keyed by message id), never overwritten; each image is downloadable and retained for review
- generalized result stream: word cards (bopomofo), multi-sentence make_sentence (count-configurable, max 5), story, direct draw, and arithmetic teaching surfaces; fused into a single conversation stream
- arithmetic execution is deterministic frontend tool logic (`ArithmeticCard` / A3 engine), rendered inline per tutor message and kept placement-compatible with future floating teaching surfaces
- scene illustration via Nano Banana (`gemini-2.5-flash-image`), auto-triggered on illustratable turns (make_sentence / tell_story / draw)
- illustration provider is cost-tiered and config-driven (`IMAGE_PROVIDER` env): `apikey` (free AI Studio quota only), `vertex` (Vertex AI predict, bills GCP GenAI/Cloud credit via service-account auth), or `cascade` (DEFAULT in prod: try free apikey first → on retryable failure 429-cooldown / 502 / empty, fall through to Vertex paid tier). Cascade is an explicit, user-authorized, observable cost ladder (logged per hop), NOT a silent identity fallback — both tiers must be fully configured or `loadEnv` fail-fast throws. Same model (`gemini-2.5-flash-image`) on both tiers; only the billing path differs.
- Vertex tier auth: service-account key (`VERTEX_KEY_FILE`, kept outside repo) → `google-auth-library` GoogleAuth mints + caches/refreshes access tokens (solves 1h token expiry for long-running server). Providers: `GeminiImageProvider` (apikey), `VertexImageProvider` (Vertex), `CascadeImageProvider` (composes both)
- TTS reads back reply + sentence/story content (zh-TW, toggleable)
- backend endpoints: `POST /api/a1/lookup`, `POST /api/a1/chat`, `POST /api/a1/illustrate`
- spec: `specs/a1_dialogue_tutor/`
- all provider calls go through backend (`GEMINI_API_KEYS` env), never the browser

### A2 feature
- idiom bank input and random selection
- quiz generation flow
- explicit quiz/result/review states
- backend-backed quiz generation boundary required during migration

### A3 feature
- four-operations teaching tool now exposed primarily as an A1 inline `solve_arithmetic` teaching surface
- `/a3` route remains mounted as a debug/direct-test route
- keypad-driven debug inputs reuse the same `ArithmeticCard` renderer as A1
- arithmetic animation engine remains deterministic frontend logic with no provider-secret dependency

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
