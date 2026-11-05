import type { Menu, MenuItem, Unavailability } from './types'

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh'

/** Lấy thứ (0=CN), "HH:MM" và ngày "YYYY-MM-DD" của một thời điểm theo múi giờ chi nhánh */
export function zonedParts(now: Date, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return {
    day: dayIdx,
    time: `${get('hour')}:${get('minute')}`,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

function inWindow(time: string, start: string, end: string) {
  // khung qua đêm, vd 18:00 → 02:00
  return start <= end ? time >= start && time < end : time >= start || time < end
}

/** Các thực đơn đang áp dụng tại thời điểm `now`, ưu tiên cao trước */
export function activeMenus(menus: Menu[], now: Date, tz = DEFAULT_TZ): Menu[] {
  const p = zonedParts(now, tz)
  return menus
    .filter((m) => {
      if (m.days.length && !m.days.includes(p.day)) return false
      if (m.validFrom && p.date < m.validFrom) return false
      if (m.validTo && p.date > m.validTo) return false
      return inWindow(p.time, m.start, m.end)
    })
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Món đang được bán: món active và (không có thực đơn nào => bán tất cả,
 * ngược lại phải nằm trong ít nhất một thực đơn đang áp dụng).
 */
export function sellableItems(items: MenuItem[], menus: Menu[], now: Date, tz = DEFAULT_TZ): MenuItem[] {
  const active = items.filter((i) => i.isActive)
  if (menus.length === 0) return active
  const ids = new Set(activeMenus(menus, now, tz).flatMap((m) => m.itemIds))
  return active.filter((i) => ids.has(i.id))
}

/** Bản ghi hết món đang có hiệu lực của một món */
export function activeUnavailability(itemId: string, list: Unavailability[], now: Date): Unavailability | undefined {
  const t = now.getTime()
  return list.find(
    (u) => u.itemId === itemId && new Date(u.startsAt).getTime() <= t && (u.endsAt === null || t < new Date(u.endsAt).getTime()),
  )
}

export const isUnavailable = (itemId: string, list: Unavailability[], now: Date) =>
  !!activeUnavailability(itemId, list, now)

/** Bản ghi hết món hẹn giờ trong tương lai */
export function upcomingUnavailability(itemId: string, list: Unavailability[], now: Date) {
  const t = now.getTime()
  return list
    .filter((u) => u.itemId === itemId && new Date(u.startsAt).getTime() > t)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Tính mốc kết thúc từ lựa chọn nhanh */
export type UntilPreset = '30m' | '2h' | 'shift' | 'today' | 'forever'
export function untilFromPreset(preset: UntilPreset, now: Date, tz = DEFAULT_TZ): string | null {
  const add = (ms: number) => new Date(now.getTime() + ms).toISOString()
  switch (preset) {
    case '30m':
      return add(30 * 60_000)
    case '2h':
      return add(2 * 3_600_000)
    case 'forever':
      return null
    case 'shift': {
      // hết ca: trưa -> 14:00, chiều/tối -> 22:00
      const hour = Number(zonedParts(now, tz).time.slice(0, 2))
      return endOfZonedTime(now, tz, hour < 14 ? 14 : 22, 0)
    }
    case 'today':
      return endOfZonedTime(now, tz, 23, 59)
  }
}

/** Thời điểm hh:mm gần nhất sau `now` theo múi giờ (tìm theo bước phút, đủ chính xác cho UI) */
function endOfZonedTime(now: Date, tz: string, h: number, m: number): string {
  const target = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  let t = now.getTime()
  for (let i = 0; i < 24 * 60 + 1; i++) {
    t += 60_000
    if (zonedParts(new Date(t), tz).time === target) return new Date(t).toISOString()
  }
  return new Date(now.getTime() + 3_600_000).toISOString()
}
