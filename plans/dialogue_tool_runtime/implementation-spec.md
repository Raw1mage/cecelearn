# Implementation Spec: dialogue_tool_runtime

## Goal

把 cecelearn 從「多個功能卡片」演進成「對話家教 + 可調用教學工具」架構。第一個工具化目標是 A3 四則運算：A3 不再作為 Portal 首頁獨立卡片，而是融入 A1「小雞」對話串流中的 inline arithmetic tool。`/a3` route 暫時保留為 debug/直接測試入口。

更長期的目標不是只讓 A1 多一個 intent，而是形成一個統一的 dialogue capability layer：同一個對話界面可以依任務選擇不同 model、執行特定 teaching tool、再用適合該工具的 renderer 顯示文字、圖像、動畫或互動卡片。

## Why Now

A1 已從國字查詢升級為對話家教，並開始具備多種 rich content 顯示能力：問字、問詞、造句、故事、插畫、筆順。A3 若仍維持獨立卡片，會讓產品入口分裂；若直接塞進 A1 prompt，又會把 UI 工具調度與內容生成混在一起。

這個系統和 opencms 的相似點是「對話界面逐步擴展能力」；差異點是小家教需要更多元的 model/tool/renderer 協調：文字教學可能用低延遲模型、插畫用 image model、語音可用 browser TTS 或未來 cloud TTS、算術用 deterministic local engine。現在需要先建立「對話 → capability routing → model selection → typed tool payload → frontend renderer」的穩定架構，避免之後逐步長成一個沒有邊界的 opencms-like 系統。

## Sequencing Principle

The primary objective for this phase is **cecelearn as a complete child tutor product**, not OpenCMS runtime unification. Architecture work should serve the product and remain lightweight:

1. Build visible tutor capabilities first: word/phrase help, sentence/story, illustration, stroke, arithmetic, voice interaction.
2. Keep internal seams compatible with a future shared dialogue capability runtime: typed intents, explicit model policy, deterministic tool engines, renderer boundaries, cost gates.
3. Do not extract shared packages or copy OpenCMS substrate during this phase.
4. Record convergence points so future unification can happen with low rework, but avoid designing a generic platform before the child tutor is product-complete.

In short: **product-first implementation, architecture-aware seams**.

Important refinement: the child tutor should still be treated as a small, restricted **agent + tool + dialog stream** system. The non-goal is a developer agent platform, not agency itself. 小家教需要能根據對話上下文選擇工具、選擇模型、控制成本、管理顯示面，而不是每一輪都把全部歷史與全部功能塞進同一個 prompt。

## Architecture Thesis

### 1. A1 is the Dialogue Shell

A1 owns user-facing dialogue lifecycle:
- text/voice input
- conversation history
- TTS output
- echo guard
- inline rich content rendering

A1 does **not** own every domain tool's internal teaching logic. It owns tool placement and turn lifecycle.

### 2. Tools are Typed Teaching Modules

Each teaching tool has three layers:

1. **Intent contract**: backend structured output identifies which tool to call and validates payload shape.
2. **Tool engine**: deterministic domain logic, preferably local and side-effect free.
3. **Tool renderer**: frontend component that displays the tool state inside the conversation stream.

For A3:
- Intent: `solve_arithmetic`
- Payload: `{ a, b, operation, expression }`
- Engine: existing `buildVertical(a, b, operation)`
- Renderer: reusable `ArithmeticCard`

### 3. Capability Routing is Separate from Tool Rendering

Dialogue turns should pass through a capability routing layer before rendering. The layer answers:

- Which capability is requested? (`lookup`, `make_sentence`, `draw`, `solve_arithmetic`, ...)
- Which model/provider should perform language understanding or generation?
- Does this capability require a deterministic tool engine?
- Which renderer should display the result?

MVP can still implement this as static typed mappings inside the current provider/contracts, but the conceptual boundary must exist:

```text
User turn
  → Tutor agent loop
  → Context policy
  → Dialogue router (intent + capability)
  → Model policy (text / image / browser TTS / deterministic engine)
  → Tool call / typed payload
  → Renderer registry
  → Dialog stream surface
```

The tutor agent is deliberately small:
- It can route to typed teaching tools.
- It can choose model policy per capability.
- It can decide what context to send.
- It cannot call developer tools, shell, file, git, arbitrary MCP, or autonomous subagents.

### 4. Backend is a Router, not the Tool Runtime

For deterministic tools like arithmetic, backend Gemini should parse the child's natural language into a typed payload, not execute the visual teaching logic. The browser already owns the animation engine and can deterministically render it.

This keeps the boundary clear:
- LLM = language understanding + child-friendly reply
- Frontend tool engine = deterministic visual explanation
- Backend = provider proxy + schema validation

### 5. Tool Output is a Presentation Surface

