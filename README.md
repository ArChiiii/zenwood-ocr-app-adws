# ocr-agentic-engine

Standalone OCR + LLM document reconstruction engine. Implements the **L1/L2/L3**
architecture in `docs/architecture-ocr-llm-reconstruction.md`:

- **L1 — Geometry** (PaddleOCR `PPStructureV3`, deterministic) → `DocumentRepresentation`
- **L2 — Semantics** (LLM annotators, index-only) → `Annotations`
- **L3 — Renderers** (deterministic Python, per format) → bytes

> LLMs **never** regenerate text at the format boundary. Renderers consume
> `(L1 geometry, L2 annotations)` only. Any regenerated text lives in
> `Annotations.corrections[block_idx]` and is inspectable block-by-block.

See also `docs/architecture-ocr-llm-reconstruction.md` for the full spec and
`docs/architecture-ocr-llm-reconstruction-cto-review.md` for the design review.

---

## Quick start

    uv sync                                                 # installs (PaddleOCR-GPU via custom index)
    ./scripts/start_server.sh                               # or: uv run uvicorn ocr_agentic_engine.app:app --port 8001 --reload

Tests (unit + router, default — `e2e` marker is opt-in):

    uv run pytest                                           # excludes `-m e2e`
    uv run pytest -m e2e                                    # needs live Ollama + qwen2.5vl:7b, llama3.1:8b, PaddleOCR

Eval harness:

    uv run python -m ocr_agentic_engine.evals run --feature scan_conversion --format html

End-to-end benchmark over fixtures:

    uv run python scripts/run_e2e_bench.py [--runs N] [--features ...] [--scan-format docx]

---

## Project layout

    ocr_agentic_engine/
      app.py                FastAPI bootstrap + lifespan (Paddle + Ollama + sweeper)
      router.py             POST /engine/{feature}, GET /engine/downloads/{run_id}/{file}
      engine.py             Per-request Engine → PipelineDeps → feature pipeline
      pipeline.py           run_scan_conversion / run_classification / run_comparison / run_handwriting_removal
      ocr_stage.py          L1 — PaddleOCR PPStructureV3 → DocumentRepresentation (cached)
      ocr_toolkit.py        L1.5 — deterministic PaddleOCR adapter for agentic fallback
      gates.py              Trigger gates (confidence, kind, script) → which agent
      tools.py              Tool schemas surfaced to LLM fallback path
      agents/
        _base.py            LocalAgent scaffolding
        _fallback.py        Agentic fallback runner (budget / timeout enforced)
        models.py           AGENT_MODELS default map
        annotators/         L2 annotators: handwriting_filter, icr_corrector,
                            heading_classifier, list_detector
        classifier.py       Feature agent: document classification
        comparator.py       Feature agent: narrative diff
      renderers/            L3: pdf_fidelity, docx_reflow, txt_flat,
                            html_reflow, xlsx_tabular, pptx_slide (REGISTRY)
      evals/                Eval harness + metrics (pixel/text/table/structure diff)
      tests/                Unit + router tests, fake Ollama client, fixtures/
      types.py, errors.py, helpers.py, client.py, auth.py, sweep.py, gates.py
    scripts/
      start_server.sh       Dev server launcher
      run_e2e_bench.py      Fixture-driven E2E benchmark → .e2e-results/
    docs/                   Architecture spec + CTO review

---

## Data flow

    ┌─────────────┐   files    ┌──────────────┐   L1 cache   ┌───────────────┐
    │  HTTP POST  │──uploads──▶│   router.py  │──────────────▶│  ocr_stage.py │
    │ /engine/{f} │            │  (auth+form) │              │ PPStructureV3 │
    └─────────────┘            └──────┬───────┘              └──────┬────────┘
                                      │  engine.run(feature, files, options)
                                      ▼                             │  DocumentRepresentation
                               ┌──────────────┐                     │
                               │  engine.py   │  PipelineDeps ─────┘
                               │  (per-req)   │        │
                               └──────┬───────┘        │
                                      ▼                ▼
                               ┌─────────────────────────────────┐
                               │        pipeline.py              │
                               │  ┌──────────────────────────┐   │
                               │  │ L2 annotators (index-only)│  │
                               │  │  heading / list / hw /   │   │
                               │  │  icr_corrector (gated)   │   │
                               │  └───────────┬──────────────┘   │
                               │              ▼                  │
                               │    Annotations                  │
                               │              ▼                  │
                               │  ┌──────────────────────────┐   │
                               │  │ L3 renderer (deterministic)│ │
                               │  │  pdf/docx/txt/html/xlsx/pptx │
                               │  └───────────┬──────────────┘   │
                               └──────────────┼──────────────────┘
                                              │  bytes → downloads_root/<run_id>/output.<fmt>
                                              ▼
                               ┌─────────────────────────────────┐
                               │   SSE stream to client          │
                               │  stage_started / stage_finished │
                               │  / run_completed / error        │
                               └─────────────────────────────────┘

                    GET /engine/downloads/{run_id}/{filename}
                    → FileResponse; BackgroundTask rmtrees run_dir after send
                    (plus DownloadSweeper TTL sweep on ENGINE_DOWNLOAD_TTL_HOURS)

