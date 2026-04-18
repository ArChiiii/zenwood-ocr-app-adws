"""ClassifierAgent — DocumentRepresentation + CleanDoc → Classification (spec §5.4).

Uses the Python-resolved context workflow: we pre-render the first page image
and inline block metadata, so no Ollama tool-calling is required (qwen2.5vl
doesn't support it).
"""
from __future__ import annotations

import json
import os

from pydantic import BaseModel

from ocr_agentic_engine.agents._base import AgentContext, LocalAgent
from ocr_agentic_engine.agents.models import agent_model
from ocr_agentic_engine.tools import build_tools
from ocr_agentic_engine.types import Classification, CleanDoc, DocumentRepresentation


class _In(BaseModel):
    doc: DocumentRepresentation
    clean_doc: CleanDoc


_SYSTEM = (
    "You are ClassifierAgent. Label the document as one of invoice, receipt, contract, id_document, "
    "form, letter, report, handwritten_note, other. The first page image and block metadata are "
    "attached — inspect them directly. Respond with a single JSON object matching the schema."
)


class ClassifierAgent(LocalAgent[_In, Classification]):
    name = "classifier"
    model = agent_model("classifier")
    system_prompt = _SYSTEM
    output_model = Classification

    def classify(self, doc: DocumentRepresentation, clean_doc: CleanDoc) -> Classification:
        if os.getenv("ENGINE_USE_NATIVE_TOOLS") == "1" and doc.page_images:
            tools = build_tools(doc, doc.page_images[0].path.parent)
            self.tools = [tools["render_page_image"], tools["get_blocks_on_page"]]
        else:
            self.tools = []
        return self.run(_In(doc=doc, clean_doc=clean_doc))

    def _build_messages(self, inp: _In) -> list[dict]:
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "user",
             "content": (f"title={inp.clean_doc.title or '(none)'} pages={inp.doc.page_count} "
                          f"lang={inp.clean_doc.language}\n"
                          f"raw_text_preview:\n---\n{inp.doc.raw_text[:1500]}\n---")},
        ]

    def _resolve_context(self, inp: _In) -> AgentContext:
        doc = inp.doc
        if not doc.page_images:
            return AgentContext()
        tools = build_tools(doc, doc.page_images[0].path.parent)
        img = tools["render_page_image"].fn(page=0)
        blocks = tools["get_blocks_on_page"].fn(page=0)
        images = [img] if isinstance(img, str) else []
        notes = f"page 0 blocks (from get_blocks_on_page):\n{json.dumps(blocks)[:2000]}"
        return AgentContext(images=images, notes=notes)
