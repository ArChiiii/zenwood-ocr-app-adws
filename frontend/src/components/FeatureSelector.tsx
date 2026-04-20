import type { Feature } from '@/lib/engine'

const FEATURES: { value: Feature; label: string; description: string }[] = [
  {
    value: 'handwriting_removal',
    label: 'Handwriting Removal',
    description: 'Extract clean typed text, removing handwritten annotations',
  },
  {
    value: 'scan_conversion',
    label: 'Scan Conversion',
    description: 'Convert scanned PDFs to structured DOCX, XLSX, PPTX, or TXT',
  },
  {
    value: 'comparison',
    label: 'Document Comparison',
    description: 'Compare two documents and highlight all differences',
  },
  {
    value: 'classification',
    label: 'Document Classification',
    description: 'Automatically categorise documents by type and content',
  },
]

interface FeatureSelectorProps {
  value: Feature
  onChange: (value: Feature) => void
}

export function FeatureSelector({ value, onChange }: FeatureSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        Feature
      </label>
      <select
        data-testid="feature-select"
        value={value}
        onChange={e => onChange(e.target.value as Feature)}
        className="w-full px-3 rounded-lg text-sm outline-none appearance-none"
        style={{
          height: '42px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2378716C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: '36px',
        }}
      >
        {FEATURES.map(f => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {FEATURES.find(f => f.value === value)?.description}
      </p>
    </div>
  )
}
