export interface ClassificationResult {
  category: string;
  confidence: number; // 0.0 to 1.0
  rationale: string;
}

export const CLASSIFICATION_CATEGORIES = [
  "forms",
  "name_cards",
  "id_cards",
  "quotations",
  "vendor_bills",
  "receipts",
  "invoices",
  "cheques",
  "agreements",
] as const;

export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number];

export type Feature =
  | "scan-conversion"
  | "handwriting-removal"
  | "document-comparison"
  | "document-classification";

export const FEATURE_LABELS: Record<Feature, string> = {
  "scan-conversion": "Scan Conversion",
  "handwriting-removal": "Handwriting Removal",
  "document-comparison": "Document Comparison",
  "document-classification": "Document Classification",
};

// ---------------------------------------------------------------------------
// v2.0 Jobs API event shapes (Phase 8).
//
// These match the backend SSE contract from:
//   - backend/routers/jobs.py (SSE framing: id/event/data lines)
//   - backend/orchestrator.py (step_started, step_finished with elapsed_ms)
//   - design spec §4.5 (queued → planning → step_started/finished → completed/failed)
// ---------------------------------------------------------------------------

export type JobEventType =
  | "queued"
  | "planning"
  | "step_started"
  | "step_finished"
  | "completed"
  | "failed";

export interface QueuedPayload {
  file_paths?: string[];
  feature?: string;
}

export interface StepStartedPayload {
  idx: number;
  specialist: string;
}

export interface StepFinishedPayload {
  idx: number;
  specialist: string;
  elapsed_ms: number;
}

export interface FailedPayload {
  error_type: string;
  message: string;
  stage?: string;
}

// Discriminated union keyed by `type`. `data` shape narrows accordingly.
export type JobProgressEvent =
  | { id: number; type: "queued"; data: QueuedPayload }
  | { id: number; type: "planning"; data: Record<string, never> }
  | { id: number; type: "step_started"; data: StepStartedPayload }
  | { id: number; type: "step_finished"; data: StepFinishedPayload }
  | { id: number; type: "completed"; data: Record<string, never> }
  | { id: number; type: "failed"; data: FailedPayload };

export interface JobSubmitResponse {
  job_id: string;
}
