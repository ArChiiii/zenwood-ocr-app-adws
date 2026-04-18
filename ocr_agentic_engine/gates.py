"""Trigger gates (spec §"Hybrid Agentic OCR — When & How").

Pure deterministic functions. Each gate decides whether a given L1 block
should enter the agentic fallback — and which agent to invoke. No LLM calls.

`agent_for(block)` is the single entry-point the engine calls per block:
returns the name of the agent to dispatch, or None to ship the deterministic
result untouched.
"""
from __future__ import annotations

from typing import Literal

from ocr_agentic_engine.types import OCRBlock

AgentName = Literal[
    "icr_corrector", "kind_disambiguator", "language_reocr",
    "nested_descender", "handwriting_filter", "handwriting_icr", "stamp_reader",
]

# Tunable thresholds — single source of truth, env-override via `apply_env()`.
THRESHOLDS = {
    "low_confidence": 0.70,
    "stamp_confidence": 0.80,
    "nested_block_count": 6,        # density threshold for nested_descender
}


def low_confidence(b: OCRBlock) -> bool:
    return b.confidence < THRESHOLDS["low_confidence"]


def ambiguous_kind(b: OCRBlock) -> bool:
    return b.kind == "unknown"


def mixed_script(b: OCRBlock) -> bool:
    """Crude: flag blocks containing both Latin and non-Latin-ASCII glyphs above a ratio."""
    t = b.text
    if len(t) < 4:
        return False
    latin = sum(1 for c in t if c.isascii() and c.isalpha())
    non_latin = sum(1 for c in t if not c.isascii() and c.isalpha())
    if latin + non_latin == 0:
        return False
    minor = min(latin, non_latin)
    return minor / (latin + non_latin) > 0.2


def nested_candidate(b: OCRBlock) -> bool:
    return b.kind == "table" and b.table_cells is not None and len(b.table_cells) > THRESHOLDS["nested_block_count"]


def stamp_candidate(b: OCRBlock) -> bool:
    return b.kind == "stamp" and b.confidence < THRESHOLDS["stamp_confidence"]


def agent_for(b: OCRBlock) -> AgentName | None:
    """Priority-ordered gate. First match wins."""
    if ambiguous_kind(b):
        return "kind_disambiguator"
    if stamp_candidate(b):
        return "stamp_reader"
    if nested_candidate(b):
        return "nested_descender"
    if mixed_script(b):
        return "language_reocr"
    if low_confidence(b):
        return "icr_corrector"
    return None


def apply_env(env: dict[str, str]) -> None:
    """Allow deployments to tune thresholds via env vars without code change."""
    mapping = {
        "ENGINE_GATE_LOW_CONFIDENCE": "low_confidence",
        "ENGINE_GATE_STAMP_CONFIDENCE": "stamp_confidence",
        "ENGINE_GATE_NESTED_BLOCK_COUNT": "nested_block_count",
    }
    for k, key in mapping.items():
        if k in env:
            try:
                THRESHOLDS[key] = float(env[k]) if "count" not in key else int(env[k])
            except ValueError:
                pass
