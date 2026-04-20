'use client'

export function XlsxPptxViewer({ format }: { format: 'xlsx' | 'pptx' }) {
  return (
    <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
      {format.toUpperCase()} preview is not available inline. Use the Download button above to open the file.
    </div>
  )
}
