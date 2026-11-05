import type { ComboDef, MenuItem, OrderLine } from './types'

/** Chuẩn hóa lựa chọn: bỏ nhóm rỗng, sắp xếp để cùng một cấu hình luôn cho cùng một khóa */
export function normalizeChoices(choices: Record<string, string[]> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [g, ids] of Object.entries(choices ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (ids.length) out[g] = [...ids].sort()
  }
  return out
}

/** Khóa nhận diện một cấu hình combo trong giỏ (cùng món + cùng lựa chọn = cùng dòng) */
export const lineKey = (itemId: string, choices?: Record<string, string[]>) => {
  const n = normalizeChoices(choices)
  return Object.keys(n).length ? `${itemId}#${JSON.stringify(n)}` : itemId
}

/** Lỗi trả về chuỗi tiếng Việt, null nếu hợp lệ */
export function validateChoices(combo: ComboDef, choices: Record<string, string[]> | undefined): string | null {
  for (const g of combo.groups) {
    const picks = choices?.[g.id] ?? []
    if (new Set(picks).size !== picks.length) return `Nhóm "${g.name}" có lựa chọn trùng`
    if (picks.some((id) => !g.options.some((o) => o.itemId === id))) return `Nhóm "${g.name}" có lựa chọn không hợp lệ`
    if (picks.length < g.min) return `Chọn tối thiểu ${g.min} cho "${g.name}"`
    if (picks.length > g.max) return `Chọn tối đa ${g.max} cho "${g.name}"`
  }
  return null
}

/** Đơn giá một suất combo = giá gốc + phụ thu các lựa chọn */
export function comboUnitPrice(item: MenuItem, choices: Record<string, string[]> | undefined): number {
  if (!item.combo) return item.price
  let p = item.price
  for (const g of item.combo.groups)
    for (const id of choices?.[g.id] ?? []) p += g.options.find((o) => o.itemId === id)?.extra ?? 0
  return p
}

/** Mô tả cho bếp / hóa đơn: phần cố định + lựa chọn, mỗi ý một dòng */
export function comboDetail(item: MenuItem, choices: Record<string, string[]> | undefined, all: MenuItem[]): string {
  if (!item.combo) return ''
  const name = (id: string) => all.find((i) => i.id === id)?.name ?? '?'
  const lines: string[] = []
  const fixed = item.combo.fixed.map((f) => (f.qty > 1 ? `${name(f.itemId)} ×${f.qty}` : name(f.itemId)))
  if (fixed.length) lines.push(`Gồm: ${fixed.join(', ')}`)
  for (const g of item.combo.groups) {
    const picks = (choices?.[g.id] ?? []).map(name)
    if (picks.length) lines.push(`${g.name}: ${picks.join(', ')}`)
  }
  return lines.join('\n')
}

/** Kiểm tra một dòng gọi món; trả về lỗi nếu là combo mà lựa chọn sai */
export function lineError(item: MenuItem, line: OrderLine): string | null {
  return item.combo ? validateChoices(item.combo, line.choices) : null
}

export const newGroupId = () => Math.random().toString(36).slice(2, 8)
