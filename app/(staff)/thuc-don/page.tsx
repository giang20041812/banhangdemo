'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarClock, Copy, ImagePlus, Pencil, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/components/AppProvider'
import { useToast } from '@/components/Toast'
import { AvailabilityRow, SoldOutDialog } from '@/components/menu/Availability'
import { Button, Chip, Empty, Field, Modal, Stepper, Switch, inputCls } from '@/components/ui'
import { DAY_LABELS, formatVnd, hhmm } from '@/lib/format'
import { activeMenus, activeUnavailability } from '@/lib/menu-logic'
import { newGroupId } from '@/lib/combo'
import type { Category, ComboDef, Menu, MenuItem } from '@/lib/types'

type Tab = 'items' | 'menus' | 'cats' | 'schedule'

export default function MenuAdminPage() {
  const { snap } = useApp()
  const [tab, setTab] = useState<Tab>('items')
  if (!snap) return <div className="grid h-full place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div>

  const tabs: [Tab, string][] = [
    ['items', `Món ăn (${snap.items.length})`],
    ['menus', `Thực đơn theo giờ (${snap.menus.length})`],
    ['cats', `Danh mục (${snap.categories.length})`],
    ['schedule', 'Lịch hết món'],
  ]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-wood-100 bg-paper/90 px-4 pt-3">
        <h1 className="font-display text-xl font-semibold text-wood-800">Thực đơn</h1>
        <div className="scroll-thin -mb-px mt-2 flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                'touch-target shrink-0 rounded-t-xl px-4 text-sm font-semibold transition',
                tab === id ? 'border-x border-t border-wood-200 bg-cream text-wood-800' : 'text-wood-600 hover:bg-cream/60',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-cream/40 p-4">
        <div className="mx-auto max-w-4xl">
          {tab === 'items' && <ItemsTab />}
          {tab === 'menus' && <MenusTab />}
          {tab === 'cats' && <CategoriesTab />}
          {tab === 'schedule' && <ScheduleTab />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Món ăn */
function ItemsTab() {
  const { snap } = useApp()
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null)
  const [out, setOut] = useState<MenuItem | null>(null)
  if (!snap) return null

  const groups = [...snap.categories, { id: '', branchId: '', name: 'Chưa phân loại', sort: 999 } as Category]
    .map((c) => ({ c, items: snap.items.filter((i) => (i.categoryId ?? '') === c.id) }))
    .filter((g) => g.items.length)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">Bật/tắt công tắc để báo hết món hoặc bán lại ngay.</p>
        <Button variant="primary" onClick={() => setEditing({ branchId: snap.branch.id, name: '', price: 0, description: '', isActive: true, categoryId: snap.categories[0]?.id ?? null, imageUrl: null, combo: null })}>
          <Plus className="size-4" /> Thêm món
        </Button>
      </div>
      {groups.length === 0 && <Empty icon={<UtensilsCrossed className="size-7" />} title="Chưa có món nào" hint="Thêm món đầu tiên để khách có thể gọi." />}
      {groups.map(({ c, items }) => (
        <section key={c.id || 'none'}>
          <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-wood-500">{c.name}</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <AvailabilityRow
                key={item.id}
                item={item}
                onToggleOut={setOut}
                trailing={
                  <Button variant="ghost" size="sm" onClick={() => setEditing(item)} aria-label={`Sửa ${item.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      ))}
      <SoldOutDialog item={out} onClose={() => setOut(null)} />
      {editing && <ItemForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ItemForm({ initial, onClose }: { initial: Partial<MenuItem>; onClose: () => void }) {
  const { backend, snap, run, refresh } = useApp()
  const toast = useToast()
  const [f, setF] = useState(initial)
  const [price, setPrice] = useState(String(initial.price ?? 0))
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  if (!snap) return null
  const comboError = f.combo ? comboProblem(f.combo) : null
  const valid = !!f.name?.trim() && Number(price) >= 0 && !uploading && !comboError

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // cho phép chọn lại cùng một ảnh
    if (!file) return
    setUploading(true)
    try {
      const url = await backend.uploadItemImage(snap!.branch.id, file)
      setF((p) => ({ ...p, imageUrl: url }))
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : 'Không tải được ảnh', tone: 'warn' })
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    const saved = await run(() =>
      backend.saveItem({
        id: f.id,
        branchId: snap!.branch.id,
        categoryId: f.categoryId ?? null,
        name: f.name!.trim(),
        description: f.description ?? '',
        price: Math.round(Number(price)),
        imageUrl: f.imageUrl || null,
        combo: f.combo ?? null,
        isActive: f.isActive ?? true,
      }),
    )
    if (saved) {
      await refresh()
      toast({ text: f.id ? 'Đã lưu món' : `Đã thêm "${saved.name}". Nhớ thêm món vào thực đơn theo giờ nếu bạn dùng.`, tone: 'success' })
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? 'Sửa món' : 'Thêm món'}
      footer={
        <>
          {f.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!window.confirm(`Xóa món "${f.name}"?`)) return
                await run(() => backend.deleteItem(f.id!))
                await refresh()
                onClose()
              }}
            >
              <Trash2 className="size-4" /> Xóa
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>Lưu</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tên món">
          <input className={inputCls} value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.combo ? 'Giá gốc combo (đ)' : 'Giá (đ)'}>
            <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Danh mục">
            <select className={inputCls} value={f.categoryId ?? ''} onChange={(e) => setF({ ...f, categoryId: e.target.value || null })}>
              <option value="">Chưa phân loại</option>
              {snap.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Mô tả ngắn">
          <input className={inputCls} value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Hiện dưới tên món ở trang khách" />
        </Field>
        <Field label="Ảnh món (tuỳ chọn)">
          <div className="flex items-center gap-3">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-cream ring-1 ring-wood-100">
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-6 text-wood-300" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              {/* không đặt capture: điện thoại sẽ hỏi chụp ảnh mới hoặc chọn từ thư viện */}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
              <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4" /> {uploading ? 'Đang tải…' : f.imageUrl ? 'Đổi ảnh' : 'Chọn ảnh'}
              </Button>
              {f.imageUrl && !uploading && (
                <Button size="sm" variant="ghost" onClick={() => setF({ ...f, imageUrl: null })}>
                  <X className="size-4" /> Bỏ ảnh
                </Button>
              )}
            </div>
          </div>
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-wood-800">Đây là combo</p>
            <p className="text-xs text-ink-soft">Combo gồm món cố định và các nhóm khách tự chọn (vd lẩu)</p>
          </div>
          <Switch
            label="Combo"
            checked={!!f.combo}
            onChange={(v) => setF({ ...f, combo: v ? { fixed: [], groups: [] } : null })}
          />
        </div>
        {f.combo && <ComboEditor combo={f.combo} onChange={(combo) => setF({ ...f, combo })} items={snap.items.filter((i) => !i.combo && i.id !== f.id)} />}
        {comboError && <p role="alert" className="rounded-lg bg-brick-soft px-3 py-2 text-sm text-brick">{comboError}</p>}
        <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-wood-800">Hiển thị trong thực đơn</p>
            <p className="text-xs text-ink-soft">Tắt để ẩn hẳn món (khác với báo hết món tạm thời)</p>
          </div>
          <Switch label="Hiển thị" checked={f.isActive ?? true} onChange={(v) => setF({ ...f, isActive: v })} />
        </div>
      </div>
    </Modal>
  )
}

function comboProblem(c: ComboDef): string | null {
  if (c.fixed.length === 0 && c.groups.length === 0) return 'Combo cần ít nhất một món cố định hoặc một nhóm lựa chọn'
  for (const f of c.fixed) if (!f.itemId) return 'Có món cố định chưa chọn món'
  for (const g of c.groups) {
    if (!g.name.trim()) return 'Có nhóm lựa chọn chưa đặt tên'
    if (g.options.length === 0) return `Nhóm "${g.name}" chưa có lựa chọn nào`
    if (g.options.some((o) => !o.itemId)) return `Nhóm "${g.name}" có lựa chọn chưa chọn món`
    if (new Set(g.options.map((o) => o.itemId)).size !== g.options.length) return `Nhóm "${g.name}" có món bị trùng`
    if (g.min < 0 || g.max < 1 || g.min > g.max) return `Nhóm "${g.name}": số chọn tối thiểu/tối đa không hợp lệ`
    if (g.max > g.options.length) return `Nhóm "${g.name}": tối đa không được lớn hơn số lựa chọn (${g.options.length})`
  }
  return null
}

function ItemSelect({ items, value, onPick }: { items: MenuItem[]; value: string; onPick: (id: string) => void }) {
  return (
    <select className={clsx(inputCls, 'min-w-0 flex-1')} value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">— Chọn món —</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.isActive ? '' : ' (ẩn)'}</option>)}
    </select>
  )
}

const toNum = (v: string) => Math.max(0, Math.floor(Number(v.replace(/\D/g, '')) || 0))

function ComboEditor({ combo, onChange, items }: { combo: ComboDef; onChange: (c: ComboDef) => void; items: MenuItem[] }) {
  const setGroup = (idx: number, patch: Partial<ComboDef['groups'][number]>) =>
    onChange({ ...combo, groups: combo.groups.map((g, i) => (i === idx ? { ...g, ...patch } : g)) })
  const setFixed = (idx: number, patch: Partial<ComboDef['fixed'][number]>) =>
    onChange({ ...combo, fixed: combo.fixed.map((x, i) => (i === idx ? { ...x, ...patch } : x)) })

  return (
    <div className="space-y-4 rounded-2xl bg-white p-3 ring-1 ring-wood-200">
      <p className="text-xs text-ink-soft">
        Món thành phần (nước lẩu, đồ nhúng…) là các món bình thường trong thực đơn. Để khách không thấy chúng bán lẻ, hãy đặt giá 0 hoặc tắt &quot;Hiển thị&quot; — món ẩn vẫn dùng được trong combo.
      </p>

      <section className="space-y-2">
        <h4 className="font-display text-sm font-semibold text-wood-800">Món cố định (luôn có)</h4>
        {combo.fixed.map((f, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <ItemSelect items={items} value={f.itemId} onPick={(id) => setFixed(idx, { itemId: id })} />
            <Stepper size="sm" min={1} value={f.qty} onChange={(q) => setFixed(idx, { qty: q })} />
            <Button variant="ghost" size="sm" aria-label="Bỏ món cố định" onClick={() => onChange({ ...combo, fixed: combo.fixed.filter((_, i) => i !== idx) })}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button size="sm" onClick={() => onChange({ ...combo, fixed: [...combo.fixed, { itemId: '', qty: 1 }] })}><Plus className="size-4" /> Thêm món cố định</Button>
      </section>

      <section className="space-y-3">
        <h4 className="font-display text-sm font-semibold text-wood-800">Nhóm khách tự chọn</h4>
        {combo.groups.map((g, gi) => (
          <div key={g.id} className="space-y-2 rounded-xl bg-cream/70 p-3 ring-1 ring-wood-100">
            <div className="flex items-center gap-2">
              <input className={clsx(inputCls, 'flex-1')} placeholder="Tên nhóm (vd Nước lẩu)" value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} />
              <Button variant="ghost" size="sm" aria-label="Xóa nhóm" onClick={() => onChange({ ...combo, groups: combo.groups.filter((_, i) => i !== gi) })}><Trash2 className="size-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Chọn tối thiểu">
                <input className={inputCls} inputMode="numeric" value={g.min} onChange={(e) => setGroup(gi, { min: toNum(e.target.value) })} />
              </Field>
              <Field label="Chọn tối đa">
                <input className={inputCls} inputMode="numeric" value={g.max} onChange={(e) => setGroup(gi, { max: toNum(e.target.value) })} />
              </Field>
            </div>
            <ul className="space-y-2">
              {g.options.map((o, oi) => (
                <li key={oi} className="flex items-center gap-2">
                  <ItemSelect items={items} value={o.itemId} onPick={(id) => setGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, itemId: id } : x)) })} />
                  <input
                    className={clsx(inputCls, 'w-24 shrink-0')}
                    inputMode="numeric"
                    aria-label="Phụ thu"
                    placeholder="+đ"
                    value={o.extra || ''}
                    onChange={(e) => setGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, extra: toNum(e.target.value) } : x)) })}
                  />
                  <Button variant="ghost" size="sm" aria-label="Bỏ lựa chọn" onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
            <Button size="sm" onClick={() => setGroup(gi, { options: [...g.options, { itemId: '', extra: 0 }] })}><Plus className="size-4" /> Thêm lựa chọn</Button>
          </div>
        ))}
        <Button size="sm" onClick={() => onChange({ ...combo, groups: [...combo.groups, { id: newGroupId(), name: '', min: 1, max: 1, options: [] }] })}>
          <Plus className="size-4" /> Thêm nhóm lựa chọn
        </Button>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ Thực đơn theo giờ */
function MenusTab() {
  const { backend, snap, now, run, refresh } = useApp()
  const [editing, setEditing] = useState<Partial<Menu> | null>(null)
  if (!snap) return null
  const active = new Set(activeMenus(snap.menus, now, snap.branch.timezone).map((m) => m.id))
  const blank: Partial<Menu> = {
    branchId: snap.branch.id, name: '', days: [], start: '10:00', end: '14:00', validFrom: null, validTo: null, priority: 1, itemIds: [],
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-soft">
          Mỗi thực đơn gồm các món bán trong một khung giờ. Lúc nào có thực đơn đang áp dụng thì khách chỉ thấy món thuộc thực đơn đó. Nếu chưa tạo thực đơn nào, tất cả món đang bật đều được bán.
        </p>
        <Button variant="primary" onClick={() => setEditing(blank)}><Plus className="size-4" /> Thêm thực đơn</Button>
      </div>
      {snap.menus.length === 0 && <Empty icon={<CalendarClock className="size-7" />} title="Chưa có thực đơn theo giờ" hint="Ví dụ: Thực đơn trưa 10:00–14:00, Thực đơn tối 17:00–22:00." />}
      <div className="grid gap-3 sm:grid-cols-2">
        {snap.menus.map((m) => (
          <article key={m.id} className={clsx('rounded-2xl bg-white p-4 shadow-warm ring-1', active.has(m.id) ? 'ring-leaf' : 'ring-wood-100')}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-wood-800">{m.name}</h3>
              {active.has(m.id) && <Chip tone="leaf">Đang áp dụng</Chip>}
            </div>
            <p className="mt-1 text-sm font-medium text-wood-600">{m.start} – {m.end}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {m.days.length === 0 ? <Chip>Mọi ngày</Chip> : m.days.map((d) => <Chip key={d}>{DAY_LABELS[d]}</Chip>)}
              {(m.validFrom || m.validTo) && <Chip tone="turmeric">{m.validFrom ?? '…'} → {m.validTo ?? '…'}</Chip>}
            </div>
            <p className="mt-2 text-sm text-ink-soft">{m.itemIds.length} món · ưu tiên {m.priority}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(m)}><Pencil className="size-4" /> Sửa</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await run(() => backend.saveMenu({ ...m, id: undefined, name: `${m.name} (bản sao)` }))
                  await refresh()
                }}
              >
                <Copy className="size-4" /> Nhân bản
              </Button>
            </div>
          </article>
        ))}
      </div>
      {editing && <MenuForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MenuForm({ initial, onClose }: { initial: Partial<Menu>; onClose: () => void }) {
  const { backend, snap, run, refresh } = useApp()
  const [m, setM] = useState<Partial<Menu>>(initial)
  const ids = new Set(m.itemIds ?? [])
  const groups = useMemo(() => {
    if (!snap) return []
    return [...snap.categories, { id: '', branchId: '', name: 'Chưa phân loại', sort: 999 } as Category]
      .map((c) => ({ c, items: snap.items.filter((i) => (i.categoryId ?? '') === c.id) }))
      .filter((g) => g.items.length)
  }, [snap])
  if (!snap) return null

  const setIds = (next: Set<string>) => setM({ ...m, itemIds: [...next] })
  const toggleDay = (d: number) => {
    const s = new Set(m.days ?? [])
    s.has(d) ? s.delete(d) : s.add(d)
    setM({ ...m, days: [...s].sort() })
  }
  const valid = !!m.name?.trim() && !!m.start && !!m.end

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={m.id ? 'Sửa thực đơn' : 'Thêm thực đơn'}
      footer={
        <>
          {m.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!window.confirm(`Xóa thực đơn "${m.name}"?`)) return
                await run(() => backend.deleteMenu(m.id!))
                await refresh()
                onClose()
              }}
            >
              <Trash2 className="size-4" /> Xóa
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={async () => {
              const ok = await run(() =>
                backend.saveMenu({
                  id: m.id, branchId: snap.branch.id, name: m.name!.trim(), days: m.days ?? [], start: m.start!, end: m.end!,
                  validFrom: m.validFrom || null, validTo: m.validTo || null, priority: m.priority ?? 0, itemIds: m.itemIds ?? [],
                }),
              )
              if (ok) {
                await refresh()
                onClose()
              }
            }}
          >
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Tên thực đơn">
          <input className={inputCls} value={m.name ?? ''} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Thực đơn trưa" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Từ giờ"><input type="time" className={inputCls} value={m.start ?? ''} onChange={(e) => setM({ ...m, start: e.target.value })} /></Field>
          <Field label="Đến giờ" hint="Nhỏ hơn giờ bắt đầu = qua đêm"><input type="time" className={inputCls} value={m.end ?? ''} onChange={(e) => setM({ ...m, end: e.target.value })} /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-wood-700">Ngày trong tuần <span className="font-normal text-ink-soft">(bỏ trống = mọi ngày)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                aria-pressed={(m.days ?? []).includes(d)}
                onClick={() => toggleDay(d)}
                className={clsx(
                  'size-11 rounded-xl text-sm font-semibold ring-1 transition',
                  (m.days ?? []).includes(d) ? 'bg-wood-500 text-white ring-wood-500' : 'bg-white text-wood-700 ring-wood-200 hover:bg-cream',
                )}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Áp dụng từ ngày"><input type="date" className={inputCls} value={m.validFrom ?? ''} onChange={(e) => setM({ ...m, validFrom: e.target.value || null })} /></Field>
          <Field label="Đến ngày"><input type="date" className={inputCls} value={m.validTo ?? ''} onChange={(e) => setM({ ...m, validTo: e.target.value || null })} /></Field>
          <Field label="Ưu tiên"><input type="number" className={inputCls} value={m.priority ?? 0} onChange={(e) => setM({ ...m, priority: Number(e.target.value) })} /></Field>
        </div>
        <div>
          <p className="mb-2 flex items-center justify-between text-[13px] font-semibold text-wood-700">
            Món trong thực đơn ({ids.size})
            <span className="flex gap-3 text-xs">
              <button className="text-wood-500 hover:underline" onClick={() => setIds(new Set(snap.items.map((i) => i.id)))}>Chọn hết</button>
              <button className="text-wood-500 hover:underline" onClick={() => setIds(new Set())}>Bỏ hết</button>
            </span>
          </p>
          <div className="space-y-3 rounded-2xl bg-cream/60 p-3 ring-1 ring-wood-100">
            {groups.map(({ c, items }) => {
              const all = items.every((i) => ids.has(i.id))
              return (
                <div key={c.id || 'none'}>
                  <button
                    className="mb-1.5 text-xs font-bold uppercase tracking-wide text-wood-500 hover:underline"
                    onClick={() => {
                      const n = new Set(ids)
                      items.forEach((i) => (all ? n.delete(i.id) : n.add(i.id)))
                      setIds(n)
                    }}
                  >
                    {c.name} {all ? '· bỏ nhóm' : '· chọn nhóm'}
                  </button>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {items.map((i) => (
                      <label key={i.id} className={clsx('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl bg-white px-3 ring-1 transition', ids.has(i.id) ? 'ring-wood-400' : 'ring-wood-100')}>
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-wood-500)]"
                          checked={ids.has(i.id)}
                          onChange={() => {
                            const n = new Set(ids)
                            n.has(i.id) ? n.delete(i.id) : n.add(i.id)
                            setIds(n)
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
                        <span className="text-xs text-ink-soft">{formatVnd(i.price)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ Danh mục */
function CategoriesTab() {
  const { backend, snap, run, refresh } = useApp()
  const [name, setName] = useState('')
  if (!snap) return null
  const cats = snap.categories

  async function swap(i: number, j: number) {
    if (j < 0 || j >= cats.length) return
    await run(async () => {
      await backend.saveCategory({ ...cats[i], sort: cats[j].sort })
      await backend.saveCategory({ ...cats[j], sort: cats[i].sort === cats[j].sort ? cats[i].sort + 1 : cats[i].sort })
    })
    await refresh()
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await run(() => backend.saveCategory({ branchId: snap.branch.id, name: name.trim(), sort: (cats.at(-1)?.sort ?? -1) + 1 }))
          setName('')
          await refresh()
        }}
      >
        <input className={inputCls} placeholder="Tên danh mục mới (Món nướng, Tráng miệng…)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="primary" disabled={!name.trim()}><Plus className="size-4" /> Thêm</Button>
      </form>
      <ul className="space-y-2">
        {cats.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 ring-1 ring-wood-100">
            <input
              className="min-h-10 flex-1 rounded-lg bg-transparent font-semibold text-wood-800 outline-none focus:bg-cream focus:px-2"
              defaultValue={c.name}
              aria-label="Tên danh mục"
              onBlur={async (e) => {
                const v = e.target.value.trim()
                if (v && v !== c.name) {
                  await run(() => backend.saveCategory({ ...c, name: v }))
                  await refresh()
                }
              }}
            />
            <span className="text-xs text-ink-soft">{snap.items.filter((x) => x.categoryId === c.id).length} món</span>
            <Button variant="ghost" size="sm" onClick={() => swap(i, i - 1)} disabled={i === 0} aria-label="Lên"><ArrowUp className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => swap(i, i + 1)} disabled={i === cats.length - 1} aria-label="Xuống"><ArrowDown className="size-4" /></Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Xóa danh mục"
              onClick={async () => {
                if (!window.confirm(`Xóa danh mục "${c.name}"? Các món sẽ chuyển sang "Chưa phân loại".`)) return
                await run(() => backend.deleteCategory(c.id))
                await refresh()
              }}
            >
              <Trash2 className="size-4 text-brick" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ Lịch hết món */
function ScheduleTab() {
  const { backend, snap, now, run, refresh } = useApp()
  if (!snap) return null
  const tz = snap.branch.timezone
  const rows = snap.unavailability
    .filter((u) => !u.endsAt || new Date(u.endsAt) > now)
    .map((u) => ({ u, item: snap.items.find((i) => i.id === u.itemId), live: !!activeUnavailability(u.itemId, [u], now) }))
    .filter((r) => r.item)
    .sort((a, b) => a.u.startsAt.localeCompare(b.u.startsAt))

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(iso))

  if (!rows.length) return <Empty icon={<CalendarClock className="size-7" />} title="Không có món nào đang hoặc sắp hết" hint="Dùng công tắc ở danh sách món để báo hết ngay hoặc hẹn giờ." />
  return (
    <ul className="space-y-2">
      {rows.map(({ u, item, live }) => (
        <li key={u.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-wood-100">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{item!.name}</p>
            <p className="text-xs text-ink-soft">
              {fmt(u.startsAt)} → {u.endsAt ? fmt(u.endsAt) : 'đến khi bật lại'}
              {u.reason && ` · ${u.reason}`}
            </p>
          </div>
          <Chip tone={live ? 'brick' : 'turmeric'}>{live ? `Đang hết${u.endsAt ? ` đến ${hhmm(u.endsAt, tz)}` : ''}` : 'Hẹn giờ'}</Chip>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Xóa lịch"
            onClick={async () => {
              await run(() => backend.deleteUnavailability(u.id))
              await refresh()
            }}
          >
            <Trash2 className="size-4 text-brick" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
