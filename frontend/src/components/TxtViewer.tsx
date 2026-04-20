'use client'

import { useEffect, useState } from 'react'

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

export function TxtViewer({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    blob.text()
      .then(setText)
      .catch(err => setError(err instanceof Error ? err.message : 'Load failed'))
  }, [blob])

  if (error) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--error)' }}>
        {error}
      </div>
    )
  }

  if (!text) return <Spinner />

  return (
    <pre
      className="p-4 text-sm overflow-y-auto whitespace-pre-wrap break-words h-full"
      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
    >
      {text}
    </pre>
  )
}
