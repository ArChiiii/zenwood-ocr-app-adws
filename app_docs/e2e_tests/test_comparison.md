# E2E Test: Document Comparison

## User Story

As an authenticated user, I upload two versions of a document and run the **Document Comparison** feature so the engine produces a structured diff (additions, deletions, modifications) with an HTML redline. The UI should require exactly two files, show stage progress, and render the DiffViewer with a summary + highlighted changes on completion.

## Fixtures

- `ocr_agentic_engine/tests/fixtures/comparison/a_small.pdf` — original.
- `ocr_agentic_engine/tests/fixtures/comparison/b_small.pdf` — revised.

## Test Steps

1. Navigate to `{application_url}/login`. Capture `01_login_page`.
2. Sign in with `E2E_EMAIL` / `E2E_PASSWORD`. **Verify** redirect to `/dashboard`.
3. Navigate to `{application_url}/dashboard/upload`. Capture `02_upload_form`.
4. Select `comparison` from `[data-testid="feature-select"]`. **Verify** TWO dropzones are now visible (original + revised). Capture `03_two_dropzones`.
5. Upload `a_small.pdf` to the first dropzone/file input. **Verify** the submit button remains disabled (second file still missing).
6. Upload `b_small.pdf` to the second dropzone/file input. **Verify** the submit button becomes enabled. Capture `04_both_attached`.
7. Click `[data-testid="submit-button"]`. **Verify** the progress panel appears. Capture `05_running`.
8. Poll (max ~8 minutes) until `✓ Complete` OR the error banner is visible. If the banner appears, fail with its text. Capture `06_complete`.
9. **Verify** the **DiffViewer** renders a summary plus at least one of: additions, deletions, modifications sections. Capture `07_diff_viewer`.

## Success Criteria

- Submit is disabled until both files are attached.
- Pipeline completes without the error banner.
- DiffViewer renders with a non-empty summary and at least one change section.

## Output Format

```json
{
  "test_name": "E2E Test: Document Comparison",
  "status": "passed|failed",
  "screenshots": [
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/01_login_page.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/02_upload_form.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/03_two_dropzones.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/04_both_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/05_running.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/06_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_comparison/07_diff_viewer.png"
  ],
  "error": null
}
```
