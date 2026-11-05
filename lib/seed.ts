import { token, uid } from './id'
import type {
  Branch, Category, DiningTable, Floor, Menu, MenuItem, Order, OrderItem, Receipt, Session, Unavailability,
} from './types'

export interface Db {
  branches: Branch[]
  floors: Floor[]
  tables: DiningTable[]
  categories: Category[]
  items: MenuItem[]
  menus: Menu[]
  unavailability: Unavailability[]
  sessions: Session[]
  orders: Order[]
  orderItems: OrderItem[]
  /** Hóa đơn đã thanh toán (nguồn báo cáo doanh thu) */
  receipts: Receipt[]
}

export const emptyDb = (): Db => ({
  branches: [], floors: [], tables: [], categories: [], items: [], menus: [],
  unavailability: [], sessions: [], orders: [], orderItems: [], receipts: [],
})

const rect = (r0: number, c0: number, h: number, w: number) => {
  const out = []
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) out.push({ r, c })
  return out
}

/** Dữ liệu mẫu để chạy thử ở chế độ demo */
export function seedBranch(db: Db, name: string, address: string, withDemoOrders = true): Branch {
  const now = Date.now()
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString()
  const branch: Branch = { id: uid(), name, address, timezone: 'Asia/Ho_Chi_Minh' }
  db.branches.push(branch)
  const b = branch.id

  const f1: Floor = { id: uid(), branchId: b, name: 'Tầng trệt', rows: 12, cols: 20, sort: 0 }
  const f2: Floor = { id: uid(), branchId: b, name: 'Tầng 2', rows: 12, cols: 20, sort: 1 }
  db.floors.push(f1, f2)

  const mk = (floor: Floor, code: string, cells: { r: number; c: number }[], seats?: number): DiningTable => {
    const t: DiningTable = {
      id: uid(), floorId: floor.id, branchId: b, code, cells, seats: seats ?? cells.length * 2, qrToken: token(), kind: 'normal', surcharge: 0,
    }
    db.tables.push(t)
    return t
  }
  const t1 = mk(f1, 'B01', rect(1, 1, 2, 2))
  const t2 = mk(f1, 'B02', rect(1, 4, 2, 2))
  const t3 = mk(f1, 'B03', rect(1, 8, 2, 4)) // bàn dài ghép 8 ô
  const t4 = mk(f1, 'B04', rect(5, 1, 1, 2))
  mk(f1, 'B05', rect(5, 5, 2, 2))
  mk(f1, 'B06', [...rect(5, 9, 1, 3), ...rect(6, 9, 1, 1)]) // bàn hình chữ L
  mk(f1, 'B07', rect(9, 2, 2, 3))
  mk(f1, 'B08', rect(9, 8, 2, 2))
  Object.assign(mk(f2, 'B09', rect(2, 2, 2, 4)), { kind: 'vip', surcharge: 200000 })
  Object.assign(mk(f2, 'B10', rect(2, 9, 2, 2)), { kind: 'vip', surcharge: 100000 })
  mk(f2, 'B11', rect(6, 3, 2, 2))

  const cat = (n: string, sort: number): Category => {
    const c = { id: uid(), branchId: b, name: n, sort }
    db.categories.push(c)
    return c
  }
  const khaiVi = cat('Khai vị', 0)
  const monChinh = cat('Món chính', 1)
  const canh = cat('Canh & Lẩu', 2)
  const doUong = cat('Đồ uống', 3)

  const it = (c: Category, name: string, price: number, description = ''): MenuItem => {
    const i: MenuItem = { id: uid(), branchId: b, categoryId: c.id, name, price, description, imageUrl: null, isActive: true, combo: null }
    db.items.push(i)
    return i
  }
  const goi = it(khaiVi, 'Gỏi ngó sen tôm thịt', 85000, 'Ngó sen giòn trộn tôm, thịt ba chỉ, rau thơm')
  const nem = it(khaiVi, 'Nem rán lá chuối', 65000, 'Giòn rụm, chấm nước mắm chua ngọt')
  const dauPhu = it(khaiVi, 'Đậu phụ sốt cà chua', 55000)
  const caKho = it(monChinh, 'Cá kho tộ', 135000, 'Cá lóc kho tộ om riềng, thịt ba chỉ')
  const thitKho = it(monChinh, 'Thịt kho trứng', 95000)
  const ga = it(monChinh, 'Gà đồi nướng mật ong', 220000, 'Nửa con, kèm xôi')
  const rauMuong = it(monChinh, 'Rau muống xào tỏi', 45000)
  const bunDau = it(monChinh, 'Bún đậu mắm tôm', 90000, 'Chỉ bán buổi trưa')
  const canhChua = it(canh, 'Canh chua cá bông lau', 110000)
  const lau = it(canh, 'Lẩu gà lá é', 320000, 'Cho 3–4 người')
  const tra = it(doUong, 'Trà đá', 5000)
  const nuocMia = it(doUong, 'Nước mía', 20000)
  const biaHoi = it(doUong, 'Bia hơi', 15000)

  // Combo lẩu mẫu: phần cố định + nhóm khách tự chọn
  const rauNam = it(canh, 'Đĩa rau & nấm', 45000, 'Rau muống, cải, nấm các loại')
  const thitBo = it(canh, 'Đĩa bò tươi', 120000)
  const bunTuoi = it(canh, 'Bún tươi', 15000)
  const launThai = it(canh, 'Nước lẩu Thái chua cay', 0)
  const lauNam = it(canh, 'Nước lẩu nấm thanh', 0)
  const lauRieu = it(canh, 'Nước lẩu riêu cua', 0)
  const haiSan = it(canh, 'Đĩa hải sản', 150000)
  const viengBo = it(canh, 'Bò viên', 60000)
  const comboLau: MenuItem = {
    id: uid(), branchId: b, categoryId: canh.id, name: 'Combo lẩu đậm vị (2–3 người)', price: 399000,
    description: 'Chọn nước lẩu, đồ nhúng và món ăn kèm', imageUrl: null, isActive: true,
    combo: {
      fixed: [{ itemId: rauNam.id, qty: 1 }, { itemId: bunTuoi.id, qty: 2 }],
      groups: [
        { id: 'nuoc', name: 'Nước lẩu', min: 1, max: 1, options: [
          { itemId: launThai.id, extra: 0 }, { itemId: lauNam.id, extra: 0 }, { itemId: lauRieu.id, extra: 20000 },
        ] },
        { id: 'nhung', name: 'Đồ nhúng', min: 1, max: 2, options: [
          { itemId: thitBo.id, extra: 0 }, { itemId: viengBo.id, extra: 0 }, { itemId: haiSan.id, extra: 40000 },
        ] },
      ],
    },
  }
  db.items.push(comboLau)

  const all = db.items.filter((x) => x.branchId === b).map((x) => x.id)
  db.menus.push(
    { id: uid(), branchId: b, name: 'Thực đơn trưa', days: [], start: '10:00', end: '14:00', validFrom: null, validTo: null, priority: 1,
      itemIds: all.filter((id) => id !== lau.id && id !== biaHoi.id) },
    { id: uid(), branchId: b, name: 'Thực đơn tối', days: [], start: '14:00', end: '23:59', validFrom: null, validTo: null, priority: 1,
      itemIds: all.filter((id) => id !== bunDau.id) },
    { id: uid(), branchId: b, name: 'Thực đơn đêm', days: [], start: '00:00', end: '10:00', validFrom: null, validTo: null, priority: 1,
      itemIds: all },
  )

  // Món hết: Cá kho hết ca này; Nem rán hẹn giờ hết sau 90 phút
  db.unavailability.push(
    { id: uid(), branchId: b, itemId: caKho.id, startsAt: iso(-20), endsAt: iso(180), reason: 'Hết cá lóc' },
    { id: uid(), branchId: b, itemId: nem.id, startsAt: iso(90), endsAt: iso(300), reason: 'Hẹn giờ: hết bột chiên' },
  )

  if (withDemoOrders) {
    const session = (t: DiningTable, minAgo: number): Session => {
      const s: Session = { id: uid(), tableId: t.id, branchId: b, openedAt: iso(-minAgo), closedAt: null }
      db.sessions.push(s)
      return s
    }
    const order = (s: Session, seq: number, source: 'qr' | 'staff', minAgo: number): Order => {
      const o: Order = { id: uid(), sessionId: s.id, tableId: s.tableId, branchId: b, source, seq, createdAt: iso(-minAgo) }
      db.orders.push(o)
      return o
    }
    const line = (o: Order, item: MenuItem, qty: number, status: OrderItem['status'], minAgo: number, note = '') => {
      db.orderItems.push({
        id: uid(), orderId: o.id, sessionId: o.sessionId, tableId: o.tableId, branchId: b, itemId: item.id,
        name: item.name, price: item.price, qty, note, detail: '', status, replacedFromId: null,
        createdAt: iso(-minAgo), servedAt: status === 'served' ? iso(-minAgo + 5) : null,
      })
    }
    const s1 = session(t1, 35)
    const o1 = order(s1, 1, 'qr', 35)
    line(o1, goi, 1, 'served', 35)
    line(o1, canhChua, 1, 'ready', 35, 'Ít chua')
    line(o1, thitKho, 2, 'cooking', 35)
    const o1b = order(s1, 2, 'qr', 6)
    line(o1b, rauMuong, 1, 'new', 6, 'Nhiều tỏi')
    line(o1b, tra, 4, 'new', 6)

    const s3 = session(t3, 50)
    const o3 = order(s3, 1, 'staff', 50)
    line(o3, lau, 1, 'cooking', 50)
    line(o3, ga, 1, 'ready', 50)
    line(o3, nuocMia, 3, 'served', 50)
    const o3b = order(s3, 2, 'qr', 4)
    line(o3b, caKho, 1, 'new', 4, 'Ít cay') // Cá kho đang hết => cần xử lý
    line(o3b, dauPhu, 1, 'new', 4)

    const s2 = session(t2, 12)
    const o2 = order(s2, 1, 'qr', 12)
    line(o2, nem, 2, 'served', 12)
    line(o2, bunDau, 2, 'served', 12)

    const s4 = session(t4, 3)
    const o4 = order(s4, 1, 'qr', 3)
    line(o4, ga, 1, 'new', 3)
    line(o4, biaHoi, 2, 'new', 3)
  }
  return branch
}

export function seedDb(): Db {
  const db = emptyDb()
  seedBranch(db, 'Cơ sở chính', '12 Nguyễn Huệ, Quận 1, TP.HCM')
  return db
}
