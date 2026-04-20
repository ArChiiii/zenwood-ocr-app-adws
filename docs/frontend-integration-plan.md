# Frontend ↔ ocr_agentic_engine Integration Plan (Option A: SSE rewrite)

Backend: FastAPI SSE engine at `http://100.126.69.89:8001`
Frontend: Next.js app at `frontend/`, currently wired for a job-queue REST API that no longer exists.

---

## 0. Pre-flight constraints

- Backend serves at `http://100.126.69.89:8001` (HTTP only — fine for dev; plan HTTPS or Tailscale fronting later).
- Backend auth: Supabase HS256 JWT (`SUPABASE_JWT_SECRET`). Frontend already has Supabase wired (`src/utils/supabase/client.ts`). Frontend must use the **same Supabase project** as the backend's `SUPABASE_JWT_SECRET`.
- CORS: backend reads `ENGINE_CORS_ORIGINS` (comma-separated). Default already includes `http://localhost:3000`.
- SSE: cannot use `EventSource` (no POST, no Authorization header). Must use `fetch` + `ReadableStream`.

## 1. Env wiring

### Frontend — create/update `frontend/.env.local`
```
NEXT_PUBLIC_ENGINE_URL=http://100.126.69.89:8001
NEXT_PUBLIC_SUPABASE_URL=<existing>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing>
```
Remove the old `NEXT_PUBLIC_API_URL`.

### Backend — export on the GPU host
```
ENGINE_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SUPABASE_JWT_SECRET=<HS256 secret from Supabase JWT settings — must match frontend project>
ENGINE_TMP_ROOT=/tmp/engine-tmp
ENGINE_DOWNLOADS_ROOT=/tmp/engine-downloads
```
When you deploy the frontend off-localhost, append the deployed origin to `ENGINE_CORS_ORIGINS` and restart uvicorn.

### Auth flow
1. Browser signs in via Supabase → JWT cached in Supabase client.
2. Each engine request: `getSession().access_token` → `Authorization: Bearer <jwt>`.
3. Backend `get_current_user` validates HS256 with `audience=authenticated`.
4. Using `fetch` (not EventSource) lets us send the auth header on the SSE POST.

## 2. New data layer — CREATE `frontend/src/lib/engine.ts`

Replaces `frontend/src/lib/api.ts`.

- Types mirroring `ocr_agentic_engine/types.py`:
  - `Feature = 'scan_conversion' | 'classification' | 'comparison' | 'handwriting_removal'`
  - `OutputFormat = 'pdf' | 'docx' | 'txt' | 'html' | 'xlsx' | 'pptx'`
  - `OCRBlock`, `Cell`, `PageImage`, `DocumentRepresentation`
  - `Section`, `Classification` (`category`, `confidence`, `rationale`)
  - `Annotations` — note `handwritten` is a `number[]` over JSON (Python set serialised as list)
  - `Comparison` (`summary`, `additions`, `deletions`, `modifications`, `diff_html`)
  - `HandwritingReport`
  - `FormattedResult` (`output_url`, `mime_type`, `bytes_size`)
  - `EngineResult` (feature + optional fields)
  - SSE event union: `StageStartedEvent`, `StageFinishedEvent`, `RunCompletedEvent {result: EngineResult}`, `ErrorEvent`
- `class EngineError extends Error { status; detail }`
- `getAuthToken()` — reuse from old `api.ts`.
- `engineDownloadUrl(outputUrl: string)` — joins `NEXT_PUBLIC_ENGINE_URL` + relative path.
- `fetchDownload(outputUrl)` -> `Promise<Blob>` (Bearer token). **Cache the blob — backend deletes after first GET.**
- `async function* streamEngine({feature, files, format, model?, signal?}): AsyncIterable<SSEEvent>`:
  - Build `FormData`; for `comparison` append both files under field `files`; otherwise one.
  - `fetch(${ENGINE}/engine/${feature}?format=${format}[&model=${model}], { method:'POST', headers:{Authorization}, body:form, signal })`
  - Read `res.body!.getReader()`, decode UTF-8, split on `\n\n`, parse `event:` and `data:` lines, yield typed events.
  - Throw `EngineError` on non-2xx (read JSON `detail` if possible).

## 3. New hook — CREATE `frontend/src/hooks/useEngineRun.ts`

Replaces `useJobPolling.ts`.

