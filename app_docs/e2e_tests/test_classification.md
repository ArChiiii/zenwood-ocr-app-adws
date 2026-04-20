# E2E Test: Document Classification

## User Story

As an authenticated user, I upload a document image to the Upload page and choose the **Document Classification** feature so the engine runs its L1 → L2 pipeline and returns a category (e.g., invoice, form, receipt, driver's license) with a confidence score and a short rationale. The UI should transition from the upload form to a progress panel, show stage progress, and finally render the Classification card with the category, confidence percentage, and rationale.

## Fixture

- `ocr_agentic_engine/tests/fixtures/classification/Invoice1.png` — an invoice scan.

## Test Steps

1. Navigate to `{application_url}/login`. Capture screenshot `01_login_page`.
2. Sign in with `E2E_EMAIL` / `E2E_PASSWORD` (default `demo@zentral.ai` / `DemoZentral2026!`). **Verify** the URL redirects to `/dashboard`.
3. Navigate to `{application_url}/dashboard/upload`. **Verify** the element `[data-testid="feature-select"]` is visible. Capture `02_upload_form`.
4. Select `classification` from `[data-testid="feature-select"]`. **Verify** the description text updates to mention categorisation.
5. Click the dropzone to open the file chooser, then upload the absolute path to `Invoice1.png`. **Verify** the file name shows inside the dropzone and `[data-testid="submit-button"]` is no longer disabled. Capture `03_file_attached`.
6. Click `[data-testid="submit-button"]`. **Verify** the form is replaced by the progress panel with a spinner and "Running: …" label. Capture `04_running`.
7. Poll the page (max ~8 minutes, 1.5s interval) until either the text `✓ Complete` is visible OR the error banner `div[style*="error-bg"]` is visible. If the error banner appears, fail with its text. Capture `05_complete`.
8. **Verify** the "Classification" card is rendered (exact-text match on `Classification`), the category value is a non-empty capitalised string, and a line matching `Confidence: <digits>%` is present. Capture `06_classification_card`.

## Success Criteria

- Login succeeds and redirects to `/dashboard`.
- Upload form shows the classification description after selecting the feature.
- Pipeline completes without the error banner appearing.
- Classification result card displays category + confidence percentage + non-empty rationale paragraph.

## Output Format

```json
{
  "test_name": "E2E Test: Document Classification",
  "status": "passed|failed",
  "screenshots": [
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_classification/01_login_page.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_classification/02_upload_form.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_classification/03_file_attached.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_classification/04_running.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_classification/05_complete.png",
    "<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/test_classification/06_classification_card.png"
  ],
  "error": null
}
```
