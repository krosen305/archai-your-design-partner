alter table public.site_constraints
  add column if not exists paragraph3_nature boolean,
  add column if not exists natura2000 boolean,
  add column if not exists protected_dige boolean,
  add column if not exists fortidsminde boolean,
  add column if not exists fortidsminde_buffer boolean,
  add column if not exists bnbo boolean,
  add column if not exists osd boolean,
  add column if not exists raw_material_area boolean;

comment on column public.site_constraints.paragraph3_nature is
  'ARCH-245: Tri-state overlap med registreret §3-beskyttet natur.';
comment on column public.site_constraints.natura2000 is
  'ARCH-245: Tri-state overlap med Natura 2000-interesser.';
comment on column public.site_constraints.protected_dige is
  'ARCH-245: Tri-state overlap med registreret beskyttet sten- eller jorddige.';
comment on column public.site_constraints.fortidsminde is
  'ARCH-245: Tri-state overlap med registreret fredet fortidsminde.';
comment on column public.site_constraints.fortidsminde_buffer is
  'ARCH-245: Tri-state overlap med fortidsmindebeskyttelseslinje.';
comment on column public.site_constraints.bnbo is
  'ARCH-245: Tri-state overlap med boringsnaert beskyttelsesomraade (BNBO).';
comment on column public.site_constraints.osd is
  'ARCH-245: Tri-state overlap med Omraade med Saerlige Drikkevandsinteresser.';
comment on column public.site_constraints.raw_material_area is
  'ARCH-245: Tri-state overlap med raastofinteresser/raastofomraade.';
