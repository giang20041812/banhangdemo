-- Bàn VIP + phụ thu, combo (món có lựa chọn), hóa đơn/doanh thu. Chạy sau 0003.

alter table dining_tables add column if not exists kind text not null default 'normal' check (kind in ('normal', 'vip'));
alter table dining_tables add column if not exists surcharge int not null default 0 check (surcharge >= 0);

-- Combo: null = món thường.
-- {"fixed":[{"itemId":"…","qty":2}],
--  "groups":[{"id":"g1","name":"Nước lẩu","min":1,"max":1,"options":[{"itemId":"…","extra":0}]}]}
alter table menu_items add column if not exists combo jsonb;

-- Mô tả phần cố định + lựa chọn của combo, chụp lại lúc gọi
alter table order_items add column if not exists detail text not null default '';

-- Hóa đơn: ghi khi thanh toán & dọn bàn (closed_at). Chụp lại mã/loại bàn để báo cáo không đổi khi sửa sơ đồ.
alter table table_sessions add column if not exists table_code text;
alter table table_sessions add column if not exists table_kind text check (table_kind in ('normal', 'vip'));
alter table table_sessions add column if not exists items_total int;
alter table table_sessions add column if not exists surcharge int;
alter table table_sessions add column if not exists total int;
create index if not exists table_sessions_revenue on table_sessions (branch_id, closed_at) where closed_at is not null;

-- Giữ hóa đơn cũ dù bàn bị xóa khỏi sơ đồ
alter table table_sessions alter column table_id drop not null;
alter table table_sessions drop constraint if exists table_sessions_table_id_fkey;
alter table table_sessions add constraint table_sessions_table_id_fkey
  foreign key (table_id) references dining_tables(id) on delete set null;

-- Khách gửi món: hỗ trợ combo. Giá, tên, mô tả luôn tính lại từ DB.
create or replace function place_order(p_token text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t dining_tables; s table_sessions; o orders; it menu_items; ln jsonb; g jsonb; f jsonb; opt jsonb; pid text;
  rejected jsonb := '[]'; accepted jsonb := '[]'; q int;
  unit int; det text; picks jsonb; n int; nm text; names text[]; found_opt boolean;
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

    if not item_sellable(it.id) then
      rejected := rejected || jsonb_build_array(jsonb_build_object('itemId', it.id, 'name', it.name));
      continue;
    end if;

    unit := it.price;
    det := '';
    if it.combo is not null then
      names := '{}';
      for f in select * from jsonb_array_elements(coalesce(it.combo->'fixed', '[]')) loop
        select name into nm from menu_items where id = (f->>'itemId')::uuid;
        names := names || (coalesce(nm, '?') || case when (f->>'qty')::int > 1 then ' ×' || (f->>'qty') else '' end);
      end loop;
      if array_length(names, 1) > 0 then det := 'Gồm: ' || array_to_string(names, ', '); end if;

      for g in select * from jsonb_array_elements(coalesce(it.combo->'groups', '[]')) loop
        picks := coalesce(ln->'choices'->(g->>'id'), '[]');
        n := jsonb_array_length(picks);
        if n < (g->>'min')::int or n > (g->>'max')::int then raise exception 'invalid_combo'; end if;
        names := '{}';
        for pid in select jsonb_array_elements_text(picks) loop
          found_opt := false;
          for opt in select * from jsonb_array_elements(g->'options') loop
            if opt->>'itemId' = pid then
              found_opt := true;
              unit := unit + coalesce((opt->>'extra')::int, 0);
              select name into nm from menu_items where id = pid::uuid;
              names := names || coalesce(nm, '?');
            end if;
          end loop;
          if not found_opt then raise exception 'invalid_combo'; end if;
        end loop;
        if array_length(names, 1) > 0 then
          det := det || case when det = '' then '' else E'\n' end || (g->>'name') || ': ' || array_to_string(names, ', ');
        end if;
      end loop;
    end if;

    accepted := accepted || jsonb_build_array(jsonb_build_object(
      'item_id', it.id, 'name', it.name, 'price', unit, 'detail', det,
      'qty', least(q, 99), 'note', left(coalesce(ln->>'note', ''), 200)));
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

  insert into order_items (branch_id, order_id, session_id, table_id, item_id, name, price, detail, qty, note)
  select t.branch_id, o.id, s.id, t.id, (a->>'item_id')::uuid, a->>'name', (a->>'price')::int, a->>'detail', (a->>'qty')::int, a->>'note'
  from jsonb_array_elements(accepted) a;

  return jsonb_build_object('orderId', o.id, 'rejected', rejected);
end $$;

grant execute on function place_order(text, jsonb) to anon, authenticated;
