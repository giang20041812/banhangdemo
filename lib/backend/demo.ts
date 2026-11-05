import { token, uid } from '../id'
import { blobToDataUrl, shrinkImage } from '../image'
import { isUnavailable, sellableItems } from '../menu-logic'
import { seedBranch, seedDb, type Db } from '../seed'
import type {
  Branch, DiningTable, Floor, Menu, OrderLine, OrderStatus, PlaceOrderResult, PublicSnapshot, Snapshot,
} from '../types'
import type { Backend, Unsub } from './types'

const KEY = 'vqm-demo-db-v1'
const CHANNEL = 'vqm-demo-sync'

/**
 * Backend chạy hoàn toàn trong trình duyệt (localStorage + BroadcastChannel).
 * Dùng khi chưa cấu hình Supabase: mở 2 tab (nhân viên + trang khách) vẫn đồng bộ realtime.
 */
export function createDemoBackend(): Backend {
  let cache: Db | null = null
  const listeners = new Set<() => void>()
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null
  // Gửi kèm toàn bộ DB trong tin nhắn: localStorage ở tab khác có thể chưa kịp đồng bộ khi tin nhắn đến
  bc?.addEventListener('message', (e: MessageEvent) => {
    cache = e.data && typeof e.data === 'object' ? (e.data as Db) : null
    listeners.forEach((l) => l())
  })

  const read = (): Db => {
    if (cache) return cache
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return (cache = JSON.parse(raw) as Db)
    } catch {
      /* fallthrough */
    }
    cache = seedDb()
    write(cache)
    return cache
  }
  const write = (db: Db) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* quota / private mode: giữ trong bộ nhớ */
    }
  }
  const mutate = <T,>(fn: (db: Db) => T): T => {
    const db = read()
    const out = fn(db)
    write(db)
    bc?.postMessage(db)
    listeners.forEach((l) => l())
    return out
  }
  const on = (cb: () => void): Unsub => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
  const nowIso = () => new Date().toISOString()

  const openSession = (db: Db, tableId: string) =>
    db.sessions.find((s) => s.tableId === tableId && !s.closedAt)

  function placeCore(db: Db, table: DiningTable, lines: OrderLine[], source: 'qr' | 'staff'): PlaceOrderResult {
    const now = new Date()
    const branch = db.branches.find((b) => b.id === table.branchId)!
    const items = db.items.filter((i) => i.branchId === table.branchId)
    const menus = db.menus.filter((m) => m.branchId === table.branchId)
    const un = db.unavailability.filter((u) => u.branchId === table.branchId)
    const sellable = new Set(sellableItems(items, menus, now, branch.timezone).map((i) => i.id))

    if (source === 'qr') {
      const recent = db.orders.filter(
        (o) => o.tableId === table.id && o.source === 'qr' && now.getTime() - new Date(o.createdAt).getTime() < 120_000,
      )
      if (recent.length >= 8) throw new Error('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.')
    }

    const accepted: { item: (typeof items)[number]; line: OrderLine }[] = []
    const rejected: PlaceOrderResult['rejected'] = []
    for (const line of lines) {
      const item = items.find((i) => i.id === line.itemId)
      if (!item || line.qty < 1) continue
      if (!sellable.has(item.id) || isUnavailable(item.id, un, now)) rejected.push({ itemId: item.id, name: item.name })
      else accepted.push({ item, line })
    }
    if (!accepted.length) return { orderId: null, rejected }

    let session = openSession(db, table.id)
    if (!session) {
      session = { id: uid(), tableId: table.id, branchId: table.branchId, openedAt: nowIso(), closedAt: null }
      db.sessions.push(session)
    }
    const seq = db.orders.filter((o) => o.sessionId === session!.id).length + 1
    const order = {
      id: uid(), sessionId: session.id, tableId: table.id, branchId: table.branchId, source, seq, createdAt: nowIso(),
    }
    db.orders.push(order)
    for (const { item, line } of accepted) {
      db.orderItems.push({
        id: uid(), orderId: order.id, sessionId: session.id, tableId: table.id, branchId: table.branchId,
        itemId: item.id, name: item.name, price: item.price,
        qty: Math.min(99, Math.max(1, Math.floor(line.qty))), note: (line.note ?? '').slice(0, 200),
        status: 'new', replacedFromId: null, createdAt: nowIso(), servedAt: null,
      })
    }
    return { orderId: order.id, rejected }
  }

  const snapshot = (db: Db, branchId: string): Snapshot => {
    const branch = db.branches.find((b) => b.id === branchId)!
    const sessions = db.sessions.filter((s) => s.branchId === branchId && !s.closedAt)
    const sids = new Set(sessions.map((s) => s.id))
    return {
      branch,
      floors: db.floors.filter((f) => f.branchId === branchId).sort((a, b) => a.sort - b.sort),
      tables: db.tables.filter((t) => t.branchId === branchId),
      categories: db.categories.filter((c) => c.branchId === branchId).sort((a, b) => a.sort - b.sort),
      items: db.items.filter((i) => i.branchId === branchId),
      menus: db.menus.filter((m) => m.branchId === branchId),
      unavailability: db.unavailability.filter((u) => u.branchId === branchId),
      sessions,
      orders: db.orders.filter((o) => sids.has(o.sessionId)),
      orderItems: db.orderItems.filter((o) => sids.has(o.sessionId)),
    }
  }

  const publicSnapshot = (db: Db, tok: string): PublicSnapshot | null => {
    const table = db.tables.find((t) => t.qrToken === tok)
    if (!table) return null
    const branch = db.branches.find((b) => b.id === table.branchId)!
    const s = openSession(db, table.id)
    return {
      branch,
      table: { id: table.id, code: table.code },
      categories: db.categories.filter((c) => c.branchId === branch.id).sort((a, b) => a.sort - b.sort),
      items: db.items.filter((i) => i.branchId === branch.id),
      menus: db.menus.filter((m) => m.branchId === branch.id),
      unavailability: db.unavailability.filter((u) => u.branchId === branch.id),
      orders: s ? db.orders.filter((o) => o.sessionId === s.id) : [],
      orderItems: s ? db.orderItems.filter((o) => o.sessionId === s.id) : [],
    }
  }

  return {
    mode: 'demo',

    async listBranches() {
      return [...read().branches]
    },
    async createBranch({ name, address }) {
      return mutate((db) => {
        const b = seedBranch(db, name, address, false)
        // chi nhánh mới: để trống sơ đồ & thực đơn mẫu giữ nguyên để dễ thử
        return b as Branch
      })
    },
    async load(branchId) {
      return snapshot(read(), branchId)
    },
    subscribe(_branchId, cb) {
      return on(cb)
    },

    async createFloor(branchId, name, rows = 12, cols = 20) {
      return mutate((db) => {
        const sort = db.floors.filter((f) => f.branchId === branchId).length
        const f: Floor = { id: uid(), branchId, name, rows, cols, sort }
        db.floors.push(f)
        return f
      })
    },
    async updateFloor(id, patch) {
      mutate((db) => {
        const f = db.floors.find((x) => x.id === id)
        if (f) Object.assign(f, patch)
      })
    },
    async deleteFloor(id) {
      mutate((db) => {
        const tids = new Set(db.tables.filter((t) => t.floorId === id).map((t) => t.id))
        db.floors = db.floors.filter((f) => f.id !== id)
        db.tables = db.tables.filter((t) => t.floorId !== id)
        db.sessions = db.sessions.filter((s) => !tids.has(s.tableId))
        db.orders = db.orders.filter((o) => !tids.has(o.tableId))
        db.orderItems = db.orderItems.filter((o) => !tids.has(o.tableId))
      })
    },
    async saveLayout(floorId, tables) {
      mutate((db) => {
        const floor = db.floors.find((f) => f.id === floorId)!
        const keep = new Set(tables.map((t) => t.id))
        const removed = db.tables.filter((t) => t.floorId === floorId && !keep.has(t.id)).map((t) => t.id)
        db.tables = db.tables.filter((t) => t.floorId !== floorId)
        db.tables.push(...tables.map((t) => ({ ...t, floorId, branchId: floor.branchId })))
        const gone = new Set(removed)
        db.sessions = db.sessions.filter((s) => !gone.has(s.tableId))
        db.orders = db.orders.filter((o) => !gone.has(o.tableId))
        db.orderItems = db.orderItems.filter((o) => !gone.has(o.tableId))
      })
    },
    async regenerateQr(tableId) {
      return mutate((db) => {
        const t = db.tables.find((x) => x.id === tableId)!
        t.qrToken = token()
        return t.qrToken
      })
    },

    async saveCategory(c) {
      return mutate((db) => {
        if (c.id) {
          const cur = db.categories.find((x) => x.id === c.id)!
          Object.assign(cur, c)
          return cur
        }
        const n = { ...c, id: uid() }
        db.categories.push(n)
        return n
      })
    },
    async deleteCategory(id) {
      mutate((db) => {
        db.categories = db.categories.filter((c) => c.id !== id)
        db.items.forEach((i) => {
          if (i.categoryId === id) i.categoryId = null
        })
      })
    },
    async saveItem(i) {
      return mutate((db) => {
        if (i.id) {
          const cur = db.items.find((x) => x.id === i.id)!
          Object.assign(cur, i)
          return cur
        }
        const n = { ...i, id: uid() }
        db.items.push(n)
        return n
      })
    },
    async uploadItemImage(_branchId, file) {
      // Demo lưu trong localStorage nên thu nhỏ hơn nhiều
      return blobToDataUrl(await shrinkImage(file, 480, 0.7))
    },
    async deleteItem(id) {
      mutate((db) => {
        db.items = db.items.filter((i) => i.id !== id)
        db.menus.forEach((m) => (m.itemIds = m.itemIds.filter((x) => x !== id)))
        db.unavailability = db.unavailability.filter((u) => u.itemId !== id)
        db.orderItems.forEach((o) => {
          if (o.itemId === id) o.itemId = null // giữ lịch sử bằng snapshot tên/giá
        })
      })
    },
    async saveMenu(m) {
      return mutate((db) => {
        if (m.id) {
          const cur = db.menus.find((x) => x.id === m.id)!
          Object.assign(cur, m)
          return cur as Menu
        }
        const n = { ...m, id: uid() }
        db.menus.push(n)
        return n
      })
    },
    async deleteMenu(id) {
      mutate((db) => {
        db.menus = db.menus.filter((m) => m.id !== id)
      })
    },

    async markUnavailable({ branchId, itemId, startsAt, endsAt, reason }) {
      mutate((db) => {
        db.unavailability.push({
          id: uid(), branchId, itemId, startsAt: startsAt ?? nowIso(), endsAt, reason: reason ?? '',
        })
      })
    },
    async markAvailable(branchId, itemId) {
      mutate((db) => {
        const now = Date.now()
        db.unavailability = db.unavailability
          .filter((u) => !(u.itemId === itemId && new Date(u.startsAt).getTime() > now))
          .map((u) =>
            u.itemId === itemId && (u.endsAt === null || new Date(u.endsAt).getTime() > now) ? { ...u, endsAt: nowIso() } : u,
          )
        void branchId
      })
    },
    async deleteUnavailability(id) {
      mutate((db) => {
        db.unavailability = db.unavailability.filter((u) => u.id !== id)
      })
    },

    async staffPlaceOrder(tableId, lines) {
      return mutate((db) => placeCore(db, db.tables.find((t) => t.id === tableId)!, lines, 'staff'))
    },
    async setStatus(ids, status: OrderStatus) {
      mutate((db) => {
        const set = new Set(ids)
        for (const o of db.orderItems) {
          if (!set.has(o.id)) continue
          o.status = status
          o.servedAt = status === 'served' ? nowIso() : null
        }
      })
    },
    async updateOrderItem(id, patch) {
      mutate((db) => {
        const o = db.orderItems.find((x) => x.id === id)
        if (!o) return
        if (patch.qty !== undefined) o.qty = Math.min(99, Math.max(1, patch.qty))
        if (patch.note !== undefined) o.note = patch.note.slice(0, 200)
      })
    },
    async replaceOrderItem(id, newItemId) {
      mutate((db) => {
        const old = db.orderItems.find((x) => x.id === id)
        const item = db.items.find((i) => i.id === newItemId)
        if (!old || !item) return
        old.status = 'cancelled'
        db.orderItems.push({
          ...old, id: uid(), itemId: item.id, name: item.name, price: item.price,
          status: 'new', replacedFromId: old.id, createdAt: nowIso(), servedAt: null,
        })
      })
    },
    async closeSession(tableId) {
      mutate((db) => {
        const s = openSession(db, tableId)
        if (s) s.closedAt = nowIso()
      })
    },

    async loadPublic(tok) {
      return publicSnapshot(read(), tok)
    },
    subscribePublic(_tok, cb) {
      return on(cb)
    },
    async placeOrder(tok, lines) {
      return mutate((db) => {
        const table = db.tables.find((t) => t.qrToken === tok)
        if (!table) throw new Error('Mã QR không hợp lệ hoặc đã bị thay thế.')
        return placeCore(db, table, lines, 'qr')
      })
    },
  }
}
