import { describe, it, expect } from 'vitest'
import { activeMenus, sellableItems, isUnavailable, untilFromPreset, zonedParts } from './menu-logic'
import type { Menu, MenuItem, Unavailability } from './types'

const menu = (p: Partial<Menu>): Menu => ({
  id: 'm', branchId: 'b', name: 'm', days: [], start: '00:00', end: '23:59',
  validFrom: null, validTo: null, priority: 0, itemIds: [], ...p,
})
const item = (id: string, active = true): MenuItem => ({
  id, branchId: 'b', categoryId: null, name: id, description: '', price: 1, imageUrl: null, isActive: active,
})
// 2026-11-05 là thứ Năm. 05:00Z = 12:00 giờ VN
const noon = new Date('2026-11-05T05:00:00Z')
const evening = new Date('2026-11-05T12:00:00Z') // 19:00 VN

describe('zonedParts', () => {
  it('đổi sang giờ Việt Nam', () => {
    expect(zonedParts(noon)).toEqual({ day: 4, time: '12:00', date: '2026-11-05' })
  })
})

describe('activeMenus', () => {
  const lunch = menu({ id: 'lunch', start: '10:00', end: '14:00', itemIds: ['a'] })
  const dinner = menu({ id: 'dinner', start: '17:00', end: '22:00', itemIds: ['b'] })
  it('chọn theo khung giờ', () => {
    expect(activeMenus([lunch, dinner], noon).map((m) => m.id)).toEqual(['lunch'])
    expect(activeMenus([lunch, dinner], evening).map((m) => m.id)).toEqual(['dinner'])
  })
  it('theo thứ trong tuần và hiệu lực ngày', () => {
    expect(activeMenus([menu({ days: [1] })], noon)).toHaveLength(0)
    expect(activeMenus([menu({ days: [4] })], noon)).toHaveLength(1)
    expect(activeMenus([menu({ validTo: '2026-11-04' })], noon)).toHaveLength(0)
  })
  it('khung qua đêm', () => {
    const night = menu({ start: '18:00', end: '02:00' })
    expect(activeMenus([night], evening)).toHaveLength(1)
    expect(activeMenus([night], noon)).toHaveLength(0)
  })
  it('ưu tiên cao xếp trước', () => {
    const r = activeMenus([menu({ id: 'x', priority: 1 }), menu({ id: 'y', priority: 5 })], noon)
    expect(r.map((m) => m.id)).toEqual(['y', 'x'])
  })
})

describe('sellableItems', () => {
  const items = [item('a'), item('b'), item('c', false)]
  it('không có thực đơn nào => bán tất cả món đang bật', () => {
    expect(sellableItems(items, [], noon).map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('chỉ bán món thuộc thực đơn đang áp dụng', () => {
    const menus = [menu({ start: '10:00', end: '14:00', itemIds: ['a', 'c'] })]
    expect(sellableItems(items, menus, noon).map((i) => i.id)).toEqual(['a'])
    expect(sellableItems(items, menus, evening)).toEqual([])
  })
})

describe('unavailability', () => {
  const u = (s: string, e: string | null): Unavailability => ({
    id: 'u', branchId: 'b', itemId: 'a', startsAt: s, endsAt: e, reason: '',
  })
  it('hết trong khoảng, tự mở lại khi quá hạn', () => {
    const list = [u('2026-11-05T04:00:00Z', '2026-11-05T06:00:00Z')]
    expect(isUnavailable('a', list, noon)).toBe(true)
    expect(isUnavailable('a', list, new Date('2026-11-05T06:00:00Z'))).toBe(false)
    expect(isUnavailable('b', list, noon)).toBe(false)
  })
  it('hẹn giờ trong tương lai chưa tính là hết', () => {
    expect(isUnavailable('a', [u('2026-11-05T08:00:00Z', null)], noon)).toBe(false)
  })
  it('endsAt null = đến khi bật lại', () => {
    expect(isUnavailable('a', [u('2026-11-01T00:00:00Z', null)], noon)).toBe(true)
  })
})

describe('untilFromPreset', () => {
  it('30 phút', () => {
    expect(untilFromPreset('30m', noon)).toBe('2026-11-05T05:30:00.000Z')
  })
  it('hết ca trưa = 14:00 VN, chiều = 22:00 VN', () => {
    expect(untilFromPreset('shift', noon)).toBe('2026-11-05T07:00:00.000Z')
    expect(untilFromPreset('shift', evening)).toBe('2026-11-05T15:00:00.000Z')
  })
  it('hết hôm nay = 23:59 VN', () => {
    expect(untilFromPreset('today', noon)).toBe('2026-11-05T16:59:00.000Z')
  })
  it('mãi mãi = null', () => {
    expect(untilFromPreset('forever', noon)).toBeNull()
  })
})
