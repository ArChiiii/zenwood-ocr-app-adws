# Key Facts

Project-wide configuration, ports, URLs, fixtures — the things you look up constantly and should never have to guess.

---

## Runtime

- **FastAPI app entrypoint:** `ocr_agentic_engine.app:app`
- **Default port:** `8001`
- **Launch dev server:** `uv run uvicorn ocr_agentic_engine.app:app --port 8001 --reload`
- **Python version:** `>=3.11,<3.13` (PaddlePaddle 3.x supports 3.9–3.12; 3.11 is the safe sweet spot)

## External services

- **Ollama (remote dev):** `http://100.115.165.42:11434`
  - Models pulled (as of 2026-04-19): `qwen2.5vl:7b`, `llama3.1:8b`, `qwen3.5:4b`, `qwen3.5:35b`, `qwen3.5:latest`
  - Agent defaults (`agents/models.py::AGENT_MODELS`): classifier + handwriting_detector + extractor → `qwen2.5vl:7b`; comparator → `llama3.1:8b`
  - Override per-agent via `ENGINE_MODELS_JSON='{"classifier":"qwen3.5:4b"}'`

## Environment variables

- `SUPABASE_JWT_SECRET` — **required** for `/engine/*` routes (JWT HS256). Any dev string works locally.
- `OLLAMA_HOST` — default `http://localhost:11434`
- `ENGINE_TMP_ROOT` — default `/tmp/engine-tmp`
- `ENGINE_DOWNLOADS_ROOT` — default `/tmp/engine-downloads`
- `ENGINE_MODELS_JSON` — JSON dict overriding `AGENT_MODELS`
- `ENGINE_OCR_CACHE` — `1` (default) / `0`; sha256-keyed cache skips GPU OCR on repeat runs
- `ENGINE_OCR_CACHE_DIR` — default `ocr_agentic_engine/.ocr_cache`
- `ENGINE_DOWNLOAD_TTL_HOURS` — default `24`
- `ENGINE_CORS_ORIGINS` — comma-separated, default `http://localhost:3000`
- `ENGINE_USE_NATIVE_TOOLS` — `1` enables Ollama native tool-calling; else python-resolved context
- `ENGINE_AGENTIC_BUDGET_BLOCK` — max toolkit calls per fallback block (default `3`)
- `ENGINE_AGENTIC_BUDGET_DOC_PCT` — max % of blocks per doc entering fallback (default `20`)
- `ENGINE_AGENTIC_TIMEOUT_SEC` — per-agent wall clock (default `15`)
- `ENGINE_GATE_LOW_CONFIDENCE` — confidence threshold for `icr_corrector` gate (default `0.70`)
- `ENGINE_GATE_STAMP_CONFIDENCE` — threshold for `stamp_reader` gate (default `0.80`)
- `ENGINE_GATE_NESTED_BLOCK_COUNT` — table-cell count threshold for `nested_descender` (default `6`)

## Fixtures layout

    ocr_agentic_engine/tests/fixtures/
      scan_conversion/        small.pdf, Document1_UL.jpg, table1.png
      classification/         small.pdf, Invoice1.png, WalmartReceipt.png, dl1.png, Form1.png
      comparison/             a_small.pdf, b_small.pdf   (paired by sorted name)
      handwriting_removal/    small.pdf, IMG_6047.jpg, image_hw_clean.jpg
      <fixture>.golden.json   editable per-case golden — read by evals at score time
      <fixture>.annotated.png bboxes + numbers overlay, authored by `evals gold`

Demo source (not tracked in repo): `/home/archii/Documents/zenwood-demo-2/images/` — contains Invoice1, WalmartReceipt, Form1, dl1, Document1_UL, table1, IMG_6047, image_hw_clean, plus others.

## Eval outputs

- Reports land in `ocr_agentic_engine/.evals/<UTC-timestamp>/` (`report.jsonl` + `summary.md`)
- Reconstruction-specific reports prefixed `reconstruct-<UTC-timestamp>/`

## HTTP surface

- `POST /engine/{feature}` — `feature ∈ {scan_conversion, classification, comparison, handwriting_removal}`
- `?format=` ∈ `{pdf, docx, txt, html, xlsx, pptx}` (default `pdf`)
- `GET /engine/downloads/{run_id}/{filename}` — file delivery + background cleanup
- SSE event names: `run_started`, `stage_started`, `stage_finished`, `run_completed`, `run_failed`
- Stages emitted: `ocr`, `annotate`, `classifier`, `comparator`, `diff`, `handwriting_filter`, `formatter`

## GPU budget

- Single GPU (~12GB) fits ~6–8 PaddleOCR fixtures per process before OOM (see bugs.md).
- Workaround for bulk eval: `--fixture <name>` one at a time OR pre-downscale >2K-px JPEGs.

## What NOT to put here

- No secrets, tokens, or private keys (commit to `.env`, not source-controlled docs)
- No ephemeral run IDs, PR numbers, or in-flight ticket state (those go in `issues.md`)
