import { NextResponse } from 'next/server'

import { classifyAgenda } from '@/lib/categories'
import { DEMO_DETAIL, DEMO_DISCUSSION, DEMO_REPORT } from '@/lib/demo'
import { hashEmbed } from '@/lib/embed'
import { buildSystemPrompt } from '@/lib/prompt'

export const maxDuration = 300

const MAX_MESSAGES = 60
const MAX_CHARS = 24000
const FIRST_TOKEN_DEADLINE_MS = 25000
const STREAM_IDLE_MS = 5000

interface IncomingMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

function isValidBody(value: unknown): value is { messages: IncomingMessage[] } {
  if (typeof value !== 'object' || value === null) return false
  const messages = (value as { messages?: unknown }).messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return false
  return messages.every((message) =>
    typeof message === 'object' && message !== null
    && ((message as IncomingMessage).role === 'user' || (message as IncomingMessage).role === 'assistant')
    && typeof (message as IncomingMessage).content === 'string'
    && (message as IncomingMessage).content.length > 0
    && (message as IncomingMessage).content.length <= MAX_CHARS)
}

function slowStream(text: string, extraHeaders: Record<string, string> = {}): Response {
  const encoder = new TextEncoder()
  const lines = text.split('\n')
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const line of lines) {
        const isBoundary = line.startsWith('[') || line.startsWith('##') || line.startsWith('검토자') || line.startsWith('판정')
        await new Promise((resolve) => setTimeout(resolve, isBoundary ? 900 : 180))
        for (const chunk of line.match(/[\s\S]{1,14}/g) ?? ['']) {
          controller.enqueue(encoder.encode(chunk))
          await new Promise((resolve) => setTimeout(resolve, 24))
        }
        controller.enqueue(encoder.encode('\n'))
      }
      controller.close()
    },
  })
  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

function extractContents(buffer: { value: string; ended?: boolean }, incoming: string): string {
  buffer.value += incoming
  const lines = buffer.value.split('\n')
  buffer.value = lines.pop() ?? ''
  let out = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') {
      buffer.ended = true
      continue
    }
    try {
      const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
      out += parsed.choices?.[0]?.delta?.content ?? ''
    } catch {
    }
  }
  return out
}

async function fallbackFromStore(agenda: string): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const res = await fetch(`${url}/rest/v1/rpc/match_fallback`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_embedding: hashEmbed(agenda), query_category: classifyAgenda(agenda) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const rows = (await res.json()) as { report?: string }[]
    const report = rows?.[0]?.report
    if (!report) return null
    return slowStream(report.replace(/\r\n?/g, '\n'), { 'X-Fallback': '1' })
  } catch {
    return null
  }
}

function callUpstream(messages: readonly IncomingMessage[], apiKey: string, baseUrl: string, signal: AbortSignal): Promise<globalThis.Response> {
  return fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      stream: true,
      max_tokens: 4000,
      reasoning: { effort: 'low' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
    signal,
  })
}

function relayStream(reader: ReadableStreamDefaultReader<Uint8Array>, buffer: { value: string; ended?: boolean }, head: string): Response {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (head) controller.enqueue(encoder.encode(head))
      for (;;) {
        if (buffer.ended) break
        const result = await Promise.race([
          reader.read(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), STREAM_IDLE_MS)),
        ])
        if (result === null || result.done) break
        const content = extractContents(buffer, decoder.decode(result.value, { stream: true }))
        if (content) controller.enqueue(encoder.encode(content))
      }
      controller.close()
      void reader.cancel()
    },
    cancel() {
      void reader.cancel()
    },
  })
  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!isValidBody(body)) return NextResponse.json({ error: 'invalid_messages' }, { status: 400 })

  if (!apiKey || !baseUrl || apiKey.includes('붙여넣기')) {
    const last = body.messages[body.messages.length - 1]
    if (body.messages.length <= 1) return slowStream(DEMO_REPORT, { 'X-Demo': '1' })
    return slowStream(last.content.startsWith('[상세:') ? DEMO_DETAIL : DEMO_DISCUSSION, { 'X-Demo': '1' })
  }

  const isFirstReview = body.messages.length <= 1

  const firstTokenAbort = new AbortController()
  const firstTokenTimer = setTimeout(() => firstTokenAbort.abort(), FIRST_TOKEN_DEADLINE_MS)
  try {
    const upstream = await callUpstream(body.messages, apiKey, baseUrl, firstTokenAbort.signal)
    if (!upstream.ok || !upstream.body) throw new Error(String(upstream.status))

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    const buffer: { value: string; ended?: boolean } = { value: '' }
    let head = ''
    while (!head) {
      if (buffer.ended) throw new Error('empty_stream')
      const { done, value } = await reader.read()
      if (done) throw new Error('empty_stream')
      head = extractContents(buffer, decoder.decode(value, { stream: true }))
    }
    clearTimeout(firstTokenTimer)
    return relayStream(reader, buffer, head)
  } catch {
    clearTimeout(firstTokenTimer)
    if (isFirstReview) {
      const fallback = await fallbackFromStore(body.messages[0].content)
      if (fallback) return fallback
    }
    return NextResponse.json({ error: 'upstream_failed' }, { status: 502 })
  }
}
