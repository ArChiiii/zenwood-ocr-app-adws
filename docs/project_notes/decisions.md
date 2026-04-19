# Architectural Decision Records (ADRs)

Document major architectural decisions, the context that motivated them, alternatives considered, and expected trade-offs.

---

### ADR-001: Extract engine from `zentralai-simple-adw` into standalone `ocr-agentic-engine` (2026-04-19)

**Context:**
- The engine was living inside the monorepo `zentralai-simple-adw/engine_backend/` but was architecturally standalone (its own FastAPI app, its own deps, SSE boundary).
- The L1/L2/L3 architecture rewrite (architecture-ocr-llm-reconstruction.md) was a large scope change; doing it in-tree would entangle the monorepo's frontend / backend tests with half-migrated engine code.

**Decision:**
- Copy (not rewrite) the engine into `../ocr-agentic-engine/`. Rename the Python package `engine_backend` → `ocr_agentic_engine`. Retain ~60% of the existing code (LocalAgent base, OCR stage, client, auth, sweeper, tools) — rewrite only the monolithic `ExtractorAgent → FormatterStage` path.

**Alternatives Considered:**
- Rewrite from scratch → Would discard 6–8 days of infra plumbing (PaddleOCR lifespan, SSE protocol, test scaffold, pinned deps). No payoff.
- Keep in monorepo and branch → Cross-contamination risk with frontend tests + CI. Rejected.
- Git subtree split → Viable if the engine might return to the monorepo as a dep; deferred — simple copy for now since no import coupling exists.

**Consequences:**
- `zentralai-simple-adw/backend/` has zero import coupling to the engine — frontend talks SSE over HTTP, so extraction is a pure move.
- Two codebases to keep in sync IF the monorepo still exercises the engine via HTTP. Mitigation: frontend talks only to `/engine/{feature}` which is API-stable.

---

### ADR-002: L1/L2/L3 separation — LLMs never emit bytes at the format boundary (2026-04-19)

**Context:**
- The legacy monolith used `ExtractorAgent` to regenerate a `CleanDoc` from OCR output, then rendered that into bytes. This is the single biggest hallucination risk in OCR+LLM systems.
- Competitors that allow LLM output to reach the canvas routinely produce fabricated content in edge cases.

**Decision:**
- **L1 (Geometry, deterministic):** PaddleOCR PPStructureV3 → `DocumentRepresentation`. No LLM touches L1.
- **L2 (Semantics, index-only LLM annotators):** Annotators return decisions keyed by block index — `{block_idx → heading_level}`, `{block_idx → list_id}`, `set[int]` of handwritten blocks, optional `Annotations.corrections[idx]` for OCR repairs. Pydantic-schema-constrained output.
- **L3 (Renderers, deterministic per format):** `renderers/` consumes `(DocumentRepresentation, Annotations)` only. Reads `corrections[idx]` first, L1.text as fallback. Any regenerated text lives in corrections and is inspectable block-by-block.

**Alternatives Considered:**
- Let LLM re-emit text for specific block kinds → Still hallucination-prone. Rejected.
- Skip L2 entirely, render from pure L1 → No semantic structure (no headings, lists, etc.) in output. Rejected.

**Consequences:**
- Renderers are pure functions — trivially testable without Ollama.
- `ExtractorAgent` retired (deleted). Legacy `CleanDoc` shim retained transitionally in `pipeline._clean_from_ann` because `ClassifierAgent` / `ComparatorAgent` still consume it; remove when those are rewritten to read `Annotations` directly.

---

### ADR-003: Gate-first agentic fallback, with budget caps (2026-04-19)

**Context:**
- Pure-agentic OCR (LLM drives the loop) pays 10–20 tool calls per page → minutes per doc, non-reproducible.
- Pure-deterministic OCR emits low-confidence garbage on hard blocks (handwriting, mixed scripts, nested forms).

