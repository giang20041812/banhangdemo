import type { Cell } from '../types'

/**
 * Logic thuần của trình vẽ sơ đồ: chọn các ô sát nhau thì tự ghép thành bàn.
 * Không phụ thuộc React / DB để dễ test.
 */

export interface LayoutTable {
  id: string
  code: string
  seats: number
  cells: Cell[]
  qrToken: string
}

export type LayoutEvent =
  | { type: 'created'; code: string }
  | { type: 'extended'; code: string }
  | { type: 'merged'; codes: string[]; into: string }
  | { type: 'split'; from: string; created: string[] }
  | { type: 'removed'; code: string }

export interface Ids {
  newId: () => string
  newToken: () => string
}

export const SEATS_PER_CELL = 2

export const key = (c: Cell) => `${c.r},${c.c}`
export const parseKey = (k: string): Cell => {
  const [r, c] = k.split(',').map(Number)
  return { r, c }
}

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/** Các thành phần liên thông (4 hướng) của một tập ô */
export function components(cells: Cell[]): Cell[][] {
  const left = new Map(cells.map((c) => [key(c), c]))
  const result: Cell[][] = []
  while (left.size) {
    const [startKey, start] = left.entries().next().value as [string, Cell]
    left.delete(startKey)
    const comp: Cell[] = [start]
    const stack: Cell[] = [start]
    while (stack.length) {
      const cur = stack.pop()!
      for (const [dr, dc] of NEIGHBORS) {
        const n = { r: cur.r + dr, c: cur.c + dc }
        const k = key(n)
        if (left.has(k)) {
          left.delete(k)
          comp.push(n)
          stack.push(n)
        }
      }
    }
    result.push(comp)
  }
  return result
}

export function occupancy(tables: LayoutTable[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of tables) for (const c of t.cells) m.set(key(c), t.id)
  return m
}

/** Mã bàn kế tiếp còn trống: B01, B02… */
export function nextCode(existing: Iterable<string>): string {
  const used = new Set(existing)
  for (let i = 1; ; i++) {
    const code = `B${String(i).padStart(2, '0')}`
    if (!used.has(code)) return code
  }
}

export interface PaintOptions {
  /** Các mã bàn đã dùng ở nơi khác (tầng khác) để không trùng */
  reservedCodes?: Iterable<string>
  rows: number
  cols: number
}

export function paint(
  tables: LayoutTable[],
  cells: Cell[],
  opts: PaintOptions,
  ids: Ids,
): { tables: LayoutTable[]; events: LayoutEvent[] } {
  const events: LayoutEvent[] = []
  let result = tables.map((t) => ({ ...t, cells: [...t.cells] }))
  const occ = occupancy(result)
  const inBounds = (c: Cell) => c.r >= 0 && c.c >= 0 && c.r < opts.rows && c.c < opts.cols
  const fresh = dedupe(cells).filter((c) => inBounds(c) && !occ.has(key(c)))

  for (const comp of components(fresh)) {
    const compKeys = new Set(comp.map(key))
    const touching = new Set<string>()
    for (const cell of comp) {
      for (const [dr, dc] of NEIGHBORS) {
        const id = occ.get(key({ r: cell.r + dr, c: cell.c + dc }))
        if (id) touching.add(id)
      }
    }
    const touched = result.filter((t) => touching.has(t.id))

    if (touched.length === 0) {
      const code = nextCode([...result.map((t) => t.code), ...(opts.reservedCodes ?? [])])
      const t: LayoutTable = {
        id: ids.newId(),
        code,
        seats: comp.length * SEATS_PER_CELL,
        cells: comp,
        qrToken: ids.newToken(),
      }
      result.push(t)
      for (const c of comp) occ.set(key(c), t.id)
      events.push({ type: 'created', code })
    } else {
      // giữ bàn có mã nhỏ nhất, gộp các bàn còn lại vào
      const [keep, ...others] = [...touched].sort((a, b) => a.code.localeCompare(b.code))
      keep.cells.push(...comp)
      for (const o of others) keep.cells.push(...o.cells)
      keep.seats = keep.cells.length * SEATS_PER_CELL
      for (const c of keep.cells) occ.set(key(c), keep.id)
      if (others.length) {
        const gone = new Set(others.map((o) => o.id))
        result = result.filter((t) => !gone.has(t.id))
        events.push({ type: 'merged', codes: [keep, ...others].map((t) => t.code), into: keep.code })
      } else if (compKeys.size) {
        events.push({ type: 'extended', code: keep.code })
      }
    }
  }
  return { tables: result, events }
}

