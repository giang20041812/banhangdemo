'use client'

import { useEffect, useId } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import clsx from 'clsx'

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'leaf'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'secondary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' && 'min-h-10 px-3 text-[13px] sm:min-h-9',
        size === 'md' && 'min-h-11 px-4 text-sm',
        size === 'lg' && 'min-h-13 px-6 text-base',
        variant === 'primary' && 'bg-wood-500 text-white shadow-warm hover:bg-wood-600',
        variant === 'leaf' && 'bg-leaf text-white shadow-warm hover:brightness-95',
        variant === 'secondary' && 'bg-cream text-wood-800 ring-1 ring-wood-200 hover:bg-sand',
        variant === 'ghost' && 'text-wood-700 hover:bg-wood-100',
        variant === 'danger' && 'bg-brick-soft text-brick ring-1 ring-brick/30 hover:bg-brick hover:text-white',
        className,
      )}
    />
  )
}

export function Chip({
  tone = 'wood',
  className,
  children,
}: {
  tone?: 'wood' | 'leaf' | 'turmeric' | 'brick' | 'solid'
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'wood' && 'bg-wood-100 text-wood-700',
        tone === 'leaf' && 'bg-leaf-soft text-leaf',
        tone === 'turmeric' && 'bg-turmeric-soft text-[#8a6417]',
        tone === 'brick' && 'bg-brick-soft text-brick',
        tone === 'solid' && 'bg-wood-700 text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-leaf' : 'bg-wood-200',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 size-6 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = 'md',
  disabled = false,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const s = size === 'sm' ? 'size-9' : 'size-10'
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-cream p-1 ring-1 ring-wood-200">
      <button
        aria-label="Giảm"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className={clsx(s, 'grid place-items-center rounded-lg text-wood-700 transition hover:bg-sand active:scale-90 disabled:opacity-30')}
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-7 text-center text-sm font-bold tabular-nums">{value}</span>
      <button
        aria-label="Tăng"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        className={clsx(s, 'grid place-items-center rounded-lg bg-wood-500 text-white transition hover:bg-wood-600 active:scale-90 disabled:opacity-30')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-labelledby={titleId}>
      <div className="absolute inset-0 animate-fade bg-wood-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={clsx(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl bg-paper shadow-lift sm:rounded-3xl',
          width,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-wood-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 id={titleId} className="font-display text-lg font-semibold text-wood-800">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="grid size-11 place-items-center rounded-full text-wood-600 hover:bg-wood-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-wood-100 bg-cream/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">{footer}</div>}
      </div>
    </div>
  )
}

export const inputCls =
  'min-h-11 w-full rounded-xl bg-white px-3.5 text-base text-ink ring-1 ring-wood-200 placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-wood-500 sm:text-sm'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-wood-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}

export function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-wood-100 text-wood-500">{icon}</div>
      <p className="font-display text-base font-semibold text-wood-800">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-soft">{hint}</p>}
    </div>
  )
}
