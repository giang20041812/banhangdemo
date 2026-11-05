'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import clsx from 'clsx'

type Tone = 'info' | 'success' | 'warn'
interface ToastInput {
  text: string
  tone?: Tone
  action?: { label: string; run: () => void }
  ms?: number
}
interface ToastItem extends ToastInput {
  id: number
}

const Ctx = createContext<(t: ToastInput | string) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (t: ToastInput | string) => {
      const input = typeof t === 'string' ? { text: t } : t
      const id = ++seq.current
      setItems((l) => [...l.slice(-3), { ...input, id }])
      setTimeout(() => dismiss(id), input.ms ?? (input.action ? 7000 : 3800))
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+0.5rem)] z-[100] md:bottom-4 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'warn' ? AlertTriangle : Info
          return (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex w-full max-w-md animate-slide-up items-center gap-3 rounded-2xl px-4 py-3 text-sm text-white shadow-lift',
                t.tone === 'warn' ? 'bg-brick' : t.tone === 'success' ? 'bg-leaf' : 'bg-wood-800',
              )}
            >
              <Icon className="size-5 shrink-0 opacity-90" />
              <span className="flex-1 leading-snug">{t.text}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run()
                    dismiss(t.id)
                  }}
                  className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} aria-label="Đóng" className="-mr-1 rounded p-1 opacity-70 hover:opacity-100">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
