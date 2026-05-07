-- Supabase Storage bucket for inspirationsbilleder (ARCH-82).
-- Sti: {user_id}/{projekt_id}/{uuid}.{jpg|png}
-- Bucket er privat — adgang via signed URLs (1 times levetid).

insert into storage.buckets (id, name, public)
values ('inspirationsbilleder', 'inspirationsbilleder', false)
on conflict (id) do nothing;

-- Brugere kan uploade billeder til deres eget user_id-mappe
create policy "bruger uploader egne billeder"
  on storage.objects for insert
  with check (
    bucket_id = 'inspirationsbilleder'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Brugere kan se billeder i deres eget user_id-mappe
create policy "bruger ser egne billeder"
  on storage.objects for select
  using (
    bucket_id = 'inspirationsbilleder'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Brugere kan slette egne billeder
create policy "bruger sletter egne billeder"
  on storage.objects for delete
  using (
    bucket_id = 'inspirationsbilleder'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
