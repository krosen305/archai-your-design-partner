create table if not exists project_br18_applicability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  requirement_id text not null,
  br18_version text not null default '2024',
  status text not null check (status in (
    'relevant','not_relevant','unknown_missing_data',
    'requires_specialist_review','requires_authority_decision'
  )),
  reasons text[] not null default '{}',
  missing_inputs text[] not null default '{}',
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, requirement_id, br18_version)
);

create table if not exists project_br18_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  requirement_id text not null,
  evidence_type text not null check (evidence_type in (
    'register_data','drawing','calculation','declaration',
    'product_documentation','photo','manual_upload','advisor_note','authority_response'
  )),
  status text not null check (status in ('missing','draft','uploaded','validated','rejected')) default 'missing',
  source text not null check (source in ('datafordeler','plandata','user_upload','advisor','ai_extract','manual')),
  file_id uuid null,
  structured_payload jsonb null,
  validation_notes text[] not null default '{}',
  reviewed_by_role text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_br18_applicability_project_id on project_br18_applicability(project_id);
create index if not exists idx_br18_evidence_project_id on project_br18_evidence(project_id);
