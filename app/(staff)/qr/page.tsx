'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ExternalLink, Link2, Printer, RefreshCw, TriangleAlert, UtensilsCrossed } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/components/AppProvider'
import { useToast } from '@/components/Toast'
import { Button, Empty, Field, inputCls } from '@/components/ui'
import type { DiningTable } from '@/lib/types'

const BASE_KEY = 'vqm-public-base'

export default function QrPage() {
  return (
    <Suspense>
      <QrInner />
    </Suspense>
  )
}

function QrInner() {
  const { backend, snap, run, refresh } = useApp()
  const toast = useToast()
  const params = useSearchParams()
  const only = params.get('table')
  const [floorId, setFloorId] = useState<string>('all')
  const [base, setBase] = useState('')

  useEffect(() => {
    let saved = ''
    try {
      saved = localStorage.getItem(BASE_KEY) ?? ''
    } catch {}
    setBase(saved || window.location.origin)
  }, [])
  const setBaseSaved = (v: string) => {
    setBase(v)
    try {
      localStorage.setItem(BASE_KEY, v)
    } catch {}
  }

  if (!snap) return <div className="grid h-full place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div>

  const tables = snap.tables
    .filter((t) => (only ? t.id === only : floorId === 'all' || t.floorId === floorId))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }))
  const urlOf = (t: DiningTable) => `${base.replace(/\/$/, '')}/t/${t.qrToken}`
  const isLocal = /localhost|127\.0\.0\.1/.test(base)

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="no-print sticky top-0 z-10 space-y-3 border-b border-wood-100 bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 font-display text-xl font-semibold text-wood-800">Mã QR gọi món</h1>
          {only ? (
            <Link href="/qr" className="text-sm font-semibold text-wood-600 hover:underline">← Xem tất cả bàn</Link>
          ) : (
            ['all', ...snap.floors.map((f) => f.id)].map((id) => (
              <button
                key={id}
                onClick={() => setFloorId(id)}
                aria-pressed={floorId === id}
                className={clsx(
                  'min-h-10 rounded-xl px-3.5 text-sm font-semibold transition',
                  floorId === id ? 'bg-wood-800 text-white' : 'bg-cream text-wood-700 ring-1 ring-wood-200 hover:bg-sand',
                )}
              >
                {id === 'all' ? 'Tất cả' : snap.floors.find((f) => f.id === id)!.name}
              </button>
            ))
          )}
          <Button variant="primary" className="ml-auto" onClick={() => window.print()} disabled={!tables.length}>
            <Printer className="size-4" /> In {tables.length} mã QR
          </Button>
        </div>
        <div className="max-w-xl">
          <Field label="Địa chỉ website mà khách sẽ mở" hint="Dùng địa chỉ công khai của quán (ví dụ https://vique.vn). Điện thoại khách không mở được localhost.">
            <input className={inputCls} value={base} onChange={(e) => setBaseSaved(e.target.value)} />
          </Field>
          {isLocal && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-turmeric-soft px-3 py-2 text-xs text-[#7a5612]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              Đang dùng địa chỉ nội bộ. Khi thử trên điện thoại cùng Wi-Fi, hãy nhập IP máy tính, ví dụ http://192.168.1.20:3000
            </p>
          )}
        </div>
      </div>

      {tables.length === 0 ? (
        <Empty icon={<UtensilsCrossed className="size-7" />} title="Chưa có bàn nào" hint="Vẽ sơ đồ bàn trước, mỗi bàn sẽ tự có một mã QR riêng." />
      ) : (
        <div className="print-grid grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((t) => (
            <QrCard
              key={t.id + t.qrToken}
              table={t}
              floor={snap.floors.find((f) => f.id === t.floorId)?.name ?? ''}
              url={urlOf(t)}
              onRegenerate={async () => {
                if (!window.confirm(`Tạo lại mã QR cho bàn ${t.code}? Mã cũ sẽ không dùng được nữa.`)) return
                await run(() => backend.regenerateQr(t.id))
                await refresh()
                toast({ text: `Đã tạo mã QR mới cho bàn ${t.code}`, tone: 'success' })
              }}
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(urlOf(t))
                  toast({ text: 'Đã chép liên kết', tone: 'success' })
                } catch {
                  toast({ text: urlOf(t) })
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function QrCard({
  table, floor, url, onRegenerate, onCopy,
}: {
  table: DiningTable
  floor: string
  url: string
  onRegenerate: () => void
  onCopy: () => void
}) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    void QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#3a2410', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then((d) => live && setSrc(d))
    return () => {
      live = false
    }
  }, [url])

  return (
    <article className="qr-card flex flex-col items-center rounded-3xl bg-white p-5 text-center shadow-warm ring-1 ring-wood-100">
      <p className="font-display text-4xl font-bold text-wood-800">Bàn {table.code}</p>
      <p className="text-xs text-ink-soft">{floor} · {table.seats} chỗ</p>
      <div className="my-3 rounded-2xl border-4 border-wood-200 bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={`Mã QR bàn ${table.code}`} className="size-48" /> : <div className="size-48 animate-pulse rounded bg-cream" />}
      </div>
      <p className="font-semibold text-wood-800">Quét để gọi món</p>
      <p className="text-xs text-ink-soft">Mở camera điện thoại và hướng vào mã</p>
      <div className="no-print mt-4 flex w-full flex-wrap justify-center gap-2">
        <Button size="sm" variant="secondary" onClick={onCopy}><Link2 className="size-4" /> Chép link</Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-cream px-3 text-[13px] font-semibold text-wood-800 ring-1 ring-wood-200 hover:bg-sand">
          <ExternalLink className="size-4" /> Mở thử
        </a>
        <Button size="sm" variant="ghost" onClick={onRegenerate} aria-label="Tạo lại mã"><RefreshCw className="size-4" /></Button>
      </div>
    </article>
  )
}
