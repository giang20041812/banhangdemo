'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { Button, Modal, Stepper } from '../ui'
import { comboUnitPrice, normalizeChoices, validateChoices } from '@/lib/combo'
import { formatVnd } from '@/lib/format'
import type { MenuItem } from '@/lib/types'

interface Props {
  item: MenuItem
  /** Toàn bộ món của chi nhánh, để lấy tên các thành phần */
  items: MenuItem[]
  initial?: Record<string, string[]>
  /** Món thành phần đang hết thì không chọn được */
  isOut?: (itemId: string) => boolean
  onConfirm: (choices: Record<string, string[]>, qty: number) => void
  onClose: () => void
}

export function ComboDialog({ item, items, initial, isOut, onConfirm, onClose }: Props) {
  const combo = item.combo!
  const [choices, setChoices] = useState<Record<string, string[]>>(initial ?? {})
  const [qty, setQty] = useState(1)
  const name = (id: string) => items.find((i) => i.id === id)?.name ?? '?'
  const error = validateChoices(combo, choices)
  const unit = comboUnitPrice(item, choices)

  function toggle(gid: string, itemId: string, max: number) {
    setChoices((c) => {
      const cur = c[gid] ?? []
      if (cur.includes(itemId)) return { ...c, [gid]: cur.filter((x) => x !== itemId) }
      if (max === 1) return { ...c, [gid]: [itemId] }
      if (cur.length >= max) return c
      return { ...c, [gid]: [...cur, itemId] }
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex w-full flex-col gap-2">
          {error && <p role="alert" className="rounded-lg bg-brick-soft px-3 py-2 text-sm text-brick">{error}</p>}
          <div className="flex items-center gap-3">
            <Stepper value={qty} min={1} onChange={setQty} />
            <Button variant="primary" size="lg" className="ml-auto" disabled={!!error} onClick={() => onConfirm(normalizeChoices(choices), qty)}>
              Thêm · {formatVnd(unit * qty)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {item.description && <p className="text-sm text-ink-soft">{item.description}</p>}
        {combo.fixed.length > 0 && (
          <p className="rounded-xl bg-cream px-3 py-2.5 text-sm text-wood-800">
            <b>Gồm: </b>
            {combo.fixed.map((f) => (f.qty > 1 ? `${name(f.itemId)} ×${f.qty}` : name(f.itemId))).join(', ')}
          </p>
        )}
        {combo.groups.map((g) => {
          const picks = choices[g.id] ?? []
          const single = g.max === 1
          return (
            <section key={g.id}>
              <h3 className="font-display text-base font-semibold text-wood-800">{g.name}</h3>
              <p className="mb-2 text-xs text-ink-soft">
                {single ? 'Chọn 1' : g.min === g.max ? `Chọn ${g.max}` : `Chọn ${g.min > 0 ? `${g.min}–` : 'tối đa '}${g.max}`}
                {picks.length > 0 && !single && ` · đã chọn ${picks.length}`}
              </p>
              <ul className="space-y-1.5">
                {g.options.map((o) => {
                  const on = picks.includes(o.itemId)
                  const out = isOut?.(o.itemId) ?? false
                  const full = !single && !on && picks.length >= g.max
                  return (
                    <li key={o.itemId}>
                      <button
                        type="button"
                        disabled={out || full}
                        onClick={() => toggle(g.id, o.itemId, g.max)}
                        aria-pressed={on}
                        className={clsx(
                          'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left ring-1 transition disabled:opacity-45',
                          on ? 'bg-wood-100 ring-wood-500' : 'bg-white ring-wood-100 hover:bg-cream',
                        )}
                      >
                        <span className={clsx('grid size-5 shrink-0 place-items-center ring-1', single ? 'rounded-full' : 'rounded-md', on ? 'bg-wood-500 text-white ring-wood-500' : 'ring-wood-300')}>
                          {on && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold">{name(o.itemId)}</span>
                        {out ? <span className="text-xs font-bold text-brick">Tạm hết</span> : o.extra > 0 && <span className="text-xs font-semibold text-wood-600">+{formatVnd(o.extra)}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
