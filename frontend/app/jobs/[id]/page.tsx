"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { JobProgress } from "@/components/JobProgress";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/**
 * /jobs/[id] — v2.0 Job observation page.
 *
 * Mounts <JobProgress /> which opens the SSE stream at
 * `${BACKEND_URL}/jobs/{id}/stream`. On terminal events the component fires
 * onComplete('completed'|'failed'); this page uses that signal to reveal a
 * download affordance.
 *
 * NOTE: Plan 8-04 replaces the raw download link with the <PdfViewer /> that
 * fetches `/jobs/{id}/result` with the Bearer token and embeds a viewer.
 * Phase 8-03 keeps the placeholder link so the page is fully functional.
 */
export default function JobPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id ?? "";

  const [terminal, setTerminal] = useState<"completed" | "failed" | null>(null);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <h1 className="text-xl font-bold text-gray-900 mb-6">Job status</h1>

        {jobId ? (
          <>
            <JobProgress jobId={jobId} onComplete={setTerminal} />

            {terminal === "completed" && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-3">
                  Result ready
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Your formatted artifact is ready. The embedded viewer lands in
                  Plan 8-04 — for now, use the direct link below (requires an
                  authenticated session).
                </p>
                <a
                  href={`${BACKEND_URL}/jobs/${jobId}/result`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-blue-600 hover:underline"
                >
                  Open result
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">Loading…</p>
        )}
      </div>
    </main>
  );
}
