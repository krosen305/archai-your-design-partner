-- supabase/migrations/20260518000000_analysis_event_summaries.sql
-- Adds human-readable summary columns to analysis_events for ARCH-235.
-- These are observability columns — never contain raw API payloads.

alter table public.analysis_events
  add column if not exists input_summary  text,
  add column if not exists output_summary text,
  add column if not exists decision_summary text;

comment on column public.analysis_events.input_summary is
  'Short human-readable description of key inputs. '
  'Example: "adresseid=0a3f50a6 koordinater=present". Never contains sensitive data.';

comment on column public.analysis_events.output_summary is
  'Short human-readable description of key outputs. '
  'Example: "grundareal=441 save=3 fbb_hit=true". Never contains raw API payloads.';

comment on column public.analysis_events.decision_summary is
  'Explains why a step was skipped, bypassed, or treated as fail-open. '
  'Example: "skippet: hard-stop aktiv" or "stale-cache bypassed: grundareal=null".';
