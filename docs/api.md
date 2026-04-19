# OCR Agentic Engine — HTTP API

FastAPI service exposing the L1/L2/L3 OCR pipeline. Base path: `/` (default port `8001`).

Run locally: `uv run uvicorn ocr_agentic_engine.app:app --port 8001 --reload`

## Authentication

All `/engine/*` routes require a Supabase-issued HS256 JWT.

- Header: `Authorization: Bearer <token>`
- Verified with `SUPABASE_JWT_SECRET`, audience `authenticated` (`auth.py:21`).
- Missing or invalid token → `401 Unauthorized`.

`/health` is unauthenticated.

---

## Endpoints

### `GET /health`

Liveness probe.

**Response** `200 OK`

```json
{ "ok": true }
```

---

### `POST /engine/{feature}`

Runs an OCR pipeline and streams progress as **Server-Sent Events**. Response
`Content-Type: text/event-stream`.

**Path params**

| Name    | Values                                                                    |
|---------|---------------------------------------------------------------------------|
| feature | `scan_conversion` \| `classification` \| `comparison` \| `handwriting_removal` |

**Query params**

| Name   | Default | Description                                                    |
|--------|---------|----------------------------------------------------------------|
| format | `pdf`   | Output renderer: `pdf`, `docx`, `txt`, `html`, `xlsx`, `pptx`. |
| model  | —       | Override the agent model for this feature (ignored for `scan_conversion`). |

**Body** `multipart/form-data` — one or more `files`:

- `comparison` → exactly **2** files.
- All other features → exactly **1** file.

**Errors**

| Status | Cause                                                          |
|--------|----------------------------------------------------------------|
| 400    | Unknown `format`, or wrong file count for the feature.         |
| 404    | Unknown `feature`.                                             |
| 401    | Missing/invalid JWT.                                           |

Errors that occur mid-stream are emitted as a `run_failed` SSE event, not an HTTP error.

#### SSE event protocol

Each event has an `event:` name and a JSON `data:` payload. The protocol is stable — frontends rely on these names and shapes.

| Event            | Payload                                                                           |
|------------------|-----------------------------------------------------------------------------------|
| `run_started`    | `{ "run_id": str, "feature": str }`                                               |
| `stage_started`  | `{ "stage": str, ... }`                                                           |
| `stage_finished` | `{ "stage": str, ... }` (stage-specific fields, e.g. `page_counts`, `mime_type`)  |
| `run_completed`  | `{ "result": EngineResult }`                                                      |
| `run_failed`     | `{ "stage": str, "error_type": str, "message": str }`                             |

Stages, in order, per feature:

- `scan_conversion` → `ocr` → `annotate` → `formatter`
- `classification` → `ocr` → `annotate` → `classifier`
- `comparison` → `ocr` → `annotate` → `diff` → `comparator` → `formatter`
- `handwriting_removal` → `ocr` → `handwriting_filter` → `formatter`

`error_type` on `run_failed` is one of: `OCRError`, `AgentOutputError`,
`ModelUnavailableError`, `ToolExecutionError`, `FormatterError`,
`InputValidationError`, `EngineError` (`errors.py`).

#### `EngineResult` shape

Defined by `types.py::EngineResult` (Pydantic, serialized with `mode="json"`):

```jsonc
{
  "feature": "scan_conversion",
  "document": {
    "file_id": "...",
    "source_path": "...",
    "page_count": 3,
    "blocks": [ /* OCRBlock[] — L1 geometry */ ],
    "page_images": [ /* PageImage[] */ ],
    "raw_text": "..."
  },
  "annotations": {
    "headings": { "<block_index>": <level> },
    "sections": [ { "start": 0, "end": 4, "title_index": 0 } ],
    "lists": { "<block_index>": <indent> },
    "corrections": { "<block_index>": "corrected text" },
    "handwritten": [ /* block indices */ ],
    "title": 0,
    "language": "en",
    "classification": null,
    "agentic": [ /* AgenticCorrection[] */ ]
  },
  "classification": null,       // populated for "classification"
  "comparison": null,           // populated for "comparison"
  "handwriting": null,          // populated for "handwriting_removal"
  "formatted": {
    "output_url": "/engine/downloads/<run_id>/output.pdf",
    "mime_type": "application/pdf",
    "bytes_size": 123456
  }
}
```

