# ocr-agentic-engine

Standalone OCR + LLM document reconstruction engine. Implements the L1/L2/L3
architecture from `docs/architecture-ocr-llm-reconstruction.md`:

- **L1 — Geometry** (PaddleOCR, deterministic): `DocumentRepresentation`
- **L2 — Semantics** (LLM annotators, index-only): `Annotations`
- **L3 — Renderers** (deterministic Python, per format): PDF-fidelity, DOCX
  reflow, TXT flat, HTML reflow, XLSX, PPTX

LLMs never regenerate text at the format boundary. Renderers consume
`(L1 geometry, L2 annotations)` only.

## Quick start

    uv sync
    uv run uvicorn ocr_agentic_engine.app:app --port 8001 --reload

Tests (unit + router, default):

    uv run pytest

End-to-end (requires live Ollama + pulled models):

    uv run pytest -m e2e

Eval harness:

    uv run python -m ocr_agentic_engine.evals run --feature scan_conversion --format html

## Env vars

- `SUPABASE_JWT_SECRET` — required for auth
- `OLLAMA_HOST` — default `http://localhost:11434`
- `ENGINE_TMP_ROOT` — default `/tmp/engine-tmp`
- `ENGINE_DOWNLOADS_ROOT` — default `/tmp/engine-downloads`
- `ENGINE_MODELS_JSON` — JSON dict overriding `AGENT_MODELS`
- `ENGINE_OCR_CACHE` — `1` (default) / `0` to disable
- `ENGINE_OCR_CACHE_DIR` — default `ocr_agentic_engine/.ocr_cache`
- `ENGINE_DOWNLOAD_TTL_HOURS` — default `24`
- `ENGINE_CORS_ORIGINS` — comma-separated, default `http://localhost:3000`
- `ENGINE_USE_NATIVE_TOOLS` — `1` to enable Ollama native tool-calling (else python-resolved context)
- `ENGINE_AGENTIC_BUDGET_BLOCK` — max toolkit calls per fallback block (default `3`)
- `ENGINE_AGENTIC_BUDGET_DOC_PCT` — max % of blocks that may enter fallback (default `20`)
- `ENGINE_AGENTIC_TIMEOUT_SEC` — per-agent fallback timeout (default `15`)
