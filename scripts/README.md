# engine_backend benchmark scripts

## `run_e2e_bench.py`

Drives the live engine end-to-end against real sample documents. Captures
per-stage timings, agent output (classification category, comparison summary,
handwriting flags), and copies the formatter artifacts (DOCX/PDF/TXT) into a
timestamped results directory for inspection.

### Prerequisites

1. `OLLAMA_HOST` reachable (set in `engine_backend/.env` or your shell).
2. Models pulled on that host: `qwen2.5vl:7b`, `llama3.1:8b`.
3. PaddleOCR installable in the venv (`uv sync` in `engine_backend/`).
4. Sample fixtures present (see below).

### Run

```bash
cd engine_backend
uv run python scripts/run_e2e_bench.py                       # all features, 1 run each
uv run python scripts/run_e2e_bench.py --runs 3              # 3 reps for stable timing stats
uv run python scripts/run_e2e_bench.py --features classification comparison
uv run python scripts/run_e2e_bench.py --scan-format docx    # default is pdf
uv run python scripts/run_e2e_bench.py --keep-tmp            # don't delete intermediate artifacts
```

### Adding your own samples

Drop files into the matching folder under
`engine_backend/tests/fixtures/<feature>/`:

| Feature              | Layout                                                             |
|----------------------|--------------------------------------------------------------------|
| scan_conversion      | one file per case (PDF or image)                                   |
| classification       | one file per case                                                  |
| comparison           | files are paired by sorted name; **drop two per case** (e.g. `caseA_v1.pdf`, `caseA_v2.pdf`) |
| handwriting_removal  | one file per case (handwritten or mixed)                           |

Filenames are used as case labels in the report — name them descriptively.

### Output

Each run writes to `engine_backend/.e2e-results/<UTC-timestamp>/`:

- `summary.md` — markdown table (open in any viewer)
- `report.json` — full structured results, suitable for diffing across runs
- `runs/<run_id>/output.<ext>` — formatter artifacts copied out of downloads_root

The `_tmp/` and `_downloads/` working dirs are deleted at the end unless you
pass `--keep-tmp`.
