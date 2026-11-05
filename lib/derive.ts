import { isUnavailable } from './menu-logic'
import type { DiningTable, OrderItem, Snapshot } from './types'

export type TableTone = 'empty' | 'cooking' | 'new' | 'ready' | 'dining' | 'attention'

export interface TableState {
  tone: TableTone
  openedAt: string | null
  counts: { new: number; cooking: number; ready: number; served: number; attention: number }
  /** số món còn phải xử lý (chưa lên) */
  pending: number
}

/** Món cần nhân viên xử lý: bị đánh dấu hết, hoặc đang chờ làm nhưng món vừa hết (kể cả hết theo hẹn giờ) */
export function needsAttention(oi: OrderItem, snap: Pick<Snapshot, 'unavailability'>, now: Date): boolean {
  if (oi.status === 'unavailable') return true
  if (oi.status === 'new' && oi.itemId) return isUnavailable(oi.itemId, snap.unavailability, now)
  return false
}

export function liveItems(snap: Snapshot, tableId: string): OrderItem[] {
  return snap.orderItems.filter((o) => o.tableId === tableId && o.status !== 'cancelled')
}

export function tableState(table: DiningTable, snap: Snapshot, now: Date): TableState {
  const session = snap.sessions.find((s) => s.tableId === table.id)
  const items = liveItems(snap, table.id)
  const counts = { new: 0, cooking: 0, ready: 0, served: 0, attention: 0 }
  for (const o of items) {
    if (needsAttention(o, snap, now)) counts.attention++
    else if (o.status === 'new') counts.new++
    else if (o.status === 'cooking') counts.cooking++
    else if (o.status === 'ready') counts.ready++
    else if (o.status === 'served') counts.served++
  }
  let tone: TableTone = 'empty'
  if (session) {
    tone = 'dining'
    if (counts.cooking) tone = 'cooking'
    if (counts.new) tone = 'new'
    if (counts.ready) tone = 'ready'
    if (counts.attention) tone = 'attention'
  }
  return {
    tone,
    openedAt: session?.openedAt ?? null,
    counts,
    pending: counts.new + counts.cooking + counts.ready + counts.attention,
  }
}

export const TONE_LABEL: Record<TableTone, string> = {
  empty: 'Trống',
  dining: 'Đang dùng bữa',
  cooking: 'Đang làm món',
  new: 'Có món mới gọi',
  ready: 'Có món chờ đưa',
  attention: 'Cần xử lý',
}
