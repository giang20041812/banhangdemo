import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { token, uid } from '../id'
import { shrinkImage } from '../image'
import { isUnavailable, sellableItems } from '../menu-logic'
import type {
  Branch, Category, DiningTable, Floor, Menu, MenuItem, Order, OrderItem, OrderLine,
  PlaceOrderResult, PublicSnapshot, Session, Snapshot, Unavailability,
} from '../types'
import type { Backend, Unsub } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

// ---------------------------------------------------------------- mappers (snake_case DB -> camelCase)
const mBranch = (r: Row): Branch => ({ id: r.id, name: r.name, address: r.address ?? '', timezone: r.timezone })
const mFloor = (r: Row): Floor => ({ id: r.id, branchId: r.branch_id, name: r.name, rows: r.rows, cols: r.cols, sort: r.sort })
const mTable = (r: Row): DiningTable => ({
  id: r.id, floorId: r.floor_id, branchId: r.branch_id, code: r.code, seats: r.seats, cells: r.cells ?? [], qrToken: r.qr_token,
})
const mCategory = (r: Row): Category => ({ id: r.id, branchId: r.branch_id, name: r.name, sort: r.sort })
const mItem = (r: Row): MenuItem => ({
  id: r.id, branchId: r.branch_id, categoryId: r.category_id, name: r.name, description: r.description ?? '',
  price: r.price, imageUrl: r.image_url, isActive: r.is_active,
})
const mMenu = (r: Row): Menu => ({
  id: r.id, branchId: r.branch_id, name: r.name, days: r.days ?? [],
  start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5),
  validFrom: r.valid_from, validTo: r.valid_to, priority: r.priority, itemIds: r.item_ids ?? [],
})
const mUnav = (r: Row): Unavailability => ({
  id: r.id, branchId: r.branch_id, itemId: r.item_id, startsAt: r.starts_at, endsAt: r.ends_at, reason: r.reason ?? '',
})
const mSession = (r: Row): Session => ({
  id: r.id, tableId: r.table_id, branchId: r.branch_id, openedAt: r.opened_at, closedAt: r.closed_at,
})
const mOrder = (r: Row): Order => ({
  id: r.id, sessionId: r.session_id, tableId: r.table_id, branchId: r.branch_id, source: r.source, seq: r.seq, createdAt: r.created_at,
})
const mOrderItem = (r: Row): OrderItem => ({
  id: r.id, orderId: r.order_id, sessionId: r.session_id, tableId: r.table_id, branchId: r.branch_id, itemId: r.item_id,
  name: r.name, price: r.price, qty: r.qty, note: r.note ?? '', status: r.status, replacedFromId: r.replaced_from_id,
  createdAt: r.created_at, servedAt: r.served_at,
})

/** Ném lỗi nếu truy vấn thất bại; dữ liệu trả về luôn được coi là có (các truy vấn ghi không dùng giá trị này) */
function ok<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

const FRIENDLY: Record<string, string> = {
  rate_limited: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
  invalid_token: 'Mã QR không hợp lệ hoặc đã bị thay thế.',
}
function friendly(message: string) {
  for (const k of Object.keys(FRIENDLY)) if (message.includes(k)) return FRIENDLY[k]
  return message
}

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  }
  return client
}

