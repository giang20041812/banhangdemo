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
}

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
