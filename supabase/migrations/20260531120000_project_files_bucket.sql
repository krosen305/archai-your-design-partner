-- =============================================================================
-- Supabase Storage bucket: project-files
--
-- Mangler i prod → SVG/PDF-eksport (beliggenhedsplan + plantegning) fejlede med
-- "Bucket not found". Repos uploader via service role til
--   drawings/{projectId}/...      (DrawingRepository)
--   floor-plans/{projectId}/...   (FloorPlanExportRepository)
-- Bucket er privat — læsning sker via signed URLs (genereret med service role).
-- Service-role-adgang omgår RLS, så ingen storage.objects-policies er nødvendige
-- for de nuværende flows.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

-- ROLLBACK:
-- delete from storage.buckets where id = 'project-files';
