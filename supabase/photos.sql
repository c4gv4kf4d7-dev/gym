-- ============================================================
-- FOTO PROGRESSI: bucket PRIVATO. Ogni utente scrive e legge solo
-- la propria cartella (<user_id>/...); l'app le mostra con URL
-- firmati temporanei. Nessun accesso pubblico.
-- Da incollare in Supabase → SQL Editor → Run.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy ph_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy ph_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy ph_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy ph_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
