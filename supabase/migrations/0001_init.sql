-- Vị Quê Mình — schema khởi tạo
-- Mô hình: nhiều chi nhánh, mỗi chi nhánh nhiều tầng, mỗi tầng một lưới các ô; các ô sát nhau tạo thành bàn.

create extension if not exists pgcrypto;

-- ============================================================ Chi nhánh & nhân viên
create table branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text not null default '',
  timezone    text not null default 'Asia/Ho_Chi_Minh',
  created_at  timestamptz not null default now()
);

create type staff_role as enum ('owner', 'manager', 'staff');

create table branch_staff (
  user_id    uuid not null references auth.users(id) on delete cascade,
  branch_id  uuid not null references branches(id) on delete cascade,
  role       staff_role not null default 'staff',
  primary key (user_id, branch_id)
);

create function is_branch_staff(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from branch_staff where user_id = auth.uid() and branch_id = b)
$$;

create function is_branch_manager(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from branch_staff
    where user_id = auth.uid() and branch_id = b and role in ('owner', 'manager')
  )
$$;

-- ============================================================ Sơ đồ
create table floors (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  name       text not null,
  rows       int  not null default 12 check (rows between 1 and 60),
  cols       int  not null default 20 check (cols between 1 and 60),
  sort       int  not null default 0
);

create table dining_tables (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  floor_id   uuid not null references floors(id) on delete cascade,
  code       text not null,
  seats      int  not null default 2 check (seats between 1 and 200),
  cells      jsonb not null default '[]',           -- [{r,c}, ...] các ô tạo nên bàn
  qr_token   text not null unique default encode(gen_random_bytes(10), 'hex'),
  constraint dining_tables_code_unique unique (branch_id, code) deferrable initially deferred
);
create index on dining_tables (floor_id);

-- ============================================================ Thực đơn
create table categories (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0
);

create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branches(id) on delete cascade,
  category_id  uuid references categories(id) on delete set null,
  name         text not null,
  description  text not null default '',
  price        int  not null check (price >= 0),   -- VND
  image_url    text,
  is_active    boolean not null default true
);
create index on menu_items (branch_id);

-- Thực đơn theo khung giờ / ngày trong tuần / khoảng ngày
create table menus (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  name        text not null,
  days        smallint[] not null default '{}',     -- 0=CN … 6=T7; rỗng = mọi ngày
  start_time  time not null default '00:00',
  end_time    time not null default '23:59',        -- start > end => qua đêm
  valid_from  date,
  valid_to    date,
  priority    int not null default 0,
  item_ids    uuid[] not null default '{}'
);

-- Hết món theo khoảng thời gian; ends_at null = đến khi bật lại.
-- "Đang hết" được suy ra tại thời điểm đọc nên hẹn giờ & tự mở lại không cần cron.
create table item_unavailability (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  item_id    uuid not null references menu_items(id) on delete cascade,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  reason     text not null default '',
  check (ends_at is null or ends_at > starts_at)
);
create index on item_unavailability (item_id);

-- ============================================================ Phiên bàn & đơn
-- Phiên = khoảng thời gian một nhóm khách ngồi ở bàn (không liên quan thanh toán).
create table table_sessions (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  table_id   uuid not null references dining_tables(id) on delete cascade,
  opened_at  timestamptz not null default now(),
  closed_at  timestamptz
);
create unique index one_open_session_per_table on table_sessions (table_id) where closed_at is null;

-- Mỗi lần quét QR gọi món (hoặc nhân viên gọi hộ) = một lượt đặt
create table orders (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  session_id  uuid not null references table_sessions(id) on delete cascade,
  table_id    uuid not null references dining_tables(id) on delete cascade,
  source      text not null check (source in ('qr', 'staff')),
  seq         int  not null,
  created_at  timestamptz not null default now()
);
create index on orders (session_id);
create index on orders (table_id, created_at);

