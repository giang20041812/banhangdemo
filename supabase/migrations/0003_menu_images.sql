-- Kho ảnh món ăn (Supabase Storage). Chạy trong SQL Editor sau 0002.
-- Bucket công khai để trang khách xem ảnh; ai có link web đều tải lên được (cùng mức mở với 0002).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "xem ảnh món" on storage.objects for select to anon, authenticated using (bucket_id = 'menu-images');
create policy "tải ảnh món" on storage.objects for insert to anon, authenticated with check (bucket_id = 'menu-images');
create policy "xóa ảnh món" on storage.objects for delete to anon, authenticated using (bucket_id = 'menu-images');
