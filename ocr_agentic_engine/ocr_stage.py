"""OCR stage — self-contained PDF rasterisation + PaddleOCR structure parse + sha256 cache."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from ocr_agentic_engine.errors import OCRError
from ocr_agentic_engine.types import BlockKind, Cell, DocumentRepresentation, OCRBlock, PageImage

_MAX_PDF_PAGES = 50


def _cache_enabled() -> bool:
    return os.getenv("ENGINE_OCR_CACHE", "1") != "0"


def _cache_dir() -> Path:
    return Path(os.getenv("ENGINE_OCR_CACHE_DIR", "ocr_agentic_engine/.ocr_cache"))


def _pdf_to_pages(pdf_bytes: bytes, scale: float = 2.0) -> list[np.ndarray]:
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(pdf_bytes)
    if len(doc) > _MAX_PDF_PAGES:
        doc.close()
        raise ValueError(f"PDF exceeds {_MAX_PDF_PAGES}-page limit")
    pages: list[np.ndarray] = []
    try:
        for page in doc:
            bitmap = page.render(scale=scale, rotation=0)
            pages.append(bitmap.to_numpy()[:, :, :3].copy())
            page.close()
    finally:
        doc.close()
    return pages


def _image_bytes_to_page(data: bytes) -> np.ndarray:
    import cv2
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode image")
    return img


def _normalise_kind(raw: str) -> BlockKind:
    raw = (raw or "").lower()
    if "table" in raw: return "table"
    if "figure" in raw or "image" in raw or "chart" in raw: return "figure"
    if "formula" in raw or "equation" in raw: return "formula"
    if "stamp" in raw or "seal" in raw: return "stamp"
    if "header" in raw: return "header"
    if "footer" in raw: return "footer"
    if "list" in raw: return "list"
    if "title" in raw: return "title"
    if "text" in raw or "paragraph" in raw: return "text"
    return "unknown"


def _extract_cells(b) -> list[Cell] | None:
    """Best-effort extraction of PP-Structure table cells. Returns None if unavailable."""
    raw_cells = None
    if isinstance(b, dict):
        raw_cells = b.get("cells") or b.get("table_cells") or b.get("block_cells")
    else:
        raw_cells = getattr(b, "cells", None) or getattr(b, "table_cells", None)
    if not raw_cells:
        return None
    cells: list[Cell] = []
    for rc in raw_cells:
        if isinstance(rc, dict):
            bbox = rc.get("bbox") or rc.get("cell_bbox")
            if bbox is None:
                continue
            cells.append(Cell(
                row=int(rc.get("row", rc.get("row_index", 0))),
                col=int(rc.get("col", rc.get("col_index", 0))),
                row_span=int(rc.get("row_span", 1)),
                col_span=int(rc.get("col_span", 1)),
                bbox=tuple(int(v) for v in bbox),
                text=str(rc.get("text", rc.get("content", "")) or ""),
            ))
    return cells or None


class OCRStage:
    def __init__(self, structure: Any):
        self.structure = structure

    def run(self, file_path: Path, run_tmp: Path) -> DocumentRepresentation:
        file_bytes = file_path.read_bytes()
        file_id = hashlib.sha256(file_bytes).hexdigest()
        if _cache_enabled():
            hit = self._read_cache(file_id)
            if hit is not None:
                return hit

        try:
            pages = (_pdf_to_pages(file_bytes) if file_path.suffix.lower() == ".pdf"
                     else [_image_bytes_to_page(file_bytes)])
        except Exception as e:
            raise OCRError(stage="ocr", message=f"unreadable: {file_path.name}", cause=e) from e

        if not pages:
            raise OCRError(stage="ocr", message="no pages produced")

        pages_root = (_cache_dir() / file_id / "pages") if _cache_enabled() else (run_tmp / "pages")
        pages_root.mkdir(parents=True, exist_ok=True)

        page_images: list[PageImage] = []
        blocks: list[OCRBlock] = []
        for idx, arr in enumerate(pages):
            img_path = pages_root / f"{idx}.png"
            rgb = arr[:, :, ::-1] if arr.ndim == 3 else arr
            Image.fromarray(rgb).save(img_path)
            page_images.append(PageImage(page=idx, path=img_path,
                                          width=int(arr.shape[1]), height=int(arr.shape[0])))
            for result in self.structure.predict(arr):
                scores = result.get("overall_ocr_res", {}).get("rec_scores") or []
                conf = float(sum(scores) / len(scores)) if scores else 0.0
                for b in result.get("parsing_res_list", []):
                    if isinstance(b, dict):
                        bbox = b["block_bbox"]
                        content = b.get("block_content", "")
                        label = b.get("block_label", "text")
                    else:
                        bbox = getattr(b, "bbox", None)
                        content = getattr(b, "content", "")
                        label = getattr(b, "label", "text")
                    kind = _normalise_kind(label)
                    blocks.append(OCRBlock(
                        page=idx, bbox=tuple(int(v) for v in bbox),
                        text=str(content or ""),
                        confidence=max(0.0, min(1.0, conf)),
                        kind=kind,
                        reading_order=len(blocks),
                        table_cells=_extract_cells(b) if kind == "table" else None,
                    ))

        doc = DocumentRepresentation(
            file_id=file_id, source_path=file_path, page_count=len(pages),
            blocks=blocks, page_images=page_images,
            raw_text="\n\n".join(b.text for b in blocks if b.text.strip()),
        )
        if _cache_enabled():
            self._write_cache(doc)
        return doc

    @staticmethod
    def _read_cache(file_id: str):
        p = _cache_dir() / f"{file_id}.json"
        if not p.exists():
            return None
        try:
            return DocumentRepresentation.model_validate_json(p.read_text())
        except Exception:
            return None

    @staticmethod
    def _write_cache(doc: DocumentRepresentation) -> None:
        root = _cache_dir(); root.mkdir(parents=True, exist_ok=True)
        (root / f"{doc.file_id}.json").write_text(doc.model_dump_json())
