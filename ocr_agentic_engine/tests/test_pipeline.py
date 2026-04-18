"""Smoke tests for the L1/L2/L3 pipeline — renderers + annotators + dispatch."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ocr_agentic_engine import gates
from ocr_agentic_engine.agents.annotators import (
    HeadingClassifierAgent, ListDetectorAgent,
)
from ocr_agentic_engine.renderers import REGISTRY, render
from ocr_agentic_engine.renderers._ordering import iter_blocks
from ocr_agentic_engine.types import Annotations, Cell, DocumentRepresentation, OCRBlock, PageImage


def _doc(tmp_path: Path) -> DocumentRepresentation:
    page_path = tmp_path / "0.png"
    from PIL import Image
    Image.new("RGB", (400, 600), "white").save(page_path)
    return DocumentRepresentation(
        file_id="f",
        source_path=tmp_path / "src.pdf",
        page_count=1,
        page_images=[PageImage(page=0, path=page_path, width=400, height=600)],
        blocks=[
            OCRBlock(page=0, bbox=(10, 10, 200, 40), text="Big Title",
                      confidence=0.99, kind="title", reading_order=0),
            OCRBlock(page=0, bbox=(10, 50, 390, 90), text="Some body text.",
                      confidence=0.95, kind="text", reading_order=1),
            OCRBlock(page=0, bbox=(10, 100, 390, 140), text="- first bullet",
                      confidence=0.95, kind="text", reading_order=2),
            OCRBlock(page=0, bbox=(10, 150, 390, 190), text="- second bullet",
                      confidence=0.95, kind="text", reading_order=3),
            OCRBlock(page=0, bbox=(10, 200, 390, 320), text="table",
                      confidence=0.9, kind="table", reading_order=4,
                      table_cells=[
                          Cell(row=0, col=0, bbox=(10, 200, 200, 260), text="A"),
                          Cell(row=0, col=1, bbox=(200, 200, 390, 260), text="B"),
                          Cell(row=1, col=0, bbox=(10, 260, 200, 320), text="1"),
                          Cell(row=1, col=1, bbox=(200, 260, 390, 320), text="2"),
                      ]),
            OCRBlock(page=0, bbox=(10, 350, 390, 400), text="handwritten bit",
                      confidence=0.50, kind="text", reading_order=5),
        ],
        raw_text="...",
    )


def test_heading_classifier_labels_title():
    doc = _doc(Path("/tmp"))
    out = HeadingClassifierAgent().annotate(doc)
    assert out.get(0) == 1


def test_list_detector_groups_consecutive_bullets():
    doc = _doc(Path("/tmp"))
    out = ListDetectorAgent().annotate(doc)
    assert out[2] == out[3]       # same list id
    assert 1 not in out            # non-bullet excluded


def test_gates_icr_for_low_confidence_block():
    doc = _doc(Path("/tmp"))
    assert gates.agent_for(doc.blocks[5]) == "icr_corrector"  # conf 0.50 < 0.70
    assert gates.agent_for(doc.blocks[0]) is None              # title, high conf


@pytest.mark.parametrize("fmt", list(REGISTRY.keys()))
def test_every_renderer_produces_nonempty_bytes(tmp_path, fmt):
    doc = _doc(tmp_path)
    ann = Annotations(
        headings=HeadingClassifierAgent().annotate(doc),
        lists=ListDetectorAgent().annotate(doc),
        handwritten={5},
        title=0,
    )
    data, mime = render(fmt, doc, ann)
    assert isinstance(data, bytes) and len(data) > 0
    assert mime


def test_iter_blocks_respects_redact_handwritten(tmp_path):
    doc = _doc(tmp_path)
    ann = Annotations(handwritten={5})
    idxs = [i for i, _ in iter_blocks(doc, ann, redact_handwritten=True)]
    assert 5 not in idxs
    assert idxs == [0, 1, 2, 3, 4]
