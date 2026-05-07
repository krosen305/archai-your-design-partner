-- ARCH-105: Projekt-readiness tracker — tilføj project_data_status til projekter.
-- Kolonnen gemmer ~63 manuelle datapunkter som JSONB keyed by fieldId.
-- Unik constraint på (user_id, adresse_dar_id) muliggør idempotent upsert.

ALTER TABLE projekter
  ADD COLUMN IF NOT EXISTS project_data_status jsonb DEFAULT '{}';

-- Unik constraint til upsert-mønster (server-fn upserterer per adresse per bruger)
ALTER TABLE projekter
  ADD CONSTRAINT projekter_user_adresse_unique
    UNIQUE (user_id, adresse_dar_id);
