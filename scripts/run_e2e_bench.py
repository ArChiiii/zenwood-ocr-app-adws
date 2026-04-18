"""End-to-end benchmark harness for the Engine.

Runs each feature against real sample documents using a live PaddleOCR + Ollama
stack, captures per-stage timing from the SSE event stream, persists agent
output (classification category, comparison summary, etc.) and the formatter
artifacts, and prints a summary table.

Usage (from repo root):

    cd ocr_agentic_engine
    uv run python scripts/run_e2e_bench.py
    uv run python scripts/run_e2e_bench.py --features classification comparison
    uv run python scripts/run_e2e_bench.py --runs 3   # repeat each case N times

Place sample PDFs/images under:

    ocr_agentic_engine/tests/fixtures/scan_conversion/
    ocr_agentic_engine/tests/fixtures/classification/
    ocr_agentic_engine/tests/fixtures/comparison/        # exactly 2 files per case (paired by sorted name)
    ocr_agentic_engine/tests/fixtures/handwriting_removal/

Outputs land in `ocr_agentic_engine/.e2e-results/<UTC-timestamp>/`:

    report.json   — full structured results (timings, agent output, formatter URLs)
    summary.md    — human-readable table
    runs/<run_id>/output.*  — formatter artifacts (DOCX/PDF/TXT) copied from downloads_root

Requires: live `ollama serve` reachable at OLLAMA_HOST and the models in
`ocr_agentic_engine/agents/models.py` already pulled.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ocr_agentic_engine.client import get_ollama_client  # noqa: E402
from ocr_agentic_engine.engine import Engine  # noqa: E402

FIXTURES = ROOT / "ocr_agentic_engine" / "tests" / "fixtures"
RESULTS_ROOT = ROOT / ".e2e-results"
FEATURES = ("scan_conversion", "classification", "comparison", "handwriting_removal")


def _parse_event(raw: str) -> tuple[str, dict[str, Any]]:
    name = re.search(r"^event: (.+)$", raw, re.M).group(1)  # type: ignore[union-attr]
    data = re.search(r"^data: (.+)$", raw, re.M).group(1)  # type: ignore[union-attr]
    return name, json.loads(data)


def _discover_cases(feature: str) -> list[list[Path]]:
    d = FIXTURES / feature
    if not d.is_dir():
        return []
    files = sorted(p for p in d.iterdir() if p.is_file() and not p.name.startswith("."))
    if feature == "comparison":
        # pair adjacent files; warn if odd count
        return [files[i : i + 2] for i in range(0, len(files) - 1, 2)]
    return [[f] for f in files]


def _new_engine(tmp_root: Path, downloads_root: Path) -> Engine:
    from paddleocr import PPStructureV3

    structure = PPStructureV3(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_seal_recognition=False,
        use_formula_recognition=False,
        use_chart_recognition=False,
    )
    return Engine(
        ollama=get_ollama_client(),
        tmp_root=tmp_root,
        downloads_root=downloads_root,
        structure=structure,
    )


def _run_once(engine: Engine, feature: str, files: list[Path], options: dict) -> dict[str, Any]:
    stage_starts: dict[str, float] = {}
    stage_ms: dict[str, float] = {}
    events: list[dict[str, Any]] = []
    final: dict[str, Any] | None = None
    failure: dict[str, Any] | None = None
    t0 = time.perf_counter()
    for raw in engine.run(feature, files, options):  # type: ignore[arg-type]
        name, payload = _parse_event(raw)
        now = time.perf_counter()
        events.append({"name": name, "payload": payload})
        if name == "stage_started":
            stage_starts[payload["stage"]] = now
        elif name == "stage_finished":
            s = payload["stage"]
            if s in stage_starts:
                stage_ms[s] = round((now - stage_starts.pop(s)) * 1000, 1)
        elif name == "run_completed":
            final = payload["result"]
        elif name == "run_failed":
            failure = payload
    total_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "total_ms": total_ms,
        "stage_ms": stage_ms,
        "events": events,
        "result": final,
        "failure": failure,
    }


def _summarise_result(feature: str, result: dict[str, Any] | None) -> dict[str, Any]:
    if not result:
        return {}
    out: dict[str, Any] = {
        "page_count": result["document"]["page_count"],
        "raw_text_chars": len(result["document"]["raw_text"]),
        "sections": len(result["clean_doc"]["sections"]),
        "language": result["clean_doc"]["language"],
        "title": result["clean_doc"]["title"],
    }
    if feature == "classification" and result.get("classification"):
        c = result["classification"]
        out["category"] = c["category"]
        out["confidence"] = c["confidence"]
        out["rationale"] = c["rationale"]
    if feature == "comparison" and result.get("comparison"):
        cmp = result["comparison"]
        out["summary"] = cmp["summary"]
        out["additions"] = len(cmp["additions"])
        out["deletions"] = len(cmp["deletions"])
        out["modifications"] = len(cmp["modifications"])
    if feature == "handwriting_removal" and result.get("handwriting"):
        h = result["handwriting"]
        out["has_handwriting"] = h["has_handwriting"]
        out["affected_pages"] = h["affected_pages"]
    if result.get("formatted"):
        out["output_url"] = result["formatted"]["output_url"]
        out["output_bytes"] = result["formatted"]["bytes_size"]
        out["output_mime"] = result["formatted"]["mime_type"]
    return out


def _copy_formatter_artifact(downloads_root: Path, output_url: str | None, dest_root: Path) -> str | None:
    if not output_url:
        return None
    # /engine/downloads/<run_id>/<filename>
    parts = output_url.strip("/").split("/")
    run_id, filename = parts[-2], parts[-1]
    src = downloads_root / run_id / filename
    if not src.exists():
        return None
    dst_dir = dest_root / "runs" / run_id
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / filename
    shutil.copy2(src, dst)
    return str(dst.relative_to(dest_root))


def _format_options(feature: str, fmt: str) -> dict:
    return {"format": fmt} if feature == "scan_conversion" else {}


def _render_summary_md(report: dict[str, Any]) -> str:
    lines = [
        f"# Engine E2E Benchmark — {report['started_at']}",
        "",
        f"- Ollama host: `{report['env']['OLLAMA_HOST']}`",
        f"- Models: " + ", ".join(f"`{k}`→`{v}`" for k, v in report["models"].items()),
        f"- Total wall time: **{report['total_wall_ms']} ms**",
        "",
        "| feature | case | run | total_ms | ocr_ms | extractor_ms | branch_ms | summary |",
        "|---------|------|-----|---------:|-------:|-------------:|----------:|---------|",
    ]
    for case in report["cases"]:
        for i, run in enumerate(case["runs"], 1):
            sm = run["stage_ms"]
            branch_ms = sum(v for k, v in sm.items() if k not in ("ocr", "extractor", "formatter"))
            summary = run["summary"]
            blurb_parts = []
            if "category" in summary:
                blurb_parts.append(f"{summary['category']} ({summary['confidence']:.2f})")
            if "summary" in summary:
                blurb_parts.append(summary["summary"][:80])
            if "has_handwriting" in summary:
                blurb_parts.append(
                    f"hw={summary['has_handwriting']} pages={summary['affected_pages']}"
                )
            if "output_url" in summary:
                blurb_parts.append(f"{summary['output_bytes']}B {summary['output_mime']}")
            if run["failure"]:
                blurb_parts.append(f"FAILED: {run['failure'].get('message', '')[:80]}")
            lines.append(
                f"| {case['feature']} | {case['name']} | {i} | {run['total_ms']} "
                f"| {sm.get('ocr', '-')} | {sm.get('extractor', '-')} | {branch_ms or '-'} "
                f"| {' • '.join(blurb_parts)} |"
            )
        if len(case["runs"]) > 1:
            totals = [r["total_ms"] for r in case["runs"]]
            lines.append(
                f"| {case['feature']} | {case['name']} | **avg** | "
                f"{round(statistics.mean(totals), 1)} | | | | "
                f"min={min(totals)} max={max(totals)} stdev={round(statistics.pstdev(totals), 1)} |"
            )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--features", nargs="+", choices=FEATURES, default=list(FEATURES))
    p.add_argument("--runs", type=int, default=1, help="repeat each case N times for stable timings")
    p.add_argument("--scan-format", default="pdf", choices=["pdf", "docx", "txt"])
    p.add_argument(
        "--keep-tmp", action="store_true",
        help="keep per-run tmp + downloads dirs (otherwise everything is collected under .e2e-results/)",
    )
    args = p.parse_args(argv)

    started_at = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = RESULTS_ROOT / started_at
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp_root = out_dir / "_tmp"
    downloads_root = out_dir / "_downloads"

    print(f"[bench] results → {out_dir}")
    print(f"[bench] OLLAMA_HOST={os.getenv('OLLAMA_HOST', 'http://localhost:11434')}")
    print(f"[bench] initialising engine (loading PaddleOCR models, can take a moment)...")
    engine = _new_engine(tmp_root, downloads_root)

    from ocr_agentic_engine.agents.models import AGENT_MODELS

    report: dict[str, Any] = {
        "started_at": started_at,
        "env": {"OLLAMA_HOST": os.getenv("OLLAMA_HOST", "http://localhost:11434")},
        "models": dict(AGENT_MODELS),
        "cases": [],
    }

    bench_t0 = time.perf_counter()
    for feature in args.features:
        cases = _discover_cases(feature)
        if not cases:
            print(f"[bench] {feature}: no fixtures in tests/fixtures/{feature}/, skipping")
            continue
        for files in cases:
            name = " + ".join(f.name for f in files)
            print(f"[bench] {feature} :: {name}")
            case_record: dict[str, Any] = {"feature": feature, "name": name,
                                            "files": [str(f.relative_to(ROOT)) for f in files],
                                            "runs": []}
            for i in range(args.runs):
                run = _run_once(engine, feature, files, _format_options(feature, args.scan_format))
                run["summary"] = _summarise_result(feature, run["result"])
                run["artifact_path"] = _copy_formatter_artifact(
                    downloads_root, run["summary"].get("output_url"), out_dir,
                )
                # don't bloat report.json with the full event stream
                run.pop("events", None)
                run.pop("result", None)
                case_record["runs"].append(run)
                status = "FAIL" if run["failure"] else "ok"
                print(
                    f"  run {i + 1}/{args.runs}: {status} in {run['total_ms']} ms — "
                    + ", ".join(f"{k}={v}" for k, v in run["stage_ms"].items())
                )
            report["cases"].append(case_record)

    report["total_wall_ms"] = round((time.perf_counter() - bench_t0) * 1000, 1)

    (out_dir / "report.json").write_text(json.dumps(report, indent=2, default=str))
    (out_dir / "summary.md").write_text(_render_summary_md(report))

    if not args.keep_tmp:
        shutil.rmtree(tmp_root, ignore_errors=True)
        shutil.rmtree(downloads_root, ignore_errors=True)

    print(f"\n[bench] done. Open: {out_dir / 'summary.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
