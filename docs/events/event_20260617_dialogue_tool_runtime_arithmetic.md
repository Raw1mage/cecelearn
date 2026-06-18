# Event: dialogue_tool_runtime arithmetic tool integration

Date: 2026-06-17

## Summary

Integrated A3 four-operations teaching as a typed `solve_arithmetic` tool inside the A1 小雞 dialogue stream.

## Decisions

- A1 remains the primary dialogue shell.
- A3 is removed from the visible Portal card list but `/a3` remains as a debug/direct-test route.
- Arithmetic parsing is handled by backend chat intent classification; arithmetic execution and animation remain deterministic frontend logic.
- `ArithmeticCard` is placement-compatible with the presentation surface direction: inline in MVP, liftable into future modal/floating surfaces.
- OpenCMS runtime is not imported; only typed intent/model/context/presentation seams are preserved.

## Validation

- Backend typecheck passed.
- Frontend typecheck/build passed.
- `/api/a1/chat` smoke tests passed for `3 乘 7 怎麼算` and `24 除以 6`.
- Browser smoke remains pending for A1 inline card, A3 debug route, and Portal card removal.
