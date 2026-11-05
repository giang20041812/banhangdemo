'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Check, ChefHat, Clock, ConciergeBell, Maximize2, Minimize2,
  MoreHorizontal, Plus, QrCode, Replace, Sparkles, Trash2, Undo2, UtensilsCrossed, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../AppProvider'
import { useToast } from '../Toast'
import { Button, Chip, Empty, Field, Modal, Stepper, inputCls } from '../ui'
import { ItemPicker } from '../menu/ItemPicker'
import { SoldOutDialog } from '../menu/Availability'
import { liveItems, needsAttention } from '@/lib/derive'
import { ago, minutesSince } from '@/lib/format'
import { isUnavailable } from '@/lib/menu-logic'
import { STATUS_LABEL, type MenuItem, type OrderItem, type OrderStatus } from '@/lib/types'
import Link from 'next/link'

type Col = 'new' | 'cooking' | 'ready' | 'served'
const COLS: { id: Col; icon: typeof Clock; dot: string; next?: OrderStatus; nextLabel?: string; bulkLabel?: string }[] = [
  { id: 'new', icon: Sparkles, dot: 'bg-turmeric', next: 'cooking', nextLabel: 'Bắt đầu làm', bulkLabel: 'Bắt đầu làm tất cả' },
  { id: 'cooking', icon: ChefHat, dot: 'bg-wood-500', next: 'ready', nextLabel: 'Xong món', bulkLabel: 'Đánh dấu xong tất cả' },
  { id: 'ready', icon: ConciergeBell, dot: 'bg-leaf', next: 'served', nextLabel: 'Đưa lên', bulkLabel: 'Đưa lên cùng lúc' },
  { id: 'served', icon: Check, dot: 'bg-wood-200' },
]

interface Props {
  tableId: string
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
}

