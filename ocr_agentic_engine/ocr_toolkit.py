"""OCRToolkit — L1.5 deterministic adapter around PaddleOCR internals.

The agentic fallback (Phase 2+) calls these methods like a function library.
Every call can be logged via `ToolkitCallLog` so fallback decisions remain
reproducible. No LLM calls here — this layer is 100% deterministic.

Coordinate invariant: every `bbox` argument and every returned block is in
*page pixel space*. `nested_layout` remaps crop-relative coords back to
page coords before returning.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image

from ocr_agentic_engine.types import BlockKind, DocumentRepresentation, OCRBlock, PageImage, ToolkitCallLog

Box = tuple[int, int, int, int]


@dataclass
class RecognizedText:
    text: str
    confidence: float
    language: str | None = None


@dataclass
class OCRToolkit:
    doc: DocumentRepresentation
    structure: Any                              # PPStructureV3
    crops_dir: Path
    call_log: list[ToolkitCallLog] = field(default_factory=list)

    # --- public API --------------------------------------------------------

    def layout(self, page: int) -> list[OCRBlock]:
        self._log("layout", {"page": page})
        return [b for b in self.doc.blocks if b.page == page]

    def text(self, page: int, bbox: Box, lang: str | None = None,
              model: Literal["server", "mobile"] = "server") -> RecognizedText:
        self._log("text", {"page": page, "bbox": list(bbox), "lang": lang, "model": model})
        crop = self._crop_array(page, bbox)
        if crop is None:
            return RecognizedText(text="", confidence=0.0, language=None)
        return self._ocr_crop(crop, lang=lang)

    def handwriting_ocr(self, page: int, bbox: Box) -> RecognizedText:
        """Dedicated handwriting backbone. Flagged behind env var — returns empty until configured."""
        self._log("handwriting_ocr", {"page": page, "bbox": list(bbox)}, ok=False,
                    note="backbone not wired (Phase 1b)")
        return RecognizedText(text="", confidence=0.0)

    def icr(self, page: int, bbox: Box, charset: str | None = None) -> RecognizedText:
        """Character-level recognition for form fields. Falls back to generic OCR."""
        self._log("icr", {"page": page, "bbox": list(bbox), "charset": charset})
        rt = self.text(page, bbox)
        if charset:
            rt.text = "".join(c for c in rt.text if c in charset)
        return rt

    def detect_handwriting(self, page: int, bbox: Box) -> float:
        """0..1 probability. Stub until a VLM classifier is wired — returns 0.0."""
        self._log("detect_handwriting", {"page": page, "bbox": list(bbox)}, ok=False,
                    note="VLM backbone not wired (Phase 1b)")
        return 0.0

    def detect_language(self, text_or_bbox) -> str:
        """Langid on text; VLM fallback not yet wired."""
        self._log("detect_language", {"arg": str(text_or_bbox)[:80]})
        if isinstance(text_or_bbox, str):
            return _langid(text_or_bbox)
        page, bbox = text_or_bbox
        return _langid(self.text(page, bbox).text)

    def recognize_stamp(self, page: int, bbox: Box) -> str:
        """PP-Structure seal pipeline not currently enabled in app.py. Returns ''."""
        self._log("recognize_stamp", {"page": page, "bbox": list(bbox)}, ok=False,
                    note="seal recognition disabled in app lifespan")
        return ""

    def nested_layout(self, page: int, bbox: Box) -> list[OCRBlock]:
        """Re-run PP-Structure on a crop; remap coords back to page space."""
        self._log("nested_layout", {"page": page, "bbox": list(bbox)})
        arr = self._crop_array(page, bbox)
        if arr is None:
            return []
        x0, y0, _, _ = bbox
        nested: list[OCRBlock] = []
        for result in self.structure.predict(arr):
            scores = result.get("overall_ocr_res", {}).get("rec_scores") or []
            conf = float(sum(scores) / len(scores)) if scores else 0.0
            for i, b in enumerate(result.get("parsing_res_list", [])):
                if isinstance(b, dict):
                    bb = b["block_bbox"]; content = b.get("block_content", ""); label = b.get("block_label", "text")
                else:
                    bb = getattr(b, "bbox", None); content = getattr(b, "content", ""); label = getattr(b, "label", "text")
                bx0, by0, bx1, by1 = (int(v) for v in bb)
                nested.append(OCRBlock(
                    page=page,
                    bbox=(bx0 + x0, by0 + y0, bx1 + x0, by1 + y0),
                    text=str(content or ""),
                    confidence=max(0.0, min(1.0, conf)),
                    kind=_best_kind(label),
                    reading_order=i,
                ))
        return nested

    def crop(self, page: int, bbox: Box) -> Path:
        self._log("crop", {"page": page, "bbox": list(bbox)})
        self.crops_dir.mkdir(parents=True, exist_ok=True)
        x0, y0, x1, y1 = bbox
        out = self.crops_dir / f"p{page}_{x0}_{y0}_{x1}_{y1}.png"
        if out.exists():
            return out
        arr = self._crop_array(page, bbox)
        if arr is None:
            raise ValueError(f"bbox {bbox} out of bounds on page {page}")
        Image.fromarray(arr).save(out)
        return out

    # --- internals ---------------------------------------------------------

    def _page_image(self, page: int) -> PageImage | None:
        for p in self.doc.page_images:
            if p.page == page:
                return p
        return None

    def _crop_array(self, page: int, bbox: Box) -> np.ndarray | None:
        p = self._page_image(page)
        if p is None:
            return None
        x0, y0, x1, y1 = (int(v) for v in bbox)
        if x0 < 0 or y0 < 0 or x1 > p.width or y1 > p.height or x1 <= x0 or y1 <= y0:
            return None
        with Image.open(p.path) as im:
            return np.asarray(im.crop((x0, y0, x1, y1)).convert("RGB"))

    def _ocr_crop(self, arr: np.ndarray, lang: str | None = None) -> RecognizedText:
        texts: list[str] = []; scores: list[float] = []
        for result in self.structure.predict(arr):
            rec = result.get("overall_ocr_res", {})
            for t in rec.get("rec_texts") or []:
                texts.append(str(t))
            for s in rec.get("rec_scores") or []:
                scores.append(float(s))
        if not texts:
            return RecognizedText(text="", confidence=0.0, language=lang)
        return RecognizedText(text=" ".join(texts),
                                confidence=float(sum(scores) / len(scores)) if scores else 0.0,
                                language=lang)

    def _log(self, tool: str, args: dict, ok: bool = True, note: str = "") -> None:
        self.call_log.append(ToolkitCallLog(tool=tool, args=args, ok=ok, note=note))


def _langid(text: str) -> str:
    if not text.strip():
        return "en"
    try:
        import langid  # type: ignore
        return langid.classify(text)[0]
    except Exception:
        return "en"


def _best_kind(label: str) -> BlockKind:
    lbl = (label or "").lower()
    if "table" in lbl: return "table"
    if "figure" in lbl or "image" in lbl: return "figure"
    if "title" in lbl: return "title"
    if "list" in lbl: return "list"
    if "formula" in lbl: return "formula"
    return "text"
