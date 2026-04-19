'use client'

import { useState, useEffect } from 'react'
import { FeatureCard } from '@/components/FeatureCard'
import { FileText, PenOff, GitCompare, Tag } from 'lucide-react'
import type { Feature } from '@/lib/types'

const ENGINE_TOGGLE_KEY = 'zentral.use_engine'

const FEATURE_ICONS: Record<Feature, typeof FileText> = {
  'scan-conversion': FileText,
  'handwriting-removal': PenOff,
  'document-comparison': GitCompare,
  'document-classification': Tag,
}

const FEATURES: Feature[] = [
  'scan-conversion',
  'handwriting-removal',
  'document-comparison',
  'document-classification',
]

export function FeatureGrid() {
  const [useEngine, setUseEngine] = useState(false)

  useEffect(() => {
    setUseEngine(window.localStorage.getItem(ENGINE_TOGGLE_KEY) === '1')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ENGINE_TOGGLE_KEY, useEngine ? '1' : '0')
  }, [useEngine])

  const engineHref = (slug: string) => `/engine/${slug}`

  return (
    <>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input
          type="checkbox"
          checked={useEngine}
          onChange={(e) => setUseEngine(e.target.checked)}
        />
        Use new engine (beta)
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURES.map((feature) => (
          <FeatureCard
            key={feature}
            feature={feature}
            icon={FEATURE_ICONS[feature]}
            href={useEngine ? engineHref(feature) : undefined}
          />
        ))}
      </div>
    </>
  )
}
