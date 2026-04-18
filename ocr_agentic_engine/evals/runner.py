"""Eval runner CLI.

Usage:

    uv run python -m ocr_agentic_engine.evals run --feature scan_conversion --format html
    uv run python -m ocr_agentic_engine.evals run --all

Writes JSONL report to `ocr_agentic_engine/.evals/<UTC-timestamp>/report.jsonl`
and a human summary to `summary.md`.

The runner is pipeline-agnostic: it takes a *callable* (feature, files, options)
→ (DocumentRepresentation, Annotations | None, bytes | None) and scores the
result. The legacy monolith and the new L1/L2/L3 stack both plug in via the
same interface so baselines and post-rewrite numbers are directly comparable.
"""
from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ocr_agentic_engine.types import Annotations, DocumentRepresentation

from . import metrics

ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = ROOT / "ocr_agentic_engine" / "tests" / "fixtures"
RESULTS_ROOT = ROOT / "ocr_agentic_engine" / ".evals"

PipelineFn = Callable[
    [str, list[Path], dict],
    tuple[DocumentRepresentation, "Annotations | None", "bytes | None"],
]


@dataclass
class EvalCase:
    feature: str
    name: str
    files: list[Path]
    options: dict = field(default_factory=dict)
    golden: dict = field(default_factory=dict)   # {"text": str, "headings": [...], ...}


@dataclass
class EvalResult:
    case: EvalCase
    ms: float
    scores: dict[str, dict[str, Any]]
    error: str | None = None


def discover_cases(feature: str) -> list[EvalCase]:
    from ocr_agentic_engine.evals.gold import load_golden
    d = FIXTURES_DIR / feature
    if not d.is_dir():
        return []
    files = sorted(p for p in d.iterdir()
                    if p.is_file()
                    and p.suffix.lower() in {".pdf", ".png", ".jpg", ".jpeg"}
                    and ".annotated" not in p.suffixes
                    and not p.name.endswith(".golden.json"))
    cases: list[EvalCase] = []
    if feature == "comparison":
        for a, b in zip(files[::2], files[1::2]):
            cases.append(EvalCase(feature, f"{a.name}+{b.name}", [a, b],
                                    golden=load_golden(a)))  # golden lives next to first file
    else:
        for f in files:
            cases.append(EvalCase(feature, f.name, [f], golden=load_golden(f)))
    return cases


def score_case(case: EvalCase, doc: DocumentRepresentation,
                ann: Annotations | None, output_bytes: bytes | None) -> dict[str, dict[str, Any]]:
    scores: dict[str, dict[str, Any]] = {}
    g = case.golden
    if "text" in g and g["text"]:
        scores["text_tree"] = metrics.text_tree_equality(doc.raw_text, g["text"])
    if "blocks" in g and g["blocks"]:
        scores["per_block_ocr"] = metrics.per_block_ocr_accuracy(doc, g["blocks"])
    if ann is not None:
        scores["annotation_coverage"] = metrics.annotation_coverage(ann, doc)
    if "handwriting_bboxes" in g and g["handwriting_bboxes"] and output_bytes:
        # Render the first PDF page to PNG so the whiteness check can run.
        png = _first_page_png(output_bytes)
        if png:
            scores["handwriting_redaction"] = metrics.handwriting_redaction(
                png, g["handwriting_bboxes"])
    if "category" in g and g["category"] and ann is not None and ann.classification:
        got = ann.classification.category
        expected = g["category"]
        conf = ann.classification.confidence
        min_conf = float(g.get("category_confidence_min", 0.0))
        passed = (got == expected and conf >= min_conf)
        scores["classification_accuracy"] = {
            "score": 1.0 if passed else 0.0,
            "details": {"expected": expected, "got": got, "confidence": conf,
                         "confidence_min": min_conf},
        }
    return scores


def _first_page_png(output_bytes: bytes) -> bytes | None:
    """If `output_bytes` is a PDF, render page 0 to PNG so pixel metrics can run."""
    if not output_bytes.startswith(b"%PDF"):
        return output_bytes  # already PNG/JPG
    try:
        import pypdfium2 as pdfium
        from io import BytesIO
        pdf = pdfium.PdfDocument(output_bytes)
        page = pdf[0]
        bitmap = page.render(scale=2.0)
        img = bitmap.to_pil()
        page.close(); pdf.close()
        buf = BytesIO(); img.save(buf, format="PNG"); return buf.getvalue()
    except Exception:
        return None