```
{
  events: SSEEvent[]
  currentStage: string | null
  stageHistory: { stage; status; meta }[]
  result: EngineResult | null
  error: string | null
  running: boolean
  start: (opts: {feature, files, format, model?}) => void
  abort: () => void
}
```
`AbortController` per run; iterate `streamEngine`; mirror old polling logger format.

## 4. Feature name reconciliation

Adopt **backend canonical names** everywhere: `scan_conversion`, `classification`, `comparison`, `handwriting_removal`.

- `frontend/src/components/FeatureSelector.tsx`: rename `'document_comparison'` -> `'comparison'`, `'document_classification'` -> `'classification'`. Import `Feature` from `engine.ts`.
- `frontend/src/app/(dashboard)/dashboard/upload/page.tsx`: update `FEATURE_QUERY_MAP` keys; treat `extraction` as alias for `handwriting_removal`.
- Search project after refactor for stragglers.

## 5. Upload page rewrite — `frontend/src/app/(dashboard)/dashboard/upload/page.tsx`

Drop navigation to `/dashboard/jobs/:id`. Run inline.

- Replace imports: `@/lib/api` -> `@/lib/engine`; replace `submitJob`/`submitComparison` with `useEngineRun()`.
- Remove `ProviderSelector` and all `vlmProvider` / `vlmModel` / `skipOcr` / `useRawReconstruction` / `routeId` UI + state. Backend has none of these knobs (only optional `?model=`; defer until needed).
- Keep `FeatureSelector`, `FileDropzone`, output-format `<select>` (applies to `scan_conversion` and `handwriting_removal`).
- For `comparison`: two dropzones; pass `[file, file2]` to `start({feature:'comparison', files:[f1,f2], format})`.
- After Submit: replace form (or render below) with:
  - Stage progress list (checkmark per `stage_finished`)
  - Spinner with `currentStage`
  - On `result`: Download button (`fetchDownload(result.formatted.output_url)` -> anchor click) + result panels (DiffViewer for comparison, classification card, handwriting report, output viewer for scan_conversion).
- Do NOT push to `/dashboard/jobs/:id`.

## 6. Job detail / history removal

Delete (option A):
- `frontend/src/app/(dashboard)/dashboard/jobs/page.tsx`
- `frontend/src/app/(dashboard)/dashboard/jobs/[id]/page.tsx`
- the whole `jobs/` directory.

## 7. Pages and components to delete

Delete:
- `frontend/src/app/(dashboard)/dashboard/costs/`
- `frontend/src/app/(dashboard)/dashboard/settings/`
- `frontend/src/app/(dashboard)/dashboard/jobs/`
- `frontend/src/components/CostBreakdown.tsx`
- `frontend/src/components/CostChart.tsx`
- `frontend/src/components/CostTable.tsx`
- `frontend/src/components/JobList.tsx`
- `frontend/src/components/ProviderSelector.tsx`
- `frontend/src/hooks/useJobPolling.ts`
- `frontend/src/lib/api.ts`

If `frontend/src/app/(dashboard)/dashboard/page.tsx` references costs/jobs, simplify to a hero card linking to `/dashboard/upload`.

## 8. DiffViewer rewrite — `frontend/src/components/DiffViewer.tsx`

New props: `comparison: Comparison` (from `useEngineRun().result.comparison`). No more `jobId` fetch.

Render:
- Summary text card (rename `VlmSummaryCard` -> `SummaryCard`).
- Stats bar from `additions.length` / `deletions.length` / `modifications.length`.
- Three collapsible lists (Additions / Deletions / Modifications).
- Below: `diff_html` rendered into a scoped container with redlines CSS (`ins`/`del`).
  - **Sanitize first** with DOMPurify (or equivalent) before injecting — the HTML originates from the LLM-driven `redlines` lib and should be treated as untrusted. Add `dompurify` to `package.json`.

Delete `AlignedSection`, `ParagraphDiff`, `TableDiff` UI — they don't apply to backend's shape.

## 9. Output viewer — CREATE `frontend/src/components/OutputViewer.tsx`

Thin dispatcher used by upload page when `result.formatted` is present:

- Resolve URL: `engineDownloadUrl(result.formatted.output_url)`.
- Detect format from `mime_type` or trailing extension.
- Fetch ONCE via `fetchDownload()` -> `Blob` -> `URL.createObjectURL`. Cache blob in state — backend deletes file on first GET.
- Pass blob/objectURL to existing viewers refactored to take `{ url }` or `{ blob }` instead of `jobId`:
  - `PdfViewer`, `DocxViewer`, `TxtViewer`, `XlsxPptxViewer`
