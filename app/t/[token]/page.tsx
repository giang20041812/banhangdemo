'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertTriangle, CheckCircle2, ChefHat, ClipboardList, ConciergeBell, Plus, QrCode, ShoppingBasket, Sparkles, Trash2, UtensilsCrossed, X,
} from 'lucide-react'
import clsx from 'clsx'
import { getBackend } from '@/lib/backend'
import { needsAttention } from '@/lib/derive'
import { formatVnd, hhmm } from '@/lib/format'
import { activeUnavailability, isUnavailable, sellableItems } from '@/lib/menu-logic'
import type { MenuItem, OrderItem, PlaceOrderResult, PublicSnapshot } from '@/lib/types'
import { Button, Modal, Stepper, inputCls } from '@/components/ui'

interface CartLine {
  qty: number
  note: string
}
type Cart = Record<string, CartLine>

const STATUS_VIEW: Record<OrderItem['status'], { label: string; cls: string; icon: typeof ChefHat }> = {
  new: { label: 'Đã gửi bếp', cls: 'bg-turmeric-soft text-[#8a6417]', icon: Sparkles },
  cooking: { label: 'Đang làm', cls: 'bg-wood-100 text-wood-700', icon: ChefHat },
  ready: { label: 'Sắp lên bàn', cls: 'bg-leaf-soft text-leaf', icon: ConciergeBell },
  served: { label: 'Đã lên bàn', cls: 'bg-leaf text-white', icon: CheckCircle2 },
  cancelled: { label: 'Đã hủy', cls: 'bg-cream text-ink-soft', icon: X },
  unavailable: { label: 'Hết món', cls: 'bg-brick-soft text-brick', icon: AlertTriangle },
}

