"""HTML reflow renderer — first-class flexible output (preferred for styling).

Emits semantic tags driven by L2 annotations. Every element carries
`data-block-index` + `data-page` so downstream tools can trace back to L1.

Figures are embedded as `<img>` with base64 data URIs so the output is a
single self-contained HTML file. Consumers can swap to external paths by
post-processing; no config in v1.
"""
from __future__ import annotations

import base64
import html
from io import BytesIO

from PIL import Image

from ocr_agentic_engine.renderers._ordering import iter_blocks
from ocr_agentic_engine.types import Annotations, DocumentRepresentation, OCRBlock

_STYLES = """
body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; }
h1, h2, h3 { margin-top: 1.4em; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #ccc; padding: 4px 8px; }
.list { padding-left: 1.2em; }
figure img { max-width: 100%; border: 1px solid #ddd; }
.redacted { color: #bbb; font-style: italic; }
"""


def render_html_reflow(doc: DocumentRepresentation, ann: Annotations) -> bytes:
    parts: list[str] = ["<!doctype html>",
                        "<html lang=\"" + html.escape(ann.language or "en") + "\">",
                        "<head><meta charset=\"utf-8\">",
                        "<style>" + _STYLES + "</style></head><body>"]

    if ann.title is not None and 0 <= ann.title < len(doc.blocks):
        parts.append(_tag("h1", doc, ann, ann.title))

    current_list_id: int | None = None
    for idx, b in iter_blocks(doc, ann, redact_handwritten=False):
        if idx == ann.title:
            continue  # already emitted
        if idx in ann.handwritten:
            parts.append(f'<p class="redacted" data-block-index="{idx}" data-page="{b.page}">[handwritten content redacted]</p>')
            continue

        list_id = ann.lists.get(idx)
        if list_id != current_list_id:
            if current_list_id is not None:
                parts.append("</ul>")
            if list_id is not None:
                parts.append("<ul class=\"list\">")
            current_list_id = list_id

        if list_id is not None:
            parts.append(_tag("li", doc, ann, idx))
        elif idx in ann.headings:
            lvl = min(3, max(1, ann.headings[idx]))
            parts.append(_tag(f"h{lvl + 1}", doc, ann, idx))  # +1 because <h1> is title
        elif b.kind == "table":
            parts.append(_table(b, idx))
        elif b.kind == "figure":
            parts.append(_figure(doc, idx, b))
        elif b.kind in ("header", "footer"):
            parts.append(_tag("small", doc, ann, idx))
        else:
            parts.append(_tag("p", doc, ann, idx))

    if current_list_id is not None:
        parts.append("</ul>")
    parts.append("</body></html>")
    return "\n".join(parts).encode("utf-8")


def _tag(name: str, doc: DocumentRepresentation, ann: Annotations, idx: int) -> str:
    b = doc.blocks[idx]
    text = html.escape(ann.corrections.get(idx, b.text))
    return f'<{name} data-block-index="{idx}" data-page="{b.page}">{text}</{name}>'


def _table(b: OCRBlock, idx: int) -> str:
    if not b.table_cells:
        return f'<pre data-block-index="{idx}" data-page="{b.page}">{html.escape(b.text)}</pre>'
    rows: dict[int, dict[int, str]] = {}
    for c in b.table_cells:
        rows.setdefault(c.row, {})[c.col] = c.text
    lines = [f'<table data-block-index="{idx}" data-page="{b.page}">']
    for r in sorted(rows):
        lines.append("<tr>" + "".join(
            f"<td>{html.escape(rows[r].get(c, ''))}</td>" for c in sorted(rows[r])) + "</tr>")
    lines.append("</table>")
    return "\n".join(lines)


def _figure(doc: DocumentRepresentation, idx: int, b) -> str:
    pi = next((p for p in doc.page_images if p.page == b.page), None)
    if pi is None:
        return f'<figure data-block-index="{idx}" data-page="{b.page}"></figure>'
    try:
        with Image.open(pi.path) as im:
            x0, y0, x1, y1 = b.bbox
            crop = im.crop((max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1)))
            buf = BytesIO(); crop.save(buf, format="PNG")
            data = base64.b64encode(buf.getvalue()).decode("ascii")
        return (f'<figure data-block-index="{idx}" data-page="{b.page}">'
                f'<img src="data:image/png;base64,{data}" alt=""></figure>')
    except Exception:
        return f'<figure data-block-index="{idx}" data-page="{b.page}"></figure>'
