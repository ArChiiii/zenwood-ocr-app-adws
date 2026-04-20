'use client'

import { PdfViewer } from '@/components/PdfViewer'
import { DocxViewer } from '@/components/DocxViewer'
import { TxtViewer } from '@/components/TxtViewer'
import { XlsxPptxViewer } from '@/components/XlsxPptxViewer'
import type { FormattedResult } from '@/lib/engine'

interface OutputViewerProps {
  formatted: FormattedResult
  blob: Blob | null
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-muted)' }}>
      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      <span className="text-sm">Loading output…</span>
    </div>
  )
}

export function OutputViewer({ formatted, blob }: OutputViewerProps) {
  if (!blob) return <Spinner />

  const { mime_type } = formatted

  if (mime_type === 'application/pdf') return <PdfViewer blob={blob} />
  if (mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return <DocxViewer blob={blob} />
  if (mime_type === 'text/plain') return <TxtViewer blob={blob} />
  if (mime_type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return <XlsxPptxViewer format="xlsx" />
  if (mime_type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return <XlsxPptxViewer format="pptx" />

  return (
    <div className="py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
      Output ready ({(formatted.bytes_size / 1024).toFixed(1)} KB). Use the Download button to save.
    </div>
  )
}
