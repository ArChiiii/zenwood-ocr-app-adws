"""Golden-authoring helper.

    uv run python -m ocr_agentic_engine.evals gold FIXTURE [--feature F]

Runs L1 OCR once on the fixture, writes two artefacts next to it:

1. **`<name>.golden.json`** — editable stub with per-block OCR text,
   placeholders for `category` / `handwriting_block_indices` / free-text
   `notes`. Edit this file; it's what the eval runner reads at score time.

2. **`<name>.annotated.png`** — first page rasterised with every block
   numbered and outlined so you can *see* which block-index corresponds to
   which region. This is the bottleneck-remover: for handwriting cases you
   read the numbers off this image and drop them into
   `handwriting_block_indices` in the JSON.

Rerunning `gold` on a fixture that already has a `.golden.json`:
- refreshes the annotated PNG
- re-dumps `_block_ocr` with whatever OCR currently says
- **preserves your edits** to `text`, `blocks`, `handwriting_block_indices`,
  `category`, `notes`

Golden JSON schema (all fields optional — omit the ones you don't care about):

    {
      "feature": "scan_conversion",        // informational, not required
      "text": "the full expected text",    // triggers `text_tree` metric
      "blocks": {"3": "corrected text"},   // triggers `per_block_ocr` metric
      "handwriting_block_indices": [7, 8], // → handwriting_bboxes metric
      "category": "invoice",               // triggers `classification_accuracy`
      "category_confidence_min": 0.7,
      "notes": "anything — free text"
    }
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from ocr_agentic_engine.ocr_stage import OCRStage
from ocr_agentic_engine.types import DocumentRepresentation

PRESERVE_KEYS = ("text", "blocks", "handwriting_block_indices",
                  "category", "category_confidence_min", "notes", "feature")


def _build_ocr_stage() -> OCRStage:
    from paddleocr import PPStructureV3
    structure = PPStructureV3(
        use_doc_orientation_classify=False, use_doc_unwarping=False,
        use_textline_orientation=False, use_seal_recognition=False,
        use_formula_recognition=False, use_chart_recognition=False,
    )
    return OCRStage(structure=structure)


def _golden_path(fixture: Path) -> Path:
    return fixture.with_suffix(fixture.suffix + ".golden.json")


def _annotated_path(fixture: Path) -> Path:
    return fixture.with_suffix(fixture.suffix + ".annotated.png")


def _load_existing(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        print(f"[gold] warning: could not parse existing {path.name}, overwriting")
        return {}


def _render_annotated_png(doc: DocumentRepresentation, out: Path) -> None:
    """Render the first page with block numbers + bboxes overlaid."""
    if not doc.page_images:
        return
    first_page = doc.page_images[0]
    with Image.open(first_page.path).convert("RGB") as im:
        draw = ImageDraw.Draw(im, "RGBA")
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", size=18)
        except OSError:
            font = ImageFont.load_default()
        for idx, b in enumerate(doc.blocks):
            if b.page != first_page.page:
                continue
            color = _color_for(b.kind)
            draw.rectangle(b.bbox, outline=color, width=3)
            label = f"{idx}:{b.kind[:3]}"
            x0, y0, _, _ = b.bbox
            # semi-transparent background for readability
            tw = len(label) * 10
            draw.rectangle((x0, max(0, y0 - 22), x0 + tw, y0), fill=(*color, 220))
            draw.text((x0 + 2, max(0, y0 - 22)), label, fill="white", font=font)
        im.save(out)


def _color_for(kind: str) -> tuple[int, int, int]:
    palette = {
        "title": (220, 50, 50), "text": (60, 140, 220), "table": (40, 180, 80),
        "figure": (200, 120, 40), "list": (140, 80, 200), "stamp": (220, 40, 180),
        "header": (120, 120, 120), "footer": (120, 120, 120),
    }
    return palette.get(kind, (100, 100, 100))


def write_stub(fixture: Path, feature: str | None = None, tmp_root: Path | None = None) -> dict[str, Path]:
    tmp_root = tmp_root or Path(os.getenv("ENGINE_TMP_ROOT", "/tmp/engine-tmp"))
    tmp_root.mkdir(parents=True, exist_ok=True)

    print(f"[gold] loading PaddleOCR (first run downloads models)...")
    stage = _build_ocr_stage()
    print(f"[gold] running OCR on {fixture.name}")
    doc = stage.run(fixture, tmp_root)

    golden_path = _golden_path(fixture)
    annotated_path = _annotated_path(fixture)

    existing = _load_existing(golden_path)
    stub: dict[str, Any] = {
        "_fixture": str(_rel(fixture)),
        "_page_count": doc.page_count,
        "_block_count": len(doc.blocks),
        "feature": existing.get("feature", feature),
        "text": existing.get("text", ""),
        "blocks": existing.get("blocks", {}),
        "handwriting_block_indices": existing.get("handwriting_block_indices", []),
        "category": existing.get("category"),
        "category_confidence_min": existing.get("category_confidence_min", 0.5),
        "notes": existing.get("notes", ""),
        # informational — what OCR currently says, for the human to spot-check.
        "_block_ocr": {
            str(i): {
                "page": b.page, "kind": b.kind, "bbox": list(b.bbox),
                "confidence": round(b.confidence, 3), "text": b.text,
            } for i, b in enumerate(doc.blocks)
        },
    }
    # Preserve only whitelisted keys from any prior edits the user made beyond these.
    for k, v in existing.items():
        if k in PRESERVE_KEYS and k not in stub:
            stub[k] = v

    golden_path.write_text(json.dumps(stub, indent=2, ensure_ascii=False))
    _render_annotated_png(doc, annotated_path)

    print(f"[gold] wrote {_rel(golden_path)}")
    print(f"[gold] wrote {_rel(annotated_path)}")
    print(f"[gold] blocks={len(doc.blocks)} pages={doc.page_count}")
    print(f"[gold] next: edit the .golden.json (set `text`, `category`, "
          f"`handwriting_block_indices`) then rerun the eval harness.")
    return {"golden": golden_path, "annotated": annotated_path}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _rel(p: Path) -> str:
    p = p.resolve()
    try:
        return str(p.relative_to(_repo_root()))
    except ValueError:
        return str(p)


def load_golden(fixture: Path) -> dict[str, Any]:
    """Loaded by runner at score-time. Returns {} if no stub exists."""
    p = _golden_path(fixture)
    if not p.exists():
        return {}
    raw = json.loads(p.read_text())
    # Strip leading-underscore informational fields — only scorer-relevant keys survive.
    golden = {k: v for k, v in raw.items() if k in PRESERVE_KEYS}
    # Convert block_indices → bboxes by reading `_block_ocr` (we cached bbox there).
    if "handwriting_block_indices" in golden and raw.get("_block_ocr"):
        bboxes = []
        for i in golden["handwriting_block_indices"]:
            entry = raw["_block_ocr"].get(str(i))
            if entry:
                bboxes.append(tuple(entry["bbox"]))
        if bboxes:
            golden["handwriting_bboxes"] = bboxes
    # Blocks dict: JSON keys are strings; score_case expects ints.
    if "blocks" in golden:
        golden["blocks"] = {int(k): v for k, v in golden["blocks"].items()}
    return golden


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ocr_agentic_engine.evals.gold")
    p.add_argument("fixture", type=Path, help="path to a fixture file (PDF/PNG/JPG)")
    p.add_argument("--feature", choices=[
        "scan_conversion", "classification", "comparison", "handwriting_removal"],
        help="record the intended feature in the stub (informational)")
    args = p.parse_args(argv)
    if not args.fixture.exists():
        print(f"[gold] not found: {args.fixture}", file=sys.stderr)
        return 2
    write_stub(args.fixture, feature=args.feature)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
