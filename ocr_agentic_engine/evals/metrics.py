"""Per-metric scorers. All pure functions — no I/O, no model calls.

Each scorer returns a dict `{score: float, details: dict}`. `score` is in
[0,1] where 1 = perfect; higher = better; `details` is for the report.
"""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

import numpy as np
from PIL import Image

from ocr_agentic_engine.types import Annotations, DocumentRepresentation, OCRBlock


def pixel_ssim(actual_png: bytes, expected_png: bytes) -> dict[str, Any]:
    """Structural similarity + raw diff ratio between two rasterised pages.

    Uses a simple luminance-based SSIM approximation to avoid pulling in skimage.
    """
    a = np.asarray(Image.open(_bytes(actual_png)).convert("L"), dtype=np.float64)
    b = np.asarray(Image.open(_bytes(expected_png)).convert("L"), dtype=np.float64)
    if a.shape != b.shape:
        return {"score": 0.0, "details": {"reason": "shape_mismatch",
                                            "actual": a.shape, "expected": b.shape}}
    mu_a, mu_b = a.mean(), b.mean()
    va, vb = a.var(), b.var()
    cov = ((a - mu_a) * (b - mu_b)).mean()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ssim = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / (
        (mu_a ** 2 + mu_b ** 2 + c1) * (va + vb + c2)
    )
    diff_ratio = float(np.mean(np.abs(a - b) > 10))  # fraction pixels differing >10 gray
    return {"score": float(max(0.0, min(1.0, ssim))),
            "details": {"ssim": float(ssim), "diff_ratio": diff_ratio}}


def text_tree_equality(actual_text: str, expected_text: str) -> dict[str, Any]:
    """Normalised text equality (whitespace-collapsed) + edit-distance ratio."""
    na = _norm(actual_text); ne = _norm(expected_text)
    ratio = SequenceMatcher(None, na, ne).ratio()
    return {"score": float(ratio), "details": {"exact": na == ne, "len_actual": len(na),
                                                 "len_expected": len(ne)}}


def heading_tree_equality(actual: list[tuple[int, str]],
                           expected: list[tuple[int, str]]) -> dict[str, Any]:
    """List of (level, text) tuples compared order-sensitively."""
    if not expected:
        return {"score": 1.0 if not actual else 0.0, "details": {"actual": len(actual)}}
    matches = sum(1 for a, e in zip(actual, expected)
                   if a[0] == e[0] and _norm(a[1]) == _norm(e[1]))
    return {"score": matches / max(len(actual), len(expected)),
            "details": {"matches": matches, "actual": len(actual), "expected": len(expected)}}


def table_cell_equality(actual_cells: list[dict], expected_cells: list[dict]) -> dict[str, Any]:
    """Cell-for-cell equality keyed by (row, col). Ignores merged-cell fine detail for now."""
    if not expected_cells:
        return {"score": 1.0 if not actual_cells else 0.0, "details": {}}
    a_idx = {(c["row"], c["col"]): _norm(c.get("text", "")) for c in actual_cells}
    e_idx = {(c["row"], c["col"]): _norm(c.get("text", "")) for c in expected_cells}
    hits = sum(1 for k, v in e_idx.items() if a_idx.get(k) == v)
    return {"score": hits / len(e_idx),
            "details": {"hits": hits, "total": len(e_idx), "actual_cells": len(a_idx)}}


def per_block_ocr_accuracy(doc: DocumentRepresentation,
                            golden: dict[int, str]) -> dict[str, Any]:
    """Average per-block edit-distance ratio vs a golden {block_idx → text} dict."""
    if not golden:
        return {"score": 0.0, "details": {"reason": "no_golden"}}
    ratios: list[float] = []
    for idx, gold in golden.items():
        if idx >= len(doc.blocks):
            ratios.append(0.0); continue
        ratios.append(SequenceMatcher(None, _norm(doc.blocks[idx].text), _norm(gold)).ratio())
    return {"score": float(sum(ratios) / len(ratios)),
            "details": {"n": len(ratios), "min": min(ratios), "max": max(ratios)}}


def handwriting_redaction(rendered_png: bytes, redacted_bboxes: list[tuple[int, int, int, int]],
                            whiteness_threshold: int = 240) -> dict[str, Any]:
    """Every flagged bbox must be uniformly near-white in the output."""
    if not redacted_bboxes:
        return {"score": 1.0, "details": {"checked": 0}}
    img = np.asarray(Image.open(_bytes(rendered_png)).convert("L"))
    passes = 0
    for (x0, y0, x1, y1) in redacted_bboxes:
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(img.shape[1], x1), min(img.shape[0], y1)
        if x1 <= x0 or y1 <= y0:
            continue
        if img[y0:y1, x0:x1].min() >= whiteness_threshold:
            passes += 1
    return {"score": passes / len(redacted_bboxes),
            "details": {"passes": passes, "total": len(redacted_bboxes)}}


def annotation_coverage(ann: Annotations, doc: DocumentRepresentation) -> dict[str, Any]:
    """Sanity check: every annotation index must reference a valid block."""
    total = len(doc.blocks)
    def ok(idx): return 0 <= idx < total
    invalid = [i for i in list(ann.headings) + list(ann.lists) + list(ann.corrections)
               + list(ann.handwritten) if not ok(i)]
    return {"score": 1.0 if not invalid else 0.0,
            "details": {"invalid_indices": invalid[:10], "total_blocks": total}}


# --- helpers ---------------------------------------------------------------

def _norm(s: str) -> str:
    return " ".join((s or "").split()).lower()


def _bytes(data: bytes):
    from io import BytesIO
    return BytesIO(data)


def _block_extract(blocks: list[OCRBlock]) -> str:
    return "\n".join(b.text for b in sorted(blocks, key=lambda b: b.reading_order))
