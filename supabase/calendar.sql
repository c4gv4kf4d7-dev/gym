-- ============================================================
-- CALENDARIO IN ABBONAMENTO (webcal): bucket pubblico dove ogni
-- utente pubblica il PROPRIO file .ics (nome = <user_id>.ics).
-- Lettura pubblica (l'URL contiene l'id utente, non indovinabile),
-- scrittura solo sul proprio file. Da incollare in SQL Editor → Run.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('calendars', 'calendars', true)
on conflict (id) do nothing;

create policy cal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'calendars' and name = auth.uid()::text || '.ics');

create policy cal_update on storage.objects for update to authenticated
  using (bucket_id = 'calendars' and name = auth.uid()::text || '.ics');

create policy cal_delete on storage.objects for delete to authenticated
  using (bucket_id = 'calendars' and name = auth.uid()::text || '.ics');

-- se il bucket esisteva già privato, forzalo pubblico
update storage.buckets set public = true where id = 'calendars';
