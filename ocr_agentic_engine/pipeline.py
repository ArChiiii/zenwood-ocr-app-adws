"""Feature compositions on the new L1/L2/L3 stack.

Each feature is a small pure function returning an SSE event iterator. The
Engine class in `engine.py` delegates to these instead of the monolithic
`ExtractorAgent → FormatterStage` path.

Contract per feature:

    pipeline_<feature>(docs, options, run_id, deps) -> Iterator[SSEEvent]

`deps` carries the lazily-built agents so tests can swap them out without
constructing an Ollama client.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator

from ocr_agentic_engine.agents.annotators import (
    HandwritingFilterAgent,
    HeadingClassifierAgent,
    ICRCorrectorAgent,
    ListDetectorAgent,
)
from ocr_agentic_engine.agents._fallback import FallbackContext, budget_doc_block_cap
from ocr_agentic_engine.agents.classifier import ClassifierAgent
from ocr_agentic_engine.agents.comparator import ComparatorAgent
from ocr_agentic_engine.errors import FormatterError, InputValidationError
from ocr_agentic_engine import gates, renderers
from ocr_agentic_engine.helpers import redlines_html
from ocr_agentic_engine.ocr_toolkit import OCRToolkit
from ocr_agentic_engine.types import (
    AgenticCorrection, Annotations, Comparison, DocumentRepresentation,
    EngineResult, FormattedResult, HandwritingReport, OCRBlock,
)

SSEEvent = str


def event(name: str, payload: dict[str, Any]) -> SSEEvent:
    return f"event: {name}\ndata: {json.dumps(payload, default=_default)}\n\n"


def _default(o):
    if isinstance(o, Path): return str(o)
    if isinstance(o, set):  return list(o)
    if hasattr(o, "model_dump"): return o.model_dump(mode="json")
    raise TypeError(f"not serialisable: {type(o)!r}")


@dataclass
class PipelineDeps:
    """Everything a feature needs beyond the documents themselves."""
    classifier: ClassifierAgent
    comparator: ComparatorAgent
    handwriting_filter: HandwritingFilterAgent
    icr_corrector: ICRCorrectorAgent
    heading_classifier: HeadingClassifierAgent = None
    list_detector: ListDetectorAgent = None
    structure: Any = None
    downloads_root: Path = None
    tmp_root: Path = None

    def __post_init__(self):
        if self.heading_classifier is None:
            self.heading_classifier = HeadingClassifierAgent()
        if self.list_detector is None:
            self.list_detector = ListDetectorAgent()


# --- public pipelines ------------------------------------------------------

def run_scan_conversion(doc: DocumentRepresentation, options: dict, run_id: str,
                         deps: PipelineDeps) -> Iterator[SSEEvent]:
    fmt = options.get("format", "html")
    if fmt not in renderers.REGISTRY:
        raise FormatterError(stage="formatter", message=f"unknown format: {fmt}")

    yield event("stage_started", {"stage": "annotate"})
    ann = _base_annotations(doc, deps)
    _run_icr_fallback(doc, ann, deps, run_id)
    yield event("stage_finished", {"stage": "annotate",
                                     "headings": len(ann.headings),
                                     "lists": len(ann.lists),
                                     "corrections": len(ann.corrections)})

    yield from _render_and_emit("scan_conversion", doc, ann, fmt, run_id, deps)


def run_classification(doc: DocumentRepresentation, options: dict, run_id: str,
                        deps: PipelineDeps) -> Iterator[SSEEvent]:
    yield event("stage_started", {"stage": "annotate"})
    ann = _base_annotations(doc, deps)
    yield event("stage_finished", {"stage": "annotate"})

    yield event("stage_started", {"stage": "classifier"})
    # ClassifierAgent still consumes a CleanDoc — feed it a thin shim built from annotations.
    clean = _clean_from_ann(doc, ann)
    cls = deps.classifier.classify(doc, clean)
    ann.classification = cls
    yield event("stage_finished", {"stage": "classifier",
                                     "category": cls.category, "confidence": cls.confidence})

    yield event("run_completed", {"result": EngineResult(
        feature="classification", document=doc, annotations=ann, clean_doc=clean,
        classification=cls,
    ).model_dump(mode="json")})


def run_comparison(docs: list[DocumentRepresentation], options: dict, run_id: str,
                    deps: PipelineDeps) -> Iterator[SSEEvent]:
    if len(docs) != 2:
        raise InputValidationError(stage="router", message=f"comparison needs 2 docs, got {len(docs)}")

    yield event("stage_started", {"stage": "annotate"})
    ann_a = _base_annotations(docs[0], deps)
    ann_b = _base_annotations(docs[1], deps)
    yield event("stage_finished", {"stage": "annotate"})

    clean_a = _clean_from_ann(docs[0], ann_a)
    clean_b = _clean_from_ann(docs[1], ann_b)

    yield event("stage_started", {"stage": "diff"})
    diff_html = redlines_html(clean_a, clean_b)
    yield event("stage_finished", {"stage": "diff"})

    yield event("stage_started", {"stage": "comparator"})
    narrative = deps.comparator.compare(clean_a, clean_b, diff_html)
    comparison = Comparison(
        summary=narrative.summary, additions=narrative.additions,
        deletions=narrative.deletions, modifications=narrative.modifications,
        diff_html=diff_html,
    )
    yield event("stage_finished", {"stage": "comparator",
                                     "additions": len(narrative.additions),
                                     "deletions": len(narrative.deletions),
                                     "modifications": len(narrative.modifications)})

    yield event("stage_started", {"stage": "formatter"})
    html_bytes = diff_html.encode("utf-8")
    formatted = _write_download(deps.downloads_root, run_id, "diff.html", html_bytes, "text/html")
    yield event("stage_finished", {"stage": "formatter",
                                     "mime_type": formatted.mime_type,
                                     "bytes_size": formatted.bytes_size})

    yield event("run_completed", {"result": EngineResult(
        feature="comparison", document=docs[0], annotations=ann_a, clean_doc=clean_a,
        comparison=comparison, formatted=formatted,
    ).model_dump(mode="json")})


def run_handwriting_removal(doc: DocumentRepresentation, options: dict, run_id: str,
                             deps: PipelineDeps) -> Iterator[SSEEvent]:
    """Smallest L1/L2/L3 proof-point: detect → annotate → PDF-fidelity redact."""
    yield event("stage_started", {"stage": "handwriting_filter"})
    handwritten = deps.handwriting_filter.annotate(doc)
    ann = Annotations(handwritten=handwritten,
                       headings=deps.heading_classifier.annotate(doc),
                       lists=deps.list_detector.annotate(doc))
    yield event("stage_finished", {"stage": "handwriting_filter",
                                     "handwritten_blocks": len(handwritten)})

    affected_blocks = [doc.blocks[i] for i in sorted(handwritten) if 0 <= i < len(doc.blocks)]
    report = HandwritingReport(
        has_handwriting=bool(handwritten),
        affected_pages=sorted({b.page for b in affected_blocks}),
        affected_blocks=affected_blocks,
        rationale=f"{len(handwritten)} blocks flagged by handwriting_filter",
    )

    yield from _render_and_emit("handwriting_removal", doc, ann, "pdf", run_id, deps,
                                 extra_fields={"handwriting": report})


# --- internal helpers ------------------------------------------------------

def _base_annotations(doc: DocumentRepresentation, deps: PipelineDeps) -> Annotations:
    """Cheap, deterministic annotators — no LLM."""
    return Annotations(
        headings=deps.heading_classifier.annotate(doc),
        lists=deps.list_detector.annotate(doc),
    )


def _run_icr_fallback(doc: DocumentRepresentation, ann: Annotations,
                      deps: PipelineDeps, run_id: str) -> None:
    """Per-block gate → icr_corrector for low-confidence blocks, within budget caps."""
    cap = budget_doc_block_cap(len(doc.blocks))
    run_dir = deps.tmp_root / run_id
    toolkit = OCRToolkit(doc=doc, structure=deps.structure, crops_dir=run_dir / "crops")
    used = 0
    for idx, b in enumerate(doc.blocks):
        if used >= cap:
            break
        if gates.agent_for(b) != "icr_corrector":
            continue
        try:
            correction: AgenticCorrection = deps.icr_corrector.run_block(
                FallbackContext(block=b, block_index=idx, toolkit=toolkit, run_dir=run_dir))
        except Exception:
            continue
        if correction.corrected_text:
            ann.corrections[idx] = correction.corrected_text
        ann.agentic.append(correction)
        used += 1


def _render_and_emit(feature: str, doc: DocumentRepresentation, ann: Annotations,
                      fmt: str, run_id: str, deps: PipelineDeps,
                      extra_fields: dict | None = None) -> Iterator[SSEEvent]:
    yield event("stage_started", {"stage": "formatter"})
    data, mime = renderers.render(fmt, doc, ann)
    formatted = _write_download(deps.downloads_root, run_id, f"output.{fmt}", data, mime)
    yield event("stage_finished", {"stage": "formatter",
                                     "mime_type": formatted.mime_type,
                                     "bytes_size": formatted.bytes_size})

    result = EngineResult(
        feature=feature, document=doc, annotations=ann,
        clean_doc=_clean_from_ann(doc, ann), formatted=formatted,
        **(extra_fields or {}),
    )
    yield event("run_completed", {"result": result.model_dump(mode="json")})


def _write_download(downloads_root: Path, run_id: str, filename: str, data: bytes, mime: str) -> FormattedResult:
    out_dir = downloads_root / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / filename).write_bytes(data)
    return FormattedResult(output_url=f"/engine/downloads/{run_id}/{filename}",
                             mime_type=mime, bytes_size=len(data))


def _clean_from_ann(doc: DocumentRepresentation, ann: Annotations):
    """Transitional adapter: the legacy ClassifierAgent / ComparatorAgent still
    consume a `CleanDoc`. Build one from L1+L2 so those agents keep working
    until they're rewritten to read Annotations directly.
    """
    from ocr_agentic_engine.types import CleanDoc, CleanSection
    sections: list[CleanSection] = []
    current_heading: str | None = None
    current_body: list[str] = []
    page_min = page_max = 0
    for idx, b in enumerate(doc.blocks):
        text = ann.corrections.get(idx, b.text)
        if idx in ann.headings:
            if current_heading or current_body:
                sections.append(CleanSection(heading=current_heading,
                                              body="\n\n".join(current_body),
                                              page_range=(page_min, page_max)))
                current_body = []
            current_heading = text; page_min = page_max = b.page
        else:
            current_body.append(text); page_max = b.page
    if current_heading or current_body:
        sections.append(CleanSection(heading=current_heading,
                                      body="\n\n".join(current_body),
                                      page_range=(page_min, page_max)))
    title = None
    if ann.title is not None and 0 <= ann.title < len(doc.blocks):
        title = ann.corrections.get(ann.title, doc.blocks[ann.title].text)
    return CleanDoc(title=title, sections=sections, language=ann.language, notes="")
