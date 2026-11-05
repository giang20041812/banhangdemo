const vnd = new Intl.NumberFormat('vi-VN')
export const formatVnd = (n: number) => `${vnd.format(n)}đ`

export function hhmm(iso: string | Date, tz = 'Asia/Ho_Chi_Minh') {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  )
}

export function minutesSince(iso: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
}

/** "3'" , "1g20'" */
export function ago(iso: string, now: Date) {
  const m = minutesSince(iso, now)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m}'`
  return `${Math.floor(m / 60)}g${String(m % 60).padStart(2, '0')}'`
}

export const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** datetime-local <-> ISO */
export function toLocalInput(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
export const fromLocalInput = (v: string) => new Date(v).toISOString()
