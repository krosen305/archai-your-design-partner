-- Tilfoej billedanalyse JSONB-kolonne til projects.
-- Gemmer AI-analyse af inspirationsbilleder (arkivering, ikke compliance-data).
-- Ingen regel-engine laeser direkte fra denne kolonne.
alter table public.projects add column if not exists billedanalyse jsonb;
