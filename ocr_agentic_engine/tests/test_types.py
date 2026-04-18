from pathlib import Path

import pytest
from pydantic import ValidationError

from ocr_agentic_engine.types import (
    Classification, CleanDoc, CleanSection, Comparison, ComparisonNarrative,
    DocumentRepresentation, EngineResult, FormattedResult, HandwritingReport,
    OCRBlock, PageImage,
)


def _block(**kw) -> OCRBlock:
    return OCRBlock(page=0, bbox=(0, 0, 10, 10), text="hi", confidence=0.9, kind="text", **kw)


def _doc(tmp_path: Path) -> DocumentRepresentation:
    p = tmp_path / "0.png"; p.write_bytes(b"x")
    return DocumentRepresentation(
        file_id="deadbeef", source_path=tmp_path / "s.pdf", page_count=1,
        blocks=[_block()],
        page_images=[PageImage(page=0, path=p, width=10, height=10)],
        raw_text="hi",
    )


def test_ocrblock_rejects_invalid_kind():
    with pytest.raises(ValidationError):
        OCRBlock(page=0, bbox=(0, 0, 1, 1), text="x", confidence=0.5, kind="bogus")


def test_classification_category_enum_enforced():
    with pytest.raises(ValidationError):
        Classification(category="nope", confidence=0.9, rationale="r")


def test_comparison_narrative_has_no_diff_html_field():
    n = ComparisonNarrative(summary="s", additions=[], deletions=[], modifications=[])
    assert "diff_html" not in n.model_fields


def test_comparison_has_diff_html_field():
    c = Comparison(summary="s", additions=[], deletions=[], modifications=[], diff_html="<p/>")
    assert c.diff_html == "<p/>"


def test_engine_result_optional_branches_default_none(tmp_path):
    r = EngineResult(feature="classification", document=_doc(tmp_path),
                      clean_doc=CleanDoc(title=None, sections=[], language="en", notes=""))
    assert r.classification is None and r.formatted is None


def test_formatted_result_requires_url():
    with pytest.raises(ValidationError):
        FormattedResult(mime_type="application/pdf", bytes_size=1)  # type: ignore[arg-type]
