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

### Portal (retired)
- the card-grid portal (`PortalPage` + `FeatureCard`) is retired as of the a1_quiz_overlay feature; both files were removed
- `/` now mounts the A1 dialogue tutor directly — "小雞老師" is the single entrypoint for the web product (DD-7)
- A2 (idiom) and A5 (dictation) are reached from within the A1 conversation (intent or quick-chip → full-screen overlay), not from portal cards
- `/a2` `/a3` `/a5` remain mounted as debug/direct-test routes

### A1 feature (dialogue tutor)
- evolved from single-shot word lookup into a conversational Chinese tutor ("小雞老師")
- full-duplex voice on desktop: continuous mic, no wake word; any final transcript becomes a turn (Android Chrome full-duplex is out of scope → Samsung manual path retained)
- echo soft-gate (DD-11): during TTS playback + 700ms tail, recognition results are discarded (Web Speech API does not guarantee AEC between SpeechSynthesis↔SpeechRecognition) — kills the self-feedback loop without pausing the mic. Trade-off: no barge-in while the tutor speaks.
- intent routing (lookup / make_words / make_sentence / tell_story / draw / solve_arithmetic / start_dictation / start_idiom / chat / unclear) via backend Gemini chat provider; `draw` = direct "draw me X" request → auto-illustrated; `solve_arithmetic` parses natural-language math into typed payload only
- quiz overlay launch (a1_quiz_overlay feature): `start_dictation` / `start_idiom` intents — or the input-row quick-chips (dual trigger path, DD-3) — open A5 (dictation) / A2 (idiom) as a full-screen overlay mounted inside A1Page (DD-2/DD-4). A5Page/A2Page take optional `onClose`/`onComplete` props; route mode (`/a2` `/a5`) passes neither and keeps original behavior (R1). On completion, a `quizSummary` tutor message renders a score summary card back in the conversation stream (DD-6)
- mic mutual-exclusion (DD-5): while an overlay is open, A1 speech recognition is paused (`wantListening=false` + `recognition.abort()`) to avoid contention with A5's TTS, and resumed on close if it was previously listening. The core speech-recognition useEffect is untouched (DD-10) — the overlay effect only reuses its abort / start-listening refs
- single-column chat layout: input row on top + full-width conversation stream. No persistent left-column canvas — stroke animation (HanziWriter) and scene illustration both render INLINE per-message in the stream, appearing only when needed
- per-message illustration history: each tutor turn carries its own illustration state (keyed by message id), never overwritten; each image is downloadable and retained for review
- generalized result stream: word cards (bopomofo), multi-sentence make_sentence (count-configurable, max 5), story, direct draw, and arithmetic teaching surfaces; fused into a single conversation stream
- arithmetic execution is deterministic frontend tool logic (`ArithmeticCard` / A3 engine), rendered inline per tutor message and kept placement-compatible with future floating teaching surfaces
- scene illustration via Nano Banana (`gemini-2.5-flash-image`), auto-triggered on illustratable turns (make_sentence / tell_story / draw)
- illustration provider is cost-tiered and config-driven (`IMAGE_PROVIDER` env): `apikey` (free AI Studio quota only), `vertex` (Vertex AI predict, bills GCP GenAI/Cloud credit via service-account auth), or `cascade` (DEFAULT in prod: try free apikey first → on retryable failure 429-cooldown / 502 / empty, fall through to Vertex paid tier). Cascade is an explicit, user-authorized, observable cost ladder (logged per hop), NOT a silent identity fallback — both tiers must be fully configured or `loadEnv` fail-fast throws. Same model (`gemini-2.5-flash-image`) on both tiers; only the billing path differs.
- Vertex tier auth: service-account key (`VERTEX_KEY_FILE`, kept outside repo) → `google-auth-library` GoogleAuth mints + caches/refreshes access tokens (solves 1h token expiry for long-running server). Providers: `GeminiImageProvider` (apikey), `VertexImageProvider` (Vertex), `CascadeImageProvider` (composes both)
- find_video intent (DD-24): "小雞老師找影片" — search layer goes through self-hosted **Invidious** (`InvidiousClient`, `/api/v1/search` region=TW), borrowing the same-host ytlite approach → **zero YouTube Data API quota**. Data API (`YoutubeVideoProvider.runQuery`, safeSearch=strict) is the fallback only when Invidious is unavailable. Playback is unchanged: real YouTube `videoId` rendered via IFrame inline player. Child safety = two gates: (1) curated channel library (`ChildChannelLibrary` active) always passes + stably sorts first; (2) non-curated channels filtered by Invidious channel-level `isFamilyFriendly` (YouTube familySafe microformat, 24h cache, parallel unique-channelId query) — unknown verdicts conservatively dropped (Invidious search has no safeSearch param). Source priority controlled by `INVIDIOUS_API_URL` env (default `http://localhost:1215` → same-host ytlite; empty string disables Invidious → Data API). Honest dependency: find_video on a fresh topic relies on the same-host ytlite Invidious docker running; if down it degrades to Data API (if keyed) or the existing video bank, never crashes.
- video bank as local cache DB (DD-24): `VideoBank` (`data/videobank.json`) accumulates kid-safe results by topic — videoId-deduped, persisted; a topic with `>= BANK_SERVE_MIN` (5) videos serves directly from the bank with zero external API call (common topics progressively need no external request). New-topic search results are written back to the bank classified by topic. Summary endpoint exposed via `a1.videoBankSummary()`.
- TTS reads back reply + sentence/story content (zh-TW, toggleable)
- backend endpoints: `POST /api/a1/lookup`, `POST /api/a1/chat`, `POST /api/a1/illustrate`, `POST /api/a1/video` (find_video; Invidious-first + video-bank cache)
- spec: `specs/a1_dialogue_tutor/`
- all provider calls go through backend (`GEMINI_API_KEYS` env), never the browser

### A2 feature
- idiom bank input and random selection
- quiz generation flow
- explicit quiz/result/review states
- backend-backed quiz generation boundary required during migration
- A2Page takes optional `onClose`/`onComplete` props so A1 can mount it as a full-screen overlay (idiom quiz); `/a2` route mode passes neither and keeps original standalone behavior

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
3. Frontend mounts A1 ("小雞老師") at `/` as the single entrypoint; A2/A3/A5 reachable via in-conversation overlays or debug routes
4. Backend handles health/config/provider-backed endpoints
5. Future persistence and reporting expand behind backend without changing frontend route ownership

## Key architecture rules
- `webapp/` is the long-term home for all web product code
- `BUILD/` is the long-term home for Docker assembly and runtime packaging assets
- legacy A1/A2/A3 folders are migration sources, not final authoritative product locations
- provider calls must move out of browser code for deployable product paths
- fail fast on unsupported capabilities instead of adding silent fallbacks
