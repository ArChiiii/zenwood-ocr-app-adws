'use client'

import { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['application/pdf', 'image/tiff', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']
const ACCEPTED_EXTENSIONS = '.pdf,.tif,.tiff,.png,.jpg,.jpeg,.heic,.heif'
const MAX_SIZE_MB = 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface FileDropzoneProps {
  label?: string
  file: File | null
  onChange: (file: File | null) => void
}

export function FileDropzone({ label = 'Drop file here or click to browse', file, onChange }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(pdf|tiff?|png|jpe?g|heic|heif)$/i)) {
      return `Unsupported file type. Accepted: PDF, TIFF, PNG, JPEG, HEIC`
    }
    if (f.size > MAX_SIZE_BYTES) {
      return `File too large. Maximum size: ${MAX_SIZE_MB}MB`
    }
    return null
  }

  const handleFile = (f: File) => {
    const err = validate(f)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    onChange(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="cursor-pointer rounded-xl p-6 text-center transition-all"
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          background: dragging ? 'var(--accent-light)' : 'var(--bg-surface)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={handleChange}
        />

        {file ? (
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <p className="text-sm font-medium truncate max-w-48" style={{ color: 'var(--text-primary)' }}>
                {file.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {formatSize(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(null); setError(null) }}
              className="ml-auto text-sm px-2 py-0.5 rounded"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              PDF, TIFF, PNG, JPEG, HEIC — max {MAX_SIZE_MB}MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>
      )}
    </div>
  )
}
