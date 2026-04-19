"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createJobEventSource } from "@/lib/api";
import type { FailedPayload, JobProgressEvent } from "@/lib/types";

interface JobProgressProps {
  jobId: string;
  onComplete?: (outcome: "completed" | "failed") => void;
}

// Friendly specialist labels. Falls back to capitalized specialist name for
// anything not in the map.
const SPECIALIST_LABELS: Record<string, string> = {
  ocr: "Running OCR",
  format: "Formatting output",
  formatter: "Formatting output",
  classify: "Classifying document",
  compare: "Comparing documents",
  handwriting: "Removing handwriting",
};

function labelFor(specialist: string): string {
  return (
    SPECIALIST_LABELS[specialist] ??
    specialist.charAt(0).toUpperCase() + specialist.slice(1)
  );
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

// A single step row derived from step_started + optional step_finished.
interface StepRow {
  idx: number;
  specialist: string;
  status: "running" | "finished";
  elapsedMs?: number;
}

type Phase =
  | "connecting"
  | "queued"
  | "planning"
  | "running"
  | "completed"
  | "failed";

interface DerivedState {
  phase: Phase;
  steps: StepRow[];
  error: FailedPayload | null;
  lastEventId: number | null;
}

function deriveState(events: JobProgressEvent[]): DerivedState {
  let phase: Phase = "connecting";
  const stepsByIdx: Map<number, StepRow> = new Map();
  let error: FailedPayload | null = null;
  let lastEventId: number | null = null;

  for (const ev of events) {
    if (typeof ev.id === "number" && ev.id > 0) lastEventId = ev.id;
    switch (ev.type) {
      case "queued":
        phase = "queued";
        break;
      case "planning":
        phase = "planning";
        break;
      case "step_started": {
        phase = "running";
        stepsByIdx.set(ev.data.idx, {
          idx: ev.data.idx,
          specialist: ev.data.specialist,
          status: "running",
        });
        break;
      }
      case "step_finished": {
        phase = "running";
        const existing = stepsByIdx.get(ev.data.idx);
        stepsByIdx.set(ev.data.idx, {
          idx: ev.data.idx,
          specialist: ev.data.specialist ?? existing?.specialist ?? "unknown",
          status: "finished",
          elapsedMs: ev.data.elapsed_ms,
        });
        break;
      }
      case "completed":
        phase = "completed";
        break;
      case "failed":
        phase = "failed";
        error = ev.data;
        break;
    }
  }

  const steps = Array.from(stepsByIdx.values()).sort((a, b) => a.idx - b.idx);
  return { phase, steps, error, lastEventId };
}

function StatusGlyph({ status }: { status: StepRow["status"] }) {
  if (status === "running") {
    return (
      <span
        role="img"
        aria-label="running"
        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
      />
    );
  }
  return (
    <span
      role="img"
      aria-label="complete"
      className="inline-block h-3 w-3 rounded-full bg-green-500"
    />
  );
}

/**
 * JobProgress: mounts an SSE consumer on /jobs/{jobId}/stream and renders the
 * event sequence as a step-by-step progress panel.
 *
 * Calls `onComplete(outcome)` exactly once when the first terminal event
 * (completed | failed) arrives — downstream pages use this to fetch the
 * result artifact (Plan 8-04 hooks PdfViewer into this signal).
 */
export function JobProgress({ jobId, onComplete }: JobProgressProps) {
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const terminalCalledRef = useRef(false);
  // onComplete may change between renders; keep the latest in a ref so the
  // subscription effect doesn't need to re-run when it changes.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancel: (() => void) | null = null;
    let aborted = false;

    (async () => {
      try {
        const cancelFn = await createJobEventSource(jobId, (ev) => {
          if (aborted) return;
          setEvents((prev) => [...prev, ev]);
          if (
            !terminalCalledRef.current &&
            (ev.type === "completed" || ev.type === "failed")
          ) {
            terminalCalledRef.current = true;
            onCompleteRef.current?.(ev.type);
          }
        });
        if (aborted) {
          cancelFn();
        } else {
          cancel = cancelFn;
        }
      } catch (err) {
        // Surface connection errors as a synthetic failed event so the UI
        // still shows SOMETHING instead of a blank "connecting…" state.
        if (aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setEvents((prev) => [
          ...prev,
          {
            id: -1,
            type: "failed",
            data: { error_type: "connection_error", message },
          },
        ]);
        if (!terminalCalledRef.current) {
          terminalCalledRef.current = true;
          onCompleteRef.current?.("failed");
        }
      }
    })();

    return () => {
      aborted = true;
      cancel?.();
    };
  }, [jobId]);

  const { phase, steps, error } = useMemo(() => deriveState(events), [events]);

  const shortId = jobId.length > 8 ? `${jobId.slice(0, 8)}…` : jobId;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
      aria-live="polite"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Job {shortId}</h2>
        <PhaseBadge phase={phase} />
      </div>

      {phase === "connecting" && (
        <p className="text-sm text-gray-500">Connecting to job stream…</p>
      )}

      {phase === "queued" && (
        <p className="text-sm text-gray-600">
          Waiting for a worker to pick up this job.
        </p>
      )}

      {phase === "planning" && steps.length === 0 && (
        <p className="text-sm text-gray-600">Deciding the execution plan…</p>
      )}

      {steps.length > 0 && (
        <ol className="space-y-2 mt-2">
          {steps.map((s) => (
            <li
              key={s.idx}
              className="flex items-center gap-3 text-sm text-gray-700"
            >
              <StatusGlyph status={s.status} />
              <span className="flex-1">{labelFor(s.specialist)}</span>
              {s.status === "finished" && s.elapsedMs !== undefined && (
                <span className="text-xs text-gray-500 tabular-nums">
                  {formatElapsed(s.elapsedMs)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {phase === "completed" && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Job finished successfully.
        </div>
      )}

      {phase === "failed" && error && (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2"
          role="alert"
        >
          <div className="font-medium">Job failed: {error.error_type}</div>
          <div>{error.message}</div>
          {error.stage && (
            <div className="text-xs text-red-600">Stage: {error.stage}</div>
          )}
          {/* Phoenix deep-link wires up in Phase 9 per UI-14. */}
          <span className="inline-block text-xs text-red-600 opacity-50">
            View trace (available in Phase 9)
          </span>
        </div>
      )}
    </div>
  );
}

function PhaseBadge({ phase }: { phase: Phase }) {
  const text = phase.charAt(0).toUpperCase() + phase.slice(1);
  const cls =
    phase === "completed"
      ? "bg-green-100 text-green-800"
      : phase === "failed"
        ? "bg-red-100 text-red-800"
        : phase === "running"
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {text}
    </span>
  );
}
