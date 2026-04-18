"""Shared helper: iterate blocks in reading_order, skipping handwritten ones if redacting."""
from __future__ import annotations

from typing import Iterable

from ocr_agentic_engine.types import Annotations, DocumentRepresentation, OCRBlock


def iter_blocks(doc: DocumentRepresentation, ann: Annotations,
                 redact_handwritten: bool = False) -> Iterable[tuple[int, OCRBlock]]:
    """Yield `(block_index, block)` in reading order."""
    indexed = list(enumerate(doc.blocks))
    indexed.sort(key=lambda pair: (pair[1].page, pair[1].reading_order, pair[0]))
    for idx, b in indexed:
        if redact_handwritten and idx in ann.handwritten:
            continue
        yield idx, b