A1 has converged on a stream-first model: stroke, illustration, sentences, story, and arithmetic should first appear inline under the tutor message that produced them. However, the product should treat each rich teaching output as a **presentation surface**, not merely as static transcript content.

Each surface starts as an inline stream card, but can later be promoted into a floating modal/window when the child needs to keep it visible while continuing the conversation. The same tool renderer should support both placements.

```text
Tutor message
  → Surface instance
  → inline card in stream
  → optional floating window
  → close / restore / resize / drag
```

This avoids reintroducing separate feature panels while preserving flexibility for visual tools that need more space, such as arithmetic animation, stroke writing, or generated illustrations.

Near-term default: inline stream first. Future-friendly seam: every renderer receives a `surfaceMode` and stable `surfaceId` so it can be lifted into a floating surface without rewriting domain logic.

### 6. Future Convergence with opencms-like Architecture

The shape is intentionally similar to opencms/toolcall systems, but simplified:

| opencms-like concept | cecelearn equivalent now | Non-goal now |
|---|---|---|
| conversation session | frontend in-memory messages | persistent multi-user session |
| tool call | typed intent payload | arbitrary external tools |
| tool result | inline rich component | server-side tool execution log |
| renderer registry | `ConversationView` switch / future registry | dynamic plugin marketplace |
| tool windowing | inline presentation surface | general desktop window manager |
| model orchestration | static model policy per capability | full multi-provider agent runtime |
| renderer | rich React components (cards/images/animation) | generic text-only transcript |

The near-term goal is a typed capability + renderer registry pattern, not a full agent platform. Long-term convergence should happen at the abstraction boundary (conversation/capability/tool/result), not by copying opencms runtime internals wholesale.

### 7. Context Engineering and Cost Control

The tutor needs explicit context engineering as soon as multiple tools and models exist. Cost reduction should not rely only on shorter prompts; it should route each subtask to the cheapest capable model and send only the minimum relevant context.

Context layers:

| Context layer | Purpose | Sent to model? |
|---|---|---|
| Recent dialog window | maintain turn continuity | yes, bounded |
| Child profile / level | adapt language difficulty | yes, compact summary |
| Tool result memory | remember generated words/images/arithmetic cards | usually summarized or referenced |
| Surface state | inline/floating/modal UI state | no, unless user refers to it |
| Cost counters | gate image/TTS/model use | no, runtime policy only |

Model policy should eventually support OpenCMS-style account/model reuse. Near-term cecelearn can continue using its existing provider adapters, but the seam should be compatible with an `accounts.json`-backed model runtime so text subtasks can use lower-cost or available accounts such as Codex/Claude-family text models where appropriate.

Constraints:
- Codex/Claude-style accounts are candidates for text reasoning / classification / explanation, not image generation.
- Image generation remains image-model-specific.
- Browser TTS remains zero-cost unless cloud TTS is explicitly selected.
- No silent fallback: if a configured model/account is unavailable, surface a typed capability error or ask for operator configuration.

### 8. OpenCMS Reuse Assessment

To satisfy the target capability set, cecelearn does **not** need to copy the full OpenCMS runtime. It needs a staged reuse path: borrow architecture now, add thin compatibility seams next, and only extract shared runtime after the tutor product proves the need.

| Need in 小家教 | OpenCMS source | Reuse level now | Why |
|---|---|---|---|
| account/model inventory for Codex/Claude/Gemini | `accounts.json`, account spec | **thin adapter later** | Useful for lowering text-model cost, but direct dependency before product maturity would add credential/coupling risk |
| provider/model dispatch | provider registry / `getSDK` concept | **concept now, adapter later** | Need model policy by capability; current Gemini providers can remain local until routing pressure is real |
| rotation/quota/rate-limit | `rotation3d`, rate-limit tracker, request monitor | **policy now, runtime later** | Need cost gates and fail-fast semantics immediately; full rotation machinery can wait |
| context engineering | session/context ideas | **reimplement small** | Tutor only needs bounded recent turns, tool summaries, child profile, and surface references; full session/compaction is too heavy |
| tool call loop | OpenCMS tool loop | **do not copy** | Tutor tools are typed teaching modules, not arbitrary developer tools |
| MCP/tool aggregation | MCP subsystem | **exclude** | Too broad and unsafe for child product unless a specific managed educational capability is selected later |
| gateway/app hosting | OpenCMS gateway | **optional only** | cecelearn is already its own app; gateway must not become required for local/product operation |
| observability | request monitor/events | **small local version now** | Need model/capability latency/error/cost-ish logs, not full OpenCMS event machinery |

Recommended staging:

1. **Stage A — Product-local runtime (now)**
   - Keep cecelearn providers local.
   - Add explicit `ModelPolicy` / `ContextPolicy` types.
   - Add typed tool calls and presentation surfaces.
   - Add local cost gates and fail-fast errors.

2. **Stage B — OpenCMS-compatible adapter seam**
   - Add `ModelRuntime` interface in cecelearn without importing OpenCMS code.
   - Implement current Gemini provider behind that interface.
   - Define how an `accounts.json`-backed runtime would satisfy the same interface.

3. **Stage C — Shared substrate extraction**
   - Only after text/image/arithmetic/voice flows are stable, audit whether to import or extract account/provider/rotation code.
   - Prefer a restricted package or filtered credential bundle over direct full OpenCMS dependency.

Minimal interface target:

```ts
type ModelRuntime = {
  runText(input: TextTask, policy: ModelPolicy, context: ContextBundle): Promise<TextResult>
  runImage(input: ImageTask, policy: ModelPolicy): Promise<ImageResult>
  getCapabilityStatus(policy: ModelPolicy): Promise<ModelStatus>
}
```

This interface is the bridge: cecelearn can remain product-local while preserving a clean path to an `accounts.json` / Codex / Claude / Gemini-backed runtime later.

## Unified Dialogue Architecture Direction

### Capability Descriptor

Each dialogue capability should eventually be describable by a static descriptor:

```ts
type DialogueCapability = {
  intent: string
  modelPolicy: ModelPolicy
  contextPolicy: ContextPolicy
  payloadSchema: unknown
  renderer: string
  presentation?: PresentationPolicy
  costPolicy?: 'free' | 'metered' | 'manual-confirm'
}

type ModelPolicy = {
  kind: 'text-fast' | 'text-reasoning' | 'image' | 'browser-tts' | 'deterministic'
  preferredFamilies?: Array<'gemini-cli' | 'codex' | 'claude' | 'openai' | 'google-api'>
  maxCostTier?: 'free' | 'low' | 'medium' | 'high'
  fallback: 'fail-fast' | 'ask-operator'
}

type ContextPolicy = {
  recentTurns: number
  includeToolSummaries: boolean
  includeSurfaceReferences: boolean
  includeFullHistory: false
}

type PresentationPolicy = {
  defaultMode: 'inline' | 'floating'
  allowedModes: Array<'inline' | 'floating'>
  resizable?: boolean
  draggable?: boolean
  closeBehavior?: 'dismiss' | 'restore-inline'
}
```

Examples:

| Capability | Model Policy | Tool Engine | Renderer | Presentation | Cost Policy |
|---|---|---|---|---|---|
| lookup / make_words | `text-fast` | optional lookup payload | word cards + stroke | inline, promotable | free-ish text |
| make_sentence / story | `text-fast` | none | sentence/story cards | inline | free-ish text |
| draw | `image` | Gemini image | illustration viewer | inline, promotable, downloadable | metered + capped |
| solve_arithmetic | `deterministic` after text parse | `buildVertical` | arithmetic animation | inline, promotable, resizable | free |
| TTS | `browser-tts` now, cloud later | speech synthesis | audio output | non-visual | free now |

### What We Implement Now

This plan only implements the first concrete step:
- extend current static A1 intent contract with `solve_arithmetic`
- extract A3 renderer as reusable tool card
- keep rich tool renderers compatible with a future presentation surface runtime
- keep the shape compatible with future `DialogueCapability` registry

It does **not** introduce a full dynamic runtime yet.

## Scope

### In Scope

- Add `solve_arithmetic` intent to A1 chat contract.
- Parse natural language arithmetic questions into `{ a, b, operation }`.
- Extract A3 visualizer into reusable frontend component.
- Render arithmetic visualizer inline inside A1 conversation stream.
- Define the UI seam for promotable teaching surfaces: inline by default, optionally floating/resizable/draggable later.
- Remove A3 card from Portal homepage.
- Keep `/a3` route for debug, backed by the same reusable component.
- Define the initial static architecture vocabulary for capability/model/renderer separation.
- Update architecture/spec/tasks docs.

### Out of Scope

- Persistent conversation/tool history.
- General arbitrary tool plugin framework or dynamic model router.
- Full draggable/resizable window manager implementation in this arithmetic MVP.
- Extracting or depending on OpenCMS account/provider/rotation runtime in this phase.
- Building a standalone mini-system generator in this phase.
- Decimal/fraction/negative arithmetic unless already supported by A3 engine.
- Rewriting A3 engine.
- Removing `/a3` route entirely.

## Product Behavior

### Scenario: Multiplication Question

GIVEN 小朋友在 A1 對話中問「3 乘 7 怎麼算」
WHEN backend classifies the turn
THEN response intent is `solve_arithmetic`
AND payload is `{ a: 3, b: 7, operation: "*", expression: "3 × 7" }`
AND A1 stream renders an inline arithmetic card
AND the card plays the same vertical math animation as A3.

