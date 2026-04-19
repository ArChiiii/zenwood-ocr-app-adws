# Work Log

Completed and in-progress work, tagged by date and brief description.

---

### 2026-04-19 — Initial extraction + L1/L2/L3 rewrite (complete)
- **Status**: Completed
- **Description**: Extracted engine from monorepo `zentralai-simple-adw/engine_backend/` into standalone `ocr-agentic-engine/`. Renamed package. Implemented the full architecture plan: `types.Annotations` + `reading_order`, `OCRToolkit` (L1.5), gates + fallback agent base, 4 annotators (heading / list / handwriting_filter / icr_corrector), 6 renderers (pdf_fidelity / docx_reflow / txt_flat / html_reflow / xlsx_tabular / pptx_slide), eval harness with 7 metrics. Retired `ExtractorAgent` + `FormatterStage` + 8 obsolete tests.
- **Refs**: docs/architecture-ocr-llm-reconstruction.md, docs/architecture-ocr-llm-reconstruction-cto-review.md
- **Notes**: 52 `.py` files, 56 unit tests passing. Frontend SSE protocol unchanged — no consumer-facing breaking changes.

### 2026-04-19 — Eval harness + golden-authoring helper (complete)
- **Status**: Completed
- **Description**: Built `evals/` package with runner CLI (`run`, `gold`, `reconstruct` subcommands), metrics module, per-fixture `.golden.json` + `.annotated.png` authoring. Classification baselined at 4/4 correct vs remote Ollama (qwen2.5vl:7b) on Invoice1 / WalmartReceipt / dl1 / Form1. Reconstruction eval: 54 renderings across 9 fixtures, per-format mean roundtrip fidelity: xlsx 0.718, docx / pptx / txt 0.685, html 0.529, pdf 0.000 (by design).
- **Notes**: Two fixtures (`IMG_6047.jpg`, `image_hw_clean.jpg`) still hit GPU OOM — being rerun one-at-a-time in subprocess to complete the reconstruction corpus.

### 2026-04-19 — Backlog (open)
- **Status**: Not started
- **Description**: (a) Per-fixture subprocess mode for `reconstruct` to eliminate GPU OOM on large JPEGs. (b) Fill remaining text goldens for scan_conversion fixtures (Document1_UL, table1). (c) Rewrite `ClassifierAgent` / `ComparatorAgent` to consume `Annotations` directly, then delete the transitional `CleanDoc` / `CleanSection` types. (d) Wire a `comparison`-feature metric (additions/deletions shape + `must_mention` keywords).
- **Notes**: None of these block current functionality — all are follow-up cleanup / expansion.
