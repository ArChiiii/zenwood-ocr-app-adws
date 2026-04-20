import Link from 'next/link'

const FEATURE_CARDS = [
  {
    href: '/dashboard/upload?feature=extraction',
    title: 'Handwriting Removal',
    description: 'Extract clean typed text from handwritten or annotated documents',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/upload?feature=scan_conversion',
    title: 'Scan Conversion',
    description: 'Convert scanned PDFs to structured DOCX, XLSX, PPTX, or TXT',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/upload?feature=comparison',
    title: 'Document Comparison',
    description: 'Compare two document versions and highlight all changes clearly',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>
      </svg>
    ),
  },
  {
    href: '/dashboard/upload?feature=classification',
    title: 'Classification',
    description: 'Automatically categorise documents by type and content with AI',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    ),
  },
]

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
          Dashboard
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Choose a feature to get started
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {FEATURE_CARDS.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="block rounded-2xl p-6 transition-shadow hover:shadow-md"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 4px 0 rgb(0 0 0 / 0.06)',
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {card.icon}
            </div>
            <h2 className="font-semibold mb-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
              {card.title}
            </h2>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {card.description}
            </p>
          </Link>
        ))}
      </div>

    </div>
  )
}
