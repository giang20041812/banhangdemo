'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Crown, Receipt as ReceiptIcon, TrendingUp, Users, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/components/AppProvider'
import { Empty } from '@/components/ui'
import { formatVnd, hhmm } from '@/lib/format'
import { bucketKey, buckets, localParts, summarize, type Bucket, type Gran } from '@/lib/revenue'
import { fetchRange, niceCeil, shortVnd } from '@/lib/revenue-ui'
import type { Receipt } from '@/lib/types'

const GRANS: [Gran, string][] = [
  ['day', 'Theo ngày'],
  ['month', 'Theo tháng'],
  ['year', 'Theo năm'],
]

export default function RevenuePage() {
  const { backend, snap } = useApp()
  const branchId = snap?.branch.id
  const tz = snap?.branch.timezone ?? 'Asia/Ho_Chi_Minh'
  const today = useMemo(() => localParts(new Date().toISOString(), tz), [tz])

  const [gran, setGran] = useState<Gran>('day')
  const [year, setYear] = useState(today.y)
  const [month, setMonth] = useState(today.m)
  const [receipts, setReceipts] = useState<Receipt[] | null>(null)
  const [error, setError] = useState('')
  const [hover, setHover] = useState<string | null>(null)

  // Tải lại khi đổi chi nhánh / kỳ xem, và khi dữ liệu vận hành đổi (có bàn vừa thanh toán)
  const refreshKey = snap ? `${snap.sessions.length}:${snap.orderItems.length}` : ''
  useEffect(() => {
    if (!branchId) return
    let stale = false
    const { from, to } = fetchRange(gran, year, month, new Date())
    backend
      .loadRevenue(branchId, from, to)
      .then((r) => {
        if (stale) return
        setReceipts(r)
        setError('')
      })
      .catch((e) => !stale && setError(e instanceof Error ? e.message : 'Không tải được doanh thu'))
    return () => {
      stale = true
    }
  }, [backend, branchId, gran, year, month, refreshKey])

  const list = receipts ?? []
  const bs = useMemo(() => buckets(list, gran, tz, year, month), [list, gran, tz, year, month])
  const keys = useMemo(() => new Set(bs.map((b) => b.key)), [bs])
  const inRange = useMemo(() => list.filter((r) => keys.has(bucketKey(r.closedAt, gran, tz))), [list, keys, gran, tz])
  const totals = useMemo(() => summarize(inRange), [inRange])
  const recent = useMemo(() => [...inRange].sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 20), [inRange])

  const step = (dir: -1 | 1) => {
    if (gran === 'day') {
      const d = new Date(Date.UTC(year, month - 1 + dir, 1))
      setYear(d.getUTCFullYear())
      setMonth(d.getUTCMonth() + 1)
    } else setYear((y) => y + dir)
  }
  const title = gran === 'day' ? `Tháng ${month}/${year}` : gran === 'month' ? `Năm ${year}` : `Đến năm ${year}`
  const hasData = totals.count > 0

  if (!snap) return <div className="grid h-full place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div>

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-cream/40">
      <div className="mx-auto max-w-5xl space-y-5 p-4 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-wood-800">Doanh thu</h1>
          <div role="tablist" aria-label="Xem theo" className="ml-auto flex gap-1 rounded-xl bg-white p-1 ring-1 ring-wood-100">
            {GRANS.map(([g, label]) => (
              <button
                key={g}
                role="tab"
                aria-selected={gran === g}
                onClick={() => {
                  setGran(g)
                  setHover(null)
                }}
                className={clsx(
                  'min-h-9 rounded-lg px-3 text-sm font-semibold transition',
                  gran === g ? 'bg-wood-500 text-white shadow-warm' : 'text-wood-700 hover:bg-cream',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {gran !== 'year' && (
            <button onClick={() => step(-1)} aria-label="Kỳ trước" className="grid size-10 place-items-center rounded-xl bg-white ring-1 ring-wood-200 hover:bg-cream">
              <ChevronLeft className="size-5" />
            </button>
          )}
          <p className="min-w-32 text-center font-display text-lg font-semibold text-wood-800">{title}</p>
          {gran !== 'year' && (
            <button onClick={() => step(1)} aria-label="Kỳ sau" className="grid size-10 place-items-center rounded-xl bg-white ring-1 ring-wood-200 hover:bg-cream">
              <ChevronRight className="size-5" />
            </button>
          )}
          {gran !== 'year' && !(year === today.y && (gran === 'month' || month === today.m)) && (
            <button
              onClick={() => {
                setYear(today.y)
                setMonth(today.m)
              }}
              className="ml-1 min-h-9 rounded-lg px-3 text-sm font-semibold text-wood-600 hover:bg-white"
            >
              {gran === 'day' ? 'Tháng này' : 'Năm nay'}
            </button>
          )}
        </div>

        {error && <p role="alert" className="rounded-xl bg-brick-soft px-4 py-3 text-sm text-brick">{error}</p>}

        {receipts === null && !error ? (
          <div className="grid h-48 place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div>
        ) : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={<TrendingUp className="size-4" />} label="Tổng doanh thu" value={formatVnd(totals.total)} strong />
              <Kpi icon={<ReceiptIcon className="size-4" />} label="Số hóa đơn" value={String(totals.count)} />
              <Kpi icon={<Users className="size-4" />} label="Trung bình / hóa đơn" value={formatVnd(totals.count ? Math.round(totals.total / totals.count) : 0)} />
              <Kpi icon={<Crown className="size-4" />} label="Phụ thu bàn VIP" value={formatVnd(totals.surcharge)} />
            </div>

            {!hasData ? (
              <Empty
                icon={<Wallet className="size-7" />}
                title="Chưa có doanh thu trong kỳ này"
                hint="Doanh thu được ghi nhận khi nhân viên bấm “Thanh toán & dọn bàn” ở trang Vận hành."
              />
            ) : (
              <>
                {/* Thường vs VIP */}
                <section className="rounded-2xl bg-white p-4 shadow-warm ring-1 ring-wood-100">
                  <h2 className="mb-3 font-display text-base font-semibold text-wood-800">Bàn thường và bàn VIP</h2>
                  <div className="flex h-3 overflow-hidden rounded-full bg-cream" role="img" aria-label={`Bàn thường ${pct(totals.normal, totals.total)}%, bàn VIP ${pct(totals.vip, totals.total)}%`}>
                    <div className="bg-wood-500" style={{ width: `${pct(totals.normal, totals.total)}%` }} />
                    <div className="ml-0.5 bg-turmeric" style={{ width: `${pct(totals.vip, totals.total)}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <Split dot="bg-wood-500" label="Bàn thường" amount={totals.normal} count={totals.normalCount} share={pct(totals.normal, totals.total)} />
                    <Split dot="bg-turmeric" label="Bàn VIP" amount={totals.vip} count={totals.vipCount} share={pct(totals.vip, totals.total)} />
                  </div>
                </section>

                {/* Biểu đồ */}
                <section className="rounded-2xl bg-white p-4 shadow-warm ring-1 ring-wood-100">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-base font-semibold text-wood-800">Doanh thu {GRANS.find(([g]) => g === gran)![1].toLowerCase()}</h2>
                    <p className="min-h-5 text-right text-sm text-wood-700" aria-live="polite">
                      {hover ? (() => {
                        const b = bs.find((x) => x.key === hover)
                        return b ? <><b className="tabular-nums">{formatVnd(b.total)}</b> · {labelOf(b, gran, month, year)} · {b.count} hóa đơn</> : null
                      })() : <span className="text-ink-soft">Chạm vào cột để xem chi tiết</span>}
                    </p>
                  </div>
                  <BarChart data={bs} onHover={setHover} hover={hover} gran={gran} />
                </section>

                {/* Bảng số liệu */}
                <section className="overflow-hidden rounded-2xl bg-white shadow-warm ring-1 ring-wood-100">
                  <div className="scroll-thin overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-cream text-left text-xs uppercase tracking-wide text-wood-600">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">{gran === 'day' ? 'Ngày' : gran === 'month' ? 'Tháng' : 'Năm'}</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Hóa đơn</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Bàn thường</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Bàn VIP</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Tổng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-wood-100 tabular-nums">
                        {bs.filter((b) => b.count > 0).map((b) => (
                          <tr key={b.key} className={clsx(hover === b.key && 'bg-cream/70')}>
                            <td className="px-4 py-2 font-medium text-wood-800">{labelOf(b, gran, month, year)}</td>
                            <td className="px-3 py-2 text-right">{b.count}</td>
                            <td className="px-3 py-2 text-right">{formatVnd(b.normal)}</td>
                            <td className="px-3 py-2 text-right">{formatVnd(b.vip)}</td>
                            <td className="px-4 py-2 text-right font-semibold">{formatVnd(b.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-wood-200 bg-cream/60 font-bold tabular-nums text-wood-800">
                        <tr>
                          <td className="px-4 py-2.5">Tổng</td>
                          <td className="px-3 py-2.5 text-right">{totals.count}</td>
                          <td className="px-3 py-2.5 text-right">{formatVnd(totals.normal)}</td>
                          <td className="px-3 py-2.5 text-right">{formatVnd(totals.vip)}</td>
                          <td className="px-4 py-2.5 text-right">{formatVnd(totals.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                {/* Hóa đơn gần đây */}
                <section>
                  <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-wood-500">Hóa đơn gần đây</h2>
                  <ul className="divide-y divide-wood-100 rounded-2xl bg-white px-4 shadow-warm ring-1 ring-wood-100">
                    {recent.map((r) => {
                      const p = localParts(r.closedAt, tz)
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 font-semibold text-wood-800">
                              Bàn {r.tableCode}
                              {r.tableKind === 'vip' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-turmeric px-2 py-0.5 text-[11px] font-bold text-wood-900"><Crown className="size-3" /> VIP</span>
                              )}
                            </p>
                            <p className="text-xs text-ink-soft">
                              {hhmm(r.closedAt, tz)} · {p.d}/{p.m}/{p.y}
                              {r.surcharge > 0 && <> · phụ thu {formatVnd(r.surcharge)}</>}
                            </p>
                          </div>
                          <span className="shrink-0 font-bold tabular-nums text-wood-800">{formatVnd(r.total)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const pct = (a: number, total: number) => (total > 0 ? Math.round((a / total) * 1000) / 10 : 0)

function labelOf(b: Bucket, gran: Gran, month: number, year: number) {
  if (gran === 'day') return `${b.label}/${month}/${year}`
  if (gran === 'month') return `Tháng ${b.label.slice(1)}/${year}`
  return `Năm ${b.label}`
}

function Kpi({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div className={clsx('rounded-2xl p-3.5 shadow-warm ring-1', strong ? 'bg-wood-500 text-white ring-wood-600' : 'bg-white ring-wood-100')}>
      <p className={clsx('flex items-center gap-1.5 text-xs font-semibold', strong ? 'text-wood-100' : 'text-wood-600')}>{icon} {label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

function Split({ dot, label, amount, count, share }: { dot: string; label: string; amount: number; count: number; share: number }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-wood-700"><span className={clsx('size-3 rounded-sm', dot)} /> {label} <span className="text-ink-soft">· {share}%</span></p>
      <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-wood-800">{formatVnd(amount)}</p>
      <p className="text-xs text-ink-soft">{count} hóa đơn</p>
    </div>
  )
}

function BarChart({ data, hover, onHover, gran }: { data: Bucket[]; hover: string | null; onHover: (k: string | null) => void; gran: Gran }) {
  const max = Math.max(...data.map((d) => d.total))
  const top = niceCeil(max)
  const ticks = [0, 0.5, 1].map((f) => top * f)
  const barW = gran === 'day' ? 26 : 44
  const H = 180
  return (
    <div className="flex gap-2">
      {/* Trục tung cố định */}
      <div className="relative shrink-0 text-[11px] tabular-nums text-ink-soft" style={{ height: H, width: 40 }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>{shortVnd(t)}</span>
        ))}
      </div>
      <div className="scroll-thin min-w-0 flex-1 overflow-x-auto pb-1">
        <div className="relative" style={{ minWidth: data.length * (barW + 4) }}>
          <div className="relative" style={{ height: H }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-wood-100" style={{ top: H - (t / top) * H }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-1">
              {data.map((d) => {
                const h = Math.max(d.total > 0 ? 3 : 0, (d.total / top) * H)
                const isMax = max > 0 && d.total === max
                return (
                  <button
                    key={d.key}
                    type="button"
                    onMouseEnter={() => onHover(d.key)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(d.key)}
                    onBlur={() => onHover(null)}
                    onClick={() => onHover(hover === d.key ? null : d.key)}
                    aria-label={`${d.label}: ${formatVnd(d.total)}, ${d.count} hóa đơn`}
                    title={`${d.label}: ${formatVnd(d.total)}`}
                    className="group flex h-full flex-col justify-end"
                    style={{ width: barW }}
                  >
                    <span
                      className={clsx(
                        'block w-full rounded-t-md transition-colors',
                        hover === d.key ? 'bg-wood-800' : isMax ? 'bg-wood-700' : 'bg-wood-400 group-hover:bg-wood-600',
                      )}
                      style={{ height: h }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-1 flex gap-1 text-[11px] text-ink-soft">
            {data.map((d) => (
              <span key={d.key} className="text-center" style={{ width: barW }}>{d.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
