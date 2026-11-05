import { describe, expect, it } from 'vitest'
import { fetchRange, niceCeil, shortVnd } from './revenue-ui'

describe('revenue-ui', () => {
  it('rút gọn tiền', () => {
    expect(shortVnd(0)).toBe('0')
    expect(shortVnd(85_000)).toBe('85k')
    expect(shortVnd(1_250_000)).toBe('1,25tr')
    expect(shortVnd(2_000_000_000)).toBe('2tỷ')
  })
  it('mốc trục đẹp', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(830_000)).toBe(1_000_000)
    expect(niceCeil(1_100_000)).toBe(2_000_000)
    expect(niceCeil(2_300_000)).toBe(2_500_000)
    expect(niceCeil(3_000_000)).toBe(5_000_000)
  })
  it('khoảng tải có đệm 1 ngày', () => {
    const r = fetchRange('day', 2026, 2, new Date())
    expect(r.from).toBe('2026-01-31T00:00:00.000Z')
    expect(r.to).toBe('2026-03-02T00:00:00.000Z')
  })
})
