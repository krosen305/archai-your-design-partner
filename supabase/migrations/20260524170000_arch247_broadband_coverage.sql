-- ARCH-247: broadband_coverage tabel til Tjekditnet data (CSV-import).
-- Keyed by adgangsadresse-ID (DAR UUID). Indeholder teknisk mulige hastigheder
-- for de fem bredbåndsteknologier. Importeres via scripts/import-tjekditnet.ts.
-- Selskabsnavne gemmes ikke.

CREATE TABLE IF NOT EXISTS public.broadband_coverage (
  -- DAR adgangsadresse UUID (matcher adgangsadresseid i address_analysis/projects)
  adgangsadresse_id         TEXT        PRIMARY KEY,

  -- Teknisk mulige hastigheder i Mbit/s (null = teknologien ikke tilgængelig på adressen)
  fast_traadloes_download_mbit  NUMERIC,
  fast_traadloes_upload_mbit    NUMERIC,
  fiber_download_mbit           NUMERIC,
  fiber_upload_mbit             NUMERIC,
  kabel_tv_download_mbit        NUMERIC,
  kabel_tv_upload_mbit          NUMERIC,
  xdsl_download_mbit            NUMERIC,
  xdsl_upload_mbit              NUMERIC,
  mobil_download_mbit           NUMERIC,

  -- Metadata
  source_url            TEXT,       -- CSV URL brugt ved import
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadband_coverage_address_idx
  ON public.broadband_coverage(adgangsadresse_id);

ALTER TABLE public.broadband_coverage ENABLE ROW LEVEL SECURITY;

-- Authenticated users kan læse
CREATE POLICY "authenticated_read_broadband_coverage"
  ON public.broadband_coverage FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.broadband_coverage IS
  'ARCH-247 Tjekditnet: teknisk mulige bredbåndshastigheder pr. adgangsadresse. '
  'Importeres via scripts/import-tjekditnet.ts fra tek.zip (Digitaliseringsstyrelsen). '
  'Selskabsnavne gemmes ikke. Opdateres typisk én gang om året.';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.broadband_coverage CASCADE;
