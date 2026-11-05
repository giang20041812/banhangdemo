'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Search, Settings2 } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../AppProvider'
import { Chip, Empty, inputCls } from '../ui'
import { AvailabilityRow, SoldOutDialog, itemStatus } from './Availability'
import { activeMenus } from '@/lib/menu-logic'
import type { MenuItem } from '@/lib/types'

/** Tab "Thực đơn" trong màn vận hành: bật/tắt hết món nhanh, không cần rời sơ đồ */
export function MenuTab() {
  const { snap, now } = useApp()
  const [q, setQ] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)
  const [target, setTarget] = useState<MenuItem | null>(null)

  const groups = useMemo(() => {
    if (!snap) return []
    const term = q.trim().toLowerCase()
    const rows = snap.items
      .map((item) => ({ item, st: itemStatus(item, snap, now) }))
      .filter(({ item }) => !term || item.name.toLowerCase().includes(term))
      .filter(({ st }) => (onlyOut ? st.kind === 'out' : true))
    const cats = [...snap.categories, { id: '', branchId: '', name: 'Khác', sort: 999 }]
    return cats
      .map((c) => ({ cat: c, rows: rows.filter(({ item }) => (item.categoryId ?? '') === c.id) }))
      .filter((g) => g.rows.length)
  }, [snap, now, q, onlyOut])

  if (!snap) return null
  const out = snap.items.filter((i) => itemStatus(i, snap, now).kind === 'out').length
  const active = activeMenus(snap.menus, now, snap.branch.timezone)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-wood-100 bg-cream/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen className="size-4 text-wood-500" />
          <span className="text-sm font-semibold text-wood-800">Đang áp dụng:</span>
          {active.length ? active.map((m) => <Chip key={m.id} tone="solid">{m.name}</Chip>) : <Chip>{snap.menus.length ? 'Không có thực đơn nào' : 'Tất cả món'}</Chip>}
          <Link href="/thuc-don" className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-wood-600 hover:underline">
            <Settings2 className="size-4" /> Quản lý thực đơn
          </Link>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input className={clsx(inputCls, 'pl-9')} placeholder="Tìm món…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button
            onClick={() => setOnlyOut((v) => !v)}
            aria-pressed={onlyOut}
            className={clsx(
              'min-h-11 shrink-0 rounded-xl px-3.5 text-sm font-semibold ring-1 transition',
              onlyOut ? 'bg-brick text-white ring-brick' : 'bg-white text-wood-700 ring-wood-200 hover:bg-cream',
            )}
          >
            Đang hết ({out})
          </button>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {groups.length === 0 && <Empty icon={<Search className="size-6" />} title="Không tìm thấy món" />}
        {groups.map(({ cat, rows }) => (
          <section key={cat.id || 'other'}>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-wood-500">{cat.name}</h3>
            <div className="space-y-2">
              {rows.map(({ item }) => (
                <AvailabilityRow key={item.id} item={item} onToggleOut={setTarget} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <SoldOutDialog item={target} onClose={() => setTarget(null)} />
    </div>
  )
}
