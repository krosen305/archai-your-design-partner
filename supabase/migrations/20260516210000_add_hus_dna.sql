-- ARCH-197: HusDna persistence
-- HusDna (AI-genereret design-DNA) gemmes i dedikeret kolonne
-- i stedet for brief_data (som bruges af byggeoenske).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hus_dna JSONB;
