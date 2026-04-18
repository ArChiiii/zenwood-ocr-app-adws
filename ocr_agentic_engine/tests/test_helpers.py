from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from PIL import Image

from ocr_agentic_engine.helpers import redact_blocks_to_pdf, redlines_html
from ocr_agentic_engine.types import CleanDoc, CleanSection, DocumentRepresentation, OCRBlock, PageImage


def test_redlines_html_marks_change():
    a = CleanDoc(title=None, sections=[CleanSection(heading=None, body="alpha", page_range=(0, 0))],
                  language="en", notes="")
    b = CleanDoc(title=None, sections=[CleanSection(heading=None, body="beta", page_range=(0, 0))],
                  language="en", notes="")
    html = redlines_html(a, b)
    assert "<del>" in html and "<ins>" in html


def _doc(tmp_path: Path) -> DocumentRepresentation:
    p = tmp_path / "0.png"
    Image.fromarray(np.full((200, 200, 3), 255, dtype=np.uint8)).save(p)
    return DocumentRepresentation(
        file_id="x", source_path=tmp_path / "s.pdf", page_count=1,
        blocks=[OCRBlock(page=0, bbox=(10, 10, 100, 50), text="hi", confidence=0.9, kind="text")],
        page_images=[PageImage(page=0, path=p, width=200, height=200)],
        raw_text="hi",
    )


def test_redact_blocks_to_pdf_produces_readable_pdf(tmp_path):
    doc = _doc(tmp_path)
    blocks = [doc.blocks[0]]
    out = redact_blocks_to_pdf(doc, blocks)
    assert out[:4] == b"%PDF"
    pdf = pdfium.PdfDocument(out)
    assert len(pdf) == 1
    pdf.close()


def test_redact_with_no_blocks_still_returns_pdf(tmp_path):
    doc = _doc(tmp_path)
    out = redact_blocks_to_pdf(doc, [])
    assert out[:4] == b"%PDF"
