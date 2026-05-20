-- supabase/migrations/20260520000000_site_constraints_jordforurening.sql
-- ARCH-241: typed DK-Jord kolonner på site_constraints
-- Alle kolonner nullable — ingen backfill nødvendig (eksisterende data har soil_contamination_status)

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS jordforurening_v1           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_v2           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_olietank     BOOLEAN,
  ADD COLUMN IF NOT EXISTS omraadeklassificering       TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_nuancering   TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_lokalitet_id TEXT;

COMMENT ON COLUMN public.site_constraints.jordforurening_v1 IS
  'DK-Jord V1-kortlægning — mulig forurening. null = ukendt/API-fejl (aldrig false ved fejl).';
COMMENT ON COLUMN public.site_constraints.jordforurening_v2 IS
  'DK-Jord V2-kortlægning — dokumenteret forurening. null = ukendt/API-fejl.';
COMMENT ON COLUMN public.site_constraints.jordforurening_olietank IS
  'DK-Jord olietank registreret. null = ukendt/API-fejl.';
COMMENT ON COLUMN public.site_constraints.omraadeklassificering IS
  'DK-Jord områdeklassificering — rå tekst fra WFS feature properties (omraadenavn).';
COMMENT ON COLUMN public.site_constraints.jordforurening_nuancering IS
  'DK-Jord nuancering fra V1/V2 feature properties — supplerende klassifikation.';
COMMENT ON COLUMN public.site_constraints.jordforurening_lokalitet_id IS
  'DK-Jord lokalitets-id — til opslag på miljoeportal.dk.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS jordforurening_v1,
--   DROP COLUMN IF EXISTS jordforurening_v2,
--   DROP COLUMN IF EXISTS jordforurening_olietank,
--   DROP COLUMN IF EXISTS omraadeklassificering,
--   DROP COLUMN IF EXISTS jordforurening_nuancering,
--   DROP COLUMN IF EXISTS jordforurening_lokalitet_id;