export default function GuestPage() {
  const { token } = useParams<{ token: string }>()
  const backend = useMemo(() => getBackend(), [])
  const [snap, setSnap] = useState<PublicSnapshot | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [cart, setCart] = useState<Cart>({})
  const [tab, setTab] = useState<'menu' | 'orders'>('menu')
  const [cartOpen, setCartOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PlaceOrderResult | null>(null)
  const [sentFlash, setSentFlash] = useState(false)
  const [cat, setCat] = useState<string>('')
  const [removedNames, setRemovedNames] = useState<string[]>([])
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const cartKey = `vqm-cart-${token}`

  const load = useCallback(async () => {
    try {
      const s = await backend.loadPublic(token)
      if (!s) setInvalid(true)
      else {
        setNow(new Date())
        setSnap(s)
        setLoadError('')
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Không tải được thực đơn')
    }
  }, [backend, token])

  useEffect(() => {
    void load()
    const unsub = backend.subscribePublic(token, () => void load())
    return unsub
  }, [backend, token, load])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  // giỏ hàng giữ lại khi tải lại trang
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(cartKey)
      if (raw) setCart(JSON.parse(raw))
    } catch {}
  }, [cartKey])
  useEffect(() => {
    try {
      sessionStorage.setItem(cartKey, JSON.stringify(cart))
    } catch {}
  }, [cart, cartKey])

  const tz = snap?.branch.timezone
  const sellable = useMemo(() => (snap ? sellableItems(snap.items, snap.menus, now, tz) : []), [snap, now, tz])
  const byCat = useMemo(() => {
    if (!snap) return []
    const cats = [...snap.categories, { id: '', branchId: '', name: 'Khác', sort: 999 }]
    return cats.map((c) => ({ c, items: sellable.filter((i) => (i.categoryId ?? '') === c.id) })).filter((g) => g.items.length)
  }, [snap, sellable])

  useEffect(() => {
    if (!cat && byCat[0]) setCat(byCat[0].c.id || 'other')
  }, [byCat, cat])

  // Món trong giỏ vừa hết: tự gỡ và báo cho khách (khi đang mở giỏ thì giữ lại để khách thấy lý do)
  useEffect(() => {
    if (!snap || cartOpen) return
    const ok = new Set(sellable.map((i) => i.id))
    const bad = Object.keys(cart).filter(
      (id) => cart[id].qty > 0 && (!ok.has(id) || isUnavailable(id, snap.unavailability, now)),
    )
    if (!bad.length) return
    setRemovedNames((prev) => [...new Set([...prev, ...bad.map((id) => snap.items.find((i) => i.id === id)?.name ?? '')])].filter(Boolean))
    setCart((c) => {
      const n = { ...c }
      for (const id of bad) delete n[id]
      return n
    })
  }, [snap, sellable, cart, cartOpen, now])

  if (invalid) return <Shell><Notice icon={<QrCode className="size-8" />} title="Mã QR không hợp lệ" text="Mã này đã bị thay thế hoặc không tồn tại. Vui lòng gọi nhân viên để được hỗ trợ." /></Shell>
  if (loadError && !snap) return <Shell><Notice icon={<AlertTriangle className="size-8" />} title="Không tải được thực đơn" text={loadError} action={<Button variant="primary" onClick={() => void load()}>Thử lại</Button>} /></Shell>
  if (!snap) return <Shell><div className="grid flex-1 place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div></Shell>

  const outOf = (id: string) => isUnavailable(id, snap.unavailability, now)
  const itemOf = (id: string) => snap.items.find((i) => i.id === id)
  const sellableIds = new Set(sellable.map((i) => i.id))
  const lines = Object.entries(cart).filter(([, l]) => l.qty > 0)
  const goodLines = lines.filter(([id]) => sellableIds.has(id) && !outOf(id))
  const badLines = lines.filter(([id]) => !sellableIds.has(id) || outOf(id))
  const count = goodLines.reduce((s, [, l]) => s + l.qty, 0)
  const total = goodLines.reduce((s, [id, l]) => s + l.qty * (itemOf(id)?.price ?? 0), 0)

  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const n = { ...c }
      if (qty <= 0) delete n[id]
      else n[id] = { qty, note: c[id]?.note ?? '' }
      return n
    })

  const orderItems = [...snap.orderItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const attention = orderItems.filter((o) => needsAttention(o, snap, now))
  const openOrdersCount = orderItems.filter((o) => o.status !== 'served' && o.status !== 'cancelled').length

  async function submit() {
    if (!goodLines.length || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await backend.placeOrder(
        token,
        goodLines.map(([itemId, l]) => ({ itemId, qty: l.qty, note: l.note.trim() || undefined })),
      )
      // bỏ khỏi giỏ: món đã gửi và món bị từ chối (khách chọn lại từ gợi ý)
      setCart((c) => {
        const n = { ...c }
        for (const [id] of goodLines) delete n[id]
        for (const r of res.rejected) delete n[r.itemId]
        return n
      })
      await load()
      if (res.rejected.length) setResult(res)
      if (res.orderId) {
        setCartOpen(false)
        setTab('orders')
        setSentFlash(true)
        setTimeout(() => setSentFlash(false), 4000)
      } else if (res.rejected.length) setCartOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gửi món chưa được, vui lòng thử lại')
    } finally {
      setBusy(false)
    }
  }

  const suggestions = (result?.rejected ?? []).flatMap((r) => {
    const orig = itemOf(r.itemId)
    return sellable
      .filter((i) => i.categoryId === orig?.categoryId && i.id !== r.itemId && !outOf(i.id))
      .sort((a, b) => Math.abs(a.price - (orig?.price ?? 0)) - Math.abs(b.price - (orig?.price ?? 0)))
      .slice(0, 3)
  })
  const uniqSuggestions = [...new Map(suggestions.map((s) => [s.id, s])).values()]

  return (
    <Shell
      header={
        <header className="wood-surface sticky top-0 z-20 pt-[env(safe-area-inset-top)] text-white shadow-warm">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold leading-tight">{snap.branch.name}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-wood-200">Bạn ngồi</p>
              <p className="font-display text-lg font-bold leading-none">Bàn {snap.table.code}</p>
            </div>
          </div>
          <div className="mx-auto flex max-w-2xl gap-1 px-3 pb-2" role="tablist">
            {(
              [
                ['menu', 'Thực đơn', UtensilsCrossed, 0],
                ['orders', 'Món đã gọi', ClipboardList, openOrdersCount],
              ] as const
            ).map(([id, label, Icon, badge]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={clsx(
                  'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition',
                  tab === id ? 'bg-paper text-wood-800 shadow-warm' : 'text-wood-100 hover:bg-white/10',
                )}
              >
                <Icon className="size-4" /> {label}
                {badge > 0 && <span className="rounded-full bg-brick px-1.5 text-xs text-white">{badge}</span>}
              </button>
            ))}
          </div>
        </header>
      }
    >
      {tab === 'menu' ? (
        <>
          {byCat.length > 1 && (
            <div className="sticky top-[117px] z-10 border-b border-wood-100 bg-paper/95 backdrop-blur">
              <div className="scroll-thin mx-auto flex max-w-2xl gap-1.5 overflow-x-auto px-3 py-2">
                {byCat.map(({ c }) => {
                  const k = c.id || 'other'
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        setCat(k)
                        sectionRefs.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className={clsx(
                        'min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition',
                        cat === k ? 'bg-wood-500 text-white shadow-warm' : 'bg-cream text-wood-700 ring-1 ring-wood-200',
                      )}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mx-auto w-full max-w-2xl space-y-6 px-3 pb-32 pt-4 min-[400px]:px-4">
            {removedNames.length > 0 && (
              <div role="alert" className="flex animate-pop items-start gap-3 rounded-2xl border border-brick/40 bg-brick-soft p-3.5 text-sm text-brick">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <p className="flex-1">
                  <b>{removedNames.join(', ')}</b> vừa hết nên đã được bỏ khỏi giỏ của bạn. Bạn có thể chọn món khác nhé.
                </p>
                <button onClick={() => setRemovedNames([])} aria-label="Đóng thông báo" className="grid size-8 place-items-center rounded-lg hover:bg-white/60"><X className="size-4" /></button>
              </div>
            )}
            {byCat.length === 0 && (
              <Notice icon={<UtensilsCrossed className="size-8" />} title="Hiện chưa có món để gọi" text="Quán chưa mở thực đơn cho khung giờ này. Vui lòng gọi nhân viên." />
            )}
            {byCat.map(({ c, items }) => {
              const k = c.id || 'other'
              return (
                <section key={k} ref={(el) => { sectionRefs.current[k] = el }} className="scroll-mt-[170px]">
                  <h2 className="mb-2.5 font-display text-xl font-semibold text-wood-800">{c.name}</h2>
                  <ul className="space-y-2.5">
                    {items.map((item) => (
                      <GuestItem
                        key={item.id}
                        item={item}
                        qty={cart[item.id]?.qty ?? 0}
                        soldOutUntil={(() => {
                          const u = activeUnavailability(item.id, snap.unavailability, now)
                          return u ? (u.endsAt ? hhmm(u.endsAt, tz) : 'later') : undefined
                        })()}
                        onQty={(q) => setQty(item.id, q)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          {count > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
              <button
                onClick={() => setCartOpen(true)}
                className="mx-auto flex min-h-14 w-full max-w-2xl animate-slide-up items-center gap-3 rounded-2xl bg-wood-500 px-5 text-white shadow-lift transition active:scale-[0.98]"
              >
                <span className="relative">
                  <ShoppingBasket className="size-6" />
                  <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-turmeric px-1 text-[11px] font-bold leading-5 text-wood-900">{count}</span>
                </span>
                <span className="flex-1 text-left font-semibold">Xem giỏ & gửi món</span>
                <span className="font-bold tabular-nums">{formatVnd(total)}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-10 pt-4">
          {sentFlash && (
            <div role="status" className="flex animate-pop items-center gap-3 rounded-2xl bg-leaf px-4 py-3 text-white shadow-warm">
              <CheckCircle2 className="size-6 shrink-0" />
              <p className="text-sm font-semibold">Đã gửi xuống bếp! Bạn có thể gọi thêm bất cứ lúc nào, mỗi lần gửi là một lượt mới.</p>
            </div>
          )}
          {attention.length > 0 && (
            <div role="alert" className="rounded-2xl border-2 border-brick/50 bg-brick-soft p-4 text-sm text-brick">
              <p className="flex items-center gap-2 font-bold"><AlertTriangle className="size-5" /> Có món vừa hết</p>
              <p className="mt-1">
                {[...new Set(attention.map((a) => a.name))].join(', ')} hiện không còn. Nhân viên sẽ đến đổi món cùng bạn, bạn cũng có thể chọn món khác ở tab Thực đơn.
              </p>
            </div>
          )}
          {snap.orders.length === 0 ? (
            <Notice
              icon={<ClipboardList className="size-8" />}
              title="Bạn chưa gọi món nào"
              text="Chọn món ở tab Thực đơn rồi bấm gửi, bếp sẽ nhận ngay."
              action={<Button variant="primary" onClick={() => setTab('menu')}>Xem thực đơn</Button>}
            />
          ) : (
            [...snap.orders].sort((a, b) => b.seq - a.seq).map((o) => {
              const list = orderItems.filter((x) => x.orderId === o.id)
              return (
                <section key={o.id} className="rounded-2xl bg-white p-4 shadow-warm ring-1 ring-wood-100">
                  <h3 className="mb-3 flex items-center justify-between font-display text-base font-semibold text-wood-800">
                    Lượt {o.seq}
                    <span className="text-xs font-normal text-ink-soft">{hhmm(o.createdAt, tz)} · {o.source === 'qr' ? 'bạn gọi' : 'nhân viên gọi giúp'}</span>
                  </h3>
                  <ul className="divide-y divide-wood-100">
                    {list.map((x) => {
                      const attn = needsAttention(x, snap, now)
                      const v = attn ? STATUS_VIEW.unavailable : STATUS_VIEW[x.status]
                      const Icon = v.icon
                      const from = x.replacedFromId ? snap.orderItems.find((y) => y.id === x.replacedFromId) : undefined
                      return (
                        <li key={x.id} className={clsx('flex items-start gap-3 py-2.5', x.status === 'cancelled' && 'opacity-55')}>
                          <span className="mt-0.5 rounded-md bg-wood-100 px-1.5 text-sm font-bold text-wood-700">{x.qty}×</span>
                          <div className="min-w-0 flex-1">
                            <p className={clsx('font-semibold leading-snug', x.status === 'cancelled' && 'line-through')}>{x.name}</p>
                            {x.note && <p className="text-xs text-ink-soft">“{x.note}”</p>}
                            {from && <p className="text-xs text-wood-500">Đổi từ {from.name}</p>}
                          </div>
                          <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', v.cls)}>
                            <Icon className="size-3.5" /> {v.label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      )}

      {/* Giỏ hàng */}
      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={`Giỏ của bàn ${snap.table.code}`}
        footer={
          <div className="flex w-full flex-col gap-2">
            {error && <p role="alert" className="rounded-lg bg-brick-soft px-3 py-2 text-sm text-brick">{error}</p>}
            <div className="flex items-center gap-3">
              <div className="mr-auto">
                <p className="text-xs text-ink-soft">{count} món</p>
                <p className="font-display text-xl font-bold text-wood-800">{formatVnd(total)}</p>
              </div>
              <Button variant="primary" size="lg" onClick={submit} disabled={!goodLines.length || busy}>
                {busy ? 'Đang gửi…' : 'Gửi món xuống bếp'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {badLines.map(([id]) => (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-brick/40 bg-brick-soft p-3">
              <AlertTriangle className="size-5 shrink-0 text-brick" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-brick">{itemOf(id)?.name}</p>
                <p className="text-xs text-brick/80">Vừa hết nên sẽ không được gửi. Hãy bỏ món này hoặc chọn món khác.</p>
              </div>
              <button onClick={() => setQty(id, 0)} className="grid size-10 place-items-center rounded-lg text-brick hover:bg-white/60" aria-label="Bỏ món"><Trash2 className="size-5" /></button>
            </div>
          ))}
          {goodLines.map(([id, l]) => {
            const item = itemOf(id)!
            return (
              <div key={id} className="rounded-xl bg-white p-3 ring-1 ring-wood-100">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-wood-600">{formatVnd(item.price)} · {formatVnd(item.price * l.qty)}</p>
                  </div>
                  <Stepper value={l.qty} onChange={(q) => setQty(id, q)} size="sm" />
                </div>
                <input
                  className={clsx(inputCls, 'mt-2 min-h-10 text-[13px]')}
                  placeholder="Ghi chú cho bếp (ít cay, không hành…)"
                  value={l.note}
                  maxLength={200}
                  onChange={(e) => setCart((c) => ({ ...c, [id]: { ...c[id], note: e.target.value } }))}
                />
              </div>
            )
          })}
          {!lines.length && <p className="py-6 text-center text-sm text-ink-soft">Giỏ đang trống.</p>}
        </div>
      </Modal>

      {/* Có món vừa hết lúc gửi */}
      <Modal
        open={!!result}
        onClose={() => setResult(null)}
        title="Có món vừa hết"
        footer={<Button variant="primary" onClick={() => setResult(null)}>Đã hiểu</Button>}
      >
        {result && (
          <div className="space-y-4">
            {result.orderId && (
              <p className="flex items-start gap-2 rounded-xl bg-leaf-soft px-3 py-2.5 text-sm text-leaf">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> Các món còn lại đã được gửi xuống bếp.
              </p>
            )}
            <p className="text-sm">
              <b className="text-brick">{result.rejected.map((r) => r.name).join(', ')}</b> vừa hết nên chưa được gửi. Xin lỗi bạn vì sự bất tiện này!
            </p>
            {uniqSuggestions.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-wood-700">Bạn có thể thử món tương tự</p>
                <ul className="space-y-2">
                  {uniqSuggestions.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-wood-100">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-xs text-wood-600">{formatVnd(s.price)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setQty(s.id, (cart[s.id]?.qty ?? 0) + 1)
                          setResult(null)
                          setTab('menu')
                          setCartOpen(true)
                        }}
                      >
                        <Plus className="size-4" /> Thêm
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Shell>
  )
}

function GuestItem({
  item, qty, soldOutUntil, onQty,
}: {
  item: MenuItem
  qty: number
  soldOutUntil?: string
  onQty: (q: number) => void
}) {
  const out = soldOutUntil !== undefined
  return (
    <li className={clsx('flex gap-3 rounded-2xl bg-white p-3 shadow-warm min-[400px]:p-3.5 ring-1 transition', qty > 0 ? 'ring-wood-400' : 'ring-wood-100', out && 'bg-cream/70')}>
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className={clsx('size-[72px] shrink-0 rounded-xl object-cover min-[400px]:size-20', out && 'grayscale')} />
      )}
      <div className="min-w-0 flex-1">
        <p className={clsx('font-semibold leading-snug', out && 'text-ink-soft')}>{item.name}</p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{item.description}</p>}
        <p className="mt-1.5 font-bold text-wood-600">{formatVnd(item.price)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-end">
        {out ? (
          <span className="rounded-full bg-brick-soft px-3 py-1.5 text-xs font-bold text-brick">
            Tạm hết{soldOutUntil && soldOutUntil !== 'later' ? ` · có lại ${soldOutUntil}` : ''}
          </span>
        ) : qty === 0 ? (
          <button
            onClick={() => onQty(1)}
            aria-label={`Thêm ${item.name}`}
            className="grid size-11 place-items-center rounded-full bg-wood-500 text-white shadow-warm transition active:scale-90 hover:bg-wood-600"
          >
            <Plus className="size-6" />
          </button>
        ) : (
          <Stepper value={qty} onChange={onQty} />
        )}
      </div>
    </li>
  )
}

function Shell({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      {children}
    </div>
  )
}

function Notice({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-wood-100 text-wood-500">{icon}</div>
      <h1 className="font-display text-xl font-semibold text-wood-800">{title}</h1>
      <p className="text-sm text-ink-soft">{text}</p>
      {action}
    </div>
  )
}