Feature-specific extras:

- **classification** — `classification: { category, confidence, rationale }`. `category` ∈ `invoice | receipt | contract | id_document | form | letter | report | handwritten_note | other`. No `formatted` artifact.
- **comparison** — `comparison: { summary, additions[], deletions[], modifications[], diff_html }`. `formatted` serves `diff.html`.
- **handwriting_removal** — `handwriting: { has_handwriting, affected_pages[], affected_blocks[], rationale }`. `formatted` is a redacted PDF.

See `types.py` for the full Pydantic models (`OCRBlock`, `Cell`, `PageImage`, `DocumentRepresentation`, `Annotations`, `AgenticCorrection`, `Classification`, `Comparison`, `HandwritingReport`, `FormattedResult`).

---

### `GET /engine/downloads/{run_id}/{filename}`

Fetches a rendered artifact produced by a prior run (URL from `formatted.output_url`).

**Response** — the file bytes with appropriate `Content-Type`.

**Side effect** — the enclosing `run_id` directory is deleted after the response
is sent (background task in `router.py:78`). Each artifact is therefore
downloadable **once**.

Idle run directories are also swept on a TTL (`ENGINE_DOWNLOAD_TTL_HOURS`, default `24h`) by `DownloadSweeper`.

**Errors**

| Status | Cause                                      |
|--------|--------------------------------------------|
| 404    | `run_id` or `filename` does not exist.     |
| 401    | Missing/invalid JWT.                       |

---

## Example

```bash
TOKEN="<supabase jwt>"

# Kick off scan conversion, stream SSE, render to DOCX.
curl -N -H "Authorization: Bearer $TOKEN" \
     -F "files=@invoice.pdf" \
     "http://localhost:8001/engine/scan_conversion?format=docx"

# From run_completed → result.formatted.output_url:
curl -H "Authorization: Bearer $TOKEN" \
     -o output.docx \
     "http://localhost:8001/engine/downloads/<run_id>/output.docx"
```

---

## CORS

Origins are controlled by `ENGINE_CORS_ORIGINS` (comma-separated; default
`http://localhost:3000`). Credentials, all methods, and all headers allowed
(`app.py:42`).

## Relevant environment variables

| Var                         | Purpose                                                       |
|-----------------------------|---------------------------------------------------------------|
| `SUPABASE_JWT_SECRET`       | Required. HS256 secret for JWT verification.                  |
| `OLLAMA_HOST`               | Ollama endpoint (default `http://localhost:11434`).           |
| `ENGINE_MODELS_JSON`        | JSON override for the agent→model map (`agents/models.py`).   |
| `ENGINE_TMP_ROOT`           | Scratch dir for uploads/OCR crops (default `/tmp/engine-tmp`).|
| `ENGINE_DOWNLOADS_ROOT`     | Root for rendered artifacts (default `/tmp/engine-downloads`).|
| `ENGINE_DOWNLOAD_TTL_HOURS` | Sweeper TTL for `downloads_root` (default `24`).              |
| `ENGINE_OCR_CACHE`          | `0` to bypass the PaddleOCR cache.                            |
| `ENGINE_OCR_CACHE_DIR`      | Where L1 OCR results are memoized.                            |
| `ENGINE_CORS_ORIGINS`       | Comma-separated origin allowlist.                             |
| `ENGINE_USE_NATIVE_TOOLS`   | `1` to enable Ollama native tool-calling in the agentic fallback. |
| `ENGINE_AGENTIC_BUDGET_BLOCK`, `ENGINE_AGENTIC_BUDGET_DOC_PCT`, `ENGINE_AGENTIC_TIMEOUT_SEC` | Caps for the agentic fallback path. |
