"""Deterministic helpers: redlines diff and PDF redaction over rasterised pages."""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from ocr_agentic_engine.types import CleanDoc, DocumentRepresentation, OCRBlock


def redlines_html(a: CleanDoc, b: CleanDoc) -> str:
    from redlines import Redlines
    return Redlines(_text(a), _text(b), markdown_style="none").output_markdown


def _text(d: CleanDoc) -> str:
    return "\n\n".join(
        (f"# {s.heading}\n{s.body}" if s.heading else s.body) for s in d.sections
    ) or (d.title or "")


def redact_blocks_to_pdf(doc: DocumentRepresentation, blocks: list[OCRBlock]) -> bytes:
    """Paint white rectangles over `blocks` on each page_image, assemble a PDF."""
    by_page: dict[int, list[OCRBlock]] = {}
    for b in blocks:
        by_page.setdefault(b.page, []).append(b)

    buf = BytesIO()
    c: canvas.Canvas | None = None
    for page_image in doc.page_images:
        with Image.open(page_image.path).convert("RGB") as im:
            draw = ImageDraw.Draw(im)
            for b in by_page.get(page_image.page, []):
                draw.rectangle(b.bbox, fill="white")
            w, h = im.size
            if c is None:
                c = canvas.Canvas(buf, pagesize=(w, h))
            c.setPageSize((w, h))
            c.drawImage(ImageReader(im), 0, 0, width=w, height=h)
            c.showPage()
    if c is None:
        c = canvas.Canvas(buf)
        c.showPage()
    c.save()
    return buf.getvalue()
