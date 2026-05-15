-- Persistent technical tracing for address/precheck/full-analysis runs.
-- These tables are internal observability data and are service_role-only.

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  run_kind text not null
    check (run_kind in ('precheck', 'full_analysis', 'byggeanalyse', 'ai_design', 'project_sync')),
  project_id uuid references public.projects(id) on delete set null,
  address_id text,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'server',
  status text not null default 'running'
    check (status in ('running', 'done', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'
);

create table public.analysis_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.analysis_runs(id) on delete cascade,
  event_type text not null
    check (event_type in ('api_call', 'cache_read', 'cache_write', 'db_read', 'db_write', 'pipeline_step')),
  phase text,
  service text not null,
  operation text not null,
  status text not null default 'ok'
    check (status in ('ok', 'error', 'skipped')),
  cache_hit boolean,
  attempt integer,
  http_status integer,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index analysis_runs_project_started_idx
  on public.analysis_runs(project_id, started_at desc)
  where project_id is not null;

create index analysis_runs_address_started_idx
  on public.analysis_runs(address_id, started_at desc)
  where address_id is not null;

create index analysis_events_run_created_idx
  on public.analysis_events(run_id, created_at);

create index analysis_events_service_operation_idx
  on public.analysis_events(service, operation, created_at desc);

create view public.analysis_run_summaries as
select
  r.id,
  r.run_kind,
  r.project_id,
  r.address_id,
  r.user_id,
  r.source,
  r.status,
  r.started_at,
  r.completed_at,
  r.duration_ms,
  r.error_message,
  count(e.id) as event_count,
  count(e.id) filter (where e.event_type = 'api_call') as api_call_count,
  count(e.id) filter (where e.event_type = 'cache_read') as cache_read_count,
  count(e.id) filter (where e.cache_hit = true) as cache_hit_count,
  count(e.id) filter (where e.event_type = 'db_write') as db_write_count,
  count(e.id) filter (where e.status = 'error') as error_count,
  coalesce(
    (
      select jsonb_object_agg(service_counts.service, service_counts.call_count)
      from (
        select service, count(*) as call_count
        from public.analysis_events
        where run_id = r.id and event_type = 'api_call'
        group by service
      ) as service_counts
    ),
    '{}'::jsonb
  ) as api_calls_by_service
from public.analysis_runs r
left join public.analysis_events e on e.run_id = r.id
group by r.id;

create view public.analysis_event_errors as
select
  r.run_kind,
  r.project_id,
  r.address_id,
  e.run_id,
  e.created_at,
  e.phase,
  e.service,
  e.operation,
  e.event_type,
  e.http_status,
  e.duration_ms,
  e.error_message,
  e.metadata
from public.analysis_events e
join public.analysis_runs r on r.id = e.run_id
where e.status = 'error';

alter table public.analysis_runs enable row level security;
alter table public.analysis_events enable row level security;

revoke all on table public.analysis_runs from anon, authenticated;
revoke all on table public.analysis_events from anon, authenticated;
grant all on table public.analysis_runs to service_role;
grant all on table public.analysis_events to service_role;
revoke all on table public.analysis_run_summaries from anon, authenticated;
revoke all on table public.analysis_event_errors from anon, authenticated;
grant select on table public.analysis_run_summaries to service_role;
grant select on table public.analysis_event_errors to service_role;

create policy "service_role_only_analysis_runs"
  on public.analysis_runs
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_only_analysis_events"
  on public.analysis_events
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.analysis_runs is
  'Internal technical trace runs for address precheck and full compliance analysis. Service role only.';

comment on table public.analysis_events is
  'Internal technical trace events: API calls, cache reads/writes, DB persistence and soft failures. Service role only.';

comment on view public.analysis_run_summaries is
  'Service-role-only summary of technical trace runs, including API call counts by service.';

comment on view public.analysis_event_errors is
  'Service-role-only list of failed technical trace events with context for debugging.';
