"""Engine — L1 OCR + feature dispatch on the new L1/L2/L3 pipeline.

The monolithic `ExtractorAgent → FormatterStage` path from the original
engine_backend has been retired. Feature compositions live in `pipeline.py`:

    L1 (OCR)  →  [L2 annotators]  →  L3 renderer(format)

The SSE event protocol is unchanged so existing frontends keep working.
"""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any, Iterator

from ocr_agentic_engine import pipeline
from ocr_agentic_engine.agents.annotators import (
    HandwritingFilterAgent, HeadingClassifierAgent, ICRCorrectorAgent, ListDetectorAgent,
)
from ocr_agentic_engine.agents.classifier import ClassifierAgent
from ocr_agentic_engine.agents.comparator import ComparatorAgent
from ocr_agentic_engine.client import OllamaClientProtocol
from ocr_agentic_engine.errors import EngineError, InputValidationError
from ocr_agentic_engine.ocr_stage import OCRStage
from ocr_agentic_engine.pipeline import PipelineDeps, event
from ocr_agentic_engine.types import Feature

SSEEvent = str


class Engine:
    def __init__(self, ollama: OllamaClientProtocol, tmp_root: Path,
                 downloads_root: Path, structure: Any,
                 model_overrides: dict[str, str] | None = None):
        self.tmp_root = tmp_root
        self.downloads_root = downloads_root
        self.ocr_stage = OCRStage(structure=structure)
        ov = model_overrides or {}
        self.deps = PipelineDeps(
            classifier=ClassifierAgent(ollama, model_override=ov.get("classifier")),
            comparator=ComparatorAgent(ollama, model_override=ov.get("comparator")),
            handwriting_filter=HandwritingFilterAgent(ollama, model_override=ov.get("handwriting_detector")),
            icr_corrector=ICRCorrectorAgent(ollama, model_override=ov.get("icr_corrector")),
            heading_classifier=HeadingClassifierAgent(),
            list_detector=ListDetectorAgent(),
            structure=structure,
            downloads_root=downloads_root,
            tmp_root=tmp_root,
        )

    def run(self, feature: Feature, files: list[Path], options: dict) -> Iterator[SSEEvent]:
        run_id = uuid.uuid4().hex
        run_tmp = self.tmp_root / run_id; run_tmp.mkdir(parents=True, exist_ok=True)
        run_download = self.downloads_root / run_id
        failed = False
        try:
            yield event("run_started", {"run_id": run_id, "feature": feature})

            yield event("stage_started", {"stage": "ocr"})
            docs = [self.ocr_stage.run(f, run_tmp) for f in files]
            yield event("stage_finished", {"stage": "ocr",
                                             "page_counts": [d.page_count for d in docs]})

            yield from self._dispatch(feature, docs, options, run_id)
        except EngineError as e:
            failed = True
            yield event("run_failed", {"stage": e.stage, "error_type": type(e).__name__, "message": str(e)})
        finally:
            shutil.rmtree(run_tmp, ignore_errors=True)
            if failed:
                shutil.rmtree(run_download, ignore_errors=True)

    def _dispatch(self, feature, docs, options, run_id):
        if feature == "scan_conversion":
            yield from pipeline.run_scan_conversion(docs[0], options, run_id, self.deps); return
        if feature == "classification":
            yield from pipeline.run_classification(docs[0], options, run_id, self.deps); return
        if feature == "comparison":
            if len(docs) != 2:
                raise InputValidationError(stage="router",
                                            message=f"comparison requires 2 files, got {len(docs)}")
            yield from pipeline.run_comparison(docs, options, run_id, self.deps); return
        if feature == "handwriting_removal":
            yield from pipeline.run_handwriting_removal(docs[0], options, run_id, self.deps); return
        raise InputValidationError(stage="router", message=f"unsupported feature: {feature}")
