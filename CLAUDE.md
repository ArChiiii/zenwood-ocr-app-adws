# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Dependency install: `uv sync` (uses a custom index for `paddlepaddle-gpu` on Linux — see `pyproject.toml`).

Run the service: `uv run uvicorn ocr_agentic_engine.app:app --port 8001 --reload`

Tests:
- Default (unit + router, excludes `e2e`): `uv run pytest`
- Single test: `uv run pytest ocr_agentic_engine/tests/test_pipeline.py::test_name`
- End-to-end (requires live Ollama + pulled models `qwen2.5vl:7b`, `llama3.1:8b`, plus PaddleOCR): `uv run pytest -m e2e`
- The `addopts = "-m 'not e2e'"` in `pyproject.toml` means `e2e`-marked tests are opt-in.

Eval harness: `uv run python -m ocr_agentic_engine.evals run --feature <feature> --format <fmt>`

E2E benchmark over fixtures: `uv run python scripts/run_e2e_bench.py [--runs N] [--features ...] [--scan-format docx] [--keep-tmp]`. Outputs land in `.e2e-results/<UTC-timestamp>/`.

## Architecture — L1/L2/L3

The engine implements a strict three-layer pipeline (see `README.md` and `docs/architecture-ocr-llm-reconstruction.md`). **LLMs never regenerate text at the format boundary** — renderers consume `(L1 geometry, L2 annotations)` only.

- **L1 — Geometry** (`ocr_stage.py`, deterministic, PaddleOCR `PPStructureV3`): produces `DocumentRepresentation` (see `types.py`). Cached under `ENGINE_OCR_CACHE_DIR`.
- **L2 — Semantics** (`agents/annotators/`, LLM-driven, index-only): `HandwritingFilterAgent`, `ICRCorrectorAgent`, `HeadingClassifierAgent`, `ListDetectorAgent` emit `Annotations` that reference L1 blocks by index — they do **not** rewrite content at render time.
- **L3 — Renderers** (`renderers/`, deterministic Python, one per format): `pdf_fidelity`, `docx_reflow`, `txt_flat`, `html_reflow`, `xlsx_tabular`, `pptx_slide`. Registered in `renderers/__init__.py::REGISTRY`.

### Request flow

1. `app.py` lifespan constructs the shared `PPStructureV3` instance, Ollama client, and a `DownloadSweeper` (TTL from `ENGINE_DOWNLOAD_TTL_HOURS`).
2. `router.py` (`POST /engine/{feature}`) accepts `scan_conversion | classification | comparison | handwriting_removal`. `comparison` requires exactly 2 files; others require 1. Streams SSE via `StreamingResponse`.
3. `engine.py::Engine` builds `PipelineDeps` and calls the feature's pipeline in `pipeline.py`. `Engine` is constructed **per-request** — the shared Paddle/Ollama objects live on `app.state`.
4. Feature pipelines (`pipeline.run_scan_conversion`, etc.) are generators of SSE event strings produced by `pipeline.event(name, payload)`. The SSE protocol is intentionally stable — frontends depend on event names and payload shapes.
5. Renderer outputs land in `downloads_root/<run_id>/`, fetched via `GET /engine/downloads/{run_id}/{filename}` which deletes the run dir after response (BackgroundTask).

### Agents

- `agents/_base.py` — shared agent scaffolding; `agents/models.py` — `AGENT_MODELS` default map (overridable per-agent via `ENGINE_MODELS_JSON`, or per-request via `?model=` for non-`scan_conversion` features).
- `agents/_fallback.py` — agentic fallback path using `OCRToolkit` (`ocr_toolkit.py`) + `tools.py`. Two modes: native Ollama tool-calling (enabled via `ENGINE_USE_NATIVE_TOOLS=1`) or python-resolved context. Budgets enforced by `ENGINE_AGENTIC_BUDGET_BLOCK`, `ENGINE_AGENTIC_BUDGET_DOC_PCT`, `ENGINE_AGENTIC_TIMEOUT_SEC`.
- `agents/classifier.py`, `agents/comparator.py` — feature-specific top-level agents (classification, diff with `redlines`).

### Tests

`tests/conftest.py` + `tests/fake_client.py` provide a fake Ollama client so unit tests run without a live LLM. `tests/fixtures/` holds sample inputs grouped by feature (also consumed by `scripts/run_e2e_bench.py`).

## Conventions

- Types are centralised in `types.py` (Pydantic): `DocumentRepresentation`, `OCRBlock`, `Annotations`, `FormattedResult`, `EngineResult`, `Feature` literal.
- Errors in `errors.py` — raise `InputValidationError`, `FormatterError`, `EngineError` with a `stage` label; the router/engine surface them as SSE `error` events.
- SSE events: always use `pipeline.event(name, payload)` so JSON serialization (including `Path`, sets, Pydantic models) is consistent.
- Auth is JWT via `SUPABASE_JWT_SECRET` (`auth.py`). All `/engine/*` routes depend on `get_current_user`.

## Key env vars

Defined in `.env.example`. Commonly flipped during local work: `OLLAMA_HOST`, `ENGINE_USE_NATIVE_TOOLS`, `ENGINE_OCR_CACHE=0` (to bypass the Paddle cache), `ENGINE_MODELS_JSON` (override the agent→model mapping).

What you created will be reviewd by codex 