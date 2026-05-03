insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload delivery proofs" on storage.objects;
create policy "Authenticated users can upload delivery proofs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'delivery-proofs');

drop policy if exists "Authenticated users can read delivery proofs" on storage.objects;
create policy "Authenticated users can read delivery proofs"
on storage.objects
for select
to authenticated
using (bucket_id = 'delivery-proofs');
