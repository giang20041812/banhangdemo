'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, Clock3, MinusCircle, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../AppProvider'
import { Button, Chip, Field, Modal, Switch, inputCls } from '../ui'
import { useToast } from '../Toast'
import { activeMenus, activeUnavailability, untilFromPreset, upcomingUnavailability, type UntilPreset } from '@/lib/menu-logic'
import { fromLocalInput, formatVnd, hhmm, toLocalInput } from '@/lib/format'
import type { MenuItem, Snapshot } from '@/lib/types'

export type ItemStatus =
  | { kind: 'ok'; upcomingFrom?: string }
  | { kind: 'out'; until: string | null; reason: string; upcomingFrom?: string }
  | { kind: 'off-menu' }
  | { kind: 'inactive' }

export function itemStatus(item: MenuItem, snap: Snapshot, now: Date): ItemStatus {
  if (!item.isActive) return { kind: 'inactive' }
  const un = activeUnavailability(item.id, snap.unavailability, now)
  const upcoming = upcomingUnavailability(item.id, snap.unavailability, now)[0]
  if (un) return { kind: 'out', until: un.endsAt, reason: un.reason, upcomingFrom: upcoming?.startsAt }
  if (snap.menus.length) {
    const on = activeMenus(snap.menus, now, snap.branch.timezone).some((m) => m.itemIds.includes(item.id))
    if (!on) return { kind: 'off-menu' }
  }
  return { kind: 'ok', upcomingFrom: upcoming?.startsAt }
}

/** Số phần món đang chờ làm (chưa nấu) và số bàn liên quan */
export function pendingFor(itemId: string, snap: Snapshot) {
  const lines = snap.orderItems.filter((o) => o.itemId === itemId && o.status === 'new')
  return { qty: lines.reduce((s, l) => s + l.qty, 0), tables: new Set(lines.map((l) => l.tableId)).size }
}

const PRESETS: { id: UntilPreset; label: string }[] = [
  { id: '30m', label: '30 phút' },
  { id: '2h', label: '2 giờ' },
  { id: 'shift', label: 'Hết ca này' },
  { id: 'today', label: 'Hết hôm nay' },
  { id: 'forever', label: 'Đến khi bật lại' },
]

