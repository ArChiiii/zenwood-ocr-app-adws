"""Fallback-agent base class (spec §"Reconciliation loop" + "Budget guardrails").

A subclass of `LocalAgent` that:

* receives a single block + OCRToolkit + per-block call budget,
* runs a constrained conversation (LLM may request toolkit operations via
  Python-resolved context — no native tool-calling required),
* returns an `AgenticCorrection`.

Caps enforced here (see CLAUDE.md env vars):

* `ENGINE_AGENTIC_BUDGET_BLOCK` — max toolkit calls per block (default 3)
* `ENGINE_AGENTIC_TIMEOUT_SEC`  — per-agent wall-clock timeout (default 15)

Doc-level cap (`ENGINE_AGENTIC_BUDGET_DOC_PCT`) is enforced by the caller
(feature pipeline), because it depends on how many blocks the doc has.

Every call writes a JSONL record to `<run_dir>/.agentic.jsonl` so the
fallback path remains reproducible for debugging.
"""
from __future__ import annotations

import json
import os
import signal
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from ocr_agentic_engine.agents._base import LocalAgent
from ocr_agentic_engine.errors import AgentOutputError
from ocr_agentic_engine.ocr_toolkit import OCRToolkit
from ocr_agentic_engine.types import AgenticCorrection, OCRBlock

InputT = TypeVar("InputT", bound=BaseModel)


def _budget_block() -> int:
    return int(os.getenv("ENGINE_AGENTIC_BUDGET_BLOCK", "3"))


def _timeout() -> int:
    return int(os.getenv("ENGINE_AGENTIC_TIMEOUT_SEC", "15"))


def budget_doc_block_cap(total_blocks: int) -> int:
    pct = float(os.getenv("ENGINE_AGENTIC_BUDGET_DOC_PCT", "20"))
    return max(1, int(total_blocks * pct / 100.0))


@dataclass
class FallbackContext:
    block: OCRBlock
    block_index: int
    toolkit: OCRToolkit
    run_dir: Path


class FallbackAgent(LocalAgent[InputT, AgenticCorrection], Generic[InputT]):
    """Base for ICR, HW-filter, kind-disambiguator, etc.

    Subclasses override :meth:`decide` to turn `(block, toolkit)` into an
    `AgenticCorrection`. The base class enforces budget, timeout and logging.
    """
    output_model = AgenticCorrection

    def run_block(self, ctx: FallbackContext) -> AgenticCorrection:
        used_before = len(ctx.toolkit.call_log)
        try:
            with _wall_timeout(_timeout()):
                decision = self.decide(ctx)
        except TimeoutError:
            decision = AgenticCorrection(
                block_index=ctx.block_index,
                confidence_after=ctx.block.confidence,
                toolkit_calls=ctx.toolkit.call_log[used_before:],
            )
        except AgentOutputError:
            decision = AgenticCorrection(
                block_index=ctx.block_index,
                confidence_after=ctx.block.confidence,
                toolkit_calls=ctx.toolkit.call_log[used_before:],
            )
        used = len(ctx.toolkit.call_log) - used_before
        if used > _budget_block():
            # over-budget → discard mutation, keep deterministic result.
            decision = AgenticCorrection(
                block_index=ctx.block_index,
                confidence_after=ctx.block.confidence,
                toolkit_calls=ctx.toolkit.call_log[used_before:],
            )
        _append_jsonl(ctx.run_dir, self.name, ctx.block_index, decision)
        return decision

    def decide(self, ctx: FallbackContext) -> AgenticCorrection:     # pragma: no cover
        raise NotImplementedError


def _append_jsonl(run_dir: Path, agent_name: str, block_index: int, decision: AgenticCorrection) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    line = json.dumps({
        "block": block_index,
        "agent": agent_name,
        "decision": decision.model_dump(mode="json"),
    }, default=str)
    with (run_dir / ".agentic.jsonl").open("a") as fp:
        fp.write(line + "\n")


@contextmanager
def _wall_timeout(seconds: int):
    """SIGALRM-based timeout. Disabled on platforms without SIGALRM (Windows)."""
    has_alarm = hasattr(signal, "SIGALRM")
    old_handler: Any = None
    if has_alarm:
        def _raise(*_): raise TimeoutError(f"fallback agent exceeded {seconds}s")
        old_handler = signal.signal(signal.SIGALRM, _raise)
        signal.alarm(seconds)
    try:
        yield
    finally:
        if has_alarm:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
