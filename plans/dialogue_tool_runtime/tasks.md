# Tasks: dialogue_tool_runtime

## M0 — Architecture Contract

- [x] 0.1 Update `specs/architecture.md`: A1 becomes dialogue shell; A3 becomes inline arithmetic teaching tool; Portal removes A3 card; `/a3` remains debug route.
- [x] 0.2 Add architecture section for product-first dialogue capability seams: capability routing, model policy, tool engine, renderer registry, cost policy.
- [x] 0.3 Update `specs/a1_dialogue_tutor/spec.md`: add `solve_arithmetic` intent and inline arithmetic behavior.
- [x] 0.4 Add event log opening record with scope `dialogue_tool_runtime`.
- [x] 0.5 Explicitly defer OpenCMS runtime extraction; only preserve compatible seams during cecelearn product work.
- [x] 0.6 Define presentation surface seam: rich outputs default inline in stream, but renderers must be liftable into future floating/modal surfaces.
- [x] 0.7 Define restricted tutor agent loop: dialog stream + context policy + typed tool calls, without developer tools/subagents.
- [x] 0.8 Define accounts/model policy seam compatible with future `accounts.json` reuse for Codex/Claude/Gemini text routing, without implementing shared runtime yet.

## M0.5 — Context Engineering / Cost Policy

- [x] 0.5.1 Define bounded context window for chat model calls; do not send full conversation history by default.
- [x] 0.5.2 Define tool result summaries and surface references so child can refer to previous cards/images without resending full payloads.
- [x] 0.5.3 Define model policy table: cheap text classification, text explanation, image generation, deterministic arithmetic, browser/cloud TTS.
- [x] 0.5.4 Preserve fail-fast behavior for missing configured account/model; no silent fallback.

## M0.6 — OpenCMS Reuse Assessment / ModelRuntime Seam

- [x] 0.6.1 Classify OpenCMS reuse surfaces into: concept now, thin adapter later, shared runtime later, exclude.
- [x] 0.6.2 Define product-local `ModelRuntime` interface for text/image/status calls.
- [x] 0.6.3 Keep current Gemini provider local, but wrap future work so it can satisfy `ModelRuntime`.
- [x] 0.6.4 Document future `accounts.json` adapter requirements for Codex/Claude/Gemini text routing.
- [x] 0.6.5 Explicitly exclude OpenCMS developer tools, arbitrary MCP, full session compaction, and subagent loop.

## M1 — Backend Intent Contract

- [x] 1.1 Add `solve_arithmetic` to backend `A1Intent`.
- [x] 1.2 Add `A1ArithmeticPayload` and optional `arithmetic` to `A1ChatResponse` / `A1ChatMessage`.
- [x] 1.3 Update `geminiChatProvider` prompt, response schema, parsed reply, and pass-through response.
- [x] 1.4 Smoke test arithmetic questions via `/api/a1/chat`.

## M2 — Frontend Contract Mirror

- [x] 2.1 Mirror `solve_arithmetic` and `A1ArithmeticPayload` in `shared/api/client.ts`.
- [x] 2.2 Ensure `useConversation` attaches arithmetic payload to tutor messages.
- [x] 2.3 Update TTS speech builder to read a short arithmetic intro, not every step.

## M3 — Extract A3 Renderer

- [x] 3.1 Extract vertical row / carry row / playback logic from `A3Page.tsx` into `features/a3/components/ArithmeticCard.tsx`.
- [x] 3.2 Refactor `A3Page.tsx` to use `ArithmeticCard` after keypad calculation.
- [x] 3.3 Preserve existing A3 `/a3` behavior for debug parity.

## M4 — A1 Inline Tool Rendering

- [x] 4.1 Add arithmetic branch to A1 `ConversationView` rich content rendering.
- [x] 4.2 Render `<ArithmeticCard compact autoStart />` under tutor message.
- [x] 4.3 Add compact CSS so vertical math fits A1 stream without crowding.
- [x] 4.4 Keep `ArithmeticCard` placement-agnostic: accept compact/sizing props and avoid assumptions that it always lives inside the transcript.

## M4.5 — Presentation Surface Runtime (Design Seam Only)

- [x] 4.5.1 Define `TeachingSurface` UI type for stroke, illustration, arithmetic, word-card, and story surfaces.
- [x] 4.5.2 Keep MVP implementation inline-only; do not build full drag/resize/floating window manager yet.
- [x] 4.5.3 Add future affordance labels/actions where appropriate (`pin`, `replay`, `download`) without blocking arithmetic MVP.

## M5 — Portal Simplification

- [x] 5.1 Remove A3 from Portal card list.
- [x] 5.2 Keep `/a3` route mounted for debug/direct test.
- [x] 5.3 Add user-facing hint in A1 empty state or examples: 「你也可以問：3 乘 7 怎麼算？」

## M6 — Validation / Closeout

- [x] 6.1 Backend typecheck.
- [x] 6.2 Frontend typecheck.
- [x] 6.3 API smoke for `3 乘 7` and `24 除以 6`.
- [ ] 6.4 Browser smoke: A1 inline card, A3 debug route, Portal card removal.
- [ ] 6.5 Browser smoke: inline surfaces still scroll with history and remain replayable/downloadable where applicable.
- [x] 6.6 Update tasks/event log and decide whether to amend existing A1 spec state or create graduate-ready architecture spec.
