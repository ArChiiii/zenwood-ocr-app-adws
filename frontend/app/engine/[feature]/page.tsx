"use client";

import { use, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import { runEngine, type EngineEvent, type Feature } from "@/lib/engineClient";

const FEATURES: Feature[] = ["scan_conversion", "classification", "comparison", "handwriting_removal"];

export default function EngineFeaturePage({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = use(params);
  if (!FEATURES.includes(feature as Feature)) {
    return <main className="p-8">Unknown feature: {feature}</main>;
  }
  const typed = feature as Feature;
  const [files, setFiles] = useState<File[]>([]);
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState("pdf");
  const [model, setModel] = useState("");

  const expected = typed === "comparison" ? 2 : 1;
  const result = events.find(e => e.event === "run_completed")?.data as
    | { result?: Record<string, unknown> } | undefined;
  const failure = events.find(e => e.event === "run_failed")?.data as
    | { stage: string; error_type: string; message: string } | undefined;

  async function start() {
    if (files.length !== expected) {
      setError(`This feature requires exactly ${expected} file(s).`); return;
    }
    setError(null); setEvents([]); setRunning(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (!jwt) { setError("Not signed in."); setRunning(false); return; }

    try {
      for await (const ev of runEngine(typed, files, {
        jwt,
        format: typed === "scan_conversion" ? format : undefined,
        model: model || undefined,
      })) {
        setEvents(prev => [...prev, ev]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const engineBase = process.env.NEXT_PUBLIC_ENGINE_API_URL ?? "http://localhost:8001";

  return (
    <main className="p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Engine · {typed.replace(/_/g, " ")}</h1>

      <input type="file" multiple={expected > 1}
              accept="application/pdf,image/png,image/jpeg"
              onChange={e => setFiles(Array.from(e.target.files ?? []))} />

      {typed === "scan_conversion" && (
        <label className="block">Format:{" "}
          <select value={format} onChange={e => setFormat(e.target.value)}>
            <option value="txt">txt</option>
            <option value="docx">docx</option>
            <option value="pdf">pdf</option>
          </select>
        </label>
      )}

      {typed !== "scan_conversion" && (
        <label className="block">Model override:{" "}
          <input value={model} onChange={e => setModel(e.target.value)}
                  placeholder="e.g. llama3.1:8b" />
        </label>
      )}

      <button disabled={running || files.length === 0} onClick={start}
               className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {running ? "Running…" : "Run"}
      </button>

      {error && <p className="text-red-600">{error}</p>}

      {failure && (
        <div className="border border-red-300 rounded p-4 bg-red-50">
          <p className="font-semibold">Failed during: {failure.stage}</p>
          <p>{failure.error_type}: {failure.message}</p>
          {failure.error_type === "ModelUnavailableError" && (
            <p className="mt-2 font-mono text-sm">Run <code>ollama pull &lt;model&gt;</code> and retry.</p>
          )}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Events</h2>
        <ul className="text-sm font-mono bg-gray-50 p-3 rounded max-h-64 overflow-y-auto">
          {events.map((e, i) => (
            <li key={i}><span className="font-semibold">{e.event}</span>{" "}
              {typeof e.data === "object" ? JSON.stringify(e.data) : String(e.data)}</li>
          ))}
        </ul>
      </section>

      {result?.result && (
        <section>
          <h2 className="text-lg font-semibold">Result</h2>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
            {JSON.stringify(result.result, null, 2)}
          </pre>
          {(() => {
            const fmt = result.result.formatted as Record<string, unknown> | undefined;
            if (!fmt?.output_url) return null;
            return (
              <a className="inline-block mt-2 text-blue-600 underline"
                 href={`${engineBase}${fmt.output_url as string}`}>
                Download {fmt.mime_type as string}
              </a>
            );
          })()}
        </section>
      )}
    </main>
  );
}
