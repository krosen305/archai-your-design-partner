-- ARCH-246: BBR Due-Diligence typed columns on site_constraints.
-- Nye felter: vandforsyning, afløbsforhold, ombygningsår og saneringsrisiko fra BBR.
-- Alle kolonner nullable — tri-state: null = ukendt/ikke hentet.

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS bbr_vandforsyning_kode   TEXT,
  ADD COLUMN IF NOT EXISTS bbr_afloebsforhold_kode  TEXT,
  ADD COLUMN IF NOT EXISTS bbr_ombygningsaar        INTEGER,
  ADD COLUMN IF NOT EXISTS bbr_sanerings_risiko     TEXT
    CHECK (bbr_sanerings_risiko IN ('lav', 'moderat', 'hoej'));

COMMENT ON COLUMN public.site_constraints.bbr_vandforsyning_kode IS
  'ARCH-246 BBR byg030Vandforsyning: vandforsyningstype kode. null = ukendt/ikke hentet.';
COMMENT ON COLUMN public.site_constraints.bbr_afloebsforhold_kode IS
  'ARCH-246 BBR byg031Afloebsforhold: afløbstype kode. "4" = nedsivningsanlæg. null = ukendt.';
COMMENT ON COLUMN public.site_constraints.bbr_ombygningsaar IS
  'ARCH-246 BBR byg027OmTilbygningsaar: seneste ombygningsår. null = aldrig ombygget/ukendt.';
COMMENT ON COLUMN public.site_constraints.bbr_sanerings_risiko IS
  'ARCH-246 heuristik: saneringsrisiko for asbest/PCB/bly. "hoej"/"moderat"/"lav". null = ukendt byggeår.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS bbr_vandforsyning_kode,
--   DROP COLUMN IF EXISTS bbr_afloebsforhold_kode,
--   DROP COLUMN IF EXISTS bbr_ombygningsaar,
--   DROP COLUMN IF EXISTS bbr_sanerings_risiko;