**Streaming protocol.** Every pipeline yields SSE events via
`pipeline.event(name, payload)` — names `stage_started`, `stage_finished`,
`run_completed`, `error`. Payload shapes are stable; frontends depend on them.

**Agentic fallback (L1.5).** `gates.py` decides per-block whether a block needs
`icr_corrector`, `handwriting_filter`, etc. When triggered, `agents/_fallback.py`
runs an LLM loop against `OCRToolkit` (native Ollama tool-calling if
`ENGINE_USE_NATIVE_TOOLS=1`, python-resolved otherwise). Bounded by
`ENGINE_AGENTIC_BUDGET_BLOCK` per block, `ENGINE_AGENTIC_BUDGET_DOC_PCT` per
doc, and `ENGINE_AGENTIC_TIMEOUT_SEC` per agent. Corrections are written into
`Annotations.corrections[idx]`; L1 is never mutated.

---

## Router — HTTP surface

Base: `/engine` (all routes require JWT via `SUPABASE_JWT_SECRET`, see `auth.py`).

### `POST /engine/{feature}` — run a pipeline

| part | type | notes |
|---|---|---|
| `feature` (path) | `scan_conversion \| classification \| comparison \| handwriting_removal` | `comparison` requires exactly 2 files, others exactly 1 |
| `files` (multipart) | `list[UploadFile]` | PDF / image inputs |
| `format` (query) | `pdf \| docx \| txt \| html \| xlsx \| pptx` | default `pdf`; resolved against `renderers.REGISTRY` |
| `model` (query) | `str?` | per-request override of agent model (ignored for `scan_conversion`; use `ENGINE_MODELS_JSON` for per-agent mapping) |

**Response:** `text/event-stream`. Events:

- `stage_started {stage}` — e.g. `annotate`, `handwriting_filter`, `classifier`, `diff`, `comparator`, `formatter`
- `stage_finished {stage, ...metrics}` — counts / sizes / mime type per stage
- `run_completed {result}` — full `EngineResult` (document + annotations + formatted URL + feature-specific fields)
- `error {stage, type, message}` — surfaced from `InputValidationError` / `FormatterError` / `EngineError`

Uploads are stashed under `ENGINE_TMP_ROOT/_uploads` and deleted after the
stream closes (success or failure).

### `GET /engine/downloads/{run_id}/{filename}` — fetch rendered output

Serves `downloads_root/<run_id>/<filename>` produced by the pipeline; the
run directory is removed by a `BackgroundTask` after the response completes,
and any orphaned directories are swept on the `ENGINE_DOWNLOAD_TTL_HOURS`
schedule by `DownloadSweeper`.

### `GET /health` — liveness

Returns `{"ok": true}`. No auth.

---

## Features

| feature | L2 annotators | L3 renderer | output |
|---|---|---|---|
| `scan_conversion` | `heading_classifier`, `list_detector`, `icr_corrector` (confidence-gated) | any of six | `output.<fmt>` |
| `classification` | `heading_classifier`, `list_detector`, `ClassifierAgent` | — | `classification` in result |
| `comparison` (2 docs) | base annotators ×2, `redlines` diff, `ComparatorAgent` narrative | — | `diff.html` + narrative |
| `handwriting_removal` | `handwriting_filter`, `heading_classifier`, `list_detector` | `pdf_fidelity` (redact) | `output.pdf` + `HandwritingReport` |

---

## Env vars

Defined in `.env.example`. Commonly flipped during local work:

| var | default | purpose |
|---|---|---|
| `SUPABASE_JWT_SECRET` | — | JWT auth (required) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |
| `ENGINE_TMP_ROOT` | `/tmp/engine-tmp` | upload stash + run scratch |
| `ENGINE_DOWNLOADS_ROOT` | `/tmp/engine-downloads` | rendered artefacts |
| `ENGINE_DOWNLOAD_TTL_HOURS` | `24` | sweeper TTL |
| `ENGINE_MODELS_JSON` | — | JSON dict overriding `AGENT_MODELS` |
| `ENGINE_OCR_CACHE` | `1` | set `0` to bypass Paddle L1 cache |
| `ENGINE_OCR_CACHE_DIR` | `ocr_agentic_engine/.ocr_cache` | L1 cache dir |
| `ENGINE_CORS_ORIGINS` | `http://localhost:3000` | comma-separated |
| `ENGINE_USE_NATIVE_TOOLS` | `0` | Ollama native tool-calling vs python-resolved |
| `ENGINE_AGENTIC_BUDGET_BLOCK` | `3` | max toolkit calls per fallback block |
| `ENGINE_AGENTIC_BUDGET_DOC_PCT` | `20` | max % of blocks that may enter fallback |
| `ENGINE_AGENTIC_TIMEOUT_SEC` | `15` | per-agent fallback timeout |

---

## Conventions

- Types are centralised in `types.py` (Pydantic): `DocumentRepresentation`,
  `OCRBlock`, `Annotations`, `FormattedResult`, `EngineResult`, `Feature` literal.
- Errors in `errors.py` carry a `stage` label; the router surfaces them as
  SSE `error` events.
- SSE events are emitted via `pipeline.event(name, payload)` — shared JSON
  serialisation covers `Path`, `set`, Pydantic models.
- `Engine` is constructed **per request**; `PPStructureV3` and the Ollama
  client live on `app.state` and are shared.
