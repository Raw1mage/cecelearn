# Decisions: dialogue_tool_runtime

## DD-1 — A1 is the dialogue shell

A1 is the single user-facing tutor entrypoint. Domain tools appear inside A1 conversation as typed rich content.

## DD-2 — A3 is no longer a Portal card

Portal removes A3 from the visible card list. `/a3` remains available as a debug route until the arithmetic renderer is stable inside A1.

## DD-3 — Arithmetic renders inline, not modal

Arithmetic visual explanation appears inline in the conversation stream, matching stroke and illustration behavior. This preserves history and supports review.

## DD-4 — Deterministic tool execution stays frontend-local

The backend LLM parses natural language into typed arithmetic payload. The actual vertical math animation uses the existing deterministic `buildVertical` engine in frontend.

## DD-5 — Static tool registry first

Do not build a dynamic plugin/tool framework yet. Implement a static typed mapping from `intent` to renderer. Revisit registry abstraction after at least three non-trivial tools share the same lifecycle.

## DD-6 — Capability/model/rendering are separate axes

小家教的對話引擎與 opencms 相似，但差異在於教育場景需要多模型與多媒體 renderer：文字、圖像、語音、動畫、互動卡片可能由不同 model policy 或 deterministic engine 提供。架構上要先分清 capability routing、model selection、tool execution、renderer placement，避免把所有能力都塞進單一 chat provider 或單一 React switch。

## DD-7 — Unify concepts before unifying runtime machinery

長期應該收斂到統一的 dialogue capability architecture，但現在不複製 opencms 的完整 agent runtime。先讓 cecelearn 的對話能力具備相同抽象邊界：conversation turn、capability、tool payload、renderer result、cost policy。等多個工具都穩定後，再評估是否抽成真正 registry/runtime。

## DD-8 — Reuse OpenCMS by staged adapter, not direct dependency

為了善用 `accounts.json` 與 Codex/Claude/Gemini 等帳號，小家教需要相容 OpenCMS 的 account/model/rotation 思維；但本階段不直接依賴 OpenCMS daemon、gateway、session runtime 或 full provider registry。先建立產品內的 `ModelRuntime` seam，讓現有 Gemini provider 與未來 `accounts.json` adapter 都能滿足同一介面。

## DD-9 — Copy policies before copying machinery

本階段應先搬 OpenCMS 的設計原則：fail-fast、no silent fallback、capability-scoped model policy、rate/cost awareness、bounded context。暫不搬 shell/file/git/MCP/subagent/compaction/repo context 等 machinery。真正抽共用 runtime 要等小家教具備文字、插畫、算術、語音、成本閘等能力後再做 audit。
