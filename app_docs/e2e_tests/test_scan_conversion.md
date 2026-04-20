# E2E Test: Scan Conversion

## User Story

As an authenticated user, I upload a scanned PDF and pick the **Scan Conversion** feature with a **.docx** output format so the engine runs L1 (PaddleOCR) → L2 (annotators) → L3 (DOCX reflow renderer) and produces a downloadable Word document. The UI should show stage progress, transition to a completion panel with ✓ Complete, and expose a working **Download** button backed by a pre-fetched Blob.

## Fixture

- `ocr_agentic_engine/tests/fixtures/scan_conversion/small.pdf` — short scanned PDF.

## Test Steps

1. Navigate to `{application_url}/login`. Capture `01_login_page`.
2. Sign in with `E2E_EMAIL` / `E2E_PASSWORD`. **Verify** the URL redirects to `/dashboard`.
3. Navigate to `{application_url}/dashboard/upload`. **Verify** `[data-testid="feature-select"]` is visible. Capture `02_upload_form`.
4. Select `scan_conversion` from `[data-testid="feature-select"]`. **Verify** the **Output Format** dropdown becomes visible.
5. Ensure the Output Format dropdown is set to `docx` (Word Document).
6. Click the dropzone and upload the absolute path to `small.pdf`. **Verify** the submit button becomes enabled. Capture `03_file_attached`.
7. Click `[data-testid="submit-button"]`. **Verify** the progress panel replaces the form. Capture `04_running`.
8. Poll (max ~8 minutes) until `✓ Complete` is visible OR the error banner (`div[style*="error-bg"]`) is visible. If the error banner appears, fail with its text. Capture `05_complete`.
9. Wait up to 60 seconds for a visible `button` with text exactly `Download`. **Verify** it is enabled. Capture `06_download_ready`.
10. Click the Download button. **Verify** a file named `output.docx` (or similar `.docx`) is triggered in the browser (if your MCP tool exposes a download event; otherwise assert via `browser_network_requests` that the engine `/downloads/` URL returned 200).

## Success Criteria

- Pipeline completes without the error banner.
- Output Viewer renders (DocxViewer) below the Download button.
- Download button appears within 60s of ✓ Complete and is enabled.
- Downloaded file is a non-empty .docx (if verifiable).

## Output Format

```json
{
  "test_name": "E2E Test: Scan Conversion",
  "status": "passed|failed",
  "screenshots": [
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_scan_conversion/01_login_page.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_scan_conversion/02_upload_form.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_scan_conversion/03_file_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_scan_conversion/04_running.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_scan_conversion/05_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_scan_conversion/06_download_ready.png"
  ],
  "error": null
}
```
