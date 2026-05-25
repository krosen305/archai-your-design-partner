-- ARCH-247: Bredbåndscoverage typed columns på site_constraints.
-- Data fra broadband_coverage tabel (Tjekditnet bulk CSV import).
-- Null = ukendt/ikke i broadband_coverage tabel (adresse mangler dækning eller ikke importeret).
-- false = hentet, adresse fundet, men teknologien er ikke tilgængelig.

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS broadband_fiber_mbit          NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_kabel_mbit          NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_xdsl_mbit           NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_fast_traadloes_mbit NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_mobil_mbit          NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_max_fast_mbit       NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_match_type          TEXT
    CHECK (broadband_match_type IN ('uuid', 'no_hit', 'db_error'));

COMMENT ON COLUMN public.site_constraints.broadband_fiber_mbit IS
  'ARCH-247 Tjekditnet: teknisk mulig fiber download Mbit/s. null = ukendt. 0 = ikke tilgængelig.';
COMMENT ON COLUMN public.site_constraints.broadband_max_fast_mbit IS
  'ARCH-247 Tjekditnet: bedste teknisk mulige faste bredbåndsdownload på tværs af teknologier.';
COMMENT ON COLUMN public.site_constraints.broadband_match_type IS
  'ARCH-247 Tjekditnet: opslag-resultat (uuid=fundet/no_hit=ikke i CSV/db_error=fejl).';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS broadband_fiber_mbit,
--   DROP COLUMN IF EXISTS broadband_kabel_mbit,
--   DROP COLUMN IF EXISTS broadband_xdsl_mbit,
--   DROP COLUMN IF EXISTS broadband_fast_traadloes_mbit,
--   DROP COLUMN IF EXISTS broadband_mobil_mbit,
--   DROP COLUMN IF EXISTS broadband_max_fast_mbit,
--   DROP COLUMN IF EXISTS broadband_match_type;
