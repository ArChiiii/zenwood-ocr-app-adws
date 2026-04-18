"""icr_corrector — fallback agent for low-confidence blocks.

Runs only when `gates.agent_for(block) == "icr_corrector"`. Asks the LLM for a
corrected string given the block crop and the original OCR text. Output is
stored in `Annotations.corrections[block_index]` — L1.text stays untouched.
"""
from __future__ import annotations

from pydantic import BaseModel

from ocr_agentic_engine.agents._base import AgentContext
from ocr_agentic_engine.agents._fallback import FallbackAgent, FallbackContext
from ocr_agentic_engine.agents.models import agent_model
from ocr_agentic_engine.types import AgenticCorrection


class _In(BaseModel):
    original_text: str
    confidence: float


_SYSTEM = (
    "You are ICRCorrectorAgent. You receive the current OCR result for one block plus "
    "a page crop showing the region. Return a corrected transcription as a single JSON "
    "object matching the schema. Do NOT invent content — if the crop is unreadable, "
    "leave corrected_text=null and set confidence_after to the input confidence."
)


class ICRCorrectorAgent(FallbackAgent[_In]):
    name = "icr_corrector"
    model = agent_model("extractor")   # text + vision model
    system_prompt = _SYSTEM
    output_model = AgenticCorrection

    def decide(self, ctx: FallbackContext) -> AgenticCorrection:
        self._ctx = ctx
        self.tools = []
        result = self.run(_In(original_text=ctx.block.text, confidence=ctx.block.confidence))
        # Force block_index to the one we're fixing (LLM may hallucinate a different one).
        result.block_index = ctx.block_index
        return result

    def _build_messages(self, inp: _In) -> list[dict]:
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "user",
             "content": f"current OCR text (conf={inp.confidence:.2f}):\n---\n{inp.original_text}\n---"},
        ]

    def _resolve_context(self, inp: _In) -> AgentContext:
        ctx = self._ctx
        try:
            crop_path = ctx.toolkit.crop(ctx.block.page, ctx.block.bbox)
            return AgentContext(images=[str(crop_path)])
        except Exception:
            return AgentContext()
