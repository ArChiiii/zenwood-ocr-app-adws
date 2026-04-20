'use client'

import { useEffect, useState } from 'react'
import type { Comparison } from '@/lib/engine'

interface DiffViewerProps {
  comparison: Comparison
}

function SummaryCard({ summary }: { summary: string }) {
  return (
    <div
      className="rounded-xl px-5 py-4 mb-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <span
        className="text-xs font-semibold tracking-widest uppercase mb-2 block"
        style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}
      >
        ✦ AI Summary
      </span>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {summary}
      </p>
    </div>
  )
}

function StatsBar({ comparison }: { comparison: Comparison }) {
  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
        +{comparison.additions.length} additions
      </span>
      <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
        −{comparison.deletions.length} deletions
      </span>
      <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
        {comparison.modifications.length} modifications
      </span>
    </div>
  )
}

interface CollapsibleListProps {
  title: string
  items: string[]
  color: string
  prefix: string
  defaultOpen?: boolean
}

function CollapsibleList({ title, items, color, prefix, defaultOpen = false }: CollapsibleListProps) {
  const [open, setOpen] = useState(defaultOpen)
  if (items.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: open ? 'var(--bg-surface)' : 'var(--bg-base)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
          <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>({items.length})</span>
        </span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
        >
          <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-2" style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border)' }}>
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <span className="font-bold text-xs mt-0.5 flex-shrink-0" style={{ color }}>{prefix}</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiffHtmlPanel({ html }: { html: string }) {
  const [srcDoc, setSrcDoc] = useState<string>('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    import('dompurify').then(({ default: DOMPurify }) => {
      const clean = DOMPurify.sanitize(html)
      setSrcDoc(`<!DOCTYPE html><html><head><style>
        body{font-family:sans-serif;font-size:14px;line-height:1.6;padding:16px;margin:0;color:#374151}
        ins{background:#dcfce7;color:#166534;text-decoration:none;border-radius:2px;padding:0 1px}
        del{background:#fee2e2;color:#991b1b;border-radius:2px;padding:0 1px}
        p{margin:0 0 8px}
      </style></head><body>${clean}</body></html>`)
    })
  }, [html])

  if (!srcDoc) return null

  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-4 py-2.5" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>REDLINE DIFF</span>
      </div>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="w-full border-0"
        style={{ minHeight: '200px', display: 'block' }}
        title="Redline diff"
        onLoad={e => {
          const iframe = e.currentTarget
          const doc = iframe.contentDocument
          if (doc) iframe.style.height = doc.body.scrollHeight + 32 + 'px'
        }}
      />
    </div>
  )
}

export function DiffViewer({ comparison }: DiffViewerProps) {
  return (
    <div data-testid="diff-viewer">
      {comparison.summary && <SummaryCard summary={comparison.summary} />}
      <StatsBar comparison={comparison} />
      <div className="space-y-1">
        <CollapsibleList
          title="Additions"
          items={comparison.additions}
          color="var(--success)"
          prefix="+"
          defaultOpen={comparison.additions.length > 0}
        />
        <CollapsibleList
          title="Deletions"
          items={comparison.deletions}
          color="var(--error)"
          prefix="−"
          defaultOpen={comparison.deletions.length > 0}
        />
        <CollapsibleList
          title="Modifications"
          items={comparison.modifications}
          color="#f59e0b"
          prefix="~"
          defaultOpen={comparison.modifications.length > 0}
        />
      </div>
      {comparison.diff_html && <DiffHtmlPanel html={comparison.diff_html} />}
    </div>
  )
}
