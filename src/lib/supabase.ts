'use client'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface ReviewRow {
  readonly id: string
  readonly title: string
  readonly agenda: string
  readonly messages: readonly ChatMessage[]
  readonly verdict: string | null
  readonly verdict_reason: string | null
  readonly updated_at: string
}

let client: SupabaseClient | null = null

const LOCAL_KEY = 'semoeye:reviews'
const LOCAL_MAX = 30

function localRows(): ReviewRow[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ReviewRow[]) : []
  } catch {
    return []
  }
}

function writeLocalRows(rows: readonly ReviewRow[]): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, LOCAL_MAX)))
  } catch {
  }
}

export function supabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) client = createClient(url, key)
  return client
}

export async function currentUser(): Promise<User | null> {
  const db = supabase()
  if (!db) return null
  const { data } = await db.auth.getUser()
  return data.user
}

export async function saveReview(row: {
  id: string
  title: string
  agenda: string
  messages: readonly ChatMessage[]
  verdict: string | null
  verdict_reason: string | null
}): Promise<void> {
  const db = supabase()
  const user = db ? (await db.auth.getUser()).data.user : null
  if (db && user) {
    await db.from('reviews').upsert({ ...row, user_id: user.id, updated_at: new Date().toISOString() })
    return
  }
  const stored: ReviewRow = { ...row, updated_at: new Date().toISOString() }
  writeLocalRows([stored, ...localRows().filter((item) => item.id !== row.id)])
}

export async function listReviews(): Promise<ReviewRow[]> {
  const db = supabase()
  const user = db ? (await db.auth.getUser()).data.user : null
  if (db && user) {
    const { data } = await db
      .from('reviews')
      .select('id, title, agenda, messages, verdict, verdict_reason, updated_at')
      .order('updated_at', { ascending: false })
    return (data as ReviewRow[] | null) ?? []
  }
  return localRows()
}

export async function getReview(id: string): Promise<ReviewRow | null> {
  const db = supabase()
  const user = db ? (await db.auth.getUser()).data.user : null
  if (db && user) {
    const { data } = await db
      .from('reviews')
      .select('id, title, agenda, messages, verdict, verdict_reason, updated_at')
      .eq('id', id)
      .maybeSingle()
    if (data) return data as ReviewRow
  }
  return localRows().find((item) => item.id === id) ?? null
}

export async function deleteReview(id: string): Promise<void> {
  const db = supabase()
  const user = db ? (await db.auth.getUser()).data.user : null
  if (db && user) await db.from('reviews').delete().eq('id', id)
  writeLocalRows(localRows().filter((item) => item.id !== id))
}
