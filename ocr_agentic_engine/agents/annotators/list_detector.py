"""list_detector — `{block_index → list_id}`.

Heuristic grouping: consecutive blocks whose text starts with a bullet glyph
(`- `, `* `, `• `, `· `) or numeric prefix (`1.`, `2)`) form one list. Non-list
blocks break the run and increment the list id.

Deterministic — no LLM in v1.
"""
from __future__ import annotations

import re

from ocr_agentic_engine.types import DocumentRepresentation, OCRBlock

_BULLET_RE = re.compile(r"^\s*([-*•·▪‣◦]\s+|\d{1,3}[.)]\s+|[a-zA-Z][.)]\s+)")


def detect_lists(doc: DocumentRepresentation) -> dict[int, int]:
    out: dict[int, int] = {}
    current_id = 0
    in_run = False
    for i, b in enumerate(doc.blocks):
        if _is_list_item(b):
            if not in_run:
                current_id += 1
                in_run = True
            out[i] = current_id
        else:
            in_run = False
    return out


def _is_list_item(b: OCRBlock) -> bool:
    if b.kind == "list":
        return True
    return bool(_BULLET_RE.match(b.text or ""))


class ListDetectorAgent:
    name = "list_detector"

    def annotate(self, doc: DocumentRepresentation) -> dict[int, int]:
        return detect_lists(doc)
