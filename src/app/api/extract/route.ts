import { NextResponse } from 'next/server'

export const maxDuration = 120

function pickText(value: unknown, depth = 0): string {
  if (depth > 4 || value === null || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of ['md_content', 'text_content', 'markdown', 'text', 'content']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  for (const child of Object.values(record)) {
    const found = pickText(child, depth + 1)
    if (found) return found
  }
  return ''
}

export async function POST(request: Request): Promise<Response> {
  const doclingUrl = process.env.DOCLING_URL
  if (!doclingUrl) return NextResponse.json({ error: 'preprocess_unavailable' }, { status: 501 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'invalid_file' }, { status: 400 })
  }

  const upstream = new FormData()
  upstream.append('files', file, file.name)
  try {
    const res = await fetch(doclingUrl, {
      method: 'POST',
      body: upstream,
      signal: AbortSignal.timeout(110000),
    })
    if (!res.ok) return NextResponse.json({ error: 'preprocess_failed', status: res.status }, { status: 502 })
    const json = (await res.json()) as unknown
    const text = pickText(json)
    if (!text.trim()) return NextResponse.json({ error: 'no_text' }, { status: 422 })
    return NextResponse.json({ text: text.slice(0, 40000) })
  } catch {
    return NextResponse.json({ error: 'preprocess_failed' }, { status: 502 })
  }
}
