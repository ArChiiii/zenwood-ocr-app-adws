# CTO Review — OCR+LLM Reconstruction Architecture

> Reviewer: CTO-level review of `architecture-ocr-llm-reconstruction.md`
> Date: 2026-04-18
> Lens: "Can this power a multi-billion SaaS?"

## Top-line

Solid engineering design for an internal document processing tool. **Not a $B SaaS platform** as written. The technical decomposition is good; the business + operational envelope is missing. Three structural concerns would block a serious enterprise buyer.

---

## What's strong

- **L1/L2/L3 separation** is the right abstraction. "LLM never regenerates bytes at the format boundary" is a principle most OCR+LLM products violate, and it's the single biggest source of hallucination in this category.
- **Index-based annotations** (`{block_idx → level}` instead of re-emitting text) is a well-chosen contract. It's how you actually get reproducibility.
- **Budget guardrails** on the agentic fallback (3 calls/block, 20% cap, 15s timeout) show thought about worst-case cost. Most teams skip this until it burns them.
- **Reproducibility sidecar** (`.agentic.jsonl`) is the right instinct for debuggability + audit.

---

## Structural gaps at $B scale

### 1. You're betting the company on one OSS model family

PaddleOCR is "ground truth for geometry" — but it's a community project with known Apple Silicon hangs (CLAUDE.md flags issues #11706, #13062, #12792), no SLA, no enterprise support contract, and version drift that breaks reproducibility on legal/audit timeframes. Competitors (Textract, Document AI, Form Recognizer, Rossum, Hypatos) ship with dedicated research teams and decades of labeled corpora.

**Fix:** Abstract the OCR layer behind an interface. PaddleOCR is one implementation. The moat isn't the OCR model, it's the orchestration + annotation layer on top.

### 2. The product is reconstruction. The market pays for extraction.

The architecture emits PDF/DOCX/TXT faithfully. That's a *commodity* feature — Adobe, ABBYY, Google have had it for a decade.

The $B+ OCR SaaS (Rossum ~$100M ARR, Hypatos, Ocrolus, Klippa, AWS Textract) monetize **extraction + validation**: key-value pairs from invoices, line-item tables, fraud signals on bank statements, KYC attestations, contract clause detection. The `classification` feature is the only one pointing this direction, and it's under-specified.

**Fix:** Decide the market segment (invoices? medical records? contracts?). Add an extraction layer (L2.5: `{field_name → {block_ref, value, confidence}}`). Monetize the validated structured output, not the reconstructed PDF.

### 3. Missing the enterprise operating envelope

Not present anywhere in the doc:

| Missing capability | Why it blocks $B buyers |
|---|---|
| PII/PHI handling before LLM calls | HIPAA, SOC2, GDPR — can't ship LLM-annotated medical or financial docs without this |
| Multi-tenancy + data isolation | Every enterprise security review asks this in the first 10 questions |
| Model versioning + output reproducibility across versions | Legal/audit reprocessing requires byte-identical output on re-run, months later |
| Human-in-the-loop correction → training flywheel | How Rossum/Hypatos differentiate; accuracy compounds |
| Per-document-class eval + accuracy SLOs | "Pixel diff on one `small.pdf`" won't survive a procurement RFP |
| Concurrency model, queue, GPU pooling | PaddleOCR is CPU-bound; LLM calls are network-bound — no throughput story |
| Audit log / provenance per decision | SOC2 Type II requires per-record decision trails |
| Cost per page modeling | At 100M pages/year, L2 LLM cost dominates — no cost engineering in the plan |

---

## Open questions that are actually core requirements

The doc ends with "open questions" that read like edge cases. They're not:

- **Table reconstruction fidelity** → This *is* the product for invoice/receipt extraction ($B market on its own).
- **Multi-column layout** → This *is* the product for contracts, research, forms.
- **Confidence threshold calibration** (0.7, 0.8 are hardcoded) → Must be learned per doc-class at scale; static thresholds bleed accuracy.

These need to land *before* the monolithic extractor is retired, not after.

---

## What I'd change before calling this v1

1. **Pick one vertical.** Generic reconstruction is a feature, not a company. Invoice extraction, contract clause detection, or KYC verification — pick one and specialize the L2 annotators.
2. **Abstract L1.** `OCRProvider` interface; PaddleOCR is implementation #1, Textract/Azure/Google are #2-4. Ship with multi-provider from day one or pay for it in year two.
3. **Add L2.5 extraction layer** with schema-constrained outputs per document type. This is the monetizable surface.
4. **Build the eval harness first, not last** (currently placed at Phase 5 / Task 11). Target accuracy numbers per doc class drive every downstream decision — thresholds, agent budgets, model choices.
5. **Add an enterprise annex**: tenancy, PII gating before LLM, audit log, model versioning, human review UI. These aren't v2 concerns at this scale; they're table-stakes.
6. **Data flywheel from day one.** Every human correction is labeled data. Without this, accuracy plateaus and you can't beat vendors with 10 years of labeled corpora.

---

## Bottom line

**As a single-developer internal platform**: this architecture is coherent, the principles are sound, and the migration plan is sequenced well. Build it.

**As the foundation for a multi-billion SaaS**: the technical spine is fine, but the product thesis (reconstruction-first), the single-vendor OCR bet, and the absent enterprise envelope are category-level blockers. The current doc gets to a nice internal tool or a $5–20M ARR boutique; it doesn't get to a $B outcome without the changes above.

---

## Decisions taken (2026-04-18)

Owner has decided to proceed as follows:

- **Now (v1 internal tool):** build the eval harness first for better decision-making (promoted from Phase 5 to Phase 0).
- **Backlog (deferred):** vertical selection, `OCRProvider` abstraction, L2.5 extraction layer, enterprise operating envelope (tenancy, PII gating, audit, model versioning, HITL flywheel).

### Resolutions to open questions

| Question | Decision |
|---|---|
| OCR correction gating | Per-block accuracy (use block-level confidence as the gate). |
| Table reconstruction | Start with PP-Structure cells; fall back to LLM re-extraction when the grid is ambiguous or cell confidence is low. |
| Renderer extensibility | Add **Excel** and **PowerPoint** outputs. **HTML** is preferred as a flexible, easy-to-style output; treat HTML as a first-class renderer. |
| Multi-column layout | Rely on PP-Structure's reading order — no separate column-detection annotator for v1. |
| Images in DOCX | **Inline crop** (embed the cropped region directly in the paragraph flow). |
