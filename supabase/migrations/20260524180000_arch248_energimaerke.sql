-- ARCH-248: Energimærke typed columns på site_constraints.
-- Data fra Energistyrelsen EMOData SOAP-service.
-- Ikke hard-stop — due-diligence/forsyningsøkonomi.
-- Null = ukendt (credentials mangler, API-fejl eller bygning ikke energimærket).

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS energimaerke_klasse      TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_gyldig_til  TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_er_udloebet BOOLEAN,
  ADD COLUMN IF NOT EXISTS energimaerke_rapport_url TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_rapport_id  TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_rapportdato TEXT;

COMMENT ON COLUMN public.site_constraints.energimaerke_klasse IS
  'ARCH-248 EMOData: energimærke klasse (A2020, B, C...). null = ingen rapport/ukendt/credentials mangler.';
COMMENT ON COLUMN public.site_constraints.energimaerke_gyldig_til IS
  'ARCH-248: ISO-dato energimærket er gyldigt til. null = ingen rapport.';
COMMENT ON COLUMN public.site_constraints.energimaerke_er_udloebet IS
  'ARCH-248: true = gyldig_til er passeret. false = stadig gyldigt. null = ingen rapport.';
COMMENT ON COLUMN public.site_constraints.energimaerke_rapport_url IS
  'ARCH-248: URL til energimærkningsrapport PDF.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS energimaerke_klasse,
--   DROP COLUMN IF EXISTS energimaerke_gyldig_til,
--   DROP COLUMN IF EXISTS energimaerke_er_udloebet,
--   DROP COLUMN IF EXISTS energimaerke_rapport_url,
--   DROP COLUMN IF EXISTS energimaerke_rapport_id,
--   DROP COLUMN IF EXISTS energimaerke_rapportdato;