export function SoldOutDialog({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  const { backend, snap, now, run } = useApp()
  const toast = useToast()
  const [preset, setPreset] = useState<UntilPreset>('shift')
  const [reason, setReason] = useState('')
  const [schedule, setSchedule] = useState(false)
  const [from, setFrom] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)))
  const [to, setTo] = useState(() => toLocalInput(new Date(Date.now() + 5 * 3_600_000)))

  const pending = useMemo(() => (item && snap ? pendingFor(item.id, snap) : { qty: 0, tables: 0 }), [item, snap])
  if (!item || !snap) return null

  const bad = schedule && new Date(to) <= new Date(from)

  async function confirm() {
    if (!item || bad) return
    const ok = await run(async () => {
      if (schedule) {
        await backend.markUnavailable({
          branchId: item.branchId,
          itemId: item.id,
          startsAt: fromLocalInput(from),
          endsAt: fromLocalInput(to),
          reason,
        })
      } else {
        await backend.markUnavailable({
          branchId: item.branchId,
          itemId: item.id,
          endsAt: untilFromPreset(preset, new Date(), snap!.branch.timezone),
          reason,
        })
      }
      return true
    })
    if (ok) {
      toast({
        text: schedule ? `Đã hẹn giờ hết "${item.name}"` : `"${item.name}" đã được đánh dấu hết`,
        tone: 'success',
        action: { label: 'Hoàn tác', run: () => void run(() => backend.markAvailable(item.branchId, item.id)) },
      })
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Hết món: ${item.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button variant="danger" onClick={confirm} disabled={bad}>
            <MinusCircle className="size-4" /> {schedule ? 'Hẹn giờ hết món' : 'Đánh dấu hết'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!schedule && pending.qty > 0 && (
          <div className="flex gap-3 rounded-xl bg-brick-soft p-3 text-sm text-brick">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <p>
              Đang có <b>{pending.qty} phần</b> ở <b>{pending.tables} bàn</b> chưa làm. Các món này sẽ chuyển sang làn{' '}
              <b>Cần xử lý</b> để bạn đổi món hoặc hủy cho khách.
            </p>
          </div>
        )}

        <div className="flex rounded-xl bg-cream p-1 ring-1 ring-wood-200">
          {[
            { v: false, label: 'Hết ngay bây giờ', icon: Clock3 },
            { v: true, label: 'Hẹn giờ hết', icon: CalendarClock },
          ].map(({ v, label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setSchedule(v)}
              className={clsx(
                'flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition',
                schedule === v ? 'bg-wood-500 text-white shadow-warm' : 'text-wood-700 hover:bg-sand',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {!schedule ? (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-wood-700">Hết trong bao lâu?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  aria-pressed={preset === p.id}
                  className={clsx(
                    'min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 transition',
                    preset === p.id ? 'bg-wood-800 text-white ring-wood-800' : 'bg-white text-wood-700 ring-wood-200 hover:bg-cream',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              {(() => {
                const u = untilFromPreset(preset, new Date(), snap.branch.timezone)
                return u ? `Tự bán lại lúc ${hhmm(u, snap.branch.timezone)}` : 'Giữ trạng thái hết cho đến khi bạn bật lại'
              })()}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hết từ">
              <input type="datetime-local" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Bán lại lúc">
              <input type="datetime-local" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            {bad && <p className="text-sm text-brick sm:col-span-2">Thời điểm bán lại phải sau thời điểm hết.</p>}
            <p className="text-xs text-ink-soft sm:col-span-2">
              Dùng cho món chỉ bán một số khung giờ, ví dụ hết từ 13:30 đến 17:00. Đến giờ, món tự hết và tự mở lại, không cần thao tác.
            </p>
          </div>
        )}

        <Field label="Lý do (tuỳ chọn)">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hết nguyên liệu, bếp quá tải…" />
        </Field>
      </div>
    </Modal>
  )
}

/** Dòng món + công tắc còn/hết, dùng ở tab Thực đơn của màn vận hành và trang quản lý */
export function AvailabilityRow({
  item,
  categoryName,
  onToggleOut,
  trailing,
}: {
  item: MenuItem
  categoryName?: string
  onToggleOut: (item: MenuItem) => void
  trailing?: React.ReactNode
}) {
  const { backend, snap, now, run } = useApp()
  const toast = useToast()
  if (!snap) return null
  const st = itemStatus(item, snap, now)
  const pending = pendingFor(item.id, snap)
  const sellable = st.kind === 'ok'
  const tz = snap.branch.timezone

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 transition',
        st.kind === 'out' ? 'ring-brick/40' : 'ring-wood-100',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={clsx('truncate font-semibold', !sellable && 'text-ink-soft')}>{item.name}</span>
          {item.combo && <Chip tone="turmeric">Combo · {item.combo.groups.length} nhóm chọn</Chip>}
          {categoryName && <Chip>{categoryName}</Chip>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="font-medium text-wood-600">{formatVnd(item.price)}</span>
          {st.kind === 'out' && (
            <span className="font-semibold text-brick">
              Hết {st.until ? `đến ${hhmm(st.until, tz)}` : 'đến khi bật lại'}
              {st.reason ? ` · ${st.reason}` : ''}
            </span>
          )}
          {st.kind === 'off-menu' && <span className="text-ink-soft">Không có trong thực đơn lúc này</span>}
          {st.kind === 'inactive' && <span className="text-ink-soft">Đã ẩn khỏi thực đơn</span>}
          {(st.kind === 'ok' || st.kind === 'out') && st.upcomingFrom && (
            <span className="inline-flex items-center gap-1 font-medium text-[#8a6417]">
              <CalendarClock className="size-3" /> Hẹn hết từ {hhmm(st.upcomingFrom, tz)}
            </span>
          )}
          {pending.qty > 0 && (
            <span className="text-ink-soft">
              {pending.qty} phần đang chờ · {pending.tables} bàn
            </span>
          )}
        </div>
      </div>
      {trailing}
      <Switch
        label={`${item.name}: ${sellable ? 'đang bán' : 'đang hết'}`}
        checked={sellable}
        disabled={st.kind === 'off-menu' || st.kind === 'inactive'}
        onChange={(on) => {
          if (on) {
            void run(() => backend.markAvailable(item.branchId, item.id)).then(() =>
              toast({ text: `"${item.name}" đã bán lại`, tone: 'success' }),
            )
          } else onToggleOut(item)
        }}
      />
    </div>
  )
}
