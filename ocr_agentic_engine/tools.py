"""Agent tools (spec §4.5)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from PIL import Image

from ocr_agentic_engine.types import DocumentRepresentation


@dataclass
class AgentTool:
    name: str
    fn: Callable[..., Any]
    schema: dict


def build_tools(doc: DocumentRepresentation, run_tmp: Path) -> dict[str, AgentTool]:
    pages_by_idx = {p.page: p for p in doc.page_images}
    crops_dir = run_tmp / "crops"

    def render_page_image(page: int):
        p = pages_by_idx.get(page)
        return {"error": f"page {page} unknown"} if p is None else str(p.path)

    def get_blocks_on_page(page: int):
        return [b.model_dump() for b in doc.blocks if b.page == page]

    def crop_region(page: int, bbox):
        p = pages_by_idx.get(page)
        if p is None:
            return {"error": f"page {page} unknown"}
        x0, y0, x1, y1 = (int(v) for v in bbox)
        if x0 < 0 or y0 < 0 or x1 > p.width or y1 > p.height or x1 <= x0 or y1 <= y0:
            return {"error": f"bbox {bbox} out of bounds for {(p.width, p.height)}"}
        crops_dir.mkdir(parents=True, exist_ok=True)
        out = crops_dir / f"p{page}_{x0}_{y0}_{x1}_{y1}.png"
        with Image.open(p.path) as im:
            im.crop((x0, y0, x1, y1)).save(out)
        return str(out)

    def _sch(name, props, required):
        return {"type": "function", "function": {"name": name, "description": name,
                 "parameters": {"type": "object", "properties": props, "required": required}}}

    return {
        "render_page_image": AgentTool("render_page_image", render_page_image,
                                        _sch("render_page_image", {"page": {"type": "integer"}}, ["page"])),
        "get_blocks_on_page": AgentTool("get_blocks_on_page", get_blocks_on_page,
                                         _sch("get_blocks_on_page", {"page": {"type": "integer"}}, ["page"])),
        "crop_region": AgentTool("crop_region", crop_region,
                                  _sch("crop_region", {"page": {"type": "integer"},
                                        "bbox": {"type": "array", "items": {"type": "integer"}}},
                                        ["page", "bbox"])),
    }
