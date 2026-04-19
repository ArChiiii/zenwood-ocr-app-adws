export type EngineEvent = { event: string; data: unknown };

export type RunEngineOptions = {
  jwt: string;
  baseUrl?: string;
  format?: string;
  model?: string;
  signal?: AbortSignal;
};

export type Feature =
  | "scan_conversion"
  | "classification"
  | "comparison"
  | "handwriting_removal";

export async function* runEngine(
  feature: Feature,
  files: File[],
  opts: RunEngineOptions,
): AsyncGenerator<EngineEvent> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const qs = new URLSearchParams();
  if (opts.format) qs.set("format", opts.format);
  if (opts.model) qs.set("model", opts.model);
  const base = opts.baseUrl ?? process.env.NEXT_PUBLIC_ENGINE_API_URL ?? "http://localhost:8001";
  const url = `${base}/engine/${feature}${qs.size ? `?${qs}` : ""}`;

  const resp = await fetch(url, {
    method: "POST", body: fd, signal: opts.signal,
    headers: { Authorization: `Bearer ${opts.jwt}` },
  });
  if (!resp.ok || !resp.body) throw new Error(`engine request failed: ${resp.status}`);

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      const parsed = parseSSE(raw);
      if (parsed) yield parsed;
    }
  }
}

function parseSSE(raw: string): EngineEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data.push(line.slice(6));
  }
  if (!data.length) return null;
  try { return { event, data: JSON.parse(data.join("\n")) }; }
  catch { return { event, data: data.join("\n") }; }
}
