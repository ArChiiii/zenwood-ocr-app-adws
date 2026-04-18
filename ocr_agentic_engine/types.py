"""Pydantic v2 data contracts.

Layered per the L1/L2/L3 architecture:

* **L1 (geometry, deterministic):** `OCRBlock`, `PageImage`, `DocumentRepresentation`.
* **L2 (semantics, LLM annotators):** `Annotations` — every field references
  L1 blocks *by index*. Annotators never emit new text into the render path.
* **L3 (renderers, deterministic):** `FormattedResult`.
* **L1.5 fallback:** `AgenticCorrection`, `ToolkitCallLog` for agentic repairs.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

BlockKind = Literal[
    "text", "title", "table", "figure", "formula",
    "list", "stamp", "header", "footer", "unknown",
]


class Cell(BaseModel):
    row: int
    col: int
    row_span: int = 1
    col_span: int = 1
    bbox: tuple[int, int, int, int]
    text: str = ""


class OCRBlock(BaseModel):
    page: int
    bbox: tuple[int, int, int, int]
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    kind: BlockKind
    reading_order: int = 0
    table_cells: list[Cell] | None = None


class PageImage(BaseModel):
    page: int
    path: Path
    width: int
    height: int


class DocumentRepresentation(BaseModel):
    file_id: str
    source_path: Path
    page_count: int
    blocks: list[OCRBlock]
    page_images: list[PageImage]
    raw_text: str


# --- L2 --------------------------------------------------------------------

class Section(BaseModel):
    start: int
    end: int
    title_index: int | None = None


_CATEGORY = Literal[
    "invoice", "receipt", "contract", "id_document",
    "form", "letter", "report", "handwritten_note", "other",
]


class Classification(BaseModel):
    category: _CATEGORY
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str


class ToolkitCallLog(BaseModel):
    tool: str
    args: dict = {}
    ok: bool = True
    note: str = ""


class AgenticCorrection(BaseModel):
    block_index: int
    corrected_text: str | None = None
    new_kind: BlockKind | None = None
    split_into: list[OCRBlock] | None = None
    redact: bool = False
    confidence_after: float = 0.0
    toolkit_calls: list[ToolkitCallLog] = []


class Annotations(BaseModel):
    headings: dict[int, int] = {}
    sections: list[Section] = []
    lists: dict[int, int] = {}
    corrections: dict[int, str] = {}
    handwritten: set[int] = set()
    title: int | None = None
    language: str = "en"
    classification: Classification | None = None
    agentic: list[AgenticCorrection] = []


# --- L3 --------------------------------------------------------------------

class FormattedResult(BaseModel):
    output_url: str
    mime_type: str
    bytes_size: int


# --- Feature-level results -------------------------------------------------

class ComparisonNarrative(BaseModel):
    summary: str
    additions: list[str]
    deletions: list[str]
    modifications: list[str]


class Comparison(BaseModel):
    summary: str
    additions: list[str]
    deletions: list[str]
    modifications: list[str]
    diff_html: str


class HandwritingReport(BaseModel):
    has_handwriting: bool
    affected_pages: list[int]
    affected_blocks: list[OCRBlock]
    rationale: str


# --- Legacy (retired at Phase 5 — kept so ExtractorAgent + tests still build) ---

class CleanSection(BaseModel):
    heading: str | None
    body: str
    page_range: tuple[int, int]


class CleanDoc(BaseModel):
    title: str | None
    sections: list[CleanSection]
    language: str
    notes: str


Feature = Literal["scan_conversion", "classification", "comparison", "handwriting_removal"]
OutputFormat = Literal["pdf", "docx", "txt", "html", "xlsx", "pptx"]


class EngineResult(BaseModel):
    feature: Feature
    document: DocumentRepresentation
    annotations: Annotations | None = None
    clean_doc: CleanDoc | None = None
    classification: Classification | None = None
    comparison: Comparison | None = None
    handwriting: HandwritingReport | None = None
    formatted: FormattedResult | None = None
