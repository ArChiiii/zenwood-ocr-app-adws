'use client'
import { useEffect, useState } from 'react'
import { fetchModels } from '@/lib/api'

interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m)
        if (m.length > 0 && !value) onChange(m[0])
      })
      .catch(() => setError(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentional mount-only

  if (error) {
    return (
      <p className="text-sm text-amber-600">Ollama unavailable — model selector disabled</p>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Ollama Model</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={models.length === 0}
      >
        {models.length === 0 && <option>Loading models...</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}
