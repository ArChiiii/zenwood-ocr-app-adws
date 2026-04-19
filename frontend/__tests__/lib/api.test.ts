import { type Mock, vi } from "vitest";

// Mock supabase client (already mocked in setup, but we need control per-test)
const mockGetSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

import { callApi, fetchModels, triggerDownload } from "@/lib/api";

// Mock global fetch
const mockFetch = vi.fn() as Mock;
vi.stubGlobal("fetch", mockFetch);

describe("callApi", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });
  });

  it("sends FormData with Bearer token", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));
    const formData = new FormData();
    formData.append("file", new Blob(["test"]), "test.pdf");

    await callApi("/process/scan-conversion", formData);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/process/scan-conversion",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
        body: formData,
      }),
    );
  });

  it("throws when not authenticated", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    await expect(callApi("/test", new FormData())).rejects.toThrow(
      "Not authenticated",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns the raw response", async () => {
    const response = new Response("result", { status: 200 });
    mockFetch.mockResolvedValue(response);

    const result = await callApi("/test", new FormData());
    expect(result).toBe(response);
  });
});

describe("fetchModels", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });
  });

  it("parses model list from JSON response", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ models: ["llava:7b", "llava:13b"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const models = await fetchModels();
    expect(models).toEqual(["llava:7b", "llava:13b"]);
  });

  it("returns empty array on non-OK response", async () => {
    mockFetch.mockResolvedValue(new Response("error", { status: 503 }));

    const models = await fetchModels();
    expect(models).toEqual([]);
  });

  it("returns empty array when not authenticated", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const models = await fetchModels();
    expect(models).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty array when models key is missing", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const models = await fetchModels();
    expect(models).toEqual([]);
  });
});

describe("triggerDownload", () => {
  let mockClick: Mock;
  let mockCreateElement: typeof document.createElement;

  beforeEach(() => {
    mockClick = vi.fn();
    mockCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const el = mockCreateElement.call(document, "a");
        el.click = mockClick;
        return el;
      }
      return mockCreateElement.call(document, tag);
    });

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a download link and clicks it", async () => {
    // Use a mock response object to avoid jsdom's missing Blob.stream() implementation
    const response = {
      ok: true,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="output.txt"' }),
      blob: vi.fn().mockResolvedValue(new Blob(["content"])),
    } as unknown as Response;

    await triggerDownload(response, "fallback.txt");

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("uses filename from Content-Disposition header", async () => {
    const response = {
      ok: true,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="report.pdf"' }),
      blob: vi.fn().mockResolvedValue(new Blob(["content"])),
    } as unknown as Response;

    await triggerDownload(response, "fallback.txt");

    // biome-ignore lint/suspicious/noExplicitAny: mock results typing
    const results = (document.createElement as Mock).mock.results as any[];
    const anchor = results.find((r) => r.value?.tagName === "A")
      ?.value as HTMLAnchorElement;
    expect(anchor?.download).toBe("report.pdf");
  });

  it("uses fallback name when no Content-Disposition", async () => {
    const response = {
      ok: true,
      headers: new Headers(),
      blob: vi.fn().mockResolvedValue(new Blob(["content"])),
    } as unknown as Response;

    await triggerDownload(response, "fallback.docx");

    // biome-ignore lint/suspicious/noExplicitAny: mock results typing
    const results = (document.createElement as Mock).mock.results as any[];
    const anchor = results.find((r) => r.value?.tagName === "A")
      ?.value as HTMLAnchorElement;
    expect(anchor?.download).toBe("fallback.docx");
  });

  it("throws on non-OK response with error detail", async () => {
    const response = new Response(
      JSON.stringify({ detail: "File too large" }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );

    await expect(triggerDownload(response, "fallback.txt")).rejects.toThrow(
      "File too large",
    );
  });

  it("throws with generic message when error body is unparseable", async () => {
    const response = new Response("not json", { status: 500 });

    await expect(triggerDownload(response, "fallback.txt")).rejects.toThrow(
      "Unknown error",
    );
  });
});
