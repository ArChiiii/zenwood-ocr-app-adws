# Architecture — OCR + LLM for Precise Document Reconstruction

> Status: Proposal. Not yet implemented.
>
> Goal: super-accurate document processing with faithful reconstruction across
> output formats (PDF, DOCX, TXT), leveraging PaddleOCR for geometry and LLM
> agents for bounded semantic annotation — never for content regeneration.

## Principles

1. **PaddleOCR is ground truth for geometry.** Bounding boxes, reading order,
   block kind, table cell grid, and raw text per block come from PP-StructureV3
   + PP-OCRv5. No LLM regenerates these values.
2. **LLMs only emit annotations that point at L1 blocks.** Indices, labels,
   levels — never new text. This eliminates hallucination risk at the format
   boundary.
3. **Renderers are deterministic Python, per output format.** They consume
   `(L1 geometry, L2 annotations)` and produce bytes. Strategies: fidelity
   (bboxes → PDF), reflow (semantics → DOCX / HTML), flat (reading order →
   TXT), tabular (tables → XLSX), slide (pages → PPTX). HTML is the preferred
   flexible output; PDF-fidelity is the preferred visual output.
4. **Features are compositions, not monoliths.** Each feature picks which L2
   annotators to run and which L3 renderer to call. Shared foundation.

## Three Layers

### L1 — Geometry (PaddleOCR, deterministic)

Output: `DocumentRepresentation`

- `page_images: list[PageImage]` — rendered page PNGs for downstream vision use
- `blocks: list[OCRBlock]`
  - `page: int`
  - `bbox: (x0, y0, x1, y1)` in page pixel space
  - `text: str` — recognised characters (raw OCR)
  - `kind: Literal["text","title","table","figure","formula","list","stamp","header","footer"]`
  - `confidence: float`
  - `reading_order: int` — PP-Structure's ordered index
  - `table_cells: list[Cell] | None` — only for `kind="table"`

No LLM involvement here. Runs on GPU (PaddleOCR-GPU). ~1–50 ms/page depending
on model and page density.

### L2 — Semantics (LLM, bounded annotators)

Each annotator is a narrow LocalAgent that returns decisions **indexed by
block**, never regenerated content.

Suggested annotators:

| annotator | input | output |
|---|---|---|
| `heading_classifier` | all blocks | `{block_index → level: 1|2|3|null}` |
| `section_grouper` | block indices + headings | `[{start, end, title_index}]` |
| `list_detector` | blocks | `{block_index → is_list_item: bool, list_id: int}` |
| `ocr_corrector` | block text + page crop | `{block_index → corrected_text}` (optional, gated by confidence) |
| `handwriting_filter` | blocks + page images | `{handwritten_block_indices: [int]}` |
| `language_detector` | sample of text | `"en"|"de"|…` |
| `title_extractor` | first N blocks | `block_index | null` |
| `classifier` | blocks + page-0 image | `{category, confidence, rationale}` |

Rules every annotator follows:

- Input always references existing L1 blocks by index.
- Output is Pydantic-schema-constrained JSON.
- If an annotator wants to regenerate text (e.g. OCR correction), its output
  **must** still be keyed by block index, and the corrected text is stored
  alongside — not in place of — L1.text.
- Vision context (page image, crop) passed via Ollama `images=[...]` param;
  python-resolved context workflow, no native Ollama tool-calling required.

Storage:

```python
class Annotations(BaseModel):
    headings: dict[int, int] = {}        # block_idx → level
    sections: list[Section] = []
    lists: dict[int, int] = {}           # block_idx → list_id
    corrections: dict[int, str] = {}     # block_idx → corrected text
    handwritten: set[int] = set()        # block indices
    title: int | None = None
    language: str = "en"
    classification: Classification | None = None
```

### L3 — Renderers (Python, per format)

Six renderers, explicit per render call: PDF-fidelity, DOCX reflow, TXT flat, HTML reflow, XLSX, PPTX.

#### 3a. PDF-fidelity

Goal: pixel-accurate reconstruction. Best for "clean scan" style output.

Algorithm:
1. Start from rasterised page images (or blank canvas at same dimensions).
2. For each block: erase the original region (or keep image), overlay
   corrected text at the bbox using the OCR font metrics.
