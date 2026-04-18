"""Gate threshold behaviour — pure unit tests, no OCR / no LLM."""
from __future__ import annotations

from ocr_agentic_engine import gates
from ocr_agentic_engine.types import Cell, OCRBlock


def _b(**kw) -> OCRBlock:
    defaults = dict(page=0, bbox=(0, 0, 100, 50), text="x", confidence=0.99,
                     kind="text", reading_order=0)
    defaults.update(kw)
    return OCRBlock(**defaults)


def test_low_confidence_routes_icr():
    assert gates.agent_for(_b(confidence=0.5)) == "icr_corrector"


def test_ambiguous_kind_wins_over_confidence():
    assert gates.agent_for(_b(kind="unknown", confidence=0.3)) == "kind_disambiguator"


def test_mixed_script_detected():
    # roughly balanced latin / cyrillic, above the 0.2 minority threshold
    b = _b(text="hello world мир дом", confidence=0.95)
    assert gates.agent_for(b) == "language_reocr"


def test_nested_table_routes_descender():
    cells = [Cell(row=r, col=c, bbox=(0, 0, 10, 10)) for r in range(4) for c in range(2)]
    assert gates.agent_for(_b(kind="table", table_cells=cells)) == "nested_descender"


def test_high_confidence_text_passes_through():
    assert gates.agent_for(_b(confidence=0.99)) is None


def test_apply_env_tunes_threshold():
    gates.apply_env({"ENGINE_GATE_LOW_CONFIDENCE": "0.50"})
    try:
        assert gates.agent_for(_b(confidence=0.60)) is None
    finally:
        gates.apply_env({"ENGINE_GATE_LOW_CONFIDENCE": "0.70"})
