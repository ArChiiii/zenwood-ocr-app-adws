# Bug Log

Track bugs, their root causes, and solutions. Include prevention notes so recurring patterns are caught early.

---

### 2026-04-19 — PaddleOCR GPU OOM on large photographed images
- **Issue**: Reconstruction eval on `IMG_6047.jpg` / `image_hw_clean.jpg` (≈4K JPEGs from `zenwood-demo-2/images/`) crashes with `ResourceExhaustedError: Out of memory error on GPU 0. Cannot allocate 3GB`. Confirmed reproducible even in **fresh Python subprocesses** — i.e. not just allocation drift across calls, the single image exceeds card capacity.
- **Root Cause**: Two compounding factors: (a) PaddleOCR's `PPStructureV3` workspace allocation scales with input resolution; a 4000×3000 JPEG triggers a ~3GB conv workspace on top of the ~8GB model footprint → >11GB on a 12GB card. (b) `PPStructureV3` also accumulates allocations between `predict()` calls in the same process, amplifying the problem for bulk eval runs.
- **Solution**: Subprocess isolation alone is **not sufficient** for these fixtures. Two effective mitigations: (i) downscale long-edge to ≤2000px before OCR (PaddleOCR accuracy unaffected at 2000px); (ii) force CPU fallback (`paddlepaddle` wheel instead of `paddlepaddle-gpu`) — slow but reliable. Not yet implemented in code; current workaround is to exclude these fixtures from eval runs.
- **Prevention**: Add a pre-OCR downscale step in `ocr_stage._image_bytes_to_page` gated by an env var (e.g. `ENGINE_OCR_MAX_LONG_EDGE=2000`). For the reconstruction eval specifically, the `.ocr_cache/` sha256 cache bypasses GPU entirely on repeat runs — so the first successful OCR of a fixture (e.g. on a larger card) makes it cheap forever after.

### 2026-04-19 — HTML roundtrip eval score polluted by CSS text
- **Issue**: `reconstruct --fixture small.pdf` reported `html roundtrip=0.165` even though the rendered HTML visually matched the OCR text perfectly.
- **Root Cause**: `_extract_html` in `evals/reconstruct.py` stripped tags with a naive regex that kept the `<style>` block's CSS *content* (selectors, rules) as "text", which never appears in `doc.raw_text` → massive spurious text mismatch.
- **Solution**: Drop `<style>` and `<script>` blocks before the general tag strip:
  ```python
  src = re.sub(r"<(style|script)\b[^>]*>.*?</\1>", " ", src, flags=re.DOTALL | re.IGNORECASE)
  ```
  Score jumped from 0.165 → 1.000 for `small.pdf`, 0.464 for `Invoice1.png` (correctly reflecting the real table-representation difference).
- **Prevention**: When writing text-extraction metrics, always test against a rendered fixture whose content equals input — a clean round-trip should score 1.0. Anything lower is either the metric or the renderer; don't accept mystery numbers.

### 2026-04-19 — Annotated PNG treated as input fixture
- **Issue**: `evals run --feature classification` discovered `Invoice1.png.annotated.png` (authored by the `gold` helper) as its own case, doubling the case count.
- **Root Cause**: `discover_cases` filtered only by extension; the `.annotated` infix wasn't excluded.
- **Solution**: Extend the filter in `evals/runner.py::discover_cases` and `evals/reconstruct.py::_discover` to skip files with `.annotated` in `p.suffixes` and files ending in `.golden.json`.
- **Prevention**: Co-locating artefacts next to fixtures is convenient; always update discovery filters when you introduce a new artefact naming convention.

### 2026-04-19 — `relative_to()` fails on fixture path from CLI
- **Issue**: `evals gold <fixture>` raised `ValueError: '...' is not in the subpath of '...'` when the user ran it from a different working directory than the repo root.
- **Root Cause**: Relative paths passed on argv weren't resolved to absolute before `relative_to(repo_root)`.
- **Solution**: Wrap with `_rel(p)` helper that does `p.resolve()` first and falls back to `str(p)` if still outside the repo.
- **Prevention**: Any CLI that accepts a path and later computes repo-relative strings must call `.resolve()` at the boundary.
