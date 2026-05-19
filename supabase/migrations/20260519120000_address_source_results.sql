-- address_source_results: per-source result cache for address analysis pipeline.
-- Keyed by (address_id, source_kind). Stores the SourceResult<T> payload
-- for sources whose data does not yet have typed site_constraints columns.
--
-- Scope: public/address-level — not user-specific. Results are shared
-- across all users who query the same address.
--
-- Usage:
--   - getCachedSourceResult(addressId, "dkjord") → fresh row or null
--   - setCachedSourceResult(addressId, "dkjord", result) → upsert
--
-- Compliance-critical values (jordforurening_v1/v2 etc.) are NOT stored here;
-- they are written to typed site_constraints columns by the orchestrator.
-- This table holds the raw SourceResult payload for observability and
-- non-SSOT screening context shown in the UI.

CREATE TABLE IF NOT EXISTS public.address_source_results (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Address reference (same key as address_analysis.address_id)
  address_id        TEXT        NOT NULL,

  -- Which data source produced this result.
  -- Matches DataSourceKind values from project-store.ts.
  -- Examples: 'dkjord', 'geus', 'dhm', 'plandata_ext', 'geodanmark_mat', 'dai_extended'
  source_kind       TEXT        NOT NULL,

  -- SourceResult<T> metadata columns (mirror the TS type)
  status            TEXT        NOT NULL
                    CHECK (status IN ('ok', 'error', 'skipped', 'mock')),
  confidence        TEXT        NOT NULL
                    CHECK (confidence IN ('confirmed', 'estimated', 'missing', 'unknown')),
  is_mock           BOOLEAN     NOT NULL DEFAULT false,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_url        TEXT,           -- endpoint URL or WFS typename(s)
  raw_feature_count INT,            -- WFS feature count (null for non-WFS)

  -- Raw normalized payload — NOT for compliance-critical values.
  -- Type: SourceResult<T>.data serialized as JSON.
  payload           JSONB,

  -- TTL-based expiry: checked at read time (WHERE expires_at > now()).
  -- Set by setCachedSourceResult based on source TTL:
  --   dkjord: 30 days, dhm/geus: 30 days, geodanmark_mat: 90 days
  expires_at        TIMESTAMPTZ NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active result per address per source
  CONSTRAINT address_source_results_address_source_unique
    UNIQUE (address_id, source_kind)
);

CREATE TRIGGER address_source_results_set_updated_at
  BEFORE UPDATE ON public.address_source_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for cache lookups (address_id, source_kind, expires_at)
CREATE INDEX IF NOT EXISTS address_source_results_lookup_idx
  ON public.address_source_results(address_id, source_kind, expires_at);

-- Index for TTL cleanup queries
CREATE INDEX IF NOT EXISTS address_source_results_expires_idx
  ON public.address_source_results(expires_at);

ALTER TABLE public.address_source_results ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (same open-read pattern as address_analysis)
CREATE POLICY "authenticated_read_address_source_results"
  ON public.address_source_results FOR SELECT
  TO authenticated
  USING (true);

-- Service role writes (bypasses RLS by default — no explicit INSERT policy needed)

COMMENT ON TABLE public.address_source_results IS
  'Per-source SourceResult<T> cache for address analysis pipeline. '
  'Keyed by (address_id, source_kind). Shared across users. '
  'For compliance-critical constraint values use typed site_constraints columns instead.';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.address_source_results CASCADE;
