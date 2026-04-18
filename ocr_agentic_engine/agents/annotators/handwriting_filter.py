"""handwriting_filter — index-only replacement for legacy HandwritingDetectorAgent.

Reuses the VLM-based detection from the old agent but emits `set[int]` of
block indices instead of regenerated bboxes. This is the L2-compliant shape
(the renderer reads indices; no LLM output reaches the canvas).
"""
from __future__ import annotations

import os

from pydantic import BaseModel

from ocr_agentic_engine.agents._base import AgentContext, LocalAgent
from ocr_agentic_engine.agents.models import agent_model
from ocr_agentic_engine.tools import build_tools
from ocr_agentic_engine.types import DocumentRepresentation


class _Out(BaseModel):
    handwritten_block_indices: list[int] = []
    rationale: str = ""


_SYSTEM = (
    "You are HandwritingFilterAgent. Inspect the attached page images and the listed "
    "block metadata. Return the **indices** (0-based, matching the order given) of blocks "
    "whose content is handwritten. Emit no new text. Return a single JSON object matching "
    "the schema."
)


class HandwritingFilterAgent(LocalAgent[DocumentRepresentation, _Out]):
    name = "handwriting_filter"
    model = agent_model("handwriting_detector")
    system_prompt = _SYSTEM
    output_model = _Out

    def annotate(self, doc: DocumentRepresentation) -> set[int]:
        if os.getenv("ENGINE_USE_NATIVE_TOOLS") == "1" and doc.page_images:
            self.tools = list(build_tools(doc, doc.page_images[0].path.parent).values())
        else:
            self.tools = []
        out = self.run(doc)
        total = len(doc.blocks)
        return {i for i in out.handwritten_block_indices if 0 <= i < total}

    def _build_messages(self, inp: DocumentRepresentation) -> list[dict]:
        block_lines = "\n".join(
            f"[{i}] p{b.page} bbox={b.bbox} kind={b.kind} text={b.text[:60]!r}"
            for i, b in enumerate(inp.blocks[:80])
        )
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "user",
             "content": f"pages={inp.page_count} blocks={len(inp.blocks)}\nfirst 80 blocks:\n{block_lines}"},
        ]

    def _resolve_context(self, inp: DocumentRepresentation) -> AgentContext:
        if not inp.page_images:
            return AgentContext()
        tools = build_tools(inp, inp.page_images[0].path.parent)
        render = tools["render_page_image"].fn
        images: list[str] = []
        for p in inp.page_images:
            out = render(page=p.page)
            if isinstance(out, str):
                images.append(out)
        return AgentContext(images=images)
