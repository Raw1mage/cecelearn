# A3 LLM API Rewrite Plan

This app currently runs fully in-browser and deterministically animates addition, subtraction, multiplication, and division. There is no LLM call yet; the only plausible AI need is to convert structured math steps into child-friendly narration or to generate follow-up practice items. The goal is to define a small, well-scoped API so that front-end calls stay stable while the LLM provider can be swapped between local GPU and cloud.

## What the service should do
- Inputs: operation (`add | sub | mul | div`), `num_a`, `num_b`, locale (e.g., `zh-Hant`), voice/tone (`encourage`, `neutral`), and optional structured steps (so the model explains exactly what was computed instead of free-form reasoning).
- Outputs: short narration (2–4 sentences) explaining the steps, bullet hints for each digit step, and a speakable string for TTS. Keep responses <120 tokens to ensure low latency.
- Constraints: deterministic, kid-safe tone, no extra operations beyond the provided inputs, and respond even when numbers are >4 digits (the UI already handles that).

## Proposed API contract
- **Endpoint:** `POST /api/llm/math-explain`
- **Request payload:**
  ```json
  {
    "operation": "add",
    "num_a": 345,
    "num_b": 78,
    "locale": "zh-Hant",
    "tone": "encourage",
    "ui_mode": "narrate",        // narrate | hint | qa
    "steps": [                   // optional structured context from the animator
      {"col": 0, "carry": 1, "a": 5, "b": 7, "sum": 12},
      {"col": 1, "carry": 0, "a": 4, "b": 8, "sum": 12}
    ]
  }
  ```
- **Response payload:**
  ```json
  {
    "narration": "先把個位數 5 加 7，得到 12，寫下 2 把 1 進位。接著十位數 4 加 8，再加進位的 1，得到 13，寫下 3 再進 1。最後百位數 3 加上進位的 1，得到 4，所以答案是 423。",
    "hints": [
      "個位先相加，不要忘記進位。",
      "十位要把進位加進來。",
      "最後寫下百位的結果。"
    ],
    "speakable": "345 加 78 的計算：5 加 7 得 12，寫 2 進 1；4 加 8 再加 1 得 13，寫 3 進 1；百位 3 加 1 得 4，答案 423。"
  }
  ```
- Prompting: keep a single system prompt that fixes persona and safety, e.g., “You are a patient primary-school math tutor. Use Traditional Chinese, concise sentences, and never change the numbers or the result. If structured `steps` are given, reflect exactly those steps.”
- Retry/backoff and latency budget: target <1.5s end-to-end; set `temperature` low (0.2–0.4) and `max_tokens` ~160. Cache identical requests by `(operation, num_a, num_b, locale, tone)` for instant repeats.

## Local GPU service options
- **vLLM (recommended):** run an OpenAI-compatible server so the front end can reuse an OpenAI client.
  - Models: `meta-llama/Meta-Llama-3-8B-Instruct` (~8–10 GB in FP16, ~6–7 GB in 4-bit), `Llama-3.1-8B-Instruct`, or `Qwen2.5-7B-Instruct` for stronger zh handling. On a 12–16 GB GPU, 4-bit quantized models have sub-second token latency.
  - Example command (after `pip install vllm` and having HF auth):  
    `python -m vllm.entrypoints.api_server --model meta-llama/Meta-Llama-3-8B-Instruct --dtype auto --max-model-len 2048 --port 8000`
  - The API exposes `POST /v1/chat/completions`, so the existing front end can call it with an OpenAI-style payload.
- **llama.cpp (CPU/GPU hybrid):** good for very small GPUs or offline use; run a Q4_0 quantized gguf of Llama-3 8B or Qwen2.5 7B. Latency is higher but still feasible for <150 tokens. Use `--api` flag to expose an OpenAI-compatible endpoint.
- **Guardrails:** enforce max numbers of digits in the request, clamp temperature, and reject prompts exceeding ~512 input tokens to prevent runaway generation.

## If cloud fallback is needed
- Use Gemini 1.5/Flash for latency, keeping the same request schema and mapping it to Google’s `generateContent` API. Keep the local service as default; switch only when an API key is configured.

## Next steps to wire this in
- Add a small client module in `A3_Math_4ops_learn/js` that posts the numbers and the front-end-generated step log to `/api/llm/math-explain`; surface narration/hints under the animation.
- Add config toggles for `llm_provider` (`local | gemini | off`), endpoint URL, and API key (if remote).
- Implement response caching on the server side and fail open (keep current deterministic animation) if the LLM call times out.