### Scenario: Debug Route Still Works

GIVEN developer opens `/a3`
WHEN entering operands manually
THEN the same `ArithmeticCard` renderer is used
AND behavior remains equivalent to the current A3 page.

### Scenario: Portal Simplification

GIVEN user opens Portal
THEN A3 is no longer shown as an independent learning card
AND arithmetic is discoverable through A1 conversation.

## Data Contract

```ts
type A1Intent =
  | 'lookup'
  | 'make_words'
  | 'make_sentence'
  | 'tell_story'
  | 'draw'
  | 'solve_arithmetic'
  | 'chat'
  | 'unclear'

type A1ArithmeticPayload = {
  a: number
  b: number
  operation: '+' | '-' | '*' | '/'
  expression: string
}
```

`A1ChatResponse` gains optional `arithmetic?: A1ArithmeticPayload`.

## Frontend Design

### Extract Renderer

Current `A3Page.tsx` mixes:
- keypad state
- animation state
- vertical row rendering
- playback controls
- note log

Plan:
- `features/a3/components/ArithmeticCard.tsx`
  - props: `{ a, b, operation, autoStart?, compact? }`
  - internally calls `buildVertical`
  - owns playback/pause/replay state
  - renders vertical math + note log
- `A3Page.tsx`
  - retains keypad/debug input
  - when calculated, renders `ArithmeticCard`
- `A1 ConversationView`
  - if message has `arithmetic`, renders `<ArithmeticCard compact autoStart />`

### Stream Placement

Arithmetic card appears under the tutor reply, same as `StrokeBox` and `MessageIllustration`. It remains in history and can be replayed.

### Presentation Surface Runtime (Planned Seam)

All rich teaching modules should be rendered through a light presentation surface abstraction, even before floating windows are implemented:

```ts
type TeachingSurface = {
  id: string
  messageId: string
  capability: 'stroke' | 'illustration' | 'arithmetic' | 'word-card' | 'story'
  mode: 'inline' | 'floating'
  title: string
  payload: unknown
  layout?: {
    x?: number
    y?: number
    width?: number
    height?: number
  }
}
```

MVP implementation can keep the state implicit in message payloads and render inline only. The important constraint is that renderer components (`StrokeBox`, `MessageIllustration`, `ArithmeticCard`) must not assume they are permanently embedded in the transcript. They should accept sizing/compactness props and be movable into a future `FloatingSurfaceHost`.

Future interactions:
- **Pin / float**: promote an inline surface into a fixed floating window.
- **Restore**: close floating window and keep the original inline history card.
- **Resize / drag**: only for visual/interactive surfaces, not simple text cards.
- **Download**: available for image surfaces.
- **Replay**: available for stroke and arithmetic surfaces.

## Backend Design

`GeminiChatProvider` updates:
- prompt adds `solve_arithmetic` intent examples
- response schema adds `arithmetic` object
- `ParsedReply` and response pass through arithmetic payload

No new backend route required for arithmetic because the deterministic tool execution happens in frontend.

### Model Policy Note

For this MVP, model selection remains static:
- `GeminiChatProvider` handles language understanding and text response.
- `GeminiImageProvider` remains the image capability provider.
- Arithmetic execution remains frontend deterministic.

The implementation should avoid hard-coding assumptions that every future tool uses the chat model for both reasoning and execution.

## Risks

- **Intent confusion**: Chinese wording like「二三得六」or「三個七是多少」may need prompt examples.
- **Payload safety**: LLM may emit invalid operation or huge operands. Frontend must validate before rendering; backend schema narrows operation enum.
- **A3 extraction regression**: existing A3 page could break during extraction. Keep `/a3` route as debug parity check.
- **Architecture creep**: avoid building a general plugin system now. Implement a minimal static tool registry pattern only if switch logic grows.
- **Premature unification**: copying opencms runtime patterns too early could overfit to agent workflows rather than child-facing education. Keep unified concepts, not shared machinery, until multiple capabilities prove the need.

## Validation Plan

- Backend typecheck.
- Frontend typecheck.
- API smoke:
  - 「3 乘 7 怎麼算」→ `intent=solve_arithmetic`, `operation=*`, `a=3`, `b=7`.
  - 「24 除以 6」→ `operation=/`.
- UI smoke:
  - A1 inline arithmetic card renders and can replay.
  - A3 `/a3` debug route still works.
  - Portal no longer shows A3 card.

## Stop Gates

- If extraction requires large rewrite of A3 engine, stop and replan.
- If LLM arithmetic parsing is unreliable for basic expressions, add deterministic frontend/backend parser before relying on LLM.
- If inline card harms A1 stream usability on mobile, re-evaluate compact/fullscreen sheet.
