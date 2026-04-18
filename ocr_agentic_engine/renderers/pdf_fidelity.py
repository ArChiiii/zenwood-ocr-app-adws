"""PDF-fidelity renderer — pixel-accurate reconstruction.

Algorithm (spec §3a):
1. Start from rasterised page images (reuse doc.page_images — already at
   OCR scale).
2. For each handwritten block: paint a white rectangle (redact).
3. Optionally overlay corrected text from `Annotations.corrections` at the
   original bbox using approximate font metrics. Disabled by default (v1
   prioritises redaction fidelity; text overlay is wired later when font
   estimation is tuned).
4. Emit as a PDF whose page size matches the source raster.

Evolved from the existing `helpers.redact_blocks_to_pdf` so we don't rewrite
the reportlab canvas flow from scratch.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from ocr_agentic_engine.types import Annotations, DocumentRepresentation


def render_pdf_fidelity(doc: DocumentRepresentation, ann: Annotations) -> bytes:
    by_page_handwritten = {}
    for idx in ann.handwritten:
        if 0 <= idx < len(doc.blocks):
            b = doc.blocks[idx]
            by_page_handwritten.setdefault(b.page, []).append(b.bbox)

    buf = BytesIO()
    c: canvas.Canvas | None = None
    for pi in doc.page_images:
        with Image.open(pi.path).convert("RGB") as im:
            draw = ImageDraw.Draw(im)
            for bbox in by_page_handwritten.get(pi.page, []):
                draw.rectangle(bbox, fill="white")
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
