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
- quiz viz is a deterministic SVG spec (`A1MathViz`), three kinds rendered by `MathDiagram`: `count`/`groups` (math, shown AFTER grading with equation) and `tally` (English image-dependent questions, shown BEFORE answering — the image IS the question, no equation/answer leaked). Image-dependent English KPs are the root-cause family for "no image shown / answer leaked in stem" bugs: they used to be `vizKind:"none"` → handed to Gemini text-only → no image channel at all, so Gemini either referenced a nonexistent image or wrote the answer into the stem. Fix = two deterministic template generators in `quizFramework`, both bypassing Gemini, both sourcing object emoji from a shared `NOUN_BANK` (all emoji-representable → no gen-image needed):
  - `genTallyItems` (KP `vizKind:"tally"` — `eng-g2-number`, `eng-g4-how-many`): picks noun+emoji, picks N (2–9), tiles N emoji via `viz.count`, pins answer to `NUMBER_WORDS[N]`. Correctness "圖裡畫 N 個 = 正確答案 N" machine-guaranteed.
  - `genNameItems` (KP `vizKind:"name"` — `eng-g3-this-is`, `eng-g4-what-is`, `eng-g3-i-like`): shows ONE object emoji (`viz` tally count=1), stem is the sentence pattern (This is a / What is it / I like), answer pinned to the noun's English singular, choices = answer + 2 distinct distractor nouns. Stem never contains the answer word (no self-answering leak). Image (emoji) and answer share one `NOUN_BANK` source → always consistent.
  - No model in either correctness loop. **Composite gen-image is now ACTIVE** (`QuizIconProvider` + `scripts/gen-quiz-icons.mjs`): instead of emoji, the unit object can be a real Imagen illustration. Correctness stays program-guaranteed because the generator only ever draws ONE object — the frontend `TallyDiagram` tiles it N times via `viz.count` (Imagen is never asked "how many"). Dual-track sourcing (user-approved per 天條 #11): (1) **build-time** `gen-quiz-icons.mjs` pre-generates one image per `NOUN_BANK` noun → `data/quiz-icons/<noun>.png` + `manifest.json` (gcloud-token Vertex Imagen path, same as `imagen.sh`); (2) **runtime** `QuizIconProvider.iconUrlFor` fills any noun missing from the manifest by calling the server's image provider once (in-flight deduped), writing the PNG to disk + updating the manifest. Generators stamp `viz.iconKey` (= noun); `quizGenProvider.enrichIcons` resolves it to `viz.iconUrl` (served by `GET /api/quiz/icon/<noun>`, noun whitelisted `^[a-z]+$` + `filePathFor` returns null for unknown → traversal-safe). When no image is available (no provider / gen failed), `iconUrl` is omitted and the frontend falls back to the deterministic emoji floor — this is the original native rendering, not a silent identity fallback. Image quantity is ALWAYS `viz.count`-tiled, never generator-counted.
- scene illustration via Nano Banana (`gemini-2.5-flash-image`), auto-triggered on illustratable turns (make_sentence / tell_story / draw)
- illustration provider is cost-tiered and config-driven (`IMAGE_PROVIDER` env): `apikey` (free AI Studio quota only), `vertex` (Vertex AI predict, bills GCP GenAI/Cloud credit via service-account auth), or `cascade` (DEFAULT in prod: try free apikey first → on retryable failure 429-cooldown / 502 / empty, fall through to Vertex paid tier). Cascade is an explicit, user-authorized, observable cost ladder (logged per hop), NOT a silent identity fallback — both tiers must be fully configured or `loadEnv` fail-fast throws. Same model (`gemini-2.5-flash-image`) on both tiers; only the billing path differs.
- Vertex tier auth: service-account key (`VERTEX_KEY_FILE`, kept outside repo) → `google-auth-library` GoogleAuth mints + caches/refreshes access tokens (solves 1h token expiry for long-running server). Providers: `GeminiImageProvider` (apikey), `VertexImageProvider` (Vertex), `CascadeImageProvider` (composes both)
- find_video intent (DD-24): "小雞老師找影片" — search layer goes through self-hosted **Invidious** (`InvidiousClient`, `/api/v1/search` region=TW), borrowing the same-host ytlite approach → **zero YouTube Data API quota**. Data API (`YoutubeVideoProvider.runQuery`, safeSearch=strict) is the fallback only when Invidious is unavailable. Playback is unchanged: real YouTube `videoId` rendered via IFrame inline player. Child safety = two gates: (1) curated channel library (`ChildChannelLibrary` active) always passes + stably sorts first; (2) non-curated channels filtered by Invidious channel-level `isFamilyFriendly` (YouTube familySafe microformat, 24h cache, parallel unique-channelId query) — unknown verdicts conservatively dropped (Invidious search has no safeSearch param). Source priority controlled by `INVIDIOUS_API_URL` env (default `http://localhost:1215` → same-host ytlite; empty string disables Invidious → Data API). **yt-dlp passive function (DD-32, supersedes DD-24/29/30/31)**: the search layer was migrated off Invidious (a "server-shaped" daemon needing 3 containers: connection pool / anti-scrape tokens / postgres) onto **`yt-dlp`** — a "function-shaped" passive binary (`YtDlpVideoProvider`, spawned per call via `execFile`, returns flat-playlist NDJSON metadata then exits). No daemon / docker / postgres / cross-service dependency. `search` uses `ytsearchN:<q>`. Playback unchanged (real YouTube `videoId` via IFrame). **Feed prewarm removed (DD-33)**: the `POST /api/a1/prewarm` endpoint + `channelLatestVideos` + `VideoBank` prewarm write-back were deleted — pouring a curated channel's *latest videos* into *every topic label that channel declares* was the root cause of "find-video topic chips return off-topic content" (a channel's label is its general coverage, not a per-video content guarantee; channels also drift, e.g. an idiom channel posting adult political poetry). The video bank now accumulates **only from real query searches**, so every banked video has actually matched that query. Child safety = two gates only: (1) curated channel whitelist (`ChildChannelLibrary` active) sorts first; (2) parent blocklist (`Blocklist`) hard-drops — yt-dlp has no `isFamilyFriendly` field, so the previous channel-level soft filter is gone (whitelist+blocklist deemed stronger for a kids app). Source priority controlled by `YTDLP_PATH` env (default `yt-dlp` on PATH; empty string disables yt-dlp → Data API fallback when `YOUTUBE_API_KEY` set). Backend startup runs a one-shot `yt-dlp --version` probe (`YtDlpVideoProvider.ping()`), logging OK or a WARN (never blocks boot); if yt-dlp is unavailable find_video fail-soft degrades to Data API or existing video bank, never crashes. Install: single binary to PATH (needs system python3); `-U` to update when YouTube changes. The earlier Invidious shared-layer (DD-31) was torn down; ytlite reverted to its own self-contained Invidious (ytlite still needs Invidious — it was not migrated).
- **GenBank — unified token-output accumulation layer (`providers/genbank.ts`, SQLite via `bun:sqlite`)**: every token-generated artifact is structured-stored for reuse in one DB (`data/genbank.sqlite`, WAL) across three tables sharing provenance columns (`source_model`, `prompt`, `created_at`, `reuse_count`): `gen_quiz` (subject/grade/kp_id, dedupe by stem), `gen_image` (kind=`quiz-icon`|`scene`, category_key, file_path — bytes stay on disk per DD-3, DB holds path only), `gen_video` (topic/video_id, dedupe). Runs under `bun run src/server.ts` (webctl.sh:66) so `bun:sqlite` is built-in (zero native dep); tsc sees a minimal ambient decl `src/types/bun-sqlite.d.ts`. fail-fast: DB open failure throws at startup (天條 #11), but per-request bank read failure degrades to the generate path (logged, functional). Three consumers:
  - **題庫 bank-first/rotation** (`quizGenProvider`): mechanical subjects draw from `gen_quiz` first when stock ≥ `BANK_FIRST_MIN` (30), rotation = `reuse_count ASC, RANDOM()`, drawn items `bumpQuizReuse`; below threshold it generates (deterministic tally/name = zero token, or Gemini) and writes back (dedupe by stem). Biggest token saver — repeat KPs stop re-billing Gemini.
  - **場景插畫快取** (`CachedIllustrationProvider` wraps the image provider on the a1 illustrate path): cache key = normalized targetWord (`mode:w:<word>`) or context hash (`mode:c:<sha16>`); hit reads file → dataURI (contract unchanged, frontend無感, zero token), miss generates → writes `data/scene-illust/<hash>.<ext>` + `gen_image(scene)`. Served via `GET /api/genbank/img/<id>`.
  - **影片庫** (`VideoBank` now delegates to `gen_video`, public API `size/get/accumulate/summary` unchanged): one-time import of legacy `data/videobank.json` → renamed `.imported` backup. Same DD-24 behavior (topic ≥ `BANK_SERVE_MIN` (5) serves with zero API call).
  - **統一後台**: `GET /api/genbank/summary` (per-table counts + video topics), `GET /api/genbank/list?type=quiz|image|video&category=&page=` (paged), `DELETE /api/genbank/:type/:id` (cleanup); frontend admin page at route `/admin` (`features/admin/AdminPage.tsx`). quiz-icon images also register into `gen_image` so the build-time icon library is visible in the same backend.
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
