"""heading_classifier — `{block_index → level: 1|2|3|null}`.

For v1 we use a deterministic heuristic: PP-Structure already labels title
blocks, and text-block font size is proxied by bbox height. The LLM variant
is wired behind `ENGINE_HEADING_USE_LLM=1` (not yet implemented — placeholder).

Index-only output satisfies the L2 invariant.
"""
from __future__ import annotations

from collections import Counter

from ocr_agentic_engine.types import DocumentRepresentation


def classify_headings(doc: DocumentRepresentation) -> dict[int, int]:
    """Heuristic: all `title` blocks get level 1; oversize text blocks get level 2.

    "Oversize" = bbox height in the top quartile relative to text-block median.
    """
    heights = sorted(_height(b) for b in doc.blocks if b.kind == "text")
    if not heights:
        return {i: 1 for i, b in enumerate(doc.blocks) if b.kind == "title"}

    median = heights[len(heights) // 2]
    p75 = heights[int(len(heights) * 0.75)] if heights else median

    out: dict[int, int] = {}
    for i, b in enumerate(doc.blocks):
        if b.kind == "title":
            out[i] = 1
        elif b.kind == "text" and _height(b) >= max(p75, median * 1.2) and len(b.text) < 100:
            out[i] = 2
    return out


def _height(b) -> int:
    _, y0, _, y1 = b.bbox
    return int(y1 - y0)


class HeadingClassifierAgent:
    """Thin wrapper so callers use the same object-oriented interface as LLM annotators."""
    name = "heading_classifier"

    def annotate(self, doc: DocumentRepresentation) -> dict[int, int]:
        return classify_headings(doc)
