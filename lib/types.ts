export interface Cell {
  r: number
  c: number
}

export interface Branch {
  id: string
  name: string
  address: string
  timezone: string
}

export interface Floor {
  id: string
  branchId: string
  name: string
  rows: number
  cols: number
  sort: number
}

export interface DiningTable {
  id: string
  floorId: string
  branchId: string
  code: string
  seats: number
  cells: Cell[]
  qrToken: string
  /** Bàn thường hay bàn VIP */
  kind: TableKind
  /** Phụ thu cố định mỗi lượt khách (VND), chỉ áp dụng cho bàn VIP */
  surcharge: number
}

export type TableKind = 'normal' | 'vip'

export interface Category {
  id: string
  branchId: string
  name: string
  sort: number
}

export interface MenuItem {
  id: string
  branchId: string
  categoryId: string | null
  name: string
  description: string
  price: number
  imageUrl: string | null
  isActive: boolean
  /** null = món thường; có giá trị = combo (giá `price` là giá gốc, chưa gồm phụ thu các lựa chọn) */
  combo: ComboDef | null
}

/** Cấu trúc combo: phần cố định + các nhóm khách tự chọn (vd lẩu: chọn 1 nước lẩu, 2 loại rau…) */
export interface ComboDef {
  fixed: { itemId: string; qty: number }[]
  groups: ComboGroup[]
}

export interface ComboGroup {
  id: string
  name: string
  /** Số lựa chọn tối thiểu / tối đa trong nhóm */
  min: number
  max: number
  options: { itemId: string; /** phụ thu nếu chọn (VND) */ extra: number }[]
}

/** Thực đơn theo khung giờ. days: 0=CN … 6=T7. start/end dạng "HH:MM". */
export interface Menu {
  id: string
  branchId: string
  name: string
  days: number[]
  start: string
  end: string
  /** Hiệu lực theo ngày (YYYY-MM-DD), null = không giới hạn */
  validFrom: string | null
  validTo: string | null
  priority: number
  itemIds: string[]
}

export interface Unavailability {
  id: string
  branchId: string
  itemId: string
  startsAt: string // ISO
  endsAt: string | null // null = đến khi bật lại
  reason: string
}

export type OrderStatus = 'new' | 'cooking' | 'ready' | 'served' | 'cancelled' | 'unavailable'

export interface Session {
  id: string
  tableId: string
  branchId: string
  openedAt: string
  closedAt: string | null
}

/** Một lần quét QR / nhân viên gọi = một lượt đặt */
export interface Order {
  id: string
  sessionId: string
  tableId: string
  branchId: string
  source: 'qr' | 'staff'
  seq: number
  createdAt: string
}

export interface OrderItem {
  id: string
  orderId: string
  sessionId: string
  tableId: string
  branchId: string
  itemId: string | null
  name: string
  price: number
  qty: number
  note: string
  /** Với combo: mô tả phần cố định + lựa chọn của khách, mỗi dòng một ý */
  detail: string
  status: OrderStatus
  replacedFromId: string | null
  createdAt: string
  servedAt: string | null
}

export interface Snapshot {
  branch: Branch
  floors: Floor[]
  tables: DiningTable[]
  categories: Category[]
  items: MenuItem[]
  menus: Menu[]
  unavailability: Unavailability[]
  sessions: Session[] // chỉ phiên đang mở
  orders: Order[] // của phiên đang mở
  orderItems: OrderItem[] // của phiên đang mở
}

/** Dữ liệu công khai cho trang khách quét QR */
export interface PublicSnapshot {
  branch: Branch
  table: { id: string; code: string }
  categories: Category[]
  items: MenuItem[]
  menus: Menu[]
  unavailability: Unavailability[]
  orders: Order[]
  orderItems: OrderItem[]
}

export interface OrderLine {
  itemId: string
  qty: number
  note?: string
  /** Với combo: groupId -> danh sách itemId đã chọn */
  choices?: Record<string, string[]>
}

/** Hóa đơn của một phiên bàn đã thanh toán; nguồn của báo cáo doanh thu */
export interface Receipt {
  id: string
  branchId: string
  tableId: string | null
  tableCode: string
  tableKind: TableKind
  openedAt: string
  closedAt: string
  /** Tiền món (không gồm phụ thu) */
  itemsTotal: number
  /** Phụ thu bàn VIP */
  surcharge: number
  total: number
}

export interface PlaceOrderResult {
  orderId: string | null
  /** Món bị từ chối vì đang hết */
  rejected: { itemId: string; name: string }[]
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Mới gọi',
  cooking: 'Đang làm',
  ready: 'Sẵn sàng',
  served: 'Đã lên',
  cancelled: 'Đã hủy',
  unavailable: 'Hết món',
}

export const FLOW: OrderStatus[] = ['new', 'cooking', 'ready', 'served']
