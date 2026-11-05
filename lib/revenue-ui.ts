import type { Gran } from './revenue'

/** 1.250.000 -> "1,25tr", 85.000 -> "85k" (nhãn trục biểu đồ) */
export function shortVnd(n: number): string {
  const a = Math.abs(n)
  const f = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')
  if (a >= 1e9) return `${f(n / 1e9)}tỷ`
  if (a >= 1e6) return `${f(n / 1e6)}tr`
  if (a >= 1e3) return `${f(n / 1e3)}k`
  return String(n)
}

/** Làm tròn lên một mốc "đẹp" (1, 2, 2.5, 5 × 10^k) để trục có vạch chẵn */
export function niceCeil(n: number): number {
  if (n <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(n)))
  for (const m of [1, 2, 2.5, 5, 10]) if (n <= m * p) return m * p
  return 10 * p
}

/** Khoảng thời gian cần tải (UTC, đệm ±1 ngày để không sót do múi giờ; bucket sẽ lọc chính xác) */
export function fetchRange(gran: Gran, year: number, month: number, now: Date): { from: string; to: string } {
  const DAY = 86_400_000
  const [a, b] =
    gran === 'day' ? [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)]
    : gran === 'month' ? [Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)]
    : [Date.UTC(2000, 0, 1), now.getTime()]
  return { from: new Date(a - DAY).toISOString(), to: new Date(b + DAY).toISOString() }
}
