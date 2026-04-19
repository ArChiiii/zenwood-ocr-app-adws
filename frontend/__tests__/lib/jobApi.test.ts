import { type Mock, vi } from "vitest";

// Mock supabase client (same pattern as api.test.ts)
const mockGetSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

import { callApiJob, createJobEventSource } from "@/lib/api";
import type { JobProgressEvent } from "@/lib/types";

// Mock global fetch
const mockFetch = vi.fn() as Mock;
vi.stubGlobal("fetch", mockFetch);

// Helper: build a ReadableStream from string chunks (as Uint8Arrays)
function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

// Helper: build a ReadableStream from chunks with a manual "done" control so we
// can abort mid-stream.
function makeControlledSSEStream(): {
  stream: ReadableStream<Uint8Array>;
  push: (s: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    stream,
    push: (s: string) => controllerRef?.enqueue(encoder.encode(s)),
    close: () => controllerRef?.close(),
  };
}

describe("callApiJob", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });
  });

  it("posts to /jobs endpoint with Bearer token and returns job_id", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: "abc" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const formData = new FormData();
    formData.append("feature", "scan_conversion");
    formData.append("file", new Blob(["test"]), "test.pdf");

    const result = await callApiJob(formData);

    expect(result).toEqual({ job_id: "abc" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/jobs",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
        body: formData,
      }),
    );
  });

  it("throws on non-2xx with detail message", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: "bad" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(callApiJob(new FormData())).rejects.toThrow("bad");
  });

  it("throws when not authenticated", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(callApiJob(new FormData())).rejects.toThrow(
      "Not authenticated",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("createJobEventSource", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });
  });

  it("parses two SSE frames and delivers events to onEvent", async () => {
    const stream = makeSSEStream([
      "id: 1\nevent: planning\ndata: {}\n\n",
      "id: 2\nevent: completed\ndata: {}\n\n",
    ]);
    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const events: JobProgressEvent[] = [];
    const cancel = await createJobEventSource("j1", (ev) => {
      events.push(ev);
    });

    // Let the reader loop drain.
    await new Promise((r) => setTimeout(r, 10));
    cancel();

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ id: 1, type: "planning", data: {} });
    expect(events[1]).toEqual({ id: 2, type: "completed", data: {} });
  });

  it("honors Last-Event-Id header on reconnect", async () => {
    const stream = makeSSEStream([]);
    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const cancel = await createJobEventSource("j1", () => {}, {
      lastEventId: "5",
    });
    cancel();

    const call = mockFetch.mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Last-Event-Id"]).toBe("5");
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers.Accept).toBe("text/event-stream");
    expect(call[0]).toBe("http://localhost:8000/jobs/j1/stream");
  });

  it("returned cancel fn stops further event delivery", async () => {
    const ctrl = makeControlledSSEStream();
    mockFetch.mockResolvedValue(
      new Response(ctrl.stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const events: JobProgressEvent[] = [];
    const cancel = await createJobEventSource("j1", (ev) => {
      events.push(ev);
    });

    ctrl.push("id: 1\nevent: planning\ndata: {}\n\n");
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toHaveLength(1);

    cancel();
    ctrl.push("id: 2\nevent: completed\ndata: {}\n\n");
    await new Promise((r) => setTimeout(r, 10));
    // After cancel, no further events delivered.
    expect(events).toHaveLength(1);
  });

  it("handles partial frames split across chunks", async () => {
    const stream = makeSSEStream(["id: 1\nev", "ent: planning\ndata: {}\n\n"]);
    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const events: JobProgressEvent[] = [];
    const cancel = await createJobEventSource("j1", (ev) => {
      events.push(ev);
    });
    await new Promise((r) => setTimeout(r, 10));
    cancel();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ id: 1, type: "planning", data: {} });
  });

  it("parses typed payloads for step_started and step_finished", async () => {
    const stream = makeSSEStream([
      'id: 3\nevent: step_started\ndata: {"idx":0,"specialist":"ocr"}\n\n',
      'id: 4\nevent: step_finished\ndata: {"idx":0,"specialist":"ocr","elapsed_ms":1250}\n\n',
    ]);
    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const events: JobProgressEvent[] = [];
    const cancel = await createJobEventSource("j1", (ev) => {
      events.push(ev);
    });
    await new Promise((r) => setTimeout(r, 10));
    cancel();

    expect(events[0]).toEqual({
      id: 3,
      type: "step_started",
      data: { idx: 0, specialist: "ocr" },
    });
    expect(events[1]).toEqual({
      id: 4,
      type: "step_finished",
      data: { idx: 0, specialist: "ocr", elapsed_ms: 1250 },
    });
  });
});
