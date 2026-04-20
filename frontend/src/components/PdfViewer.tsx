'use client'

import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div
        className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
      />
    </div>
  )
}

export function PdfViewer({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width)
        if (w > 0) setContainerWidth(w)
      }
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth || 600)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (error) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--error)' }}>
        {error}
      </div>
    )
  }

  if (!url) return <Spinner />

  return (
    <div ref={containerRef}>
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={() => setError('Failed to render PDF')}
      >
        {Array.from({ length: Math.min(numPages, 10) }, (_, i) => (
          <Page key={i + 1} pageNumber={i + 1} width={containerWidth} className="mb-2" />
        ))}
      </Document>
    </div>
  )
}
