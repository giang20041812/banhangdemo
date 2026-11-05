# Quản lý bàn & gọi món tại chỗ

Webapp cho quán ăn: vẽ sơ đồ bàn dạng lưới (các ô sát nhau tự ghép thành bàn), mỗi bàn có QR riêng để khách gọi món,
nhân viên theo dõi Kanban từng bàn, thực đơn đổi theo khung giờ, xử lý món hết theo thời điểm. Hỗ trợ nhiều chi nhánh, nhiều tầng.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime)

## Chạy thử ngay (chế độ Demo, không cần Supabase)

```bash
npm install
npm run dev        # http://localhost:3000
```

Khi chưa cấu hình Supabase, app lưu dữ liệu trong trình duyệt (localStorage) và đồng bộ giữa các tab.
Thử luồng đầy đủ: mở `/van-hanh` ở một tab, vào `/qr` → "Mở thử" một bàn ở tab khác (đóng vai khách), gọi món và xem đơn
hiện ngay ở tab nhân viên. Có nút "Đặt lại dữ liệu demo" trong menu chi nhánh.

## Chạy với Supabase

1. Tạo project trên supabase.com.
2. Chạy `supabase/migrations/0001_init.sql` trong SQL Editor (hoặc `supabase db push` nếu dùng CLI).
3. Authentication → tạo tài khoản nhân viên (email + mật khẩu); **tắt "Allow new users to sign up"** để người ngoài không tự đăng ký.
4. Sao chép `.env.example` thành `.env.local`, điền `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. `npm run dev`, đăng nhập, bấm "Tạo chi nhánh đầu tiên" (người tạo trở thành chủ quán).
6. Thêm nhân viên khác vào chi nhánh (chạy trong SQL Editor):
   ```sql
   insert into branch_staff (user_id, branch_id, role)
   values ('<uuid người dùng>', '<uuid chi nhánh>', 'staff');  -- owner | manager | staff
   ```
   `staff` chỉ vận hành (Kanban, hết món); `manager`/`owner` mới sửa được sơ đồ và thực đơn.

### Bảo mật khi khách quét QR
Khách không đăng nhập và **không truy cập trực tiếp bảng nào** (RLS chặn). Họ chỉ gọi hai hàm RPC:
`public_table_info(token)` và `place_order(token, lines)`. Hàm này lấy tên/giá từ DB (không tin dữ liệu từ client),
từ chối món đang hết, giới hạn 8 lượt/2 phút mỗi bàn. Bàn bị lộ QR thì bấm "Tạo lại mã" ở trang Mã QR.

## Cấu trúc

```
app/(staff)/van-hanh   sơ đồ + Kanban bàn + tab Thực đơn (bật/tắt hết món nhanh)
app/(staff)/so-do      trình vẽ sơ đồ: kéo qua các ô để tạo/ghép/tách bàn
app/(staff)/thuc-don   món, thực đơn theo giờ, danh mục, lịch hết món
app/(staff)/qr         in mã QR
app/t/[token]          trang gọi món của khách
lib/grid               thuật toán ghép/tách bàn (thuần, có test)
lib/menu-logic.ts      thực đơn đang áp dụng, món hết theo thời điểm (thuần, có test)
lib/backend            Backend interface + bản Demo + bản Supabase
supabase/migrations    schema, RLS, RPC
```

## Quy ước nghiệp vụ

- **Một lượt đặt** = một lần khách bấm "Gửi món" (hoặc nhân viên gọi hộ). Đơn đi thẳng xuống Kanban, không cần xác nhận.
- **Phiên bàn**: đơn gắn vào phiên đang mở của bàn. "Dọn bàn" đóng phiên (không có thanh toán); khách sau quét QR sẽ mở phiên mới.
- **Món hết** được tính tại lúc đọc từ khoảng `[starts_at, ends_at)`, nên hẹn giờ và tự mở lại không cần cron.
  Món đã gọi nhưng vừa hết (kể cả hết theo hẹn giờ) tự rơi vào làn **Cần xử lý** để đổi món hoặc hủy.

## Lệnh

```bash
npm run dev        # phát triển
npm run build      # build production
npm test           # unit test (ghép bàn, thực đơn theo giờ, hết món)
npm run typecheck
```