export function TablePanel({ tableId, expanded, onToggleExpand, onClose }: Props) {
  const { backend, snap, now, run } = useApp()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<OrderItem | null>(null)
  const [replacing, setReplacing] = useState<OrderItem | null>(null)
  const [ordering, setOrdering] = useState(false)
  const [closing, setClosing] = useState(false)
  const [soldOut, setSoldOut] = useState<MenuItem | null>(null)
  const [dragOver, setDragOver] = useState<Col | null>(null)

  const table = snap?.tables.find((t) => t.id === tableId)
  const floor = snap?.floors.find((f) => f.id === table?.floorId)
  const session = snap?.sessions.find((s) => s.tableId === tableId)

  const items = useMemo(() => (snap ? liveItems(snap, tableId) : []), [snap, tableId])
  const attention = items.filter((o) => snap && needsAttention(o, snap, now))
  const attentionIds = new Set(attention.map((a) => a.id))
  const byCol = (c: Col) => items.filter((o) => !attentionIds.has(o.id) && o.status === c)

  if (!snap || !table) return null
  const seqOf = (o: OrderItem) => snap.orders.find((x) => x.id === o.orderId)
  const pendingCount = items.filter((o) => o.status !== 'served').length

  // ---- thao tác
  async function move(ids: string[], to: OrderStatus) {
    if (!ids.length) return
    const before = ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) as OrderItem[]
    const ok = await run(async () => {
      await backend.setStatus(ids, to)
      return true
    })
    if (!ok) return
    setSelected(new Set())
    toast({
      text: `${before.length} món → ${STATUS_LABEL[to]}`,
      tone: 'success',
      ms: 5000,
      action: {
        label: 'Hoàn tác',
        run: () => {
          const groups = new Map<OrderStatus, string[]>()
          for (const b of before) groups.set(b.status, [...(groups.get(b.status) ?? []), b.id])
          void run(async () => {
            for (const [st, list] of groups) await backend.setStatus(list, st)
          })
        },
      },
    })
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function cancel(o: OrderItem) {
    const ok = await run(async () => {
      await backend.setStatus([o.id], 'cancelled')
      return true
    })
    if (ok)
      toast({
        text: `Đã hủy "${o.name}"`,
        action: { label: 'Hoàn tác', run: () => void run(() => backend.setStatus([o.id], o.status)) },
      })
    setEditing(null)
  }

  async function flagOut(o: OrderItem) {
    await run(() => backend.setStatus([o.id], 'unavailable'))
    setEditing(null)
    const item = snap!.items.find((i) => i.id === o.itemId)
    toast({
      text: `"${o.name}" chuyển sang Cần xử lý`,
      tone: 'warn',
      action: item ? { label: 'Báo hết toàn quán', run: () => setSoldOut(item) } : undefined,
    })
  }

  const cardProps = (o: OrderItem) => ({
    o,
    order: seqOf(o),
    now,
    selected: selected.has(o.id),
    onSelect: () => toggle(o.id),
    onEdit: () => setEditing(o),
    onDragStart: (e: React.DragEvent) => {
      const ids = selected.has(o.id) ? [...selected] : [o.id]
      e.dataTransfer.setData('text/plain', JSON.stringify(ids))
      e.dataTransfer.effectAllowed = 'move'
    },
  })

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-paper" aria-label={`Bàn ${table.code}`}>
      {/* Header */}
      <div className="wood-surface flex shrink-0 items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-2xl font-bold leading-none">Bàn {table.code}</h2>
            <span className="truncate text-sm text-wood-200">
              {floor?.name} · {table.seats} chỗ
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-wood-200">
            {session ? (
              <>
                <Clock className="size-3.5" /> Khách ngồi {minutesSince(session.openedAt, now)} phút
                {pendingCount > 0 && <> · còn {pendingCount} món chưa đưa lên</>}
              </>
            ) : (
              'Bàn đang trống'
            )}
          </p>
        </div>
        <button onClick={onToggleExpand} className="touch-target hidden place-items-center rounded-xl text-wood-100 hover:bg-white/10 xl:grid" aria-label={expanded ? 'Thu nhỏ' : 'Mở rộng'}>
          {expanded ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </button>
        <button onClick={onClose} className="touch-target grid place-items-center rounded-xl text-wood-100 hover:bg-white/10" aria-label="Đóng bàn">
          <X className="size-5" />
        </button>
      </div>

      {/* Thanh hành động */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-wood-100 bg-cream/70 px-4 py-2.5">
        <Button variant="primary" onClick={() => setOrdering(true)}>
          <Plus className="size-4" /> Gọi món cho khách
        </Button>
        <Link href={`/qr?table=${table.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cream px-3 text-[13px] font-semibold text-wood-800 ring-1 ring-wood-200 hover:bg-sand">
          <QrCode className="size-4" /> QR
        </Link>
        <Button variant="secondary" className="ml-auto" onClick={() => setClosing(true)} disabled={!session}>
          <UtensilsCrossed className="size-4" /> Dọn bàn
        </Button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {!session && items.length === 0 ? (
          <Empty
            icon={<UtensilsCrossed className="size-7" />}
            title="Bàn đang trống"
            hint="Khi khách quét QR gọi món, đơn sẽ hiện ở đây ngay. Bạn cũng có thể gọi món hộ khách."
          />
        ) : (
          <div className="space-y-4">
            {/* Làn Cần xử lý */}
            {attention.length > 0 && (
              <div className="rounded-2xl border-2 border-brick/50 bg-brick-soft/60 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-brick">
                  <AlertTriangle className="size-4" /> Cần xử lý ({attention.length})
                  <span className="font-normal text-brick/80">· món hết, cần đổi hoặc hủy cho khách</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {attention.map((o) => {
                    const back = o.itemId && !isUnavailable(o.itemId, snap.unavailability, now) && o.status === 'unavailable'
                    return (
                      <div key={o.id} className="rounded-xl bg-white p-3 shadow-warm ring-1 ring-brick/30">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-snug">
                            {o.qty}× {o.name}
                          </p>
                          <Chip tone="brick">Hết món</Chip>
                        </div>
                        {o.note && <p className="mt-1 text-xs text-ink-soft">“{o.note}”</p>}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button size="sm" variant="primary" onClick={() => setReplacing(o)}>
                            <Replace className="size-4" /> Đổi món
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void cancel(o)}>
                            <Trash2 className="size-4" /> Hủy
                          </Button>
                          {back && (
                            <Button size="sm" variant="leaf" onClick={() => void run(() => backend.setStatus([o.id], 'new'))}>
                              <Undo2 className="size-4" /> Món đã có lại
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Kanban */}
            <div className={clsx('grid items-start gap-3 pb-16', expanded ? 'grid-cols-4' : 'grid-cols-1')}>
              {COLS.map((col) => {
                const list = byCol(col.id)
                const ids = list.map((l) => l.id)
                const allSel = ids.length > 0 && ids.every((id) => selected.has(id))
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(col.id)
                    }}
                    onDragLeave={() => setDragOver((d) => (d === col.id ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(null)
                      try {
                        const dropped = JSON.parse(e.dataTransfer.getData('text/plain')) as string[]
                        const changed = dropped.filter((id) => items.find((i) => i.id === id)?.status !== col.id)
                        void move(changed, col.id)
                      } catch {}
                    }}
                    className={clsx(
                      'flex flex-col rounded-2xl bg-cream/80 p-2 ring-1 transition',
                      expanded && 'min-h-40',
                      dragOver === col.id ? 'bg-wood-100 ring-2 ring-wood-500' : 'ring-wood-100',
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span className={clsx('size-2.5 rounded-full', col.dot)} />
                      <h3 className="text-sm font-bold text-wood-800">{STATUS_LABEL[col.id]}</h3>
                      <span className="rounded-full bg-white px-2 text-xs font-bold text-wood-600 ring-1 ring-wood-100">{list.length}</span>
                      {col.next && list.length > 0 && (
                        <button
                          aria-label={`Chọn tất cả ${STATUS_LABEL[col.id]}`}
                          aria-pressed={allSel}
                          onClick={() =>
                            setSelected((s) => {
                              const n = new Set(s)
                              ids.forEach((id) => (allSel ? n.delete(id) : n.add(id)))
                              return n
                            })
                          }
                          className={clsx(
                            'ml-auto grid size-6 place-items-center rounded-md ring-1 transition',
                            allSel ? 'bg-wood-500 text-white ring-wood-500' : 'bg-white text-transparent ring-wood-300 hover:text-wood-300',
                          )}
                        >
                          <Check className="size-4" />
                        </button>
                      )}
                    </div>

                    {col.next && list.length > 1 && (
                      <Button
                        size="sm"
                        variant={col.id === 'ready' ? 'leaf' : 'secondary'}
                        className="mb-2 w-full"
                        onClick={() => void move(ids, col.next!)}
                      >
                        {col.bulkLabel} ({list.length}) <ArrowRight className="size-4" />
                      </Button>
                    )}

                    <div className={clsx('grid gap-2', !expanded && 'min-[560px]:grid-cols-2')}>
                      {list.map((o) => (
                        <Card key={o.id} {...cardProps(o)} col={col.id} onAdvance={col.next ? () => void move([o.id], col.next!) : undefined} advanceLabel={col.nextLabel} onBack={col.id === 'served' ? () => void move([o.id], 'ready') : undefined} />
                      ))}
                      {list.length === 0 && (
                        <p className={clsx('col-span-full rounded-xl border border-dashed border-wood-200 px-3 text-center text-xs text-ink-soft', expanded ? 'py-6' : 'py-2.5')}>
                          {dragOver === col.id ? 'Thả vào đây' : 'Chưa có món'}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Thanh chọn nhiều */}
      {selected.size > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex animate-slide-up flex-wrap items-center gap-2 border-t border-wood-200 bg-wood-800 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-lift">
          <span className="text-sm font-semibold">Đã chọn {selected.size} món</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void move([...selected], 'cooking')}>Đang làm</Button>
            <Button size="sm" variant="secondary" onClick={() => void move([...selected], 'ready')}>Sẵn sàng</Button>
            <Button size="sm" variant="leaf" onClick={() => void move([...selected], 'served')}>
              <ConciergeBell className="size-4" /> Đưa lên
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
          </div>
        </div>
      )}

      {/* Sửa món */}
      <EditDialog
        key={editing?.id ?? 'none'}
        o={editing}
        onClose={() => setEditing(null)}
        onSave={async (qty, note) => {
          if (!editing) return
          await run(() => backend.updateOrderItem(editing.id, { qty, note }))
          setEditing(null)
        }}
        onReplace={() => {
          setReplacing(editing)
          setEditing(null)
        }}
        onCancel={() => editing && void cancel(editing)}
        onFlagOut={() => editing && void flagOut(editing)}
      />

      <ItemPicker
        mode="single"
        open={!!replacing}
        title={replacing ? `Đổi “${replacing.name}” sang món khác` : ''}
        onClose={() => setReplacing(null)}
        excludeItemId={replacing?.itemId}
        preferCategoryId={snap.items.find((i) => i.id === replacing?.itemId)?.categoryId}
        onSubmit={async (item) => {
          if (!replacing) return
          const from = replacing
          const ok = await run(async () => {
            await backend.replaceOrderItem(from.id, item.id)
            return true
          })
          if (ok) toast({ text: `Đã đổi “${from.name}” → “${item.name}”`, tone: 'success' })
          setReplacing(null)
        }}
      />

      <ItemPicker
        mode="multi"
        open={ordering}
        title={`Gọi món · Bàn ${table.code}`}
        onClose={() => setOrdering(false)}
        onSubmit={async (lines) => {
          const res = await run(() => backend.staffPlaceOrder(tableId, lines))
          if (!res) return
          if (res.rejected.length) toast({ text: `${res.rejected.map((r) => r.name).join(', ')} vừa hết, chưa gửi`, tone: 'warn' })
          if (res.orderId) {
            toast({ text: 'Đã gửi món xuống bếp', tone: 'success' })
            setOrdering(false)
          }
        }}
      />

      <SoldOutDialog item={soldOut} onClose={() => setSoldOut(null)} />

      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title={`Dọn bàn ${table.code}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(false)}>Hủy</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await run(() => backend.closeSession(tableId))
                setClosing(false)
                onClose()
                toast({ text: `Bàn ${table.code} đã trống`, tone: 'success' })
              }}
            >
              Xác nhận dọn bàn
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Khách đã ra về và bàn sẵn sàng đón nhóm mới. Các món đã gọi sẽ được lưu lại và khách mới quét QR sẽ bắt đầu một lượt mới.
          {pendingCount > 0 && (
            <b className="mt-3 block rounded-lg bg-turmeric-soft px-3 py-2 text-[#8a6417]">
              Còn {pendingCount} món chưa đưa lên bàn này.
            </b>
          )}
        </p>
      </Modal>
    </section>
  )
}

