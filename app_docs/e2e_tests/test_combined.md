# E2E Test: Combined Feature Run

## User Story

As an authenticated user, I run all four engine features — **Classification**, **Handwriting Removal**, **Scan Conversion**, and **Document Comparison** — against the same real-world scan so I can verify the entire L1 → L2 → L3 pipeline end-to-end in a single test run. Each feature is exercised sequentially from the Upload page; after each run I return to the upload form and submit the next feature.

## Fixture

- `ocr_agentic_engine/tests/fixtures/test/IMG_6047.jpg` — shared input image used for all four features. Comparison uses it as both the *original* and *revised* file (expected diff is empty / minimal; the pipeline must still complete successfully).

## Test Steps

1. Navigate to `{application_url}/login`. Capture `01_login_page`.
2. Sign in with `E2E_EMAIL` / `E2E_PASSWORD`. **Verify** redirect to `/dashboard`.

### Phase A — Classification

3. Navigate to `{application_url}/dashboard/upload`. Capture `A02_upload_form`.
4. Select `classification` from `[data-testid="feature-select"]`.
5. Upload `IMG_6047.jpg`. **Verify** `[data-testid="submit-button"]` is enabled. Capture `A03_file_attached`.
6. Click submit. Poll (max ~8 min) until `✓ Complete` or error banner. Fail with banner text if it appears. Capture `A04_complete`.
7. **Verify** the **Classification** card renders with a non-empty category and `Confidence: <digits>%`. Capture `A05_classification_card`.

### Phase B — Handwriting Removal

8. Navigate to `{application_url}/dashboard/upload`.
9. Select `handwriting_removal` from `[data-testid="feature-select"]`. **Verify** the Output Format dropdown is visible.
10. Upload `IMG_6047.jpg`. Capture `B03_file_attached`.
11. Click submit. Poll until `✓ Complete` or error banner. Capture `B04_complete`.
12. **Verify** the **Handwriting Report** card renders with either `Handwriting detected on N page(s)` or `No handwriting detected`, plus a non-empty rationale. **Verify** a Download button appears. Capture `B05_report_card`.

### Phase C — Scan Conversion (docx)

13. Navigate to `{application_url}/dashboard/upload`.
14. Select `scan_conversion`. **Verify** the Output Format dropdown is visible; set it to `docx`.
15. Upload `IMG_6047.jpg`. Capture `C03_file_attached`.
16. Click submit. Poll until `✓ Complete` or error banner. Capture `C04_complete`.
17. Wait up to 60s for a visible `button` with exact text `Download`. **Verify** it is enabled. Capture `C05_download_ready`.

### Phase D — Comparison (same file twice)

18. Navigate to `{application_url}/dashboard/upload`.
19. Select `comparison`. **Verify** TWO dropzones/file inputs are visible. Capture `D02_two_dropzones`.
20. Upload `IMG_6047.jpg` to the first input. **Verify** submit remains disabled.
21. Upload `IMG_6047.jpg` to the second input. **Verify** submit becomes enabled. Capture `D03_both_attached`.
22. Click submit. Poll until `✓ Complete` or error banner. Capture `D04_complete`.
23. **Verify** the **DiffViewer** renders a summary (additions/deletions/modifications sections may be empty given identical inputs, but the viewer itself must render). Capture `D05_diff_viewer`.

## Success Criteria

- Login succeeds and redirects to `/dashboard`.
- All four pipelines complete without the error banner.
- Classification card shows category + confidence percentage.
- Handwriting Report card renders with detection statement + rationale; Download button appears.
- Scan Conversion exposes an enabled Download button within 60s of completion.
- Comparison DiffViewer renders (summary present even when diff is empty).

## Output Format

```json
{
  "test_name": "E2E Test: Combined Feature Run",
  "status": "passed|failed",
  "screenshots": [
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/01_login_page.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/A02_upload_form.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/A03_file_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/A04_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/A05_classification_card.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/B03_file_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/B04_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/B05_report_card.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/C03_file_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/C04_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/C05_download_ready.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/D02_two_dropzones.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/D03_both_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/D04_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_combined/D05_diff_viewer.png"
  ],
  "error": null
}
```
