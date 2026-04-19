import { createClient } from "@/lib/supabase/client";
import type {
  JobEventType,
  JobProgressEvent,
  JobSubmitResponse,
} from "@/lib/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function callApi(
  endpoint: string,
  formData: FormData,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  return fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // DO NOT set Content-Type — browser sets multipart boundary automatically
    },
    body: formData,
  });
}

export async function fetchModels(): Promise<string[]> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.models ?? [];
}

// ---------------------------------------------------------------------------
// v2.0 Jobs API (Phase 8).
//
// POST /jobs accepts multipart/form-data (feature + file[+file2] + options),
// returns 202 {job_id}. The follow-up stream is consumed by
// createJobEventSource below.
//
// EventSource doesn't support custom Authorization headers, so we use a
// fetch-based SSE reader. The response body is parsed frame-by-frame with a
// rolling buffer so chunks that split a frame are reassembled correctly.
// ---------------------------------------------------------------------------

export async function callApiJob(
  formData: FormData,
): Promise<JobSubmitResponse> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // DO NOT set Content-Type — browser sets multipart boundary automatically
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: `Request failed (${res.status})` }));
    throw new Error(
      (err as { detail?: string }).detail ?? `Request failed (${res.status})`,
    );
  }

  return (await res.json()) as JobSubmitResponse;
}

interface CreateJobEventSourceOptions {
  lastEventId?: string;
  signal?: AbortSignal;
}

/**
 * Opens an SSE connection to /jobs/{jobId}/stream, parsing `id:`, `event:`,
 * `data:` lines into typed {@link JobProgressEvent} objects and delivering
 * them to `onEvent`.
 *
 * Returns a cancel fn that aborts the underlying fetch. After cancel no more
 * events are delivered to onEvent (late-arriving chunks are dropped).
 *
 * Honors Last-Event-Id via the `opts.lastEventId` option — the backend
 * (backend/routers/jobs.py) uses this header to replay events with
 * id > lastEventId on reconnect.
 */
export async function createJobEventSource(
  jobId: string,
  onEvent: (ev: JobProgressEvent) => void,
  opts: CreateJobEventSourceOptions = {},
): Promise<() => void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const controller = new AbortController();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "text/event-stream",
  };
  if (opts.lastEventId !== undefined) {
    headers["Last-Event-Id"] = opts.lastEventId;
  }

  // External signal cancels our controller too.
  if (opts.signal) {
    if (opts.signal.aborted) {
      controller.abort();
    } else {
      opts.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  const res = await fetch(`${BACKEND_URL}/jobs/${jobId}/stream`, {
    method: "GET",
    headers,
    signal: controller.signal,
  });

  if (!res.ok) {
    const detail = await res
      .text()
      .then((t) => {
        try {
          return (
            (JSON.parse(t) as { detail?: string }).detail ??
            `Stream request failed (${res.status})`
          );
        } catch {
          return `Stream request failed (${res.status})`;
        }
      })
      .catch(() => `Stream request failed (${res.status})`);
    throw new Error(detail);
  }

  const body = res.body;
  if (!body) {
    throw new Error("Stream response has no body");
  }

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    try {
      controller.abort();
    } catch {
      // already aborted — ignore
    }
  };

  // Kick off the reader loop; do NOT await it — the caller needs the cancel
  // fn returned synchronously-ish so the component can wire cleanup on
  // unmount.
  void readSSEStream(body, (ev) => {
    if (cancelled) return;
    onEvent(ev);
  }).catch((err) => {
    // Aborts surface as AbortError; swallow them, surface everything else via
    // a synthetic `failed` event so the UI can render something.
    if ((err as { name?: string } | null)?.name === "AbortError") return;
    if (cancelled) return;
    const message = err instanceof Error ? err.message : String(err);
    onEvent({
      id: -1,
      type: "failed",
      data: { error_type: "stream_error", message },
    });
  });

  return cancel;
}

/**
 * Internal: reads a ReadableStream<Uint8Array> of SSE bytes, buffers chunks,
 * and invokes `onEvent` once per complete frame (delimited by `\n\n`).
 *
 * SSE frame grammar (per backend/routers/jobs.py):
 *     id: <int>\n
 *     event: <type>\n
 *     data: <json>\n
 *     \n
 */
async function readSSEStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (ev: JobProgressEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on the double-newline frame separator; keep the tail as the
      // in-progress partial frame.
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const parsed = parseSSEFrame(frame);
        if (parsed) onEvent(parsed);
        idx = buffer.indexOf("\n\n");
      }
    }

    // Flush any trailing partial frame on stream close (rare — backend always
    // emits the terminating \n\n).
    if (buffer.trim().length > 0) {
      const parsed = parseSSEFrame(buffer);
      if (parsed) onEvent(parsed);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEFrame(frame: string): JobProgressEvent | null {
  let id: number | null = null;
  let eventType: JobEventType | null = null;
  let dataRaw: string | null = null;

  for (const line of frame.split("\n")) {
    if (line.startsWith("id:")) {
      const v = line.slice(3).trim();
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) id = n;
    } else if (line.startsWith("event:")) {
      eventType = line.slice(6).trim() as JobEventType;
    } else if (line.startsWith("data:")) {
      dataRaw = line.slice(5).trim();
    }
  }

  if (id === null || eventType === null || dataRaw === null) return null;

  let data: unknown;
  try {
    data = JSON.parse(dataRaw);
  } catch {
    return null;
  }

  // Trust the backend's event_type — the frontend's JobProgressEvent union
  // covers all known types; unknown ones are ignored to keep the UI
  // forward-compatible.
  // biome-ignore lint/suspicious/noExplicitAny: discriminated-union construction requires a widening cast
  return { id, type: eventType, data: data as any };
}

export async function triggerDownload(
  response: Response,
  fallbackName: string,
): Promise<void> {
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
    throw new Error(
      (err as { detail?: string }).detail ??
        `Request failed (${response.status})`,
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = match?.[1] ?? fallbackName;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // prevent memory leak
}
