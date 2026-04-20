# E2E Test: Handwriting Removal

## User Story

As an authenticated user, I upload a scan containing handwritten annotations and run the **Handwriting Removal** feature so the engine's handwriting-filter L2 agent identifies handwritten blocks and the renderer emits a clean typed-text output plus a human-readable handwriting report. The UI should show stage progress, the Handwriting Report card (detected vs. not detected, rationale), and a Download button for the cleaned file.

## Fixture

- `ocr_agentic_engine/tests/fixtures/handwriting_removal/small.pdf` — short sample with handwriting.

## Test Steps

1. Navigate to `{application_url}/login`. Capture `01_login_page`.
2. Sign in with `E2E_EMAIL` / `E2E_PASSWORD`. **Verify** redirect to `/dashboard`.
3. Navigate to `{application_url}/dashboard/upload`. Capture `02_upload_form`.
4. Select `handwriting_removal` from `[data-testid="feature-select"]` (it is the default, but set it explicitly). **Verify** the Output Format dropdown is visible (handwriting_removal also renders to a file).
5. Click the dropzone, upload the absolute path to `small.pdf`. **Verify** submit becomes enabled. Capture `03_file_attached`.
6. Click `[data-testid="submit-button"]`. **Verify** the progress panel appears. Capture `04_running`.
7. Poll (max ~8 minutes) until `✓ Complete` OR the error banner is visible. If the banner appears, fail with its text. Capture `05_complete`.
8. **Verify** the **Handwriting Report** card is rendered and contains either `Handwriting detected on N page(s)` or `No handwriting detected`, plus a non-empty rationale line. Capture `06_report_card`.

## Success Criteria

- Pipeline completes without the error banner.
- Handwriting Report card is rendered with a detection statement and rationale.
- Download button appears for the cleaned output file.

## Output Format

```json
{
  "test_name": "E2E Test: Handwriting Removal",
  "status": "passed|failed",
  "screenshots": [
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_handwriting_removal/01_login_page.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_handwriting_removal/02_upload_form.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_handwriting_removal/03_file_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_handwriting_removal/04_running.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_handwriting_removal/05_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_handwriting_removal/06_report_card.png"
  ],
  "error": null
}
```
