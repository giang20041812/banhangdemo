import { describe, it, expect } from 'vitest'
import { paint, erase, components, nextCode, line, type LayoutTable, type Ids } from './grid'

let n = 0
const ids: Ids = { newId: () => `id${++n}`, newToken: () => `tok${n}` }
const cells = (...p: [number, number][]) => p.map(([r, c]) => ({ r, c }))
const opts = { rows: 10, cols: 10 }

describe('paint', () => {
  it('ô tách rời tạo nhiều bàn, ô sát nhau thành một bàn', () => {
    const { tables, events } = paint([], cells([0, 0], [0, 1], [5, 5]), opts, ids)
    expect(tables).toHaveLength(2)
    expect(tables.map((t) => t.code).sort()).toEqual(['B01', 'B02'])
    expect(events.filter((e) => e.type === 'created')).toHaveLength(2)
    expect(tables.find((t) => t.cells.length === 2)!.seats).toBe(4)
  })

  it('ô sát một bàn thì mở rộng bàn đó', () => {
    const a = paint([], cells([0, 0], [0, 1]), opts, ids).tables
    const { tables, events } = paint(a, cells([0, 2]), opts, ids)
    expect(tables).toHaveLength(1)
    expect(tables[0].cells).toHaveLength(3)
    expect(events[0].type).toBe('extended')
  })

  it('nét vẽ nối hai bàn thì gộp thành một', () => {
    let t = paint([], cells([0, 0]), opts, ids).tables
    t = paint(t, cells([0, 4]), opts, ids).tables
    expect(t).toHaveLength(2)
    const { tables, events } = paint(t, cells([0, 1], [0, 2], [0, 3]), opts, ids)
    expect(tables).toHaveLength(1)
    expect(tables[0].cells).toHaveLength(5)
    expect(tables[0].code).toBe('B01')
    expect(events[0]).toMatchObject({ type: 'merged', into: 'B01' })
  })

  it('ô vẽ sát bàn có sẵn luôn được ghép vào bàn đó', () => {
    const a = paint([], cells([0, 0]), opts, ids).tables
    const { tables } = paint(a, cells([0, 1]), opts, ids)
    expect(tables).toHaveLength(1)
    expect(tables[0].cells).toHaveLength(2)
  })

  it('bỏ qua ô đã thuộc bàn và ô ngoài lưới', () => {
    const a = paint([], cells([0, 0]), opts, ids).tables
    const { tables } = paint(a, cells([0, 0], [-1, 0], [0, 99]), opts, ids)
    expect(tables).toHaveLength(1)
    expect(tables[0].cells).toHaveLength(1)
  })

  it('chéo góc không tính là sát nhau', () => {
    const { tables } = paint([], cells([0, 0], [1, 1]), opts, ids)
    expect(tables).toHaveLength(2)
  })

  it('không đụng mã bàn của tầng khác', () => {
    const { tables } = paint([], cells([0, 0]), { ...opts, reservedCodes: ['B01', 'B02'] }, ids)
    expect(tables[0].code).toBe('B03')
  })
})

describe('erase', () => {
  const base = (): LayoutTable[] => paint([], cells([0, 0], [0, 1], [0, 2]), opts, ids).tables

  it('xóa hết ô thì xóa bàn', () => {
    const { tables, events } = erase(base(), cells([0, 0], [0, 1], [0, 2]), {}, ids)
    expect(tables).toHaveLength(0)
    expect(events[0].type).toBe('removed')
  })

  it('xóa ô giữa thì tách bàn, bàn lớn giữ mã cũ', () => {
    const b = paint([], cells([0, 0], [0, 1], [0, 2], [0, 3]), opts, ids).tables
    const { tables, events } = erase(b, cells([0, 1]), {}, ids)
    expect(tables).toHaveLength(2)
    expect(events[0].type).toBe('split')
    const old = tables.find((t) => t.code === 'B01')!
    expect(old.cells).toHaveLength(2)
    expect(new Set(tables.map((t) => t.qrToken)).size).toBe(2)
  })

  it('xóa ô đầu mút chỉ thu nhỏ bàn', () => {
    const { tables } = erase(base(), cells([0, 2]), {}, ids)
    expect(tables).toHaveLength(1)
    expect(tables[0].cells).toHaveLength(2)
    expect(tables[0].seats).toBe(4)
  })
})

describe('helpers', () => {
  it('components', () => {
    expect(components(cells([0, 0], [0, 1], [3, 3]))).toHaveLength(2)
  })
  it('nextCode lấp chỗ trống', () => {
    expect(nextCode(['B01', 'B03'])).toBe('B02')
  })
  it('line phủ đủ ô khi kéo nhanh', () => {
    expect(line({ r: 0, c: 0 }, { r: 0, c: 5 })).toHaveLength(6)
  })
})
