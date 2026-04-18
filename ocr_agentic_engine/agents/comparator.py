"""ComparatorAgent — narrates a pre-computed diff (spec §5.4)."""
from __future__ import annotations

from pydantic import BaseModel

from ocr_agentic_engine.agents._base import LocalAgent
from ocr_agentic_engine.agents.models import agent_model
from ocr_agentic_engine.types import CleanDoc, ComparisonNarrative


class _In(BaseModel):
    a: CleanDoc
    b: CleanDoc
    diff_html: str


_SYSTEM = (
    "You are ComparatorAgent. You DO NOT compute the diff — it is given to you. "
    "Narrate what changed. Return a single JSON object matching the schema."
)


class ComparatorAgent(LocalAgent[_In, ComparisonNarrative]):
    name = "comparator"
    model = agent_model("comparator")
    system_prompt = _SYSTEM
    output_model = ComparisonNarrative
    tools = []

    def compare(self, a: CleanDoc, b: CleanDoc, diff_html: str) -> ComparisonNarrative:
        return self.run(_In(a=a, b=b, diff_html=diff_html))

    def _build_messages(self, inp: _In) -> list[dict]:
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"DOCUMENT A (title={inp.a.title}):\n{_serialise(inp.a)}"},
            {"role": "user", "content": f"DOCUMENT B (title={inp.b.title}):\n{_serialise(inp.b)}"},
            {"role": "user", "content": f"PRE-COMPUTED DIFF:\n{inp.diff_html[:8000]}"},
        ]


def _serialise(d: CleanDoc) -> str:
    return "\n\n".join(
        (f"# {s.heading}\n{s.body}" if s.heading else s.body) for s in d.sections
    ) or (d.title or "")
