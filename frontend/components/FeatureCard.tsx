import Link from 'next/link'
import type { Feature } from '@/lib/types'
import { FEATURE_LABELS } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'

const FEATURE_DESCRIPTIONS: Record<Feature, string> = {
  'scan-conversion':
    'Convert scanned PDFs and images to structured TXT, DOCX, or PDF output.',
  'handwriting-removal':
    'Remove handwritten annotations, returning a clean typed-only PDF.',
  'document-comparison':
    'Compare two documents and view color-coded inline redline differences.',
  'document-classification':
    'Classify a document into one of 9 categories with confidence score and rationale.',
}

interface FeatureCardProps {
  feature: Feature
  icon: LucideIcon
  href?: string
}

export function FeatureCard({ feature, icon: Icon, href }: FeatureCardProps) {
  return (
    <Link
      href={href ?? `/process/${feature}`}
      className="group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-lg bg-blue-50 p-2 group-hover:bg-blue-100 transition-colors">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">
          {FEATURE_LABELS[feature]}
        </h2>
      </div>
      <p className="text-sm text-gray-500 leading-relaxed">
        {FEATURE_DESCRIPTIONS[feature]}
      </p>
    </Link>
  )
}
