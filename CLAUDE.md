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

## Frontend (local Next.js, remote backend)

The Next.js frontend in `frontend/` runs locally and talks to the `ocr_agentic_engine` over HTTP (URL in `frontend/.env.local::NEXT_PUBLIC_ENGINE_URL`). Backend is hosted remotely (typically a Tailscale-reachable host) — do **not** spawn it locally; PaddleOCR-GPU + Ollama models are required.

- Start: `/start-frontend` slash command (`.claude/commands/start-frontend.md`). It verifies engine `/health`, resolves port conflicts on 3000 interactively, and spawns inside a named tmux session.
- Tmux session name: `zenwood-ocr-frontend` (always — never run `npm run dev` in foreground or via `nohup`/`&`).
- Default port: `3000` (Next.js bound via `PORT` env). Fallbacks: 3001/3002/3003 if the user opts out of killing the holder.
- Tail logs: `tmux capture-pane -p -t zenwood-ocr-frontend` (add `| tail -50` for the last chunk; use `-S -200` to scroll back further).
- Attach interactively: `tmux attach -t zenwood-ocr-frontend` (detach with `Ctrl-b d`).
- Stop: `tmux kill-session -t zenwood-ocr-frontend`.
- CORS: the remote engine's `ENGINE_CORS_ORIGINS` must include the frontend origin. If a non-3000 port was chosen, the user must add `http://localhost:<port>` on the remote host.

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

## Project Memory System

This project maintains institutional knowledge in `docs/project_notes/` for consistency across sessions.

### Memory Files

- **bugs.md** — Bug log with dates, solutions, and prevention notes
- **decisions.md** — Architectural Decision Records (ADRs) with context and trade-offs
- **key_facts.md** — Project configuration, ports, URLs, env vars, fixtures layout, GPU budget
- **issues.md** — Work log with date, description, and follow-up backlog

### Memory-Aware Protocols

**Before proposing architectural changes:**
- Check `docs/project_notes/decisions.md` for existing ADRs (001 extraction, 002 L1/L2/L3 separation, 003 gates + budgets, 004 eval-first, 005 renderers, 006 monolith retirement).
- Verify the proposed approach doesn't conflict. If it does, acknowledge the ADR and explain why revisiting is warranted (and update the ADR entry with a revision date).

**When encountering errors or bugs:**
- Search `docs/project_notes/bugs.md` for similar issues first (PaddleOCR GPU OOM, HTML extractor CSS pollution, annotated-PNG discovery leak, CLI relative-path issues are all logged).
- Apply known solutions; add new entries when resolved.

**When looking up project configuration:**
- Check `docs/project_notes/key_facts.md` for ports, env vars, Ollama host, model defaults, GPU budget, fixture layout.

**When completing work:**
- Log completed work in `docs/project_notes/issues.md` with date + brief description.

**When user requests memory updates:**
- Update the appropriate file. Keep entries concise (1–3 lines per point), dated, and linked to files/ADRs.

### Style Guidelines for Memory Files

- Bullet lists over tables.
- Always include dates (YYYY-MM-DD).
- Reference code by path, not paraphrase.
- Never store secrets or ephemeral IDs in memory files.
 