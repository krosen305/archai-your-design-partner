-- address_analysis: shared AI extraction cache keyed by DAWA address ID.
-- Rows are NOT per-user — results from public documents are shared across users
-- for the same address, eliminating redundant AI calls.
--
-- Service role (server-side) bypasses RLS for all writes/reads.
-- Authenticated users may read (useful for future client-side inspection).

CREATE TABLE public.address_analysis (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache key: DAWA/DAR address ID (adresseid, not adgangsadresseid)
  address_id              TEXT        NOT NULL UNIQUE,

  -- Lokalplan PDF extraction (ARCH-25)
  lokalplan_extracted     JSONB,
  lokalplan_extracted_at  TIMESTAMPTZ,
  lokalplan_pdf_url       TEXT,       -- which PDF was parsed; change = cache bust

  -- Servitut extraction (ARCH-26)
  servitut_extracted      JSONB,
  servitut_extracted_at   TIMESTAMPTZ,

  -- Compliance pipeline result (BBR + MAT + Plandata)
  compliance_result       JSONB,
  compliance_result_at    TIMESTAMPTZ,

  -- Final Danish report text
  report_text             TEXT,
  report_generated_at     TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX address_analysis_address_id_idx ON public.address_analysis(address_id);

ALTER TABLE public.address_analysis ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read cached results
CREATE POLICY "Authenticated users can read address analysis"
  ON public.address_analysis FOR SELECT
  TO authenticated
  USING (true);

-- Writes are service_role only (bypasses RLS automatically)

CREATE TRIGGER address_analysis_set_updated_at
  BEFORE UPDATE ON public.address_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
