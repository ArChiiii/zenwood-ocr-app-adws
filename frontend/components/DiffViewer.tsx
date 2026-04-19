'use client'
import DOMPurify from 'dompurify'

interface DiffViewerProps {
  /** Plain text from backend comparison endpoint containing del/ins tags only */
  rawHtml: string
}

export function DiffViewer({ rawHtml }: DiffViewerProps) {
  /**
   * Sanitize BEFORE rendering. Allow ONLY del and ins tags.
   * All other tags and ALL attributes are stripped.
   * This is required even though we control the backend — defense in depth.
   */
  const sanitized = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['del', 'ins'],
    ALLOWED_ATTR: [],
  })

  return (
    <div
      className="diff-content font-mono text-sm leading-relaxed whitespace-pre-wrap overflow-auto max-h-96 border rounded-lg p-4 bg-gray-50"
      // The sanitized variable above has been processed by DOMPurify — only del/ins tags remain
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify with ALLOWED_TAGS=['del','ins']
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
