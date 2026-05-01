-- ARCH-61: Udvid projects.address_* kolonner
--
-- Tilføjer de manglende adresse-felter der er nødvendige for:
--   a) Korrekt cache-nøgle (adresseid ≠ adgangsadresseid)
--   b) Compliance genberegning fra restored session (koordinater, ejerlavskode, matrikelnummer)
--   c) Fuld adresse-visning (postnr, postnrnavn)
--
-- address_bbr beholdes for backward compatibility (= adgangsadresseid).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS address_adresseid      TEXT,
  ADD COLUMN IF NOT EXISTS address_postnr         TEXT,
  ADD COLUMN IF NOT EXISTS address_postnrnavn     TEXT,
  ADD COLUMN IF NOT EXISTS address_koordinater    JSONB,
  ADD COLUMN IF NOT EXISTS address_ejerlavskode   BIGINT,
  ADD COLUMN IF NOT EXISTS address_matrikelnummer TEXT;