export function erase(
  tables: LayoutTable[],
  cells: Cell[],
  opts: { reservedCodes?: Iterable<string> },
  ids: Ids,
): { tables: LayoutTable[]; events: LayoutEvent[] } {
  const events: LayoutEvent[] = []
  const kill = new Set(cells.map(key))
  const out: LayoutTable[] = []

  for (const t of tables) {
    const remaining = t.cells.filter((c) => !kill.has(key(c)))
    if (remaining.length === t.cells.length) {
      out.push(t)
      continue
    }
    if (remaining.length === 0) {
      events.push({ type: 'removed', code: t.code })
      continue
    }
    const comps = components(remaining).sort((a, b) => b.length - a.length)
    const [main, ...rest] = comps
    out.push({ ...t, cells: main, seats: Math.max(SEATS_PER_CELL, main.length * SEATS_PER_CELL) })
    if (rest.length) {
      const created: string[] = []
      for (const comp of rest) {
        const code = nextCode([...out.map((x) => x.code), ...tables.map((x) => x.code), ...(opts.reservedCodes ?? [])])
        out.push({
          id: ids.newId(),
          code,
          seats: comp.length * SEATS_PER_CELL,
          cells: comp,
          qrToken: ids.newToken(),
        })
        created.push(code)
      }
      events.push({ type: 'split', from: t.code, created })
    }
  }
  return { tables: out, events }
}

function dedupe(cells: Cell[]): Cell[] {
  const m = new Map(cells.map((c) => [key(c), c]))
  return [...m.values()]
}

/** Hộp bao quanh của bàn, dùng để đặt nhãn */
export function bounds(cells: Cell[]) {
  const rs = cells.map((c) => c.r)
  const cs = cells.map((c) => c.c)
  return { r0: Math.min(...rs), r1: Math.max(...rs), c0: Math.min(...cs), c1: Math.max(...cs) }
}

/** Ô nên đặt nhãn: ô gần tâm hộp bao nhất mà thực sự thuộc bàn */
export function labelCell(cells: Cell[]): Cell {
  const b = bounds(cells)
  const cr = (b.r0 + b.r1) / 2
  const cc = (b.c0 + b.c1) / 2
  return [...cells].sort((a, z) => dist(a, cr, cc) - dist(z, cr, cc))[0]
}
const dist = (c: Cell, r: number, cc: number) => (c.r - r) ** 2 + (c.c - cc) ** 2

/** Các ô thuộc bàn: cho biết cạnh nào cần vẽ viền (không sát ô cùng bàn) */
export function edgeFlags(cell: Cell, own: Set<string>) {
  return {
    top: !own.has(key({ r: cell.r - 1, c: cell.c })),
    bottom: !own.has(key({ r: cell.r + 1, c: cell.c })),
    left: !own.has(key({ r: cell.r, c: cell.c - 1 })),
    right: !own.has(key({ r: cell.r, c: cell.c + 1 })),
  }
}

/** Các ô trên đường kéo từ a đến b (đường thẳng liên tục, tránh hụt ô khi kéo nhanh) */
export function line(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = []
  const n = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c))
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    out.push({ r: Math.round(a.r + (b.r - a.r) * t), c: Math.round(a.c + (b.c - a.c) * t) })
  }
  return out
}
