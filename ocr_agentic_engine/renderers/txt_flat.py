"""TXT flat renderer.

Walks blocks in reading_order, adds light markers for structure (headings
become `# `/`## `/`### `, list items `- `, tables pipe-separated, figures
skipped). No external deps.
"""
from __future__ import annotations

from ocr_agentic_engine.renderers._ordering import iter_blocks
from ocr_agentic_engine.types import Annotations, DocumentRepresentation


def render_txt_flat(doc: DocumentRepresentation, ann: Annotations) -> bytes:
    out: list[str] = []
    for idx, b in iter_blocks(doc, ann, redact_handwritten=True):
        text = ann.corrections.get(idx, b.text)
        if idx in ann.headings:
            out.append("#" * ann.headings[idx] + " " + text.strip())
        elif idx in ann.lists:
            out.append("- " + text.strip())
        elif b.kind == "table" and b.table_cells:
            rows: dict[int, dict[int, str]] = {}
            for c in b.table_cells:
                rows.setdefault(c.row, {})[c.col] = c.text
            for r in sorted(rows):
                cells = [rows[r].get(c, "") for c in sorted(rows[r])]
                out.append(" | ".join(cells))
        elif b.kind == "figure":
            continue
        elif b.kind in ("header", "footer"):
            out.append(text.strip())
        else:
            out.append(text)
    return "\n\n".join(x for x in out if x).encode("utf-8")