3. Honour `handwritten_block_indices` → redact (blank fill) instead of
   rewriting.

Library: `reportlab` (already a dep) for canvas, `PIL` for raster operations.

#### 3b. DOCX reflow

Goal: editable document with preserved semantic structure.

Algorithm:
1. Walk blocks in `reading_order`.
2. Open paragraph/heading/list/table elements based on L2 annotations.
3. Write block text (or `corrections[idx]` if present).
4. For `kind="table"`, materialise `table_cells` into a `python-docx` table.
5. For `kind="figure"`, **embed as inline cropped image** at the block's position in reading order (not sidecar).

Library: `python-docx` (already a dep).

#### 3c. TXT flat

Goal: plain text with light markers for structure.

Algorithm:
1. Walk blocks in `reading_order`.
2. Prefix headings with `#`, `##`, `###` per L2 heading level.
3. Prefix list items with `- ` or `1. ` per L2 list annotation.
4. Tables rendered as pipe-separated lines.
5. Skip figures.

No external dep.

#### 3d. HTML reflow

Goal: structured, styleable output. Treated as a **first-class renderer** — preferred format when downstream consumers need flexibility in styling and layout.

Algorithm:
1. Walk blocks in `reading_order`.
2. Emit semantic tags driven by L2 annotations: `<h1>/<h2>/<h3>` (headings), `<ul>/<ol>/<li>` (lists), `<table>/<tr>/<td>` (tables from `table_cells`), `<section>` (from `sections`), `<p>` for plain text.
3. Figures embed as `<img>` referencing the inline cropped PNG (base64 data URI by default; external path configurable).
4. Emit a minimal base stylesheet; consumers override with their own CSS.
5. Include `data-block-index` and `data-page` attributes on every block element so downstream tooling can trace elements back to L1 geometry.

Library: stdlib only (string templating) or `jinja2` if already present.

#### 3e. XLSX (Excel)

Goal: structured tabular output. Primary use case: tables extracted from the document become first-class spreadsheets.

Algorithm:
1. One sheet per detected table (or one sheet per page with tables stacked, configurable).
2. Materialise `table_cells` into rows/columns, preserving merged cells via `openpyxl` merge ranges.
3. Non-table blocks in `reading_order` emit as a "Text" sheet (block_index, page, kind, text, corrected_text) so nothing is lost.
4. Headings preserved via cell formatting (bold / font size) on the Text sheet.

Library: `openpyxl` (standard choice; add as dep).

#### 3f. PPTX (PowerPoint)

Goal: slide-oriented reconstruction. Best for decks, posters, and any source document whose page structure maps to slide structure.

Algorithm:
1. One slide per source page.
2. Blocks placed via their `bbox` (scaled to slide dimensions) as text frames or image shapes.
3. `kind="figure"` → picture shape from inline crop; `kind="table"` → native PowerPoint table from `table_cells`.
4. Honour `reading_order` for z-index (later blocks on top).

Library: `python-pptx` (add as dep).

## Features as Compositions

| feature | L1 | L2 annotators | L3 |
|---|---|---|---|
| `scan_conversion` | parse | heading, list, (ocr_corrector optional) | render(fmt) |
| `classification` | parse | classifier | — |
| `comparison` | parse × 2 | heading, section | diff narration + render(pdf) |
| `handwriting_removal` | parse | handwriting_filter | render(pdf, fidelity, redact) |

Each feature is one pipeline function that:
1. Runs L1 once per input document.
2. Selects and runs the L2 annotators it needs.
3. Calls the renderer with the chosen strategy.

## Why this kills hallucination

At the format boundary (where bytes are emitted) the renderer reads only from
L1 + L2 annotation structures. L2 annotations are JSON with a strict schema —
either a valid block index or a label from a fixed vocabulary. The renderer
never passes LLM output string-through to the canvas.

The only place regenerated text appears in the pipeline is `corrections` — and
that field is optional, gated by low-confidence OCR, and human-inspectable
block-by-block.

## Evaluation

A reconstruction-quality suite:

- **Pixel diff** for PDF-fidelity: render golden input, compare raster diff
  against expected output.
- **Text diff** for DOCX/TXT: compare extracted text + structure (heading
  hierarchy, list structure) against expected tree.
- **Handwriting redaction**: check that bboxes marked handwritten are blank
  in the output.

