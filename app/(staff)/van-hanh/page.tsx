'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BookOpen, LayoutGrid, PencilRuler, Users } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/components/AppProvider'
import { FloorGrid } from '@/components/floor/FloorGrid'
import { TablePanel } from '@/components/kanban/TablePanel'
import { MenuTab } from '@/components/menu/MenuTab'
import { itemStatus } from '@/components/menu/Availability'
import { Button, Empty } from '@/components/ui'
import { ago } from '@/lib/format'
import { TONE_LABEL, serveQueue, tableState, type TableTone } from '@/lib/derive'

type Tab = 'table' | 'menu'

export default function OperationsPage() {
  const { snap, now } = useApp()
  const [floorId, setFloorId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('table')
  const [expanded, setExpanded] = useState(false)
  const [drawer, setDrawer] = useState(false) // chỉ dùng trên màn hình hẹp
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapW, setMapW] = useState(900)

  useEffect(() => {
    if (!mapRef.current) return
    const ro = new ResizeObserver(([e]) => setMapW(e.contentRect.width))
    ro.observe(mapRef.current)
    return () => ro.disconnect()
  }, [])

  const floor = snap?.floors.find((f) => f.id === floorId) ?? snap?.floors[0]
  // nếu bàn đang chọn bị xóa
  useEffect(() => {
    if (snap && selectedId && !snap.tables.some((t) => t.id === selectedId)) setSelectedId(null)
  }, [snap, selectedId])

  const states = useMemo(() => {
    const m = new Map<string, ReturnType<typeof tableState>>()
    if (snap) for (const t of snap.tables) m.set(t.id, tableState(t, snap, now))
    return m
  }, [snap, now])

  const queue = useMemo(() => (snap ? serveQueue(snap) : []), [snap])
  const rankOf = useMemo(() => new Map(queue.map((q, i) => [q.tableId, i + 1])), [queue])

  if (!snap) {
    return <div className="grid h-full place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div>
  }

  if (!snap.floors.length || !floor) {
    return (
      <Empty
        icon={<PencilRuler className="size-7" />}
        title="Chưa có sơ đồ bàn"
        hint="Vẽ sơ đồ tầng đầu tiên để bắt đầu nhận khách."
      />
    )
  }

  const floorTables = snap.tables.filter((t) => t.floorId === floor.id)
  const floorStat = (fid: string) => {
    const ts = snap.tables.filter((t) => t.floorId === fid)
    return {
      attention: ts.reduce((s, t) => s + (states.get(t.id)?.counts.attention ?? 0), 0),
      busy: ts.filter((t) => states.get(t.id)?.tone !== 'empty').length,
      total: ts.length,
    }
  }
  const totalAttention = snap.tables.reduce((s, t) => s + (states.get(t.id)?.counts.attention ?? 0), 0)
  const outItems = snap.items.filter((i) => itemStatus(i, snap, now).kind === 'out').length
  const cell = Math.max(28, Math.min(64, Math.floor((mapW - 24) / floor.cols)))
  const selected = snap.tables.find((t) => t.id === selectedId)

  function pick(id: string) {
    setSelectedId(id)
    setTab('table')
    setDrawer(true)
  }
  function jumpToAttention() {
    const t = snap!.tables.find((x) => (states.get(x.id)?.counts.attention ?? 0) > 0)
    if (!t) return
    setFloorId(t.floorId)
    pick(t.id)
  }

  const legend: TableTone[] = ['empty', 'new', 'cooking', 'ready', 'dining', 'attention']
  const LEGEND_SWATCH: Record<TableTone, string> = {
    empty: 'bg-cream border-wood-200',
    new: 'bg-turmeric border-[#b8862a]',
    cooking: 'bg-wood-500 border-wood-700',
    ready: 'bg-leaf border-[#43692f]',
    dining: 'bg-leaf-soft border-leaf/60',
    attention: 'bg-brick border-[#8d321f]',
  }

  const panelWidth = expanded ? 'xl:w-[min(880px,62vw)]' : 'xl:w-[500px]'

  return (
    <div className="relative flex h-full">
      {/* ======= Sơ đồ ======= */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-wood-100 bg-paper/90 px-3 py-2 backdrop-blur sm:px-4 sm:py-2.5">
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Tầng">
            {snap.floors.map((f) => {
              const st = floorStat(f.id)
              const on = f.id === floor.id
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFloorId(f.id)}
                  className={clsx(
                    'touch-target flex shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
                    on ? 'bg-wood-800 text-white shadow-warm' : 'bg-cream text-wood-700 ring-1 ring-wood-200 hover:bg-sand',
                  )}
                >
                  {f.name}
                  <span className={clsx('rounded-full px-1.5 text-xs', on ? 'bg-white/20' : 'bg-white')}>{st.busy}/{st.total}</span>
                  {st.attention > 0 && <span className="size-2 animate-pulse-soft rounded-full bg-brick" aria-label="Có món cần xử lý" />}
                </button>
              )
            })}
          </div>

          {totalAttention > 0 && (
            <button
              onClick={jumpToAttention}
              className="touch-target flex animate-pulse-soft items-center gap-2 rounded-xl bg-brick px-3.5 text-sm font-bold text-white shadow-warm"
            >
              <AlertTriangle className="size-4" /> {totalAttention} món cần xử lý
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant={tab === 'menu' && drawer ? 'primary' : 'secondary'} className="xl:hidden" onClick={() => { setTab('menu'); setDrawer(true) }}>
              <BookOpen className="size-4" /> Thực đơn {outItems > 0 && <span className="rounded-full bg-brick px-1.5 text-xs text-white">{outItems}</span>}
            </Button>
          </div>
        </div>

        {queue.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-wood-100 bg-cream/70 px-3 py-2 sm:px-4">
            <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-wood-700">Thứ tự ra món</span>
            <ol className="scroll-thin flex gap-1.5 overflow-x-auto">
              {queue.map((q, i) => {
                const t = snap.tables.find((x) => x.id === q.tableId)
                if (!t) return null
                return (
                  <li key={q.tableId} className="shrink-0">
                    <button
                      onClick={() => { setFloorId(t.floorId); pick(t.id) }}
                      className={clsx(
                        'flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold ring-1 transition hover:bg-sand',
                        i === 0 ? 'bg-brick text-white ring-brick hover:bg-brick' : 'bg-white text-wood-800 ring-wood-200',
                      )}
                    >
                      <span className="font-bold">#{i + 1}</span> {t.code}
                      <span className="text-xs font-medium opacity-80">{q.pending} món · {ago(q.since, now)}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        <div ref={mapRef} className="scroll-thin min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          {floorTables.length === 0 ? (
            <div className="mx-auto max-w-md pt-10">
              <Empty
                icon={<LayoutGrid className="size-7" />}
                title={`${floor.name} chưa có bàn`}
                hint="Vào trang Sơ đồ bàn, chọn các ô sát nhau để tạo bàn."
              />
              <div className="text-center"><Link href="/so-do" className="inline-flex min-h-11 items-center rounded-xl bg-wood-500 px-5 font-semibold text-white shadow-warm hover:bg-wood-600">Vẽ sơ đồ</Link></div>
            </div>
          ) : (
            <div className="mx-auto w-fit">
              <FloorGrid
                rows={floor.rows}
                cols={floor.cols}
                cell={cell}
                tables={floorTables}
                selectedId={selectedId}
                onTableClick={pick}
                toneOf={(t) => {
                  const s = states.get(t.id)
                  return { tone: s?.tone ?? 'empty', badge: s?.tone === 'empty' ? undefined : s?.pending, rank: rankOf.get(t.id) }
                }}
              />
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft" aria-label="Chú thích màu bàn">
                {legend.map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className={clsx('size-3.5 rounded border-2', LEGEND_SWATCH[t])} />
                    {TONE_LABEL[t]}
                  </li>
                ))}
                <li className="flex items-center gap-1.5"><Users className="size-3.5" /> Số trên bàn = món chưa đưa lên</li>
                <li className="flex items-center gap-1.5"><span className="rounded bg-brick px-1 text-[10px] font-bold text-white">#1</span> Thứ tự ra món (gọi trước ra trước)</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ======= Panel bên phải ======= */}
      <aside
        className={clsx(
          'z-20 flex min-h-0 flex-col border-l border-wood-200 bg-paper shadow-lift transition-[width] duration-200',
          // xl: cố định bên cạnh; nhỏ hơn: trượt đè lên như ngăn kéo
          'fixed inset-x-0 bottom-[var(--bottom-nav-h)] top-[calc(60px+env(safe-area-inset-top))] md:bottom-0 xl:static xl:inset-auto xl:shadow-none',
          panelWidth,
          drawer ? 'translate-x-0' : 'translate-x-full xl:translate-x-0',
          'transition-transform xl:transition-[width]',
        )}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-wood-100 bg-cream/60 p-1.5" role="tablist">
          {(
            [
              ['table', selected ? `Bàn ${selected.code}` : 'Bàn', LayoutGrid],
              ['menu', 'Thực đơn', BookOpen],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                'touch-target flex flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition',
                tab === id ? 'bg-wood-500 text-white shadow-warm' : 'text-wood-700 hover:bg-sand',
              )}
            >
              <Icon className="size-4" /> {label}
              {id === 'menu' && outItems > 0 && (
                <span className={clsx('rounded-full px-1.5 text-xs', tab === id ? 'bg-white/25' : 'bg-brick text-white')}>{outItems} hết</span>
              )}
            </button>
          ))}
          <button onClick={() => setDrawer(false)} className="touch-target px-3 text-sm font-semibold text-wood-600 xl:hidden">Đóng</button>
        </div>

        <div className="min-h-0 flex-1">
          {tab === 'menu' ? (
            <MenuTab />
          ) : selected ? (
            <TablePanel
              tableId={selected.id}
              expanded={expanded}
              onToggleExpand={() => setExpanded((v) => !v)}
              onClose={() => {
                setSelectedId(null)
                setDrawer(false)
              }}
            />
          ) : (
            <Empty
              icon={<LayoutGrid className="size-7" />}
              title="Chọn một bàn trên sơ đồ"
              hint="Bấm vào bàn để xem các món khách đã gọi, chuyển trạng thái và xử lý món hết."
            />
          )}
        </div>
      </aside>
    </div>
  )
}
