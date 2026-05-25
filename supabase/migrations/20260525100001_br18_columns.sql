alter table projects
  add column if not exists br18_version text not null default '2024',
  add column if not exists authority_readiness_status text
    check (authority_readiness_status in (
      'preliminary','ready_for_advisor_review',
      'ready_for_authority_review','missing_critical_documentation'
    )) default 'preliminary';

alter table site_constraints
  add column if not exists lca_required boolean,
  add column if not exists energy_frame_required boolean,
  add column if not exists fire_review_required boolean,
  add column if not exists static_review_required boolean;