**Decision:**
- `gates.py` runs first — deterministic per-block check on `confidence`, `kind`, `mixed_script`, `nested_candidate`, `stamp_candidate`. First match wins and dispatches one named agent.
- `agents/_fallback.py::FallbackAgent` enforces: max 3 toolkit calls per block (`ENGINE_AGENTIC_BUDGET_BLOCK`), 15s wall-clock per agent (`ENGINE_AGENTIC_TIMEOUT_SEC`), max 20% of blocks per doc may enter fallback (`ENGINE_AGENTIC_BUDGET_DOC_PCT`).
- Every fallback decision writes a line to `<run_dir>/.agentic.jsonl` for audit.

**Consequences:**
- Worst-case doc latency is bounded by the deterministic spine × 1 + fallback_budget × timeout.
- Thresholds are env-tunable without code change — cheap to rebalance per deployment.

---

### ADR-004: Eval harness is first-class; golden authoring helper is required (2026-04-19)

**Context:**
- Every architecture change produces subjective "it looks better" claims. Without per-metric baselines, regressions land silently.
- Golden-authoring for OCR fixtures is tedious (typing out full-page text). That friction prevents goldens from existing → evals can't score → decisions are vibes-based.

**Decision:**
- `evals/` is a first-class module with: JSONL report + summary.md, 7 metrics (pixel SSIM, text tree, heading tree, table cells, per-block OCR edit distance, handwriting redaction, annotation coverage, classification accuracy).
- `evals gold <fixture>` authors a `.golden.json` stub with OCR-extracted per-block text as a starting point + an `.annotated.png` overlaying numbered bboxes. User edits just the scorer-relevant keys (`category`, `handwriting_block_indices`, `text`).
- Golden stubs live co-located with fixtures (`X.png.golden.json`).

**Consequences:**
- Discovery filters must explicitly exclude `.annotated.png` and `.golden.json` (see bugs.md).
- Adding a new metric now means: one pure function in `evals/metrics.py`, one branch in `score_case`, one golden key. No plumbing changes.

---

### ADR-005: HTML is a first-class renderer; XLSX + PPTX added; retain inline image crops for DOCX (2026-04-19)

**Context:**
- Original spec (`architecture-ocr-llm-reconstruction.md`) listed PDF-fidelity / DOCX reflow / TXT flat only. CTO review (`-cto-review.md`) called for Excel + PowerPoint and making HTML first-class.

**Decision:**
- Six renderers registered in `renderers/REGISTRY`: `pdf_fidelity`, `docx_reflow`, `txt_flat`, `html_reflow`, `xlsx_tabular`, `pptx_slide`. Router's `format` enum = `set(REGISTRY.keys())`.
- HTML: every element carries `data-block-index` + `data-page` for downstream traceability to L1.
- DOCX embeds figures as **inline crops** at `reading_order` position (not sidecar) — per resolved question in architecture doc.
- XLSX produces one sheet per detected table + a "Text" sheet capturing every block regardless of kind (why xlsx leads reconstruction-roundtrip at 0.718 mean).

**Consequences:**
- Adding a format = one file + one `REGISTRY` line. Proven workflow.
- `pdf_fidelity` has roundtrip score 0.0 by design — it rasterises pages, pypdf can't re-extract. "Fidelity" means visual, not re-machine-readable.

---

### ADR-006: Retire the legacy `ExtractorAgent → FormatterStage` monolith (2026-04-19)

**Context:**
- Post-rewrite, the old path regenerates text through an LLM → violates ADR-002.
- Tests for the old path (`test_extractor_agent.py`, `test_formatter_stage.py`, `test_engine_*.py` monolith variants, `test_router.py`) would fail against the new pipeline shape.

**Decision:**
- Delete: `agents/extractor.py`, `agents/handwriting_detector.py` (replaced by `agents/annotators/handwriting_filter.py`), `formatter_stage.py`, and 8 obsolete test files.
- Keep the `CleanDoc` / `CleanSection` types in `types.py` transitionally because `ClassifierAgent` / `ComparatorAgent` still consume them via a shim (`pipeline._clean_from_ann`).

**Consequences:**
- Every L2 agent is now strictly index-emitting (`HandwritingFilterAgent` returns `set[int]` not bboxes).
- When `ClassifierAgent` / `ComparatorAgent` are rewritten to read `Annotations` directly, we can delete `CleanDoc` entirely.
