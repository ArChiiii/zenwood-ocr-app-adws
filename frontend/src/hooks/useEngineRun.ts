'use client'

import { useCallback, useRef, useState } from 'react'
import {
  streamEngine,
  fetchDownload,
  type Feature,
  type OutputFormat,
  type SSEEvent,
  type EngineResult,
  EngineError,
} from '@/lib/engine'

interface StageEntry {
  stage: string
  status: 'started' | 'finished'
  meta?: Record<string, unknown>
}

interface UseEngineRunResult {
  events: SSEEvent[]
  currentStage: string | null
  stageHistory: StageEntry[]
  result: EngineResult | null
  downloadBlob: Blob | null
  error: string | null
  running: boolean
  start: (opts: { feature: Feature; files: File[]; format?: OutputFormat; model?: string }) => void
  abort: () => void
  reset: () => void
}

export function useEngineRun(): UseEngineRunResult {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [stageHistory, setStageHistory] = useState<StageEntry[]>([])
  const [result, setResult] = useState<EngineResult | null>(null)
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setEvents([])
    setCurrentStage(null)
    setStageHistory([])
    setResult(null)
    setDownloadBlob(null)
    setError(null)
    setRunning(false)
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
    setCurrentStage(null)
  }, [])

  const start = useCallback(async ({ feature, files, format, model }: {
    feature: Feature
    files: File[]
    format?: OutputFormat
    model?: string
  }) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setEvents([])
    setCurrentStage(null)
    setStageHistory([])
    setResult(null)
    setDownloadBlob(null)
    setError(null)
    setRunning(true)

    try {
      for await (const ev of streamEngine({ feature, files, format, model, signal: controller.signal })) {
        if (controller.signal.aborted) break

        setEvents(prev => [...prev, ev])

        if (ev.event === 'stage_started') {
          setCurrentStage(ev.stage)
          setStageHistory(prev => [...prev, { stage: ev.stage, status: 'started', meta: ev.meta }])
          console.log(`[engine] stage_started: ${ev.stage}`)
        } else if (ev.event === 'stage_finished') {
          setStageHistory(prev => [...prev, { stage: ev.stage, status: 'finished', meta: ev.meta }])
          console.log(`[engine] stage_finished: ${ev.stage}`)
        } else if (ev.event === 'run_completed') {
          setCurrentStage(null)
          setResult(ev.result)
          console.log(`[engine] run_completed: feature=${ev.result.feature}`)
          if (ev.result.formatted?.output_url) {
            fetchDownload(ev.result.formatted.output_url)
              .then(blob => setDownloadBlob(blob))
              .catch(err => console.error('[engine] Pre-fetch download failed:', err))
          }
        } else if (ev.event === 'run_failed') {
          setError(ev.message)
          setCurrentStage(null)
          console.error(`[engine] run_failed at ${ev.stage}: ${ev.message}`)
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const msg = err instanceof EngineError ? err.detail : err instanceof Error ? err.message : String(err)
      setError(msg)
      console.error('[engine] Stream error:', msg)
    } finally {
      if (!controller.signal.aborted) {
        setRunning(false)
        setCurrentStage(null)
      }
    }
  }, [])

  return { events, currentStage, stageHistory, result, downloadBlob, error, running, start, abort, reset }
}
