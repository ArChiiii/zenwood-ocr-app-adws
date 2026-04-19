'use client'
import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { FileUpload } from '@/components/FileUpload'
import { ModelSelector } from '@/components/ModelSelector'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { callApi, triggerDownload } from '@/lib/api'
import { DiffViewer } from '@/components/DiffViewer'
import { ClassificationDisplay } from '@/components/ClassificationDisplay'
import type { Feature, ClassificationResult } from '@/lib/types'
import { FEATURE_LABELS } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const FEATURES_NEEDING_MODEL: Feature[] = ['handwriting-removal', 'document-classification']
const FEATURES_NEEDING_FORMAT: Feature[] = ['scan-conversion']
const FEATURES_TWO_FILES: Feature[] = ['document-comparison']

type ProcessResult =
  | { type: 'download'; filename: string }
  | { type: 'diff'; html: string }
  | { type: 'classification'; data: ClassificationResult }

export default function ProcessPage() {
  const params = useParams<{ feature: string }>()
  const feature = params.feature as Feature

  const [file, setFile] = useState<File | null>(null)
  const [file2, setFile2] = useState<File | null>(null)
  const [model, setModel] = useState('')
  const [outputFormat, setOutputFormat] = useState<'txt' | 'docx' | 'pdf'>('txt')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessResult | null>(null)

  const label = FEATURE_LABELS[feature] ?? feature

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!file) return
      if (FEATURES_TWO_FILES.includes(feature) && !file2) return

      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const form = new FormData()

        if (FEATURES_TWO_FILES.includes(feature)) {
          form.append('file1', file)
          form.append('file2', file2!)
        } else {
          form.append('file', file)
        }

        if (FEATURES_NEEDING_FORMAT.includes(feature)) {
          form.append('output_format', outputFormat)
        }

        if (FEATURES_NEEDING_MODEL.includes(feature) && model) {
          form.append('model', model)
        }

        const endpoint = `/process/${feature}`
        const response = await callApi(endpoint, form)

        if (!response.ok) {
          const err = await response.json().catch(() => ({ detail: 'Processing failed' }))
          setError((err as { detail?: string }).detail ?? 'Processing failed')
          return
        }

        if (feature === 'document-classification') {
          const data: ClassificationResult = await response.json()
          setResult({ type: 'classification', data })
        } else if (feature === 'document-comparison') {
          // Read as text — backend returns del/ins markup, not a binary file (Pitfall 4)
          const text = await response.text()
          setResult({ type: 'diff', html: text })
        } else {
          // scan-conversion and handwriting-removal: trigger browser file download
          const disposition = response.headers.get('Content-Disposition') ?? ''
          const match = disposition.match(/filename="?([^";\n]+)"?/)
          const filename = match?.[1] ?? `output.${outputFormat}`
          await triggerDownload(response, filename)
          setResult({ type: 'download', filename })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    },
    [feature, file, file2, model, outputFormat],
  )

  const canSubmit = file !== null && (!FEATURES_TWO_FILES.includes(feature) || file2 !== null)

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

        <h1 className="text-xl font-bold text-gray-900 mb-6">{label}</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6"
        >
          {FEATURES_TWO_FILES.includes(feature) ? (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Document 1</p>
                <FileUpload file={file} onChange={setFile} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Document 2</p>
                <FileUpload file={file2} onChange={setFile2} />
              </div>
            </>
          ) : (
            <FileUpload file={file} onChange={setFile} />
          )}

          {FEATURES_NEEDING_FORMAT.includes(feature) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Output Format</label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as 'txt' | 'docx' | 'pdf')}
                className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="txt">TXT</option>
                <option value="docx">DOCX</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          )}

          {FEATURES_NEEDING_MODEL.includes(feature) && (
            <ModelSelector value={model} onChange={setModel} />
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Processing...' : 'Process Document'}
          </button>

          {loading && (
            <div className="flex justify-center pt-2">
              <LoadingSpinner label="Processing document..." />
            </div>
          )}
        </form>

        {result && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {result.type === 'download' && (
              <p className="text-sm text-green-700 font-medium flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                File downloaded: {result.filename}
              </p>
            )}

            {result.type === 'diff' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900">Comparison Result</h2>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([result.html], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'comparison.txt'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Download result
                  </button>
                </div>
                <DiffViewer rawHtml={result.html} />
              </div>
            )}

            {result.type === 'classification' && (
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-4">Classification Result</h2>
                <ClassificationDisplay result={result.data} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
