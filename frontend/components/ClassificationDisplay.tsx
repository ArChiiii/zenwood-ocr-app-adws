'use client'
import type { ClassificationResult } from '@/lib/types'

interface ClassificationDisplayProps {
  result: ClassificationResult
}

export function ClassificationDisplay({ result }: ClassificationDisplayProps) {
  const pct = Math.round(result.confidence * 100)
  const label = result.category.replace(/_/g, ' ')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 capitalize">{label}</h3>
        <span className="text-sm font-medium text-gray-500">{pct}% confidence</span>
      </div>

      <div
        className="w-full bg-gray-200 rounded-full h-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-sm text-gray-700 leading-relaxed">{result.rationale}</p>
    </div>
  )
}
