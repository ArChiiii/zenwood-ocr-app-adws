import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { JobProgressEvent } from "@/lib/types";

// Module-scoped emit/cancel hooks so tests can drive the mock.
let capturedOnEvent: ((ev: JobProgressEvent) => void) | null = null;
const mockCancel = vi.fn();

vi.mock("@/lib/api", () => ({
  createJobEventSource: vi.fn(
    async (
      _jobId: string,
      onEvent: (ev: JobProgressEvent) => void,
      _opts?: { lastEventId?: string },
    ) => {
      capturedOnEvent = onEvent;
      return mockCancel;
    },
  ),
}));

import { JobProgress } from "@/components/JobProgress";

function emit(ev: JobProgressEvent) {
  if (!capturedOnEvent) throw new Error("onEvent not captured — mount first");
  capturedOnEvent(ev);
}

async function flush() {
  // React 19 uses act(); testing-library wraps it. A microtask flush is
  // usually enough for the useEffect subscription to run.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  capturedOnEvent = null;
  mockCancel.mockReset();
});

describe("JobProgress", () => {
  it("renders a connecting state before the first event arrives", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    // Before any events, the component should show at least the jobId hint
    // plus a loading/connecting affordance.
    expect(screen.getByText(/j1/i)).toBeInTheDocument();
  });

  it("renders queued state after queued event", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    emit({
      id: 1,
      type: "queued",
      data: { file_paths: ["/tmp/a.pdf"], feature: "scan_conversion" },
    });
    await waitFor(() => {
      expect(screen.getByText(/queued/i)).toBeInTheDocument();
    });
  });

  it("renders planning state after queued → planning", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    emit({
      id: 1,
      type: "queued",
      data: { feature: "scan_conversion" },
    });
    emit({ id: 2, type: "planning", data: {} });
    await waitFor(() => {
      expect(screen.getByText(/planning/i)).toBeInTheDocument();
    });
  });

  it("renders an in-progress row for step_started(ocr)", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    emit({ id: 1, type: "planning", data: {} });
    emit({
      id: 2,
      type: "step_started",
      data: { idx: 0, specialist: "ocr" },
    });
    await waitFor(() => {
      // "Running OCR" is the friendly label per the plan's behavior section.
      expect(screen.getByText(/running ocr/i)).toBeInTheDocument();
    });
  });

  it("renders elapsed time after step_finished", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    emit({ id: 1, type: "planning", data: {} });
    emit({
      id: 2,
      type: "step_started",
      data: { idx: 0, specialist: "ocr" },
    });
    emit({
      id: 3,
      type: "step_finished",
      data: { idx: 0, specialist: "ocr", elapsed_ms: 1250 },
    });
    await waitFor(() => {
      // Format chosen: seconds with 2 decimals, e.g. "1.25s".
      expect(screen.getByText(/1\.25s/)).toBeInTheDocument();
    });
  });

  it("renders full two-step progression and the completion banner", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    emit({
      id: 1,
      type: "queued",
      data: { feature: "scan_conversion" },
    });
    emit({ id: 2, type: "planning", data: {} });
    emit({
      id: 3,
      type: "step_started",
      data: { idx: 0, specialist: "ocr" },
    });
    emit({
      id: 4,
      type: "step_finished",
      data: { idx: 0, specialist: "ocr", elapsed_ms: 1200 },
    });
    emit({
      id: 5,
      type: "step_started",
      data: { idx: 1, specialist: "format" },
    });
    emit({
      id: 6,
      type: "step_finished",
      data: { idx: 1, specialist: "format", elapsed_ms: 300 },
    });
    emit({ id: 7, type: "completed", data: {} });

    await waitFor(() => {
      expect(screen.getByText(/1\.20s/)).toBeInTheDocument();
      expect(screen.getByText(/0\.30s/)).toBeInTheDocument();
      expect(screen.getByText(/formatting output/i)).toBeInTheDocument();
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });
  });

  it("renders a failed block with error_type, message, and stage", async () => {
    render(<JobProgress jobId="j1" />);
    await flush();
    emit({ id: 1, type: "planning", data: {} });
    emit({
      id: 2,
      type: "failed",
      data: {
        error_type: "RuntimeError",
        message: "boom",
        stage: "ocr",
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/RuntimeError/)).toBeInTheDocument();
      expect(screen.getByText(/boom/)).toBeInTheDocument();
      expect(screen.getByText(/ocr/i)).toBeInTheDocument();
    });
  });

  it("calls onComplete('completed') when completed arrives", async () => {
    const onComplete = vi.fn();
    render(<JobProgress jobId="j1" onComplete={onComplete} />);
    await flush();
    emit({ id: 1, type: "queued", data: { feature: "scan_conversion" } });
    emit({ id: 2, type: "planning", data: {} });
    emit({ id: 3, type: "completed", data: {} });
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith("completed");
    });
  });

  it("calls onComplete('failed') when failed arrives", async () => {
    const onComplete = vi.fn();
    render(<JobProgress jobId="j1" onComplete={onComplete} />);
    await flush();
    emit({ id: 1, type: "planning", data: {} });
    emit({
      id: 2,
      type: "failed",
      data: { error_type: "RuntimeError", message: "boom", stage: "ocr" },
    });
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith("failed");
    });
  });
});