Reference corpus in `engine_backend/tests/fixtures/` (current: one `small.pdf`
per feature). Needs to grow; candidates from `zenwood-demo-2/images/` already
identified (Invoice1, WalmartReceipt, Form1, dl1, Document1_UL, etc.).

## Migration path (non-binding order)

1. Define the `Annotations` schema in `types.py`. Shared foundation.
2. **Build the eval harness + baseline the legacy pipeline.** Every change after this is measured against these numbers.
3. Implement renderers (`render_pdf_fidelity`, `render_docx_reflow`,
   `render_txt_flat`, `render_html_reflow`, `render_xlsx`, `render_pptx`) as
   pure functions consuming `(doc, annotations, format)`.
4. Rewrite `handwriting_removal` on the new pattern as the smallest
   proof-point (narrow annotator + single renderer call).
5. Add `heading_classifier` + `list_detector` annotators.
6. Rewrite `scan_conversion` to use the renderer registry.
7. Retire the monolithic `ExtractorAgent` once all features have migrated off and eval deltas are non-regressive.

## Hybrid Agentic OCR — When & How

The pure-deterministic pipeline is fast and reproducible but emits
low-confidence garbage on hard blocks (handwriting, mixed scripts, nested
forms, faded stamps, rotated regions). Pure-agentic flips control to the LLM
and pays 10–20 tool calls per page → minutes per doc, non-reproducible.

**Hybrid**: deterministic spine handles the fast path; an LLM with a
PaddleOCR-backed toolkit takes over only for blocks that fail a confidence or
clarity gate.

### Trigger gates (when the fallback runs)

A block enters the agentic fallback iff *any* of the following hold. No
fallback → ship the deterministic block as-is.

| gate | condition | agent invoked |
|---|---|---|
| low confidence | `block.confidence < 0.7` | `icr_corrector` |
| ambiguous kind | layout parser unsure (multiple plausible kinds above threshold) | `kind_disambiguator` |
| mixed script | langid returns low-confidence or ≥2 scripts in one block | `language_reocr` |
| nested structure | `kind="form"` or `kind="table"` with sub-block density > N | `nested_descender` |
| handwriting flagged | VLM detects handwriting in block region | `handwriting_filter` or `handwriting_icr` (depending on feature) |
| stamp / seal | `kind="stamp"` and deterministic recognizer returns < 0.8 | `stamp_reader` |

Every gate is cheap and deterministic. Gates are *first*; the LLM is *last*.

### OCRToolkit — L1.5

A thin, deterministic adapter around PaddleOCR internals. The LLM calls it
exactly like a function library. Each toolkit call logs its inputs and output
to the run artefact directory so the fallback path remains reproducible for
debugging.

```python
class OCRToolkit:
    def layout(self, page: int) -> list[OCRBlock]:
        """PP-StructureV3 on the page. Deterministic."""

    def text(self, page: int, bbox: Box,
             lang: str | None = None,
             model: Literal["server", "mobile"] = "server") -> RecognizedText:
        """Targeted OCR on a single region. Optional language pack."""

    def handwriting_ocr(self, page: int, bbox: Box) -> RecognizedText:
        """Dedicated handwriting model (e.g. TrOCR) on a crop."""

    def icr(self, page: int, bbox: Box,
            charset: str | None = None) -> RecognizedText:
        """Character-level recognition for form fields. charset narrows the
        search space (digits only, uppercase alpha, etc.)."""

    def detect_handwriting(self, page: int, bbox: Box) -> float:
        """0..1 probability. VLM classifier on the crop."""

    def detect_language(self, text_or_bbox: str | tuple[int, Box]) -> str:
        """langid + VLM fallback for low-confidence cases."""

    def recognize_stamp(self, page: int, bbox: Box) -> str:
        """PP-Structure seal recognition pipeline."""

    def nested_layout(self, page: int, bbox: Box) -> list[OCRBlock]:
        """Run PP-Structure on a cropped region. Coords returned are
        relative to the crop; caller remaps to page coords."""

    def crop(self, page: int, bbox: Box) -> Path:
        """Save a PNG crop for visual inspection or VLM input."""
```

All coordinates stay in page pixel space (remapped on return from
`nested_layout`). Every method wraps an existing PaddleOCR / PaddleX capability
— no new models needed except the handwriting / ICR backbones.

