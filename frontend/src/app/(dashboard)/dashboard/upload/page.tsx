'use client'

import { useState, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { FeatureSelector } from '@/components/FeatureSelector'
import { FileDropzone } from '@/components/FileDropzone'
import { DiffViewer } from '@/components/DiffViewer'
import { OutputViewer } from '@/components/OutputViewer'
import { useEngineRun } from '@/hooks/useEngineRun'
import type { Feature, OutputFormat } from '@/lib/engine'

const FEATURE_QUERY_MAP: Record<string, Feature> = {
  extraction: 'handwriting_removal',
  scan_conversion: 'scan_conversion',
  comparison: 'comparison',
  classification: 'classification',
}

const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'docx', label: 'Word Document (.docx)' },
  { value: 'pdf', label: 'PDF Document (.pdf)' },
  { value: 'txt', label: 'Plain Text (.txt)' },
  { value: 'xlsx', label: 'Spreadsheet (.xlsx)' },
  { value: 'pptx', label: 'Presentation (.pptx)' },
]

function StageProgressList({ stageHistory, currentStage }: {
  stageHistory: { stage: string; status: 'started' | 'finished' }[]
  currentStage: string | null
}) {
  const finished = new Set(
    stageHistory.filter(s => s.status === 'finished').map(s => s.stage)
  )
  const stages = [...new Set(stageHistory.map(s => s.stage))]

  return (
    <div className="flex flex-col gap-2">
      {stages.map(stage => {
        const done = finished.has(stage)
        const active = currentStage === stage
        return (
          <div key={stage} className="flex items-center gap-3">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {done ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : active ? (
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              ) : null}
            </div>
            <span
              className="text-sm capitalize"
              style={{ color: done ? 'var(--success)' : active ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {stage.replace(/_/g, ' ')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function UploadForm() {
  const searchParams = useSearchParams()
  const initialFeature = FEATURE_QUERY_MAP[searchParams.get('feature') ?? ''] ?? 'handwriting_removal'

  const [feature, setFeature] = useState<Feature>(initialFeature)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('docx')
  const [file, setFile] = useState<File | null>(null)
  const [file2, setFile2] = useState<File | null>(null)

  const { currentStage, stageHistory, result, downloadBlob, error, running, start, reset } = useEngineRun()

  const submitted = running || result !== null || error !== null

  const isComparison = feature === 'comparison'
  const showOutputFormat = feature === 'scan_conversion' || feature === 'handwriting_removal'

  const handleFeatureChange = useCallback((v: Feature) => {
    setFeature(v)
    setFile(null)
    setFile2(null)
    reset()
  }, [reset])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    if (isComparison && !file2) return

    const files = isComparison ? [file, file2!] : [file]
    start({
      feature,
      files,
      format: showOutputFormat ? outputFormat : undefined,
    })
  }

  const handleDownload = () => {
    if (!downloadBlob || !result?.formatted) return
    const ext = result.formatted.mime_type.split('/').pop()?.split('.').pop() ?? 'bin'
    triggerBlobDownload(downloadBlob, `output.${ext}`)
  }

  const handleReset = () => {
    setFile(null)
    setFile2(null)
    reset()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
          Upload Document
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Select a feature and upload your document
        </p>
      </div>

      {/* Upload form — hidden once submitted */}
      {!submitted && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 4px 0 rgb(0 0 0 / 0.06)' }}
        >
          <FeatureSelector value={feature} onChange={handleFeatureChange} />

          {showOutputFormat && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Output Format
              </label>
              <select
                value={outputFormat}
                onChange={e => setOutputFormat(e.target.value as OutputFormat)}
                className="w-full px-3 rounded-lg text-sm outline-none"
                style={{ height: '42px', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                {OUTPUT_FORMATS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          )}

          <FileDropzone
            label={isComparison ? 'Drop original document here' : 'Drop file here or click to browse'}
            file={file}
            onChange={setFile}
          />

          {isComparison && (
            <FileDropzone
              label="Drop revised document here"
              file={file2}
              onChange={setFile2}
            />
          )}

          <button
            data-testid="submit-button"
            type="submit"
            disabled={!file || (isComparison && !file2)}
            className="w-full rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ height: '44px', background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}
          >
            Submit
          </button>
        </form>
      )}

      {/* Progress panel */}
      {submitted && (
        <div
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 4px 0 rgb(0 0 0 / 0.06)' }}
        >
          {/* Running header */}
          {running && (
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin flex-shrink-0"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {currentStage ? `Running: ${currentStage.replace(/_/g, ' ')}…` : 'Starting…'}
              </span>
            </div>
          )}

          {/* Stage list */}
          {stageHistory.length > 0 && (
            <StageProgressList stageHistory={stageHistory} currentStage={currentStage} />
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          {/* Result actions */}
          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                  ✓ Complete
                </span>
                {downloadBlob && result.formatted && (
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}
                  >
                    Download
                  </button>
                )}
                {!downloadBlob && result.formatted && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fetching file…</span>
                )}
              </div>

              {/* Classification result */}
              {result.classification && (
                <div className="rounded-xl px-5 py-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>
                    Classification
                  </p>
                  <p className="text-lg font-bold capitalize mb-1" style={{ color: 'var(--text-primary)' }}>
                    {result.classification.category.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    Confidence: {(result.classification.confidence * 100).toFixed(0)}%
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {result.classification.rationale}
                  </p>
                </div>
              )}

              {/* Handwriting report */}
              {result.handwriting && (
                <div className="rounded-xl px-5 py-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>
                    Handwriting Report
                  </p>
                  <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                    {result.handwriting.has_handwriting
                      ? `Handwriting detected on ${result.handwriting.affected_pages.length} page(s)`
                      : 'No handwriting detected'}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {result.handwriting.rationale}
                  </p>
                </div>
              )}

              {/* Comparison diff viewer */}
              {result.comparison && <DiffViewer comparison={result.comparison} />}

              {/* Output file viewer (scan_conversion, handwriting_removal) */}
              {result.formatted && result.feature !== 'comparison' && (
                <OutputViewer formatted={result.formatted} blob={downloadBlob} />
              )}
            </div>
          )}

          {/* Start new */}
          {!running && (
            <button
              onClick={handleReset}
              className="text-sm font-medium self-start"
              style={{ color: 'var(--accent)' }}
            >
              ← Start new
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadForm />
    </Suspense>
  )
}
