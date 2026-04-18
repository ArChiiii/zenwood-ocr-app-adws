"""Eval metric unit tests — deterministic, no fixtures."""
from __future__ import annotations

from io import BytesIO

from PIL import Image

from ocr_agentic_engine.evals import metrics


def _png(color=(255, 255, 255), size=(50, 50)) -> bytes:
    buf = BytesIO(); Image.new("RGB", size, color).save(buf, format="PNG"); return buf.getvalue()


def test_pixel_ssim_identical_returns_one():
    a = _png(); b = _png()
    r = metrics.pixel_ssim(a, b)
    assert r["score"] == 1.0 or r["score"] > 0.99


def test_pixel_ssim_shape_mismatch():
    a = _png(size=(50, 50)); b = _png(size=(40, 40))
    assert metrics.pixel_ssim(a, b)["score"] == 0.0


def test_text_tree_equality_exact():
    r = metrics.text_tree_equality("Hello world", "hello   world")
    assert r["score"] == 1.0


def test_heading_tree_mismatch():
    r = metrics.heading_tree_equality([(1, "A"), (2, "B")], [(1, "A"), (2, "C")])
    assert 0 < r["score"] < 1.0


def test_table_cell_equality_partial():
    a = [{"row": 0, "col": 0, "text": "x"}, {"row": 0, "col": 1, "text": "y"}]
    e = [{"row": 0, "col": 0, "text": "x"}, {"row": 0, "col": 1, "text": "Z"}]
    r = metrics.table_cell_equality(a, e)
    assert r["score"] == 0.5


def test_handwriting_redaction_all_white_passes():
    white_png = _png()
    r = metrics.handwriting_redaction(white_png, [(0, 0, 50, 50)])
    assert r["score"] == 1.0


def test_handwriting_redaction_black_fails():
    black_png = _png(color=(0, 0, 0))
    r = metrics.handwriting_redaction(black_png, [(0, 0, 50, 50)])
    assert r["score"] == 0.0