### Reconciliation loop

When an agent returns, its output **replaces or augments** the original block
in a structured way. It never mutates L1 in place.

```python
class AgenticCorrection(BaseModel):
    block_index: int
    corrected_text: str | None = None
    new_kind: BlockKind | None = None
    split_into: list[OCRBlock] | None = None   # nested_descender
    redact: bool = False                       # handwriting_filter
    confidence_after: float
    toolkit_calls: list[ToolkitCallLog]        # for reproducibility
```

`Annotations.corrections[idx]` holds the final decision. Renderers consult
corrections first, then fall back to L1.

### Budget guardrails

- **Max toolkit calls per block:** 3. Beyond that, mark the block as
  `needs_human_review` and ship the deterministic result.
- **Max agentic blocks per doc:** configurable, default 20% of total blocks.
  If exceeded → abort fallback on the remainder, flag the doc.
- **Timeout per agent:** 15 s. Exceed → keep deterministic result.

These caps bound worst-case latency and cost. They're explicit numbers so they
can be tuned per deployment.

### Feature-by-feature use of the toolkit

| feature | fallback agents it invokes |
|---|---|
| `scan_conversion` | `icr_corrector`, `kind_disambiguator`, `language_reocr` |
| `classification` | none — classifier only needs summary-level input |
| `comparison` | `icr_corrector` on low-confidence blocks before diff |
| `handwriting_removal` | `handwriting_filter` (index-only); optionally `handwriting_icr` if output must preserve handwritten content as printed text |

### Reproducibility

Every fallback run writes a sidecar `.agentic.jsonl` next to the output:

```jsonl
{"block": 12, "trigger": "low_confidence", "calls": [...], "decision": {...}}
```

A re-run with the same inputs + same model versions + same temperature=0.0
should produce the same decisions. The log makes bugs inspectable without
re-running the pipeline.

## Implementation Plan

Tasks ordered by dependency. Each is independently reviewable.

### Phase 0 — foundation (prereq)

1. **Define shared types**
   - Add `Annotations`, `AgenticCorrection`, `ToolkitCallLog` to `types.py`.
   - Extend `OCRBlock` with `reading_order: int` and optional `table_cells`.
   - No behavioural change.

2. **Eval harness (promoted from Phase 5)**
   - Build before any rewrite so every downstream change is measured against a baseline, not vibes.
   - Structure: `engine_backend/evals/` with a runner, a fixture loader, and per-metric reporters.
   - Metrics:
     - **Pixel-diff** for PDF-fidelity output (SSIM + raw diff %).
     - **Text + structure diff** for DOCX / HTML / TXT (normalized text equality, heading-tree equality, list-tree equality).
     - **Table cell diff** for XLSX (cell-for-cell equality, merged-cell equality).
     - **Slide layout diff** for PPTX (shape count + per-shape bbox tolerance).
     - **Per-block OCR accuracy** (edit distance vs golden text, confidence calibration curve).
     - **Handwriting redaction** check (flagged bboxes blank in output).
   - Fixture corpus: start from `engine_backend/tests/fixtures/*/small.pdf`; expand with zenwood-demo-2 samples (Invoice1, WalmartReceipt, Form1, dl1, Document1_UL).
   - CLI: `uv run python -m engine_backend.evals run --feature scan_conversion --format html` prints a table and writes a JSONL report.
   - Publish baseline numbers for the current monolithic pipeline before touching code — these are the numbers every subsequent phase must beat or match.

### Phase 1 — OCRToolkit (L1.5)

2. **Build `OCRToolkit` class** (`engine_backend/ocr_toolkit.py`).
   - Backed by the existing `PPStructureV3` instance.
   - Methods: `layout`, `text`, `nested_layout`, `crop`, `detect_language`
     (using `langid`), `recognize_stamp` (if PP-Structure seal pipeline is
     reachable).
   - Deterministic — no LLM.
   - Unit tests with a small fixture.

