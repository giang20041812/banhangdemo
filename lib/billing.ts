import type { DiningTable, OrderItem } from './types'

export interface Bill {
  lines: OrderItem[]
  itemsTotal: number
  surcharge: number
  total: number
}

/** Hóa đơn tạm tính của một phiên: món chưa hủy / chưa bị đánh dấu hết + phụ thu bàn VIP */
export function billOf(items: OrderItem[], table: Pick<DiningTable, 'kind' | 'surcharge'>): Bill {
  const lines = items.filter((i) => i.status !== 'cancelled' && i.status !== 'unavailable')
  const itemsTotal = lines.reduce((s, i) => s + i.price * i.qty, 0)
  const surcharge = table.kind === 'vip' ? Math.max(0, table.surcharge) : 0
  // Phiên không có món nào thì không thu phụ thu
  return { lines, itemsTotal, surcharge: lines.length ? surcharge : 0, total: itemsTotal + (lines.length ? surcharge : 0) }
}
