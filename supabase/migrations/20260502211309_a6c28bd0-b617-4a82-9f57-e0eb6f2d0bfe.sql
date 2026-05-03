
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS address_adresseid TEXT,
  ADD COLUMN IF NOT EXISTS address_postnr TEXT,
  ADD COLUMN IF NOT EXISTS address_postnrnavn TEXT,
  ADD COLUMN IF NOT EXISTS address_koordinater JSONB,
  ADD COLUMN IF NOT EXISTS address_ejerlavskode INTEGER,
  ADD COLUMN IF NOT EXISTS address_matrikelnummer TEXT;

CREATE TABLE IF NOT EXISTS public.address_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address_id TEXT NOT NULL UNIQUE,
  lokalplan_extracted JSONB,
  lokalplan_extracted_at TIMESTAMPTZ,
  lokalplan_pdf_url TEXT,
  servitut_extracted JSONB,
  servitut_extracted_at TIMESTAMPTZ,
  compliance_result JSONB,
  compliance_result_at TIMESTAMPTZ,
  report_text TEXT,
  report_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.address_analysis ENABLE ROW LEVEL SECURITY;
-- Ingen policies = kun service role kan læse/skrive (intern cache).

CREATE TRIGGER set_address_analysis_updated_at
BEFORE UPDATE ON public.address_analysis
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