create table order_items (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branches(id) on delete cascade,
  order_id          uuid not null references orders(id) on delete cascade,
  session_id        uuid not null references table_sessions(id) on delete cascade,
  table_id          uuid not null references dining_tables(id) on delete cascade,
  item_id           uuid references menu_items(id) on delete set null,
  name              text not null,                  -- snapshot tên
  price             int  not null,                  -- snapshot giá
  qty               int  not null check (qty between 1 and 99),
  note              text not null default '',
  status            text not null default 'new'
                    check (status in ('new', 'cooking', 'ready', 'served', 'cancelled', 'unavailable')),
  replaced_from_id  uuid references order_items(id) on delete set null,
  created_at        timestamptz not null default now(),
  served_at         timestamptz
);
create index on order_items (session_id);
create index on order_items (branch_id, status);

-- ============================================================ RLS
alter table branches            enable row level security;
alter table branch_staff        enable row level security;
alter table floors              enable row level security;
alter table dining_tables       enable row level security;
alter table categories          enable row level security;
alter table menu_items          enable row level security;
alter table menus               enable row level security;
alter table item_unavailability enable row level security;
alter table table_sessions      enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;

create policy "xem chi nhánh của mình" on branches for select using (is_branch_staff(id));
create policy "quản lý sửa chi nhánh"  on branches for update using (is_branch_manager(id));
create policy "xem nhân viên cùng chi nhánh" on branch_staff for select using (user_id = auth.uid() or is_branch_staff(branch_id));

-- Sơ đồ & thực đơn: nhân viên xem, quản lý sửa
create policy "xem" on floors     for select using (is_branch_staff(branch_id));
create policy "sửa" on floors     for all    using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id));
create policy "xem" on dining_tables for select using (is_branch_staff(branch_id));
create policy "sửa" on dining_tables for all    using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id));
create policy "xem" on categories for select using (is_branch_staff(branch_id));
create policy "sửa" on categories for all    using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id));
create policy "xem" on menu_items for select using (is_branch_staff(branch_id));
create policy "sửa" on menu_items for all    using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id));
create policy "xem" on menus      for select using (is_branch_staff(branch_id));
create policy "sửa" on menus      for all    using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id));

-- Vận hành: mọi nhân viên của chi nhánh
create policy "nhân viên" on item_unavailability for all using (is_branch_staff(branch_id)) with check (is_branch_staff(branch_id));
create policy "nhân viên" on table_sessions      for all using (is_branch_staff(branch_id)) with check (is_branch_staff(branch_id));
create policy "nhân viên" on orders              for all using (is_branch_staff(branch_id)) with check (is_branch_staff(branch_id));
create policy "nhân viên" on order_items         for all using (is_branch_staff(branch_id)) with check (is_branch_staff(branch_id));

-- Khách (anon) không có policy nào => không đọc/ghi trực tiếp được; chỉ qua RPC bên dưới.

-- ============================================================ Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      floors, dining_tables, categories, menu_items, menus,
      item_unavailability, table_sessions, orders, order_items;
  end if;
end $$;

-- ============================================================ RPC
-- Tạo chi nhánh: người tạo thành chủ quán.
create function create_branch(p_name text, p_address text default '')
returns branches language plpgsql security definer set search_path = public as $$
declare b branches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into branches (name, address) values (p_name, coalesce(p_address, '')) returning * into b;
  insert into branch_staff (user_id, branch_id, role) values (auth.uid(), b.id, 'owner');
  insert into floors (branch_id, name, sort) values (b.id, 'Tầng trệt', 0);
  return b;
end $$;

-- Món có đang bán được tại thời điểm p_at không (đang bật + thuộc thực đơn đang áp dụng + không hết món)
create function item_sellable(p_item uuid, p_at timestamptz default now())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  i menu_items; tz text; local_ts timestamp; dow int; t time; d date;
begin
  select * into i from menu_items where id = p_item;
  if not found or not i.is_active then return false; end if;
  if exists (
    select 1 from item_unavailability u
    where u.item_id = p_item and u.starts_at <= p_at and (u.ends_at is null or p_at < u.ends_at)
  ) then return false; end if;

  select timezone into tz from branches where id = i.branch_id;
  local_ts := p_at at time zone tz;
  dow := extract(dow from local_ts)::int;
  t := local_ts::time;
  d := local_ts::date;

  if not exists (select 1 from menus where branch_id = i.branch_id) then return true; end if;
  return exists (
    select 1 from menus m
    where m.branch_id = i.branch_id and p_item = any (m.item_ids)
      and (cardinality(m.days) = 0 or dow = any (m.days))
      and (m.valid_from is null or d >= m.valid_from)
      and (m.valid_to   is null or d <= m.valid_to)
      and (case when m.start_time <= m.end_time
                then t >= m.start_time and t < m.end_time
                else t >= m.start_time or t < m.end_time end)
  );
