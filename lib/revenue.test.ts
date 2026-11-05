import { describe, expect, it } from 'vitest'
import { billOf } from './billing'
import { comboDetail, comboUnitPrice, lineKey, validateChoices } from './combo'
import { buckets, bucketKey, summarize } from './revenue'
import type { MenuItem, OrderItem, Receipt } from './types'

const TZ = 'Asia/Ho_Chi_Minh'
const rc = (closedAt: string, total: number, kind: 'normal' | 'vip' = 'normal', surcharge = 0): Receipt => ({
  id: closedAt + total, branchId: 'b', tableId: 't', tableCode: 'B01', tableKind: kind,
  openedAt: closedAt, closedAt, itemsTotal: total - surcharge, surcharge, total,
})

describe('doanh thu', () => {
  it('tính ngày theo múi giờ chi nhánh (UTC 17:30 = 00:30 hôm sau ở VN)', () => {
    expect(bucketKey('2026-03-31T17:30:00Z', 'day', TZ)).toBe('2026-04-01')
    expect(bucketKey('2026-03-31T17:30:00Z', 'month', TZ)).toBe('2026-04')
  })
  it('tách bàn thường / VIP và phụ thu', () => {
    const t = summarize([rc('2026-04-01T05:00:00Z', 500_000), rc('2026-04-01T06:00:00Z', 700_000, 'vip', 100_000)])
    expect(t).toMatchObject({ count: 2, total: 1_200_000, normal: 500_000, vip: 700_000, surcharge: 100_000, vipCount: 1 })
  })
  it('bucket theo ngày có đủ các ngày trong tháng, kể cả ngày trống', () => {
    const b = buckets([rc('2026-02-10T05:00:00Z', 100)], 'day', TZ, 2026, 2)
    expect(b).toHaveLength(28)
    expect(b[9].total).toBe(100)
    expect(b[0].total).toBe(0)
  })
  it('bucket theo tháng và năm', () => {
    const rs = [rc('2025-12-31T05:00:00Z', 10), rc('2026-01-05T05:00:00Z', 20), rc('2026-03-05T05:00:00Z', 30)]
    const m = buckets(rs, 'month', TZ, 2026, 1)
    expect(m).toHaveLength(12)
    expect(m[0].total).toBe(20)
    expect(m[2].total).toBe(30)
    const y = buckets(rs, 'year', TZ, 2026, 1)
    expect(y.map((x) => [x.key, x.total])).toEqual([['2025', 10], ['2026', 50]])
  })
})

const oi = (price: number, qty: number, status: OrderItem['status'] = 'served'): OrderItem => ({
  id: 'x', orderId: 'o', sessionId: 's', tableId: 't', branchId: 'b', itemId: null, name: 'n', price, qty, note: '',
  detail: '', status, replacedFromId: null, createdAt: '', servedAt: null,
})

describe('hóa đơn', () => {
  it('bỏ món đã hủy / hết, cộng phụ thu VIP', () => {
    const b = billOf([oi(100, 2), oi(50, 1, 'cancelled'), oi(70, 1, 'unavailable')], { kind: 'vip', surcharge: 30 })
    expect(b).toMatchObject({ itemsTotal: 200, surcharge: 30, total: 230 })
  })
  it('bàn thường không phụ thu; phiên trống không phụ thu', () => {
    expect(billOf([oi(100, 1)], { kind: 'normal', surcharge: 99 }).total).toBe(100)
    expect(billOf([], { kind: 'vip', surcharge: 30 }).total).toBe(0)
  })
})

const mi = (id: string, name: string, price = 0, combo: MenuItem['combo'] = null): MenuItem => ({
  id, branchId: 'b', categoryId: null, name, description: '', price, imageUrl: null, isActive: true, combo,
})
const broth = mi('t', 'Lẩu Thái'), broth2 = mi('n', 'Lẩu nấm'), beef = mi('b', 'Bò')
const combo = mi('c', 'Combo lẩu', 300_000, {
  fixed: [{ itemId: 'b', qty: 2 }],
  groups: [{ id: 'g1', name: 'Nước lẩu', min: 1, max: 1, options: [{ itemId: 't', extra: 0 }, { itemId: 'n', extra: 20_000 }] }],
})

describe('combo', () => {
  it('kiểm tra số lượng lựa chọn', () => {
    expect(validateChoices(combo.combo!, {})).toMatch(/tối thiểu/)
    expect(validateChoices(combo.combo!, { g1: ['t', 'n'] })).toMatch(/tối đa/)
    expect(validateChoices(combo.combo!, { g1: ['zzz'] })).toMatch(/không hợp lệ/)
    expect(validateChoices(combo.combo!, { g1: ['t'] })).toBeNull()
  })
  it('giá = gốc + phụ thu lựa chọn; mô tả đủ ý', () => {
    expect(comboUnitPrice(combo, { g1: ['n'] })).toBe(320_000)
    expect(comboDetail(combo, { g1: ['n'] }, [broth, broth2, beef, combo])).toBe('Gồm: Bò ×2\nNước lẩu: Lẩu nấm')
  })
  it('cùng lựa chọn cho cùng khóa dòng', () => {
    expect(lineKey('c', { g1: ['a', 'b'] })).toBe(lineKey('c', { g1: ['b', 'a'] }))
    expect(lineKey('x')).toBe('x')
  })
})
