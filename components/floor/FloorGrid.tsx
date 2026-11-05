'use client'

import { Fragment, useRef, useState } from 'react'
import { AlertTriangle, BellRing, ConciergeBell, Crown, Flame, Utensils } from 'lucide-react'
import clsx from 'clsx'
import { edgeFlags, key, labelCell, line, type LayoutTable } from '@/lib/grid/grid'
import type { TableTone } from '@/lib/derive'
import type { Cell, TableKind } from '@/lib/types'

const TONE: Record<TableTone, { bg: string; border: string; text: string }> = {
  empty: { bg: 'bg-cream wood-tile', border: 'border-wood-200', text: 'text-wood-700' },
  dining: { bg: 'bg-leaf-soft', border: 'border-leaf/60', text: 'text-[#3f6a2f]' },
  cooking: { bg: 'bg-wood-500', border: 'border-wood-700', text: 'text-white' },
  new: { bg: 'bg-turmeric', border: 'border-[#b8862a]', text: 'text-wood-900' },
  ready: { bg: 'bg-leaf', border: 'border-[#43692f]', text: 'text-white' },
  attention: { bg: 'bg-brick', border: 'border-[#8d321f]', text: 'text-white' },
}

const ICON: Partial<Record<TableTone, typeof Flame>> = {
  dining: Utensils,
  cooking: Flame,
  new: BellRing,
  ready: ConciergeBell,
  attention: AlertTriangle,
}

export interface GridTable extends Pick<LayoutTable, 'id' | 'code' | 'cells'> {
  seats?: number
  kind?: TableKind
}

interface Props {
  rows: number
  cols: number
  cell: number
  tables: GridTable[]
  toneOf?: (t: GridTable) => { tone: TableTone; badge?: number }
  selectedId?: string | null
  onTableClick?: (id: string) => void
  /** Chế độ vẽ: kéo để chọn nhiều ô liên tiếp */
  draw?: { mode: 'paint' | 'erase'; onCommit: (cells: Cell[]) => void }
}

