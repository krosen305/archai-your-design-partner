-- ARCH-138: Unify datacheck persistence in `projects`
alter table public.projects
add column if not exists project_data_status jsonb;

