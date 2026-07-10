-- ============================================================
-- CREW: accountability a due. Da incollare in Supabase → SQL Editor → Run.
-- Ognuno pubblica SOLO aggregati (crew_stats.stats); i dati veri
-- restano privati in user_states. RLS: legge le stats solo chi è
-- nella stessa crew.
-- ============================================================

create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

create table if not exists crew_stats (
  user_id uuid primary key references auth.users on delete cascade,
  crew_id uuid references crews not null,
  nick text,
  stats jsonb,
  updated_at timestamptz default now()
);

create table if not exists crew_nudges (
  id bigint generated always as identity primary key,
  crew_id uuid references crews not null,
  from_user uuid references auth.users not null,
  from_nick text,
  to_user uuid references auth.users not null,
  txt text,
  created_at timestamptz default now(),
  seen boolean default false
);

alter table crews enable row level security;
alter table crew_stats enable row level security;
alter table crew_nudges enable row level security;

-- La mia crew (security definer: evita la ricorsione RLS su crew_stats)
create or replace function my_crew() returns uuid
language sql security definer stable as $$
  select crew_id from crew_stats where user_id = auth.uid()
$$;

-- Lookup del codice invito senza esporre l'elenco delle crew
create or replace function crew_id_for_code(c text) returns uuid
language sql security definer stable as $$
  select id from crews where code = upper(c)
$$;

-- crews: creo la mia, vedo solo la mia
create policy crews_insert on crews for insert to authenticated
  with check (created_by = auth.uid());
create policy crews_select on crews for select to authenticated
  using (created_by = auth.uid() or id = my_crew());

-- crew_stats: scrivo la mia riga, leggo quelle della mia crew
create policy stats_insert on crew_stats for insert to authenticated
  with check (user_id = auth.uid());
create policy stats_update on crew_stats for update to authenticated
  using (user_id = auth.uid());
create policy stats_delete on crew_stats for delete to authenticated
  using (user_id = auth.uid());
create policy stats_select on crew_stats for select to authenticated
  using (user_id = auth.uid() or crew_id = my_crew());

-- nudges: mando solo alla mia crew, leggo i miei, segno "visto" i ricevuti
create policy nudges_insert on crew_nudges for insert to authenticated
  with check (from_user = auth.uid() and crew_id = my_crew());
create policy nudges_select on crew_nudges for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());
create policy nudges_update on crew_nudges for update to authenticated
  using (to_user = auth.uid());
