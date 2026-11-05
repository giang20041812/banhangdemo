import type { Receipt } from './types'

export type Gran = 'day' | 'month' | 'year'

export interface Totals {
  count: number
  total: number
  itemsTotal: number
  surcharge: number
  /** doanh thu (gồm phụ thu) theo loại bàn */
  normal: number
  vip: number
  normalCount: number
  vipCount: number
}

export interface Bucket extends Totals {
  /** 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' */
  key: string
  label: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Ngày giờ theo múi giờ của chi nhánh */
export function localParts(iso: string, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const [y, m, d] = f.format(new Date(iso)).split('-').map(Number)
  return { y, m, d }
}

export function bucketKey(iso: string, gran: Gran, tz: string): string {
  const { y, m, d } = localParts(iso, tz)
  return gran === 'year' ? `${y}` : gran === 'month' ? `${y}-${pad(m)}` : `${y}-${pad(m)}-${pad(d)}`
}

export const emptyTotals = (): Totals => ({
  count: 0, total: 0, itemsTotal: 0, surcharge: 0, normal: 0, vip: 0, normalCount: 0, vipCount: 0,
})

export function add(t: Totals, r: Receipt): Totals {
  t.count++
  t.total += r.total
  t.itemsTotal += r.itemsTotal
  t.surcharge += r.surcharge
  if (r.tableKind === 'vip') {
    t.vip += r.total
    t.vipCount++
  } else {
    t.normal += r.total
    t.normalCount++
  }
  return t
}

export const summarize = (rs: Receipt[]): Totals => rs.reduce((t, r) => add(t, r), emptyTotals())

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Chia hóa đơn vào các khoảng, kể cả khoảng không có doanh thu (để biểu đồ liền mạch).
 * - day: các ngày trong tháng `year`-`month`;  month: 12 tháng của `year`;  year: từ năm sớm nhất đến năm `year`.
 * Hóa đơn nằm ngoài khoảng bị bỏ qua.
 */
export function buckets(receipts: Receipt[], gran: Gran, tz: string, year: number, month: number): Bucket[] {
  const keys: { key: string; label: string }[] = []
  if (gran === 'day') {
    for (let d = 1; d <= daysInMonth(year, month); d++) keys.push({ key: `${year}-${pad(month)}-${pad(d)}`, label: String(d) })
  } else if (gran === 'month') {
    for (let m = 1; m <= 12; m++) keys.push({ key: `${year}-${pad(m)}`, label: `T${m}` })
  } else {
    const first = receipts.length ? Math.min(...receipts.map((r) => localParts(r.closedAt, tz).y)) : year
    for (let y = Math.min(first, year); y <= year; y++) keys.push({ key: String(y), label: String(y) })
  }
  const map = new Map<string, Bucket>(keys.map((k) => [k.key, { ...emptyTotals(), ...k }]))
  for (const r of receipts) {
    const b = map.get(bucketKey(r.closedAt, gran, tz))
    if (b) add(b, r)
  }
  return keys.map((k) => map.get(k.key)!)
}
