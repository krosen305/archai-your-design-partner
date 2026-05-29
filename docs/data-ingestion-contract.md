# Data Ingestion Contract

Status: current backend contract for new public data sources as of 2026-05-19.

This document defines how new public data sources are integrated in ArchAI. Follow it exactly — each ARCH-240+ issue should reference it.

## 1. Service file location

New sources live in `src/integrations/<source>/client.ts`.

Naming: `<Source>Service` with a static method that returns `SourceResult<T>`.

## 2. SourceResult<T> — the universal return type

Every service method returns `SourceResult<T>` from `src/lib/source-result.ts`.

```typescript
import { makeOkResult, makeErrorResult, makeMockResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";

const IS_MOCK = true; // flip to false when live

export type MySourcePayload = {
  someValue: boolean | null; // tri-state: true/false/null (null = unknown/error)
  otherField: string | null;
};

export class MySourceService {
  static async getData(koordinat: {
    lat: number;
    lng: number;
  }): Promise<SourceResult<MySourcePayload>> {
    if (IS_MOCK) {
      return makeMockResult(
        { someValue: false, otherField: null },
        { kilde: "my-source", sourceUrl: "https://example.com/wfs", rawFeatureCount: 0 },
      );
    }
    try {
      const features = await fetchWfs(koordinat);
      return makeOkResult(
        { someValue: features.length > 0, otherField: features[0]?.name ?? null },
        {
          kilde: "my-source",
          sourceUrl: "https://example.com/wfs",
          rawFeatureCount: features.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "my-source", sourceUrl: "https://example.com/wfs" });
    }
  }
}
```

## 3. Tri-state semantics

Boolean fields on the payload type MUST be `boolean | null`:

- `true` — condition confirmed present
- `false` — condition confirmed absent
- `null` — unknown (API error, timeout, no data returned)

**Never map API errors to `false`.** A missing result is not a confirmed absence.

The `status` field on `SourceResult` provides the signal:

- `"ok"` — live data, `data` may contain nulls for fields not found
- `"mock"` — IS_MOCK=true, synthetic data
- `"error"` — call failed, `data` is null
- `"skipped"` — intentionally not called (e.g. Hard Stop gate)

## 4. Persistence: which table for what?

| Data type                                                                                                          | Table                                      | Key                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------- |
| Compliance-critical constraints (max_bebyggelsesprocent, save_value, strandbeskyttelse, jordforurening_v1/v2, ...) | `site_constraints` (typed columns)         | `address_id`                |
| Raw/intermediate screening results (not yet site_constraints columns)                                              | `address_source_results`                   | `(address_id, source_kind)` |
| Full compliance pipeline blob                                                                                      | `address_analysis.compliance_result` JSONB | `address_id`                |

**Rule:** If a value is used by the Validation Engine (`runRuleEngine`) or shown as a Hard Stop, it goes in `site_constraints` as a typed column. If it is screening context data that the UI presents but doesn't trigger rules, cache it in `address_source_results`.

## 5. Tracing convention

Every service call must be wrapped in `traceStep` with:

- `inputSummary`: key inputs (never coordinates in full precision, use grid-rounded)
- `outputSummary` via `summarizeSourceResult()`: status + feature count + key payload fields
- `metadata.source`: source_kind string
- `metadata.isMock`: boolean
- `metadata.feature_count`: rawFeatureCount from result

Example:

```typescript
const result = await traceStep(
  trace,
  {
    eventType: "api_call",
    phase: "layer4",
    service: "DK-Jord WFS",
    operation: "getTilstand",
    inputSummary: `koordinater=${koordinat.lat.toFixed(4)},${koordinat.lng.toFixed(4)}`,
  },
  () => DkJordService.getTilstand(koordinat),
  {
    outputSummary: (r) => summarizeSourceResult(r, (d) => `v1=${d.v1Kortlagt} v2=${d.v2Kortlagt}`),
    metadata: (r) => ({
      source: r.kilde,
      isMock: r.isMock,
      feature_count: r.rawFeatureCount,
    }),
  },
);
```

## 6. Pre-check vs full analysis

| Source                    | Pre-check         | Full analysis      |
| ------------------------- | ----------------- | ------------------ |
| BBR, MAT, DAR             | ✅                | ✅                 |
| Plandata                  | ✅                | ✅                 |
| FBB                       | ✅                | ✅                 |
| DK-Jord                   | ✅ (simplified)   | ✅ (full 4 layers) |
| DHM / terrain             | ❌                | ✅                 |
| GEUS / HIP                | ❌                | ✅                 |
| MAT geometry / GeoDanmark | ✅ (polygon only) | ✅                 |
| Plandata expansion        | ❌                | ✅                 |
| DAI extended layers       | ❌                | ✅                 |

Pre-check sources must be fast (< 2s target) and only fetch Hard Stop-critical data.

## 7. `DataSourceKind` extension

When a new source is added to the orchestrator, add its kind to `DataSourceKind` in `project-store.ts` simultaneously. This is a protected file — flag the change in PR. New PipelineServiceState mappings:

| SourceResult.status   | PipelineServiceState |
| --------------------- | -------------------- |
| `"ok"` + data != null | `"success"`          |
| `"ok"` + data == null | `"no_hit"`           |
| `"mock"`              | `"mock"`             |
| `"error"`             | `"error"`            |
| `"skipped"`           | `"skipped"`          |

## 8. New site_constraints columns — per-ARCH migration

Each P0/P1 ARCH issue adds its own typed columns to `site_constraints`. Do not add all columns speculatively. Migrate only what you need for that source.

Planned column groups:

- **ARCH-240 (MAT geometry + GeoDanmark)**: `matGeometri` in `ComplianceResult` — `MatParcelGeometryPayload` (area, centroid, bbox, featureCount, hasCanonicalPolygon). Raw MAT/GeoDanmark geometry is cached via `address_source_results` source_kind `"mat_geometry"` and `"geodanmark_nabo"` (90-day TTL). GeoDanmark error results are not cached; a transient Datafordeler failure must degrade the current run without poisoning the 90-day cache. GeoDanmark derived neighbor summary values are written to the existing ARCH-240/omgivelser typed `site_constraints` columns when the source result is live and non-mock. Raw geometry remains screening context and is not a Hard Stop input.
- **ARCH-241 (DK-Jord)**: `jordforurening_v1`, `jordforurening_v2`, `olietank_eksisterer`, `omraadeklassificering`, `jordforurening_nuancering`
- **ARCH-242 (GEUS/HIP)**: `grundvand_depth_winter_m`, `grundvand_depth_summer_m`, `grundvand_model_uncertainty_m`, `geoteknik_jordart`
- **ARCH-243 (DHM)**: `terrain_slope_pct`, `terrain_low_point_m`, `bluespot_risk`
- **ARCH-244 (Plandata ext)**: `zone_type`, `landzone_permit_required`, `lokalplan_byggefelt_present`, `within_building_field`, `spildevand_status`
- **ARCH-245 (DAI ext)**: `natura2000`, `paragraph3_nature`, `protected_dige`, `fortidsminde`, `fortidsminde_buffer`
