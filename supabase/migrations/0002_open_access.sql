-- Bỏ đăng nhập: cho phép mọi người (anon) đọc/ghi trực tiếp.
-- Lưu ý: ai có link web đều sửa được dữ liệu. Chạy file này trong SQL Editor sau 0001_init.sql.

do $$
declare t text;
begin
  foreach t in array array[
    'branches', 'floors', 'dining_tables', 'categories', 'menu_items', 'menus',
    'item_unavailability', 'table_sessions', 'orders', 'order_items'
  ] loop
    execute format('create policy "mở truy cập" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Tạo chi nhánh không cần tài khoản
create or replace function create_branch(p_name text, p_address text default '')
returns branches language plpgsql security definer set search_path = public as $$
declare b branches;
begin
  insert into branches (name, address) values (p_name, coalesce(p_address, '')) returning * into b;
  insert into floors (branch_id, name, sort) values (b.id, 'Tầng trệt', 0);
  return b;
end $$;

grant execute on function create_branch(text, text) to anon, authenticated;