3. **Add handwriting / ICR backbones**
   - Integrate TrOCR (or PaddleOCR's handwriting recognizer if available in 3.x).
   - `handwriting_ocr` and `icr` methods.
   - Gate integration behind a feature flag until model downloads are verified.

### Phase 2 — confidence gates & agent framework

4. **Trigger-gate module** (`engine_backend/gates.py`).
   - Pure functions: `low_confidence(block)`, `ambiguous_kind(block)`,
     `mixed_script(block)`, `nested_candidate(block)`.
   - Returns which agent (if any) should run.
   - Unit-tested deterministic logic.

5. **Generic fallback agent base** (`engine_backend/agents/_fallback.py`).
   - Subclass of `LocalAgent` that receives a block + toolkit + toolkit-call
     budget, runs a constrained conversation, emits `AgenticCorrection`.
   - Enforces budget/timeout caps.
   - Writes `.agentic.jsonl` entry per block.

### Phase 3 — first agents

6. **`icr_corrector` agent**
   - Input: block, OCR confidence, page crop.
   - Available tools: `text`, `icr`, `crop`.
   - Output: `corrected_text`, `confidence_after`.

7. **`handwriting_filter` agent** (rewrite of existing detector on the new pattern)
   - Input: blocks + page images.
   - Available tools: `detect_handwriting`, `crop`.
   - Output: `handwritten_block_indices`.
   - Retire the bbox-emitting detector.

### Phase 4 — renderers & feature rewrite

8. **Renderer registry** (`engine_backend/renderers/`).
   - `render_pdf_fidelity`, `render_docx_reflow`, `render_txt_flat`,
     `render_html_reflow`, `render_xlsx`, `render_pptx`.
   - Each consumes `(DocumentRepresentation, Annotations)`.
   - Unit-tested with golden-output fixtures driven by the Phase 0 eval harness.

9. **Rewrite `handwriting_removal`** on the new stack.
   - Pipeline: L1 → handwriting_filter → render_pdf_fidelity(redact).
   - Drop extractor stage for this feature.
   - Smallest proof-point of the whole architecture.

10. **Rewrite `scan_conversion`** with annotators + chosen renderer.
    - Optional annotators: `heading_classifier`, `list_detector`,
      `icr_corrector` (gated by per-block confidence).
    - Exercise all six renderers against the eval harness.

### Phase 5 — rollout

11. **Expand eval corpus and publish deltas**
    - Add zenwood-demo-2 samples (Invoice1, WalmartReceipt, Form1, dl1,
      Document1_UL) to the Phase 0 harness.
    - Run the harness against both the legacy monolithic pipeline and the new
      stack; publish per-metric deltas.
    - Gate further agent additions on measurable wins.

### Out of scope for v1 (internal tool)

- Additional annotators beyond those listed in Phase 3.
- Heading/list annotators (simple heuristics suffice until eval shows need).
- Model fine-tuning.
- Streaming agent responses.

### Backlog (from CTO review, deferred past internal-tool phase)

See `architecture-ocr-llm-reconstruction-cto-review.md` for the full review.
Deferred items:

- Pick a vertical (invoices / contracts / medical records) and specialise annotators.
- `OCRProvider` abstraction (Textract / Document AI / Azure as additional implementations).
- L2.5 extraction layer — schema-constrained `{field_name → {block_ref, value, confidence}}` outputs per document type; the monetisable surface.
- Enterprise operating envelope: multi-tenancy, PII/PHI gating before LLM calls, audit log per decision, model versioning + reproducibility across versions, HITL review UI, cost-per-page modelling.
- Data flywheel: every human correction feeds labeled training data.

## Resolved design decisions

| Question | Decision |
|---|---|
| OCR correction gating | **Per-block accuracy** — use `block.confidence` (and `confidence_after` post-agentic) as the gate. Per-word gating is deferred. |
| Table reconstruction fidelity | **Start with PP-Structure cells.** Fall back to LLM re-extraction only when the grid is ambiguous (cell-count mismatch across rows, low per-cell confidence, or flagged by the `kind_disambiguator` gate). |
| Renderer extensibility | **Add XLSX and PPTX.** **HTML is a first-class renderer** (flexible, easy to style) and is the preferred output for downstream consumers. Markdown deferred. |
| Multi-column layout | **Rely on PP-Structure's `reading_order`.** No separate column-detection annotator in v1. Revisit if eval shows multi-column failures. |
| Image handling in DOCX | **Inline crop** — embed the cropped region directly in the paragraph flow at the block's `reading_order` position. No sidecar. |
