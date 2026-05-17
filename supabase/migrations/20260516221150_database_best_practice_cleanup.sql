-- Database best-practice cleanup after Supabase advisor review.
-- Focus: RLS performance, least-privilege grants, redundant schema artifacts
-- and small write-amplification fixes. No domain data is deleted.

-- Fix advisor: public.set_updated_at must pin search_path.
-- A later legacy migration recreated the function without SET search_path.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Fix advisor: analysis_runs.user_id FK needs a covering index for joins and
-- ON DELETE SET NULL from auth.users.
CREATE INDEX IF NOT EXISTS analysis_runs_user_id_idx
  ON public.analysis_runs(user_id)
  WHERE user_id IS NOT NULL;

-- address_analysis.address_id already has a UNIQUE index from the constraint.
-- The non-unique btree duplicates write cost without improving lookups.
DROP INDEX IF EXISTS public.address_analysis_address_id_idx;

-- Two identical updated_at triggers were created by overlapping migrations.
DROP TRIGGER IF EXISTS set_address_analysis_updated_at ON public.address_analysis;

-- Public views should not bypass underlying RLS by default. They are still
-- granted only to service_role below.
ALTER VIEW public.analysis_run_summaries SET (security_invoker = true);
ALTER VIEW public.analysis_event_errors SET (security_invoker = true);

-- Consolidate duplicate permissive read policies on address_analysis.
DROP POLICY IF EXISTS "Authenticated users can read address analysis" ON public.address_analysis;
DROP POLICY IF EXISTS "Authenticated users can read address cache" ON public.address_analysis;
CREATE POLICY "authenticated_read_address_analysis"
  ON public.address_analysis
  FOR SELECT
  TO authenticated
  USING (true);

-- Optimize auth.uid()/auth.role() RLS calls by evaluating them once per query,
-- and restrict user-facing policies to authenticated instead of public.
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users delete own profile" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles_delete_own"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users delete own projects" ON public.projects;

CREATE POLICY "projects_select_own"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "projects_insert_own"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "projects_update_own"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "projects_delete_own"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users_own_design_iterations" ON public.design_iterations;
CREATE POLICY "design_iterations_own_project"
  ON public.design_iterations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = design_iterations.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = design_iterations.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "users_own_building_tasks" ON public.building_tasks;
CREATE POLICY "building_tasks_own_project"
  ON public.building_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = building_tasks.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = building_tasks.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "service_role only" ON public.agent_sessions;
CREATE POLICY "agent_sessions_service_role"
  ON public.agent_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role only" ON public.agent_tasks;
CREATE POLICY "agent_tasks_service_role"
  ON public.agent_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role only" ON public.agent_qa_verdicts;
CREATE POLICY "agent_qa_verdicts_service_role"
  ON public.agent_qa_verdicts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storage: the app uses only the Danish bucket name. Remove the old English
-- bucket policies only when it has no objects. Supabase intentionally blocks
-- direct deletion from storage.buckets; delete the empty bucket itself via the
-- Storage API/Dashboard after this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'inspiration-images'
  ) THEN
    DROP POLICY IF EXISTS "Users view own inspiration images" ON storage.objects;
    DROP POLICY IF EXISTS "Users upload own inspiration images" ON storage.objects;
    DROP POLICY IF EXISTS "Users update own inspiration images" ON storage.objects;
    DROP POLICY IF EXISTS "Users delete own inspiration images" ON storage.objects;
  END IF;
END $$;

DROP POLICY IF EXISTS "bruger uploader egne billeder" ON storage.objects;
DROP POLICY IF EXISTS "bruger ser egne billeder" ON storage.objects;
DROP POLICY IF EXISTS "bruger sletter egne billeder" ON storage.objects;

CREATE POLICY "inspirationsbilleder_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'inspirationsbilleder'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "inspirationsbilleder_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inspirationsbilleder'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "inspirationsbilleder_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inspirationsbilleder'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

-- Least-privilege grants. RLS remains the row-level gate, but broad anon/all
-- grants make the API surface harder to reason about.
REVOKE ALL ON TABLE
  public.profiles,
  public.projects,
  public.address_analysis,
  public.site_constraints,
  public.design_iterations,
  public.building_tasks,
  public.agent_sessions,
  public.agent_tasks,
  public.agent_qa_verdicts,
  public.analysis_runs,
  public.analysis_events,
  public.analysis_run_summaries,
  public.analysis_event_errors
FROM anon;

REVOKE ALL ON TABLE
  public.address_analysis,
  public.site_constraints,
  public.agent_sessions,
  public.agent_tasks,
  public.agent_qa_verdicts,
  public.analysis_runs,
  public.analysis_events,
  public.analysis_run_summaries,
  public.analysis_event_errors
FROM authenticated;

REVOKE TRIGGER, TRUNCATE, REFERENCES ON TABLE
  public.profiles,
  public.projects,
  public.design_iterations,
  public.building_tasks
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.projects,
  public.design_iterations,
  public.building_tasks
TO authenticated;

GRANT SELECT ON TABLE
  public.address_analysis,
  public.site_constraints
TO authenticated;

GRANT ALL ON TABLE
  public.agent_sessions,
  public.agent_tasks,
  public.agent_qa_verdicts,
  public.analysis_runs,
  public.analysis_events
TO service_role;

GRANT SELECT ON TABLE
  public.analysis_run_summaries,
  public.analysis_event_errors
TO service_role;