function Card({
  o, order, now, selected, onSelect, onEdit, onDragStart, col, onAdvance, advanceLabel, onBack,
}: {
  o: OrderItem
  order?: { seq: number; source: 'qr' | 'staff' }
  now: Date
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDragStart: (e: React.DragEvent) => void
  col: Col
  onAdvance?: () => void
  advanceLabel?: string
  onBack?: () => void
}) {
  const done = col === 'served'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={clsx(
        'group rounded-xl bg-white p-3 shadow-warm ring-1 transition',
        selected ? 'ring-2 ring-wood-500' : 'ring-wood-100',
        done && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        {!done ? (
          <button
            aria-label={selected ? 'Bỏ chọn' : 'Chọn món'}
            aria-pressed={selected}
            onClick={onSelect}
            className={clsx(
              'mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ring-1 transition',
              selected ? 'bg-wood-500 text-white ring-wood-500' : 'bg-white text-transparent ring-wood-300 hover:text-wood-300',
            )}
          >
            <Check className="size-4" />
          </button>
        ) : (
          <Check className="mt-0.5 size-5 shrink-0 text-leaf" />
        )}
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-semibold leading-snug', done && 'line-through decoration-wood-300')}>
            <span className="mr-1 inline-block rounded-md bg-wood-100 px-1.5 text-wood-700">{o.qty}×</span>
            {o.name}
          </p>
          {o.note && <p className="mt-1 rounded-md bg-turmeric-soft px-2 py-1 text-xs text-[#7a5612]">{o.note}</p>}
          {o.replacedFromId && <p className="mt-1 text-[11px] text-ink-soft">↻ món được đổi</p>}
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-soft">
            Lượt {order?.seq ?? '?'} · {order?.source === 'qr' ? 'khách' : 'nhân viên'} · {ago(o.createdAt, now)}
          </p>
        </div>
        <button onClick={onEdit} aria-label="Sửa món" className="grid size-10 shrink-0 place-items-center rounded-lg text-wood-600 hover:bg-wood-100">
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      {onAdvance && (
        <Button size="sm" variant={col === 'ready' ? 'leaf' : 'secondary'} className="mt-2 w-full" onClick={onAdvance}>
          {advanceLabel} <ArrowRight className="size-4" />
        </Button>
      )}
      {onBack && (
        <button onClick={onBack} className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-wood-500 hover:underline">
          <Undo2 className="size-3" /> Chưa lên
        </button>
      )}
    </div>
  )
}

function EditDialog({
  o, onClose, onSave, onReplace, onCancel, onFlagOut,
}: {
  o: OrderItem | null
  onClose: () => void
  onSave: (qty: number, note: string) => Promise<void>
  onReplace: () => void
  onCancel: () => void
  onFlagOut: () => void
}) {
  const [qty, setQty] = useState(o?.qty ?? 1)
  const [note, setNote] = useState(o?.note ?? '')
  if (!o) return null
  const dirty = qty !== o.qty || note !== o.note
  return (
    <Modal
      open
      onClose={onClose}
      title={o.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button variant="primary" disabled={!dirty} onClick={() => void onSave(qty, note)}>Lưu thay đổi</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-wood-700">Số lượng</span>
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>
        <Field label="Ghi chú cho bếp">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ít cay, không hành…" />
        </Field>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" onClick={onReplace}><Replace className="size-4" /> Đổi món</Button>
          <Button variant="secondary" onClick={onFlagOut}><AlertTriangle className="size-4" /> Báo hết món</Button>
          <Button variant="danger" onClick={onCancel}><Trash2 className="size-4" /> Hủy món</Button>
        </div>
      </div>
    </Modal>
  )
}
