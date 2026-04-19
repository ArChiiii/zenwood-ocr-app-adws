import { describe, expect, it, vi } from "vitest";
import { runEngine } from "@/lib/engineClient";

function mockStream(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("runEngine", () => {
  it("yields parsed SSE events in order", async () => {
    const r = mockStream([
      "event: run_started\ndata: {\"run_id\":\"r\"}\n\n",
      "event: stage_finished\ndata: {\"stage\":\"ocr\"}\n\n",
      "event: run_completed\ndata: {\"result\":{}}\n\n",
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => r));
    const got: string[] = [];
    for await (const ev of runEngine("scan_conversion", [], { jwt: "t" })) got.push(ev.event);
    expect(got).toEqual(["run_started", "stage_finished", "run_completed"]);
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    await expect(async () => {
      for await (const _ of runEngine("scan_conversion", [], { jwt: "t" })) void _;
    }).rejects.toThrow(/400/);
  });
});
