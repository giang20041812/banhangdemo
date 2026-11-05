import { createDemoBackend } from './demo'
import { createSupabaseBackend } from './supabase'
import type { Backend } from './types'

export const isSupabaseConfigured = () =>
  process.env.NEXT_PUBLIC_USE_SUPABASE === '1' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let instance: Backend | null = null

/** Chỉ gọi từ client component */
export function getBackend(): Backend {
  if (!instance) instance = isSupabaseConfigured() ? createSupabaseBackend() : createDemoBackend()
  return instance
}

export type { Backend } from './types'