end $$;

-- Dữ liệu cho trang khách quét QR
create function public_table_info(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t dining_tables; b branches; s table_sessions;
begin
  select * into t from dining_tables where qr_token = p_token;
  if not found then return null; end if;
  select * into b from branches where id = t.branch_id;
  select * into s from table_sessions where table_id = t.id and closed_at is null;
  return jsonb_build_object(
    'branch', jsonb_build_object('id', b.id, 'name', b.name, 'address', b.address, 'timezone', b.timezone),
    'table',  jsonb_build_object('id', t.id, 'code', t.code),
    'categories',     coalesce((select jsonb_agg(to_jsonb(c) order by c.sort) from categories c where c.branch_id = b.id), '[]'),
    'items',          coalesce((select jsonb_agg(to_jsonb(i)) from menu_items i where i.branch_id = b.id), '[]'),
    'menus',          coalesce((select jsonb_agg(to_jsonb(m)) from menus m where m.branch_id = b.id), '[]'),
    'unavailability', coalesce((select jsonb_agg(to_jsonb(u)) from item_unavailability u where u.branch_id = b.id), '[]'),
    'orders',         coalesce((select jsonb_agg(to_jsonb(o) order by o.seq) from orders o where o.session_id = s.id), '[]'),
    'order_items',    coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from order_items x where x.session_id = s.id), '[]')
  );
end $$;

-- Khách gửi một lượt gọi món. Giá & tên luôn lấy từ DB; món đang hết bị trả về trong `rejected`.
create function place_order(p_token text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t dining_tables; s table_sessions; o orders; it menu_items; ln jsonb;
  rejected jsonb := '[]'; accepted jsonb := '[]'; q int;
begin
  select * into t from dining_tables where qr_token = p_token for update;
  if not found then raise exception 'invalid_token'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then raise exception 'invalid_lines'; end if;

  if (select count(*) from orders
      where table_id = t.id and source = 'qr' and created_at > now() - interval '2 minutes') >= 8 then
    raise exception 'rate_limited';
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    select * into it from menu_items where id = (ln->>'itemId')::uuid and branch_id = t.branch_id;
    if not found then continue; end if;
    q := coalesce((ln->>'qty')::int, 0);
    if q < 1 then continue; end if;
    if item_sellable(it.id) then
      accepted := accepted || jsonb_build_array(jsonb_build_object(
        'item_id', it.id, 'name', it.name, 'price', it.price,
        'qty', least(q, 99), 'note', left(coalesce(ln->>'note', ''), 200)));
    else
      rejected := rejected || jsonb_build_array(jsonb_build_object('itemId', it.id, 'name', it.name));
    end if;
  end loop;

  if jsonb_array_length(accepted) = 0 then
    return jsonb_build_object('orderId', null, 'rejected', rejected);
  end if;

  select * into s from table_sessions where table_id = t.id and closed_at is null;
  if not found then
    insert into table_sessions (branch_id, table_id) values (t.branch_id, t.id) returning * into s;
  end if;

  insert into orders (branch_id, session_id, table_id, source, seq)
  values (t.branch_id, s.id, t.id, 'qr', (select count(*) + 1 from orders where session_id = s.id))
  returning * into o;

  insert into order_items (branch_id, order_id, session_id, table_id, item_id, name, price, qty, note)
  select t.branch_id, o.id, s.id, t.id, (a->>'item_id')::uuid, a->>'name', (a->>'price')::int, (a->>'qty')::int, a->>'note'
  from jsonb_array_elements(accepted) a;

  return jsonb_build_object('orderId', o.id, 'rejected', rejected);
end $$;

revoke all on function place_order(text, jsonb), public_table_info(text), create_branch(text, text) from public;
grant execute on function place_order(text, jsonb), public_table_info(text) to anon, authenticated;
grant execute on function create_branch(text, text) to authenticated;