export function FloorGrid({ rows, cols, cell, tables, toneOf, selectedId, onTableClick, draw }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [stroke, setStroke] = useState<Cell[]>([])
  const last = useRef<Cell | null>(null)
  const active = useRef(false)

  const cellAt = (e: React.PointerEvent): Cell => {
    const rect = ref.current!.getBoundingClientRect()
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * cols)
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * rows)
    return { r: Math.min(rows - 1, Math.max(0, r)), c: Math.min(cols - 1, Math.max(0, c)) }
  }
  const add = (cells: Cell[]) =>
    setStroke((prev) => {
      const m = new Map(prev.map((c) => [key(c), c]))
      for (const c of cells) m.set(key(c), c)
      return [...m.values()]
    })

  const down = (e: React.PointerEvent) => {
    if (!draw) return
    ref.current!.setPointerCapture(e.pointerId)
    active.current = true
    const c = cellAt(e)
    last.current = c
    setStroke([c])
  }
  const move = (e: React.PointerEvent) => {
    if (!draw || !active.current) return
    const c = cellAt(e)
    if (last.current && (last.current.r !== c.r || last.current.c !== c.c)) add(line(last.current, c))
    last.current = c
  }
  const up = () => {
    if (!draw || !active.current) return
    active.current = false
    const cells = stroke
    setStroke([])
    last.current = null
    if (cells.length) draw.onCommit(cells)
  }

  const w = cols * cell
  const h = rows * cell

  return (
    <div
      ref={ref}
      className={clsx('relative rounded-2xl bg-paper shadow-inner ring-1 ring-wood-200', draw && 'cursor-crosshair touch-none')}
      style={{
        width: w,
        height: h,
        backgroundImage:
          'linear-gradient(to right, rgb(139 90 43 / 0.13) 1px, transparent 1px), linear-gradient(to bottom, rgb(139 90 43 / 0.13) 1px, transparent 1px)',
        backgroundSize: `${cell}px ${cell}px`,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {tables.map((t) => {
        const own = new Set(t.cells.map(key))
        const info = toneOf?.(t) ?? { tone: 'empty' as TableTone }
        const tone = TONE[info.tone]
        const lc = labelCell(t.cells)
        const selected = selectedId === t.id
        const Icon = ICON[info.tone]
        const cellsEl = t.cells.map((c) => {
          const e = edgeFlags(c, own)
          const isLabel = c.r === lc.r && c.c === lc.c
          const R = Math.min(14, cell / 3)
          return (
            <div
              key={`${t.id}:${key(c)}`}
              className="absolute"
              style={{ left: c.c * cell, top: c.r * cell, width: cell, height: cell }}
              onClick={() => !draw && onTableClick?.(t.id)}
            >
              <div
                className={clsx(
                  'relative flex h-full w-full items-center justify-center border-0 transition-colors',
                  tone.bg,
                  tone.border,
                  tone.text,
                  !draw && onTableClick && 'cursor-pointer',
                  selected && 'z-10',
                  t.kind === 'vip' && 'vip-cell',
                )}
                style={{
                  marginTop: e.top ? 2 : 0,
                  marginBottom: e.bottom ? 2 : 0,
                  marginLeft: e.left ? 2 : 0,
                  marginRight: e.right ? 2 : 0,
                  height: cell - (e.top ? 2 : 0) - (e.bottom ? 2 : 0),
                  width: cell - (e.left ? 2 : 0) - (e.right ? 2 : 0),
                  borderTopWidth: e.top ? 2 : 0,
                  borderBottomWidth: e.bottom ? 2 : 0,
                  borderLeftWidth: e.left ? 2 : 0,
                  borderRightWidth: e.right ? 2 : 0,
                  borderStyle: 'solid',
                  borderTopLeftRadius: e.top && e.left ? R : 0,
                  borderTopRightRadius: e.top && e.right ? R : 0,
                  borderBottomLeftRadius: e.bottom && e.left ? R : 0,
                  borderBottomRightRadius: e.bottom && e.right ? R : 0,
                }}
              >
                {isLabel && (
                  <button
                    type="button"
                    tabIndex={draw ? -1 : 0}
                    aria-label={`Bàn ${t.code}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      if (!draw) onTableClick?.(t.id)
                    }}
                    className="flex flex-col items-center justify-center leading-none outline-offset-4"
                  >
                    <span className="flex items-center gap-0.5 font-display font-bold" style={{ fontSize: Math.max(11, Math.min(17, cell * 0.34)) }}>
                      {t.kind === 'vip' && <Crown aria-label="Bàn VIP" className="size-3 shrink-0 text-[#b8862a]" style={{ width: Math.max(10, cell * 0.26), height: Math.max(10, cell * 0.26) }} />}
                      {t.code}
                    </span>
                    {cell >= 40 && Icon && <Icon className="mt-1 size-3.5 opacity-90" />}
                    {cell >= 40 && !Icon && t.seats ? (
                      <span className="mt-1 text-[10px] font-medium opacity-70">{t.seats} chỗ</span>
                    ) : null}
                  </button>
                )}
              </div>
            </div>
          )
        })

        // Badge ở góc trên-phải của bàn (ô hàng trên cùng, bên phải nhất) để không che mã bàn
        const topCell = t.cells.reduce((best, c) => (c.r < best.r || (c.r === best.r && c.c > best.c) ? c : best))
        const R = Math.min(14, cell / 3)
        return (
          <Fragment key={t.id}>
            {cellsEl}
            {selected &&
              t.cells.map((c) => {
                const e = edgeFlags(c, own)
                return (
                  <div
                    key={`ring:${key(c)}`}
                    className="pointer-events-none absolute z-10 border-0 border-solid border-wood-900"
                    style={{
                      left: c.c * cell - (e.left ? 1 : 0),
                      top: c.r * cell - (e.top ? 1 : 0),
                      width: cell + (e.left ? 1 : 0) + (e.right ? 1 : 0),
                      height: cell + (e.top ? 1 : 0) + (e.bottom ? 1 : 0),
                      borderTopWidth: e.top ? 3 : 0,
                      borderBottomWidth: e.bottom ? 3 : 0,
                      borderLeftWidth: e.left ? 3 : 0,
                      borderRightWidth: e.right ? 3 : 0,
                      borderTopLeftRadius: e.top && e.left ? R + 2 : 0,
                      borderTopRightRadius: e.top && e.right ? R + 2 : 0,
                      borderBottomLeftRadius: e.bottom && e.left ? R + 2 : 0,
                      borderBottomRightRadius: e.bottom && e.right ? R + 2 : 0,
                    }}
                  />
                )
              })}
            {!!info.badge && (
              <span
                className={clsx(
                  'pointer-events-none absolute z-20 grid min-w-5 place-items-center rounded-full border-2 border-paper px-1 text-[11px] font-bold leading-5',
                  info.tone === 'attention' ? 'animate-pulse-soft bg-brick text-white' : 'bg-wood-900 text-white',
                )}
                style={{ left: (topCell.c + 1) * cell - 14, top: topCell.r * cell - 6 }}
              >
                {info.badge}
              </span>
            )}
          </Fragment>
        )
      })}

      {stroke.map((c) => (
        <div
          key={`p:${key(c)}`}
          className={clsx(
            'pointer-events-none absolute rounded-md',
            draw?.mode === 'erase' ? 'bg-brick/35 ring-2 ring-inset ring-brick' : 'bg-wood-400/45 ring-2 ring-inset ring-wood-500',
          )}
          style={{ left: c.c * cell + 2, top: c.r * cell + 2, width: cell - 4, height: cell - 4 }}
        />
      ))}
    </div>
  )
}
