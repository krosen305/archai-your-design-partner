-- supabase/migrations/20260606200000_drawing_params.sql
-- Five new typed columns on projects for authority-grade beliggenhedsplan.
-- Rule 6: domain-critical design values must be typed SQL columns, not JSONB.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS taghaldning_grad    numeric
    CONSTRAINT taghaldning_grad_range CHECK (taghaldning_grad BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS tagform             text
    CONSTRAINT tagform_values CHECK (tagform IN ('sadeltag','fladt','mansard','pulttag')),
  ADD COLUMN IF NOT EXISTS har_jordvarme       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS har_kaelder         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kaelder_gulv_kote_m numeric;

COMMENT ON COLUMN projects.taghaldning_grad    IS 'Taghaldning i grader (0-60). Null = ikke angivet.';
COMMENT ON COLUMN projects.tagform             IS 'Tagtype: sadeltag, fladt, mansard eller pulttag.';
COMMENT ON COLUMN projects.har_jordvarme       IS 'Jordvarme planlagt — udløser §19-påmindelser.';
COMMENT ON COLUMN projects.har_kaelder         IS 'Kælder inkluderet — udløser kloak/grundvand-valideringer.';
COMMENT ON COLUMN projects.kaelder_gulv_kote_m IS 'Kælderens gulvkote DVR90 i meter.';

-- ROLLBACK:
-- ALTER TABLE projects
--   DROP COLUMN IF EXISTS taghaldning_grad,
--   DROP COLUMN IF EXISTS tagform,
--   DROP COLUMN IF EXISTS har_jordvarme,
--   DROP COLUMN IF EXISTS har_kaelder,
--   DROP COLUMN IF EXISTS kaelder_gulv_kote_m;
