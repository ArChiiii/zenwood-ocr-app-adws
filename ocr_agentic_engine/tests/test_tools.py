from pathlib import Path

import numpy as np
from PIL import Image

from ocr_agentic_engine.tools import build_tools
from ocr_agentic_engine.types import DocumentRepresentation, OCRBlock, PageImage


def _doc(tmp_path: Path) -> DocumentRepresentation:
    p = tmp_path / "0.png"
    Image.fromarray(np.full((50, 80, 3), 255, dtype=np.uint8)).save(p)
    return DocumentRepresentation(
        file_id="x", source_path=tmp_path / "s.pdf", page_count=1,
        blocks=[
            OCRBlock(page=0, bbox=(0, 0, 20, 20), text="a", confidence=0.9, kind="text"),
            OCRBlock(page=1, bbox=(0, 0, 20, 20), text="b", confidence=0.9, kind="text"),
        ],
        page_images=[PageImage(page=0, path=p, width=80, height=50)],
        raw_text="a\nb",
    )


def test_render_returns_existing_path(tmp_path):
    tools = build_tools(_doc(tmp_path), tmp_path)
    assert Path(tools["render_page_image"].fn(page=0)).exists()


def test_render_unknown_page_returns_error(tmp_path):
    tools = build_tools(_doc(tmp_path), tmp_path)
    assert "error" in tools["render_page_image"].fn(page=99)


def test_get_blocks_on_page_filters(tmp_path):
    tools = build_tools(_doc(tmp_path), tmp_path)
    assert [b["text"] for b in tools["get_blocks_on_page"].fn(page=1)] == ["b"]


def test_crop_region_writes_file(tmp_path):
    tools = build_tools(_doc(tmp_path), tmp_path)
    out = Path(tools["crop_region"].fn(page=0, bbox=[0, 0, 10, 10]))
    assert out.exists() and out.parent.name == "crops"


def test_crop_out_of_bounds_returns_error(tmp_path):
    tools = build_tools(_doc(tmp_path), tmp_path)
    assert "error" in tools["crop_region"].fn(page=0, bbox=[0, 0, 999, 999])
