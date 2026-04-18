import hashlib
from pathlib import Path

import numpy as np
import pytest

from ocr_agentic_engine.errors import OCRError
from ocr_agentic_engine.ocr_stage import OCRStage
from ocr_agentic_engine.types import DocumentRepresentation

FIXTURE = Path(__file__).parent / "fixtures" / "small.pdf"


class FakeStructure:
    def predict(self, img: np.ndarray):
        return [{
            "parsing_res_list": [
                {"block_bbox": (0, 0, 10, 10), "block_content": "hello", "block_label": "text"}
            ],
            "overall_ocr_res": {"rec_scores": [0.9]},
        }]


def test_ocr_stage_produces_doc_representation(tmp_path):
    doc = OCRStage(structure=FakeStructure()).run(FIXTURE, tmp_path)
    assert isinstance(doc, DocumentRepresentation)
    assert doc.page_count == 2
    assert len(doc.page_images) == 2 and all(p.path.exists() for p in doc.page_images)
    assert doc.file_id == hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
    assert doc.raw_text.strip()


def test_bad_pdf_raises_ocr_error(tmp_path):
    bad = tmp_path / "bad.pdf"; bad.write_bytes(b"not a pdf")
    with pytest.raises(OCRError):
        OCRStage(structure=FakeStructure()).run(bad, tmp_path)


def test_cache_skips_predict_on_second_call(tmp_path, monkeypatch):
    monkeypatch.setenv("ENGINE_OCR_CACHE", "1")
    monkeypatch.setenv("ENGINE_OCR_CACHE_DIR", str(tmp_path / "cache"))
    calls = {"n": 0}

    class Counting(FakeStructure):
        def predict(self, img):
            calls["n"] += 1; return super().predict(img)

    stage = OCRStage(structure=Counting())
    stage.run(FIXTURE, tmp_path)
    first = calls["n"]
    stage.run(FIXTURE, tmp_path / "run2")
    assert calls["n"] == first
