'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../AppProvider'
import { Button, Empty, Modal, Stepper, inputCls } from '../ui'
import { itemStatus } from './Availability'
import { ComboDialog } from './ComboDialog'
import { comboDetail, comboUnitPrice, lineKey } from '@/lib/combo'
import { formatVnd } from '@/lib/format'
import type { MenuItem, OrderLine } from '@/lib/types'

interface Common {
  open: boolean
  title: string
  onClose: () => void
  /** gợi ý: ưu tiên danh mục này */
  preferCategoryId?: string | null
  excludeItemId?: string | null
}

type Props =
  | (Common & { mode: 'multi'; onSubmit: (lines: OrderLine[]) => Promise<void> | void })
  | (Common & { mode: 'single'; onSubmit: (item: MenuItem) => Promise<void> | void })

export function ItemPicker(props: Props) {
  const { open, title, onClose, preferCategoryId, excludeItemId } = props
  const { snap, now } = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | 'all'>('all')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  /** Cấu hình từng dòng combo trong giỏ, khóa = lineKey */
  const [combos, setCombos] = useState<Record<string, { itemId: string; choices: Record<string, string[]> }>>({})
  const [comboFor, setComboFor] = useState<MenuItem | null>(null)

  const rows = useMemo(() => {
    if (!snap) return []
    const term = q.trim().toLowerCase()
    return snap.items
      .filter((i) => i.id !== excludeItemId)
      .filter((i) => props.mode === 'multi' || !i.combo)
      .map((item) => ({ item, st: itemStatus(item, snap, now) }))
      .filter(({ st }) => st.kind === 'ok' || st.kind === 'out')
      .filter(({ item }) => (cat === 'all' ? true : item.categoryId === cat))
      .filter(({ item }) => !term || item.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const av = a.st.kind === 'ok' ? 0 : 1
        const bv = b.st.kind === 'ok' ? 0 : 1
        if (av !== bv) return av - bv
        const ap = a.item.categoryId === preferCategoryId ? 0 : 1
        const bp = b.item.categoryId === preferCategoryId ? 0 : 1
        return ap - bp
      })
  }, [snap, now, q, cat, excludeItemId, preferCategoryId, props.mode])

  if (!snap) return null
  const total = Object.values(qty).reduce((s, n) => s + n, 0)
  const sum = Object.entries(qty).reduce((s, [key, n]) => {
    const c = combos[key]
    const it = snap.items.find((i) => i.id === (c?.itemId ?? key))
    return s + n * (it ? comboUnitPrice(it, c?.choices) : 0)
  }, 0)

  async function submitMulti() {
    if (props.mode !== 'multi') return
    setBusy(true)
    const lines = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => ({ itemId: combos[key]?.itemId ?? key, qty: n, note: note[key]?.trim() || undefined, choices: combos[key]?.choices }))
    try {
      await props.onSubmit(lines)
      setQty({})
      setNote({})
      setCombos({})
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-2xl"
      footer={
        props.mode === 'multi' ? (
          <>
            <span className="mr-auto text-sm text-ink-soft">
              {total > 0 ? (
                <>
                  <b className="text-wood-800">{total} món</b> · {formatVnd(sum)}
                </>
              ) : (
                'Chưa chọn món nào'
              )}
            </span>
            <Button variant="ghost" onClick={onClose}>Đóng</Button>
            <Button variant="primary" disabled={total === 0 || busy} onClick={submitMulti}>
              Gửi xuống bếp
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input className={clsx(inputCls, 'pl-9')} placeholder="Tìm món…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: 'all', name: 'Tất cả' }, ...snap.categories].map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={clsx(
                'min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition',
                cat === c.id ? 'bg-wood-800 text-white' : 'bg-cream text-wood-700 ring-1 ring-wood-200 hover:bg-sand',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {rows.length === 0 && <Empty icon={<Search className="size-6" />} title="Không có món phù hợp" />}

        <ul className="space-y-2">
          {rows.map(({ item, st }) => {
            const out = st.kind === 'out'
            const n = qty[item.id] ?? 0
            return (
              <li key={item.id} className={clsx('rounded-2xl bg-white p-3 ring-1', n > 0 ? 'ring-wood-400' : 'ring-wood-100')}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={clsx('truncate font-semibold', out && 'text-ink-soft line-through decoration-brick/50')}>{item.name}</p>
                    <p className="text-xs text-wood-600">
                      {formatVnd(item.price)}
                      {out && <span className="ml-2 font-semibold text-brick">Tạm hết</span>}
                    </p>
                  </div>
                  {props.mode === 'multi' && item.combo ? (
                    <Button variant="primary" size="sm" disabled={out} onClick={() => setComboFor(item)}>
                      Chọn combo
                    </Button>
                  ) : props.mode === 'multi' ? (
                    <Stepper value={n} onChange={(v) => setQty((s) => ({ ...s, [item.id]: v }))} size="sm" max={out ? 0 : 99} />
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={out || busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await props.onSubmit(item)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Chọn món này
                    </Button>
                  )}
                </div>
                {props.mode === 'multi' &&
                  item.combo &&
                  Object.entries(combos)
                    .filter(([key, c]) => c.itemId === item.id && (qty[key] ?? 0) > 0)
                    .map(([key, c]) => (
                      <div key={key} className="mt-2 rounded-xl bg-cream/70 p-2.5">
                        <div className="flex items-start gap-3">
                          <p className="min-w-0 flex-1 whitespace-pre-line text-xs text-wood-700">
                            {comboDetail(item, c.choices, snap.items)}
                            {'\n'}
                            <b>{formatVnd(comboUnitPrice(item, c.choices))}</b>
                          </p>
                          <Stepper value={qty[key] ?? 0} onChange={(v) => setQty((s) => ({ ...s, [key]: v }))} size="sm" />
                        </div>
                        <input
                          className={clsx(inputCls, 'mt-2 min-h-9 text-[13px]')}
                          placeholder="Ghi chú cho bếp"
                          value={note[key] ?? ''}
                          onChange={(e) => setNote((s) => ({ ...s, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                {props.mode === 'multi' && !item.combo && n > 0 && (
                  <input
                    className={clsx(inputCls, 'mt-2 min-h-9 text-[13px]')}
                    placeholder="Ghi chú cho bếp (ít cay, không hành…)"
                    value={note[item.id] ?? ''}
                    onChange={(e) => setNote((s) => ({ ...s, [item.id]: e.target.value }))}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
      {comboFor && (
        <ComboDialog
          item={comboFor}
          items={snap.items}
          isOut={(id) => itemStatus({ ...comboFor, id } as MenuItem, snap, now).kind === 'out'}
          onClose={() => setComboFor(null)}
          onConfirm={(choices, n) => {
            const key = lineKey(comboFor.id, choices)
            setCombos((c) => ({ ...c, [key]: { itemId: comboFor.id, choices } }))
            setQty((s) => ({ ...s, [key]: (s[key] ?? 0) + n }))
            setComboFor(null)
          }}
        />
      )}
    </>
  )
}
