'use client'

import { useEffect, useRef, useState } from 'react'

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

export function DocxViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function render() {
      const arrayBuffer = await blob.arrayBuffer()
      const { renderAsync } = await import('docx-preview')
      if (containerRef.current) {
        await renderAsync(arrayBuffer, containerRef.current, undefined, {
          className: 'docx-viewer',
        })
      }
      setLoading(false)
    }

    render().catch(err => {
      console.error('[viewer] DocxViewer render error:', err)
      setError(err instanceof Error ? (err.message || 'Render failed') : 'Render failed')
      setLoading(false)
    })
  }, [blob])

  return (
    <div style={{ contain: 'content' }}>
      {loading && <Spinner />}
      {error && <div className="p-4 text-sm" style={{ color: 'var(--error)' }}>{error}</div>}
      <div ref={containerRef} className={loading ? 'hidden' : ''} />
    </div>
  )
}
