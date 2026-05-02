-- ARCH-81: projekter-tabel til byggeønsker og analyse-resultater.
-- Adskilt fra den eksisterende `projects`-tabel (wizard-state) for at
-- holde det strukturerede byggeønskeflow i en ren datamodel.

create table projekter (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users(id) on delete cascade,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  -- Adresse
  adresse       text,
  adresse_dar_id text,

  -- Byggeønsker (JSONB — hele Byggeoenske-objektet)
  byggeoenske   jsonb,

  -- Ejendomsdata fra BBR/DAR/MAT (caches — opdateres ved compliance-kørsel)
  bbr_data      jsonb,
  dar_data      jsonb,
  mat_data      jsonb,

  -- Byggeanalyse-output
  byggeanalyse_resultat jsonb
);

-- Automatisk opdater updated_at ved hver ændring
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projekter_set_updated_at
  before update on projekter
  for each row execute function set_updated_at();

-- RLS: brugere må kun se og ændre egne projekter
alter table projekter enable row level security;

create policy "bruger ser egne projekter"
  on projekter for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
