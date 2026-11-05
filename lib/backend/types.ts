import type {
  Branch,
  Category,
  DiningTable,
  Floor,
  Menu,
  MenuItem,
  OrderLine,
  OrderStatus,
  PlaceOrderResult,
  PublicSnapshot,
  Snapshot,
} from '../types'

export type Unsub = () => void

export interface Backend {
  readonly mode: 'demo' | 'supabase'

  // ---- Chi nhánh
  listBranches(): Promise<Branch[]>
  createBranch(input: { name: string; address: string }): Promise<Branch>
  load(branchId: string): Promise<Snapshot>
  /** Gọi cb mỗi khi dữ liệu chi nhánh thay đổi (từ bất kỳ thiết bị nào) */
  subscribe(branchId: string, cb: () => void): Unsub

  // ---- Sơ đồ
  createFloor(branchId: string, name: string, rows?: number, cols?: number): Promise<Floor>
  updateFloor(id: string, patch: Partial<Pick<Floor, 'name' | 'rows' | 'cols'>>): Promise<void>
  deleteFloor(id: string): Promise<void>
  /** Ghi đè toàn bộ bàn của một tầng */
  saveLayout(floorId: string, tables: DiningTable[]): Promise<void>
  regenerateQr(tableId: string): Promise<string>

  // ---- Thực đơn
  saveCategory(c: Omit<Category, 'id'> & { id?: string }): Promise<Category>
  deleteCategory(id: string): Promise<void>
  saveItem(i: Omit<MenuItem, 'id'> & { id?: string }): Promise<MenuItem>
  deleteItem(id: string): Promise<void>
  saveMenu(m: Omit<Menu, 'id'> & { id?: string }): Promise<Menu>
  deleteMenu(id: string): Promise<void>

  // ---- Hết món
  /** Đặt hết món từ `startsAt` (mặc định bây giờ) đến `endsAt` (null = đến khi bật lại) */
  markUnavailable(input: {
    branchId: string
    itemId: string
    startsAt?: string
    endsAt: string | null
    reason?: string
  }): Promise<void>
  /** Bật bán lại: kết thúc mọi bản ghi hết món đang hiệu lực, xóa các bản hẹn giờ tương lai */
  markAvailable(branchId: string, itemId: string): Promise<void>
  deleteUnavailability(id: string): Promise<void>

  // ---- Đơn của bàn (nhân viên)
  staffPlaceOrder(tableId: string, lines: OrderLine[]): Promise<PlaceOrderResult>
  setStatus(itemIds: string[], status: OrderStatus): Promise<void>
  updateOrderItem(id: string, patch: { qty?: number; note?: string }): Promise<void>
  /** Đổi món khách đã gọi sang món khác (giữ số lượng, ghi chú) */
  replaceOrderItem(id: string, newItemId: string): Promise<void>
  /** Khách rời bàn: đóng phiên hiện tại, bàn về trạng thái trống */
  closeSession(tableId: string): Promise<void>

  // ---- Khách (quét QR, không đăng nhập)
  loadPublic(token: string): Promise<PublicSnapshot | null>
  subscribePublic(token: string, cb: () => void): Unsub
  placeOrder(token: string, lines: OrderLine[]): Promise<PlaceOrderResult>
}
