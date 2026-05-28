-- =============================================================================
-- drawing_exports: tabel til beliggenhedsplan-eksporter (Fase 2)
--
-- DrawingRepository (drawing.repository.ts) bruger denne tabel allerede —
-- den eksisterer ikke i prod endnu. Kør migration før deploy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.drawing_exports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  svg_path        text,
  pdf_path        text,
  readiness_status text       NOT NULL,
  input_hash      text        NOT NULL,
  drawing_type    text        NOT NULL DEFAULT 'beliggenhedsplan',
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'review', 'approved', 'rejected')),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS drawing_exports_project_id_idx
  ON public.drawing_exports(project_id);

CREATE INDEX IF NOT EXISTS drawing_exports_generated_at_idx
  ON public.drawing_exports(project_id, generated_at DESC);

-- RLS: ejere ser og opretter kun egne projekters eksporter
ALTER TABLE public.drawing_exports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.drawing_exports FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.drawing_exports TO authenticated;
GRANT ALL ON public.drawing_exports TO service_role;

CREATE POLICY "Ejere ser egne eksporter"
  ON public.drawing_exports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = drawing_exports.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Ejere opretter eksporter"
  ON public.drawing_exports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = drawing_exports.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Ejere opdaterer egne eksporter"
  ON public.drawing_exports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = drawing_exports.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = drawing_exports.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.drawing_exports CASCADE;
