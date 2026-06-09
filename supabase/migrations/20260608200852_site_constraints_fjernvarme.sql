alter table public.site_constraints
  add column if not exists fjernvarme_daekket boolean,
  add column if not exists fjernvarme_planlagt boolean,
  add column if not exists fjernvarme_tilslutningspligt boolean,
  add column if not exists fjernvarme_forsyningsforbud boolean,
  add column if not exists fjernvarme_forsyningsselskab_navn text,
  add column if not exists fjernvarme_forsyningsselskab_cvr text,
  add column if not exists fjernvarme_plan_navn text,
  add column if not exists fjernvarme_plan_start_aar integer,
  add column if not exists fjernvarme_plan_slut_aar integer,
  add column if not exists fjernvarme_dokument_url text,
  add column if not exists fjernvarme_confidence text,
  add column if not exists fjernvarme_source_kinds text[],
  add column if not exists fjernvarme_fetched_at timestamptz;

comment on column public.site_constraints.fjernvarme_daekket is
  'True only when Plandata confirms district-heating supply-area coverage. Planned heat areas alone do not set this.';
comment on column public.site_constraints.fjernvarme_planlagt is
  'True when Plandata heat-plan areas indicate planned district heating for the address.';
comment on column public.site_constraints.fjernvarme_tilslutningspligt is
  'True when the address intersects a Plandata connection-obligation area.';
comment on column public.site_constraints.fjernvarme_forsyningsforbud is
  'True when the address intersects a district-heating-relevant Plandata supply-ban area.';
comment on column public.site_constraints.fjernvarme_confidence is
  'Confidence from the district-heating adapter: confirmed, estimated, missing or unknown.';