- For `comparison` (HTML), render `diff_html` inline in DiffViewer (same content).

Delete `frontend/src/components/OcrOutputPanel.tsx` — consumes a v1 `OcrResult` shape (`pages/tokens/signals`) that no longer exists. Reintroduce later from `result.document.blocks` if needed.

## 10. Sidebar / nav cleanup

- `frontend/src/components/Sidebar.tsx`: `NAV_ITEMS` keeps only Dashboard + Upload. Drop History / Costs / Settings.
- `frontend/src/components/BottomNav.tsx`: same trim.

## 11. Misc cleanups

- `frontend/src/proxy.ts` — review; if it referenced old API base, delete or leave unused.
- `frontend/next.config.ts` — no rewrites needed; direct cross-origin call works once CORS is set.
- `frontend/package.json` — add `dompurify` (+ `@types/dompurify`) for the DiffViewer HTML sanitiser.
- `frontend/e2e/` — Playwright tests hitting removed routes will break; out of scope unless asked.

## 12. Sequence of changes (dependency order)

1. Create `src/lib/engine.ts` (types + `streamEngine` + `fetchDownload`).
2. Create `src/hooks/useEngineRun.ts`.
3. Rewrite `FeatureSelector` to canonical names.
4. Refactor viewers (`PdfViewer`, `DocxViewer`, `TxtViewer`, `XlsxPptxViewer`) to take URL/blob.
5. Rewrite `DiffViewer` to take `Comparison` prop.
6. Rewrite `upload/page.tsx` to use `useEngineRun` + new viewers + new DiffViewer.
7. Trim `Sidebar.tsx` and `BottomNav.tsx`.
8. Simplify or rewrite `dashboard/page.tsx`.
9. Delete: `lib/api.ts`, `hooks/useJobPolling.ts`, `dashboard/{jobs,costs,settings}/`, `components/{CostBreakdown,CostChart,CostTable,JobList,ProviderSelector,OcrOutputPanel}.tsx`.
10. Set `frontend/.env.local`.
11. Set backend env, restart uvicorn.

## 13. Sanity test commands

```bash
# Backend reachable + CORS
curl -i http://100.126.69.89:8001/health
curl -i -X OPTIONS http://100.126.69.89:8001/engine/scan_conversion \
  -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST"

# Frontend dev
cd frontend && npm run dev
npm run lint
npx tsc --noEmit
```

Grep `frontend/src/` for zero hits on: `useJobPolling`, `getJobStatus`, `submitJob`, `submitComparison`, `getJobDiff`, `getCostSummary`, `getProviderSetting`, `JobResponse`, `document_comparison`, `document_classification`, `/jobs/`, `/costs/`, `/settings/`, `NEXT_PUBLIC_API_URL`.

Manual smoke flow:
1. Sign in. DevTools -> Application -> confirm Supabase session.
2. `/dashboard/upload` -> Scan Conversion, format pdf, drop a small PDF, Submit.
3. Network tab: POST `http://100.126.69.89:8001/engine/scan_conversion?format=pdf` with `Authorization: Bearer …`, response `text/event-stream`, chunks streaming.
4. UI shows `annotate` then `formatter` stages, then Download button.
5. Click Download -> GET `/engine/downloads/<run_id>/output.pdf` succeeds; 2nd click -> 404 (expected, file deleted).
6. Repeat for Classification (just category card) and Comparison (two files, diff_html rendered).

## 14. Known gotchas / follow-ups

- **One-shot downloads**: cache the blob — never refetch the same `output_url`.
- **Untrusted diff HTML**: sanitise `diff_html` with DOMPurify before injecting.
- **Streaming under Next.js dev proxy**: not applicable (direct CORS). If a reverse proxy is added later, disable buffering (`X-Accel-Buffering: no`).
- **Token refresh during long runs**: SSE is fine (already authed), but call `getAuthToken()` fresh for the download GET.
- **Comparison field name**: backend `router.py` expects field `files` (list); browsers serialise two `files` appends as two parts — confirmed.
- **Annotations.handwritten**: typed as `number[]` (JSON array) not `Set<number>`.
- **Renderer formats**: backend supports `pdf, docx, txt, html, xlsx, pptx`.