def run(pipeline: PipelineFn, features: list[str], options: dict) -> Path:
    started = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RESULTS_ROOT / started
    out.mkdir(parents=True, exist_ok=True)
    report_path = out / "report.jsonl"
    with report_path.open("w") as fp:
        for feature in features:
            for case in discover_cases(feature):
                t0 = time.perf_counter()
                result: EvalResult
                try:
                    doc, ann, data = pipeline(feature, case.files, options)
                    result = EvalResult(case=case, ms=(time.perf_counter() - t0) * 1000,
                                         scores=score_case(case, doc, ann, data))
                except Exception as e:
                    result = EvalResult(case=case, ms=(time.perf_counter() - t0) * 1000,
                                         scores={}, error=str(e))
                fp.write(json.dumps({
                    "feature": case.feature,
                    "name": case.name,
                    "ms": round(result.ms, 1),
                    "scores": result.scores,
                    "error": result.error,
                }) + "\n")
                print(f"[eval] {case.feature} :: {case.name} — "
                      f"{'FAIL' if result.error else 'ok'} ({result.ms:.0f} ms)")
    (out / "summary.md").write_text(_summarise(report_path))
    return out


def _summarise(report_path: Path) -> str:
    lines = [f"# Eval report — {report_path.parent.name}", ""]
    lines.append("| feature | case | ms | metrics |")
    lines.append("|---|---|---:|---|")
    for raw in report_path.read_text().splitlines():
        row = json.loads(raw)
        metric_blurb = ", ".join(f"{k}={v['score']:.2f}" for k, v in row["scores"].items())
        if row["error"]:
            metric_blurb = f"FAIL: {row['error'][:60]}"
        lines.append(f"| {row['feature']} | {row['name']} | {row['ms']} | {metric_blurb} |")
    return "\n".join(lines) + "\n"


def _build_engine_pipeline() -> PipelineFn:
    """Plug the current Engine (L1/L2/L3 stack) into the eval runner."""
    import os
    from paddleocr import PPStructureV3
    from ocr_agentic_engine.client import get_ollama_client
    from ocr_agentic_engine.engine import Engine

    structure = PPStructureV3(
        use_doc_orientation_classify=False, use_doc_unwarping=False,
        use_textline_orientation=False, use_seal_recognition=False,
        use_formula_recognition=False, use_chart_recognition=False,
    )
    tmp_root = Path(os.getenv("ENGINE_TMP_ROOT", "/tmp/engine-tmp"))
    downloads_root = Path(os.getenv("ENGINE_DOWNLOADS_ROOT", "/tmp/engine-downloads"))
    tmp_root.mkdir(parents=True, exist_ok=True); downloads_root.mkdir(parents=True, exist_ok=True)
    engine = Engine(ollama=get_ollama_client(), tmp_root=tmp_root,
                     downloads_root=downloads_root, structure=structure)

    def _run(feature, files, options):
        doc = None; ann: Annotations | None = None; output_bytes = None
        for raw in engine.run(feature, files, options):  # type: ignore[arg-type]
            ev_line, data_line = raw.strip().splitlines()[:2]
            ev = ev_line.split(": ", 1)[1]
            payload = json.loads(data_line.split(": ", 1)[1])
            if ev == "run_completed":
                res = payload["result"]
                doc = DocumentRepresentation.model_validate(res["document"])
                if res.get("annotations"):
                    ann = Annotations.model_validate(res["annotations"])
                if res.get("formatted"):
                    url = res["formatted"]["output_url"]
                    run_id, fname = url.strip("/").split("/")[-2:]
                    p = downloads_root / run_id / fname
                    if p.exists():
                        output_bytes = p.read_bytes()
        return doc, ann, output_bytes

    return _run


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ocr_agentic_engine.evals")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run eval harness")
    r.add_argument("--feature", action="append", choices=[
        "scan_conversion", "classification", "comparison", "handwriting_removal"])
    r.add_argument("--all", action="store_true")
    r.add_argument("--format", default="html")

    g = sub.add_parser("gold", help="author a .golden.json stub for a fixture")
    g.add_argument("fixture", type=Path, help="path to a fixture file (PDF/PNG/JPG)")
    g.add_argument("--feature", choices=[
        "scan_conversion", "classification", "comparison", "handwriting_removal"])

    rc = sub.add_parser("reconstruct", help="render every format and score round-trip fidelity")
    rc.add_argument("--fixture", help="substring filter on fixture filename")

    args = p.parse_args(argv)
    if args.cmd == "run":
        features = (["scan_conversion", "classification", "comparison", "handwriting_removal"]
                    if args.all else (args.feature or ["scan_conversion"]))
        out = run(_build_engine_pipeline(), features, {"format": args.format})
        print(f"\n[eval] report → {out}")
        return 0
    if args.cmd == "gold":
        from ocr_agentic_engine.evals.gold import write_stub
        if not args.fixture.exists():
            print(f"[gold] not found: {args.fixture}"); return 2
        write_stub(args.fixture, feature=args.feature)
        return 0
    if args.cmd == "reconstruct":
        from ocr_agentic_engine.evals.reconstruct import run as run_recon
        run_recon(args.fixture)
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