export function createSupabaseBackend(): Backend {
  const sb = getSupabase()
  const nowIso = () => new Date().toISOString()

  const branchTables = [
    'floors', 'dining_tables', 'categories', 'menu_items', 'menus',
    'item_unavailability', 'table_sessions', 'orders', 'order_items',
  ]

  return {
    mode: 'supabase',

    async listBranches() {
      return ok(await sb.from('branches').select('*').order('created_at')).map(mBranch)
    },
    async createBranch({ name, address }) {
      return mBranch(ok(await sb.rpc('create_branch', { p_name: name, p_address: address })))
    },

    async load(branchId): Promise<Snapshot> {
      const [branch, floors, tables, categories, items, menus, unav, sessions] = await Promise.all([
        sb.from('branches').select('*').eq('id', branchId).single(),
        sb.from('floors').select('*').eq('branch_id', branchId).order('sort'),
        sb.from('dining_tables').select('*').eq('branch_id', branchId),
        sb.from('categories').select('*').eq('branch_id', branchId).order('sort'),
        sb.from('menu_items').select('*').eq('branch_id', branchId),
        sb.from('menus').select('*').eq('branch_id', branchId),
        sb.from('item_unavailability').select('*').eq('branch_id', branchId),
        sb.from('table_sessions').select('*').eq('branch_id', branchId).is('closed_at', null),
      ])
      const sess = ok(sessions).map(mSession)
      const sids = sess.map((s) => s.id)
      let orders: Order[] = []
      let orderItems: OrderItem[] = []
      if (sids.length) {
        const [o, oi] = await Promise.all([
          sb.from('orders').select('*').in('session_id', sids).order('seq'),
          sb.from('order_items').select('*').in('session_id', sids).order('created_at'),
        ])
        orders = ok(o).map(mOrder)
        orderItems = ok(oi).map(mOrderItem)
      }
      return {
        branch: mBranch(ok(branch)),
        floors: ok(floors).map(mFloor),
        tables: ok(tables).map(mTable),
        categories: ok(categories).map(mCategory),
        items: ok(items).map(mItem),
        menus: ok(menus).map(mMenu),
        unavailability: ok(unav).map(mUnav),
        sessions: sess,
        orders,
        orderItems,
      }
    },

    subscribe(branchId, cb): Unsub {
      let timer: ReturnType<typeof setTimeout> | undefined
      const fire = () => {
        clearTimeout(timer)
        timer = setTimeout(cb, 150) // gộp nhiều thay đổi liên tiếp
      }
      let ch = sb.channel(`branch-${branchId}`)
      for (const table of branchTables) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `branch_id=eq.${branchId}` }, fire)
      }
      ch.subscribe()
      return () => {
        clearTimeout(timer)
        void sb.removeChannel(ch)
      }
    },

    async createFloor(branchId, name, rows = 12, cols = 20) {
      const { count } = await sb.from('floors').select('*', { count: 'exact', head: true }).eq('branch_id', branchId)
      return mFloor(
        ok(await sb.from('floors').insert({ branch_id: branchId, name, rows, cols, sort: count ?? 0 }).select().single()),
      )
    },
    async updateFloor(id, patch) {
      ok(await sb.from('floors').update(patch).eq('id', id))
    },
    async deleteFloor(id) {
      ok(await sb.from('floors').delete().eq('id', id))
    },
    async saveLayout(floorId, tables) {
      const floor = ok(await sb.from('floors').select('branch_id').eq('id', floorId).single())
      const existing = ok(await sb.from('dining_tables').select('id').eq('floor_id', floorId)) as Row[]
      const keep = new Set(tables.map((t) => t.id))
      const gone = existing.map((e) => e.id as string).filter((id) => !keep.has(id))
      if (gone.length) ok(await sb.from('dining_tables').delete().in('id', gone))
      if (tables.length) {
        ok(
          await sb.from('dining_tables').upsert(
            tables.map((t) => ({
              id: t.id, branch_id: floor.branch_id, floor_id: floorId, code: t.code, seats: t.seats, cells: t.cells, qr_token: t.qrToken,
            })),
            { onConflict: 'id' },
          ),
        )
      }
    },
    async regenerateQr(tableId) {
      const t = token()
      ok(await sb.from('dining_tables').update({ qr_token: t }).eq('id', tableId))
      return t
    },

    async saveCategory(c) {
      const row = { branch_id: c.branchId, name: c.name, sort: c.sort }
      const q = c.id ? sb.from('categories').update(row).eq('id', c.id) : sb.from('categories').insert(row)
      return mCategory(ok(await q.select().single()))
    },
    async deleteCategory(id) {
      ok(await sb.from('categories').delete().eq('id', id))
    },
    async saveItem(i) {
      const row = {
        branch_id: i.branchId, category_id: i.categoryId, name: i.name, description: i.description,
        price: i.price, image_url: i.imageUrl, is_active: i.isActive,
      }
      const q = i.id ? sb.from('menu_items').update(row).eq('id', i.id) : sb.from('menu_items').insert(row)
      return mItem(ok(await q.select().single()))
    },
    async deleteItem(id) {
      ok(await sb.from('menu_items').delete().eq('id', id))
    },
    async uploadItemImage(branchId, file) {
      const blob = await shrinkImage(file)
      const path = `${branchId}/${uid()}.jpg`
      const { error } = await sb.storage.from('menu-images').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (error) throw new Error(error.message.includes('not found') ? 'Chưa tạo kho ảnh: chạy migration 0003 trong Supabase.' : error.message)
      return sb.storage.from('menu-images').getPublicUrl(path).data.publicUrl
    },
    async saveMenu(m) {
      const row = {
        branch_id: m.branchId, name: m.name, days: m.days, start_time: m.start, end_time: m.end,
        valid_from: m.validFrom, valid_to: m.validTo, priority: m.priority, item_ids: m.itemIds,
      }
      const q = m.id ? sb.from('menus').update(row).eq('id', m.id) : sb.from('menus').insert(row)
      return mMenu(ok(await q.select().single()))
    },
    async deleteMenu(id) {
      ok(await sb.from('menus').delete().eq('id', id))
    },

    async markUnavailable({ branchId, itemId, startsAt, endsAt, reason }) {
      ok(
        await sb.from('item_unavailability').insert({
          branch_id: branchId, item_id: itemId, starts_at: startsAt ?? nowIso(), ends_at: endsAt, reason: reason ?? '',
        }),
      )
    },
    async markAvailable(_branchId, itemId) {
      const now = nowIso()
      ok(await sb.from('item_unavailability').delete().eq('item_id', itemId).gt('starts_at', now))
      ok(
        await sb
          .from('item_unavailability')
          .update({ ends_at: now })
          .eq('item_id', itemId)
          .lte('starts_at', now)
          .or(`ends_at.is.null,ends_at.gt.${now}`),
      )
    },
    async deleteUnavailability(id) {
      ok(await sb.from('item_unavailability').delete().eq('id', id))
    },

    async staffPlaceOrder(tableId, lines: OrderLine[]): Promise<PlaceOrderResult> {
      const table = ok(await sb.from('dining_tables').select('*').eq('id', tableId).single())
      const [branch, items, menus, unav] = await Promise.all([
        sb.from('branches').select('*').eq('id', table.branch_id).single(),
        sb.from('menu_items').select('*').eq('branch_id', table.branch_id),
        sb.from('menus').select('*').eq('branch_id', table.branch_id),
        sb.from('item_unavailability').select('*').eq('branch_id', table.branch_id),
      ])
      const tz = ok(branch).timezone as string
      const all = ok(items).map(mItem)
      const now = new Date()
      const sellable = new Set(sellableItems(all, ok(menus).map(mMenu), now, tz).map((i) => i.id))
      const un = ok(unav).map(mUnav)

      const accepted: { item: MenuItem; line: OrderLine }[] = []
      const rejected: PlaceOrderResult['rejected'] = []
      for (const line of lines) {
        const item = all.find((i) => i.id === line.itemId)
        if (!item || line.qty < 1) continue
        if (!sellable.has(item.id) || isUnavailable(item.id, un, now)) rejected.push({ itemId: item.id, name: item.name })
        else accepted.push({ item, line })
      }
      if (!accepted.length) return { orderId: null, rejected }

      let session = (await sb.from('table_sessions').select('*').eq('table_id', tableId).is('closed_at', null).maybeSingle()).data
      if (!session) {
        session = ok(await sb.from('table_sessions').insert({ branch_id: table.branch_id, table_id: tableId }).select().single())
      }
      const { count } = await sb.from('orders').select('*', { count: 'exact', head: true }).eq('session_id', session.id)
      const order = ok(
        await sb
          .from('orders')
          .insert({ branch_id: table.branch_id, session_id: session.id, table_id: tableId, source: 'staff', seq: (count ?? 0) + 1 })
          .select()
          .single(),
      )
      ok(
        await sb.from('order_items').insert(
          accepted.map(({ item, line }) => ({
            branch_id: table.branch_id, order_id: order.id, session_id: session.id, table_id: tableId, item_id: item.id,
            name: item.name, price: item.price, qty: Math.min(99, Math.max(1, Math.floor(line.qty))), note: (line.note ?? '').slice(0, 200),
          })),
        ),
      )
      return { orderId: order.id, rejected }
    },
    async setStatus(ids, status) {
      if (!ids.length) return
      ok(await sb.from('order_items').update({ status, served_at: status === 'served' ? nowIso() : null }).in('id', ids))
    },
    async updateOrderItem(id, patch) {
      const row: Row = {}
      if (patch.qty !== undefined) row.qty = Math.min(99, Math.max(1, patch.qty))
      if (patch.note !== undefined) row.note = patch.note.slice(0, 200)
      ok(await sb.from('order_items').update(row).eq('id', id))
    },
    async replaceOrderItem(id, newItemId) {
      const old = ok(await sb.from('order_items').select('*').eq('id', id).single())
      const item = ok(await sb.from('menu_items').select('*').eq('id', newItemId).single())
      ok(await sb.from('order_items').update({ status: 'cancelled' }).eq('id', id))
      ok(
        await sb.from('order_items').insert({
          branch_id: old.branch_id, order_id: old.order_id, session_id: old.session_id, table_id: old.table_id,
          item_id: item.id, name: item.name, price: item.price, qty: old.qty, note: old.note,
          status: 'new', replaced_from_id: old.id,
        }),
      )
    },
    async closeSession(tableId) {
      ok(await sb.from('table_sessions').update({ closed_at: nowIso() }).eq('table_id', tableId).is('closed_at', null))
    },

    async loadPublic(tok): Promise<PublicSnapshot | null> {
      const { data, error } = await sb.rpc('public_table_info', { p_token: tok })
      if (error) throw new Error(friendly(error.message))
      if (!data) return null
      return {
        branch: mBranch(data.branch),
        table: data.table,
        categories: (data.categories as Row[]).map(mCategory),
        items: (data.items as Row[]).map(mItem),
        menus: (data.menus as Row[]).map(mMenu),
        unavailability: (data.unavailability as Row[]).map(mUnav),
        orders: (data.orders as Row[]).map(mOrder),
        orderItems: (data.order_items as Row[]).map(mOrderItem),
      }
    },
    subscribePublic(_tok, cb): Unsub {
      // Khách chưa đăng nhập nên không dùng Realtime (RLS chặn); thăm dò nhẹ mỗi 4 giây
      const id = setInterval(cb, 4000)
      return () => clearInterval(id)
    },
    async placeOrder(tok, lines) {
      const { data, error } = await sb.rpc('place_order', { p_token: tok, p_lines: lines })
      if (error) throw new Error(friendly(error.message))
      return data as PlaceOrderResult
    },
  }
}
