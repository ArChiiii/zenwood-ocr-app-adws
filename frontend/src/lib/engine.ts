import { createClient } from '@/utils/supabase/client'

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://100.126.69.89:8001'

// ---- Feature / format types ----

export type Feature = 'scan_conversion' | 'classification' | 'comparison' | 'handwriting_removal'
export type OutputFormat = 'pdf' | 'docx' | 'txt' | 'html' | 'xlsx' | 'pptx'

// ---- L1 geometry types (mirroring types.py) ----

export type BlockKind = 'text' | 'title' | 'table' | 'figure' | 'formula' | 'list' | 'stamp' | 'header' | 'footer' | 'unknown'

export interface Cell {
  row: number
  col: number
  row_span: number
  col_span: number
  bbox: [number, number, number, number]
  text: string
}

export interface OCRBlock {
  page: number
  bbox: [number, number, number, number]
  text: string
  confidence: number
  kind: BlockKind
  reading_order: number
  table_cells?: Cell[]
}

export interface PageImage {
  page: number
  path: string
  width: number
  height: number
}

export interface DocumentRepresentation {
  file_id: string
  source_path: string
  page_count: number
  blocks: OCRBlock[]
  page_images: PageImage[]
  raw_text: string
}

// ---- L2 annotations ----

export interface Section {
  start: number
  end: number
  title_index?: number
}

export interface Classification {
  category: string
  confidence: number
  rationale: string
}

export interface Annotations {
  headings: Record<number, number>
  sections: Section[]
  lists: Record<number, number>
  corrections: Record<number, string>
  handwritten: number[]  // Python set serialised as JSON array
  title?: number
  language: string
  classification?: Classification
}

// ---- Feature-level result types ----

export interface Comparison {
  summary: string
  additions: string[]
  deletions: string[]
  modifications: string[]
  diff_html: string
}

export interface HandwritingReport {
  has_handwriting: boolean
  affected_pages: number[]
  affected_blocks: OCRBlock[]
  rationale: string
}

export interface FormattedResult {
  output_url: string
  mime_type: string
  bytes_size: number
}

export interface EngineResult {
  feature: Feature
  document: DocumentRepresentation
  annotations?: Annotations
  classification?: Classification
  comparison?: Comparison
  handwriting?: HandwritingReport
  formatted?: FormattedResult
}

// ---- SSE event types ----

export interface StageStartedEvent {
  event: 'stage_started'
  stage: string
  meta?: Record<string, unknown>
}

export interface StageFinishedEvent {
  event: 'stage_finished'
  stage: string
  meta?: Record<string, unknown>
}

export interface RunCompletedEvent {
  event: 'run_completed'
  result: EngineResult
}

export interface RunFailedEvent {
  event: 'run_failed'
  stage: string
  error_type: string
  message: string
}

export type SSEEvent = StageStartedEvent | StageFinishedEvent | RunCompletedEvent | RunFailedEvent

// ---- Error class ----

export class EngineError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail)
    this.name = 'EngineError'
  }
}

// ---- Auth ----

export async function getAuthToken(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ---- Download helpers ----

export function engineDownloadUrl(outputUrl: string): string {
  if (outputUrl.startsWith('http')) return outputUrl
  return `${ENGINE_URL}${outputUrl.startsWith('/') ? '' : '/'}${outputUrl}`
}

export async function fetchDownload(outputUrl: string): Promise<Blob> {
  const token = await getAuthToken()
  const url = engineDownloadUrl(outputUrl)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { headers })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { const j = await res.json(); detail = j.detail ?? detail } catch { /* ignore */ }
    throw new EngineError(res.status, detail)
  }
  return res.blob()
}

// ---- Stream engine ----

interface StreamEngineOptions {
  feature: Feature
  files: File[]
  format?: OutputFormat
  model?: string
  signal?: AbortSignal
}

export async function* streamEngine({ feature, files, format, model, signal }: StreamEngineOptions): AsyncIterable<SSEEvent> {
  const token = await getAuthToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const form = new FormData()
  for (const file of files) {
    form.append('files', file)
  }

  const params = new URLSearchParams()
  if (format) params.set('format', format)
  if (model) params.set('model', model)
  const qs = params.toString()
  const url = `${ENGINE_URL}/engine/${feature}${qs ? `?${qs}` : ''}`

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: form, signal })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new EngineError(0, `Can't reach engine at ${ENGINE_URL}. Check that the backend is running and reachable (Tailscale, CORS, VPN).`)
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { const j = await res.json(); detail = j.detail ?? detail } catch { /* ignore */ }
    throw new EngineError(res.status, detail)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch (err) {
      if (signal?.aborted) throw err
      throw new EngineError(0, `Connection to engine at ${ENGINE_URL} was interrupted mid-stream. The backend may have crashed, timed out, or lost network.`)
    }
    const { done, value } = chunk
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      if (!block.trim()) continue
      let eventName = 'message'
      let dataLine = ''

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
      }

      if (!dataLine) continue

      try {
        const payload = JSON.parse(dataLine)
        yield { event: eventName, ...payload } as SSEEvent
      } catch {
        console.warn('[engine] Failed to parse SSE data:', dataLine)
      }
    }
  }
}
