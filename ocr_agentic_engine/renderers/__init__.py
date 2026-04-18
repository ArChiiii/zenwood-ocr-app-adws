"""L3 renderers — pure functions `(DocumentRepresentation, Annotations) → bytes`.

Registered by format name. The router's `format` query-param maps directly to
a key here. Adding a new format = new file + one line in `REGISTRY`.

**Invariant:** renderers read only from L1 (blocks, page_images) and L2
(Annotations). They do not call LLMs and do not receive regenerated text
outside `Annotations.corrections`. This is where hallucination is killed.
"""
from __future__ import annotations

from typing import Callable

from ocr_agentic_engine.renderers.docx_reflow import render_docx_reflow
from ocr_agentic_engine.renderers.html_reflow import render_html_reflow
from ocr_agentic_engine.renderers.pdf_fidelity import render_pdf_fidelity
from ocr_agentic_engine.renderers.pptx_slide import render_pptx_slide
from ocr_agentic_engine.renderers.txt_flat import render_txt_flat
from ocr_agentic_engine.renderers.xlsx_tabular import render_xlsx_tabular
from ocr_agentic_engine.types import Annotations, DocumentRepresentation

RendererFn = Callable[[DocumentRepresentation, Annotations], bytes]

REGISTRY: dict[str, tuple[RendererFn, str]] = {
    "pdf":  (render_pdf_fidelity, "application/pdf"),
    "docx": (render_docx_reflow,  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "txt":  (render_txt_flat,     "text/plain"),
    "html": (render_html_reflow,  "text/html"),
    "xlsx": (render_xlsx_tabular, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "pptx": (render_pptx_slide,   "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
}


def render(fmt: str, doc: DocumentRepresentation, ann: Annotations) -> tuple[bytes, str]:
    if fmt not in REGISTRY:
        raise ValueError(f"unknown format: {fmt}")
    fn, mime = REGISTRY[fmt]
    return fn(doc, ann), mime


def resolved_text(ann: Annotations, block_index: int, fallback: str) -> str:
    """Renderers use this to get the right string: correction if any, else L1."""
    return ann.corrections.get(block_index, fallback)
