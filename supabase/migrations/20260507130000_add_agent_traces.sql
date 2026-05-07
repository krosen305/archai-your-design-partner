-- agent_traces: persistent log af agent-sessioner på tværs af lokale kørsler
-- Valgfri — fil-baseret tracing i agent-traces/ fungerer uden dette

-- Sessions
create table agent_sessions (
  id          text primary key,
  trigger_issue text,
  model       text not null,
  status      text not null default 'running'
    check (status in ('running','done','failed','partial')),
  started_at  timestamptz not null default now(),
  completed_at timestamptz,
  metadata    jsonb default '{}'
);

-- RLS: kun service_role må skrive (agenter kører server-side)
alter table agent_sessions enable row level security;
create policy "service_role only"
  on agent_sessions
  using (auth.role() = 'service_role');

-- Tasks
create table agent_tasks (
  id              text primary key,
  session_id      text not null references agent_sessions(id) on delete cascade,
  agent           text not null
    check (agent in ('orchestrator','backend','frontend','design','qa')),
  description     text not null,
  depends_on      text[] not null default '{}',
  status          text not null default 'pending'
    check (status in ('pending','running','done','failed','retrying','abandoned','skipped')),
  retry_count     int not null default 0,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     int,
  output_summary  text,
  files_changed   text[] default '{}',
  types_exported  text[] default '{}',
  failure_type    text,
  failure_message text,
  failure_details text
);

alter table agent_tasks enable row level security;
create policy "service_role only"
  on agent_tasks
  using (auth.role() = 'service_role');

-- Indexes
create index on agent_tasks(session_id);
create index on agent_tasks(status);
create index on agent_sessions(trigger_issue);

-- QA verdicts
create table agent_qa_verdicts (
  session_id    text primary key references agent_sessions(id),
  status        text not null check (status in ('pass','fail')),
  build_check   text check (build_check in ('pass','fail','skip')),
  tests_check   text check (tests_check in ('pass','fail','skip')),
  lint_check    text check (lint_check in ('pass','fail','skip')),
  blockers      text[] default '{}',
  warnings      text[] default '{}',
  duration_ms   int,
  created_at    timestamptz not null default now()
);

alter table agent_qa_verdicts enable row level security;
create policy "service_role only"
  on agent_qa_verdicts
  using (auth.role() = 'service_role');
