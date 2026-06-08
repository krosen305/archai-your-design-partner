# Naturbeskyttelse - Authority-Grade Source And Implementation Plan

**Date:** 2026-06-07
**Status:** Runtime implementation added; all five target geometry sources live-verified
**Scope:** Naturbeskyttelse geometry for beliggenhedsplan and byggeansoegning.

This document upgrades the earlier naturbeskyttelse plan from code-reading plus
candidate sources to a live-verified implementation plan. It corrects one
important assumption in the existing phase-2 plan: `https://wfs2-miljoegis.mim.dk/natur`
is live, but it does not expose the five required building/protection line
feature types.

Initial runtime implementation now exists in:

- `src/integrations/naturbeskyttelse/geometry-adapter.ts`
- `src/integrations/geodanmark/drawing-layers.ts`
- `src/services/drawing/assemble-beliggenhedsplan.service.ts`
- `src/lib/drawing/drawing-model-builder.ts`
- `src/integrations/arealdata/client.ts`

---

## 1. Target datapoints

| Datapoint                     |                Required geometry | Legal/use note                                                            |
| ----------------------------- | -------------------------------: | ------------------------------------------------------------------------- |
| Strandbeskyttelseslinje       | Polygon/line zone, usually 300 m | Naturbeskyttelsesloven section 15. Authority: Kystdirektoratet.           |
| Skovbyggelinje                |              Polygon zone, 300 m | Naturbeskyttelsesloven section 17. Must not be conflated with `fredskov`. |
| Aabeskyttelseslinje           |              Polygon zone, 150 m | Naturbeskyttelsesloven section 16.                                        |
| Fortidsmindebeskyttelseslinje |              Polygon zone, 100 m | Naturbeskyttelsesloven section 18. Municipality is authority.             |
| Klitfredning                  |                          Polygon | Naturbeskyttelsesloven section 8. Authority: Kystdirektoratet.            |

Adjacent existing layer: `soebeskyttelse` is already fetched in the current
screening service and should probably be kept with `aabeskyttelse` because both
belong to section 16 logic.

---

## 2. Live source verification

Read-only probes were run on 2026-06-07 and 2026-06-08.

### 2.1 Miljoestyrelsen MIM WFS `/natur`

Endpoint:

```text
https://wfs2-miljoegis.mim.dk/natur/ows?service=wfs&version=1.1.0&request=GetCapabilities
```

Result:

| Check                                  | Result                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| HTTP status                            | 200                                                                                                                           |
| Feature types found                    | `natur:ais_par3`, `natur:natura_2000_omraader`, `natur:skov_kortlaegning_2016_2018`, `natur:soe_kortlaegning_2014_2018`, etc. |
| Required protection line feature types | Not present                                                                                                                   |
| Implementation status                  | Do not use for these five datapoints.                                                                                         |

Conclusion: The endpoint exists, but it is the wrong source for this task.

### 2.2 Danmarks Miljoeportal Arealeditering GeoServer

Endpoint:

```text
https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs
```

Capabilities result:

| Check         | Result                                |
| ------------- | ------------------------------------- |
| HTTP status   | 200                                   |
| Auth          | None required                         |
| Output tested | `application/json`                    |
| CRS tested    | `srsName=EPSG:25832`                  |
| BBOX tested   | `bbox=minx,miny,maxx,maxy,EPSG:25832` |

Verified feature types:

| Datapoint           | TypeName               |       GetFeature result | Geometry                                                    |
| ------------------- | ---------------------- | ----------------------: | ----------------------------------------------------------- |
| Skovbyggelinje      | `dai:skovbyggelinjer`  |                      OK | `MultiPolygon`                                              |
| Aabeskyttelseslinje | `dai:aa_bes_linjer`    |                      OK | `MultiPolygon`                                              |
| Soebeskyttelse      | `dai:soe_bes_linjer`   |                      OK | `MultiPolygon`                                              |
| Kirkebyggelinje     | `dai:kirkebyggelinjer` | Present in capabilities | Current screening uses it; not part of this requested five. |

Probe bboxes for future smoke tests:

| Layer                 | BBOX EPSG:25832                 | Result     |
| --------------------- | ------------------------------- | ---------- |
| `dai:skovbyggelinjer` | `658800,6056400,659100,6056800` | 2 features |
| `dai:aa_bes_linjer`   | `496166,6161603,496567,6162004` | 5 features |
| `dai:soe_bes_linjer`  | `512677,6134465,513078,6134866` | 3 features |

### 2.3 Slots- og Kulturstyrelsen Fund og Fortidsminder WFS

Endpoint:

```text
https://www.kulturarv.dk/ffgeoserver/public/wfs
```

Capabilities result:

| Check                  | Result                                         |
| ---------------------- | ---------------------------------------------- |
| HTTP status            | 200                                            |
| Auth                   | None required                                  |
| Candidate feature type | `public:fundogfortidsminder_areal_beskyttelse` |
| Output tested          | `application/json`                             |
| CRS tested             | `srsName=EPSG:25832`                           |
| BBOX tested            | `bbox=minx,miny,maxx,maxy,EPSG:25832`          |
| Geometry               | `MultiPolygon`                                 |

GetFeature probe:

```text
typeName=public:fundogfortidsminder_areal_beskyttelse
maxFeatures=1
outputFormat=application/json
srsName=EPSG:25832
```

The layer returned GeoJSON with properties including:

```text
beskyttelse_areal_lbnr, systemnr, stednr, loknr, sbext, frednr,
anlaegstype, datering, url, fred_status
```

Probe bbox for future smoke tests:

| Layer                                          | BBOX EPSG:25832                 | Result     |
| ---------------------------------------------- | ------------------------------- | ---------- |
| `public:fundogfortidsminder_areal_beskyttelse` | `548900,6301500,549100,6301700` | 2 features |

Conclusion: This is the best verified source candidate for
`fortidsmindebeskyttelseslinje`.

### 2.4 Datafordeler MAT WFS

Endpoint used by current code:

```text
https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS
```

Expected feature types in current code:

| Datapoint         | TypeName                               |
| ----------------- | -------------------------------------- |
| Strandbeskyttelse | `mat:StrandbeskyttelseFlade_Gaeldende` |
| Klitfredning      | `mat:KlitfredningFlade_Gaeldende`      |

Live result:

| Check                                           | Result                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Without API key                                 | 401                                                                                                                 |
| With trimmed local `.env.local` API key          | 200                                                                                                                 |
| `GetCapabilities`                               | 200, capabilities include both `StrandbeskyttelseFlade_Gaeldende` and `KlitfredningFlade_Gaeldende`                 |
| `DescribeFeatureType`                           | 200, `application/gml+xml`                                                                                          |
| `GetFeature` strand, `count=1`                  | 200, `numberMatched="60810"`, GML polygon under `mat:geometri`                                                      |
| `GetFeature` klit, `count=1`                    | 200, `numberMatched="5343"`, GML polygon under `mat:geometri`                                                       |
| CRS                                             | Capabilities default CRS is `urn:ogc:def:crs:EPSG::25832`; adapter uses that CRS for MAT `srsname` and `bbox`.      |
| Implementation status                           | Live geometry verified and covered by gated smoke test `RUN_LIVE_NATURBESKYTTELSE_WFS=true`.                       |

Probe bboxes for future smoke tests:

| Layer                                    | BBOX EPSG:25832                 | Result              |
| ---------------------------------------- | ------------------------------- | ------------------- |
| `mat:StrandbeskyttelseFlade_Gaeldende`   | `891460,6127440,891485,6127470` | Live smoke hit      |
| `mat:KlitfredningFlade_Gaeldende`        | `542590,6358950,542645,6358990` | Live smoke hit      |

Conclusion: MAT WFS is the verified source for strand and klit geometry.

---

## 3. Canonical source matrix

| Datapoint                     | Recommended source              | Status             | Notes                                                                                                           |
| ----------------------------- | ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Strandbeskyttelseslinje       | Datafordeler MAT WFS            | Verified           | Uses `mat:StrandbeskyttelseFlade_Gaeldende`, GML polygon, EPSG:25832 via MAT default CRS.                       |
| Skovbyggelinje                | Danmarks Miljoeportal GeoServer | Verified           | Use `dai:skovbyggelinjer`, GeoJSON `MultiPolygon`, EPSG:25832, BBOX.                                            |
| Aabeskyttelseslinje           | Danmarks Miljoeportal GeoServer | Verified           | Use `dai:aa_bes_linjer`, GeoJSON `MultiPolygon`, EPSG:25832, BBOX.                                              |
| Fortidsmindebeskyttelseslinje | SLKS Fund og Fortidsminder WFS  | Verified candidate | Use `public:fundogfortidsminder_areal_beskyttelse`. Legal semantics still need product/architecture sign-off.   |
| Klitfredning                  | Datafordeler MAT WFS            | Verified           | Uses `mat:KlitfredningFlade_Gaeldende`, GML polygon, EPSG:25832 via MAT default CRS.                            |

Do not use `wfs2-miljoegis.mim.dk/natur` for these five datapoints unless a
future capabilities check exposes the required feature types.

---

## 4. Current repo state

Current screening:

- `src/integrations/sdfi/naturbeskyttelse.ts`
  - Fetches boolean point-overlap for `skovbyggelinje`, `aabeskyttelse`,
    `soebeskyttelse`, `kirkebyggelinje`, `strandbeskyttelse`, `klitfredning`.
  - Uses DMP GeoServer for skov/aa/soe/kirke.
  - Uses MAT WFS for strand/klit.
  - No `fortidsmindebeskyttelseslinje`.
  - Per-layer failures can become `false` in the data payload, with lower
    confidence. That is not authority-grade enough for compliance truth.

Current arealdata:

- `src/integrations/arealdata/client.ts`
  - Has `fortidsminde` and `fortidsmindeBuffer` fields.
  - Explicitly returns `null` because the source was not verified.
  - This spike identifies a verified candidate WFS layer to unblock that work.

Current beliggenhedsplan:

- `src/domain/drawing/beliggenhedsplan.types.ts`
  - Already has `NaturbeskyttelseLayer` with the requested geometry types.
- `src/domain/drawing/ports.ts`
  - Already has `fetchNaturbeskyttelse(bbox25832)`.
- `src/integrations/geodanmark/drawing-layers.ts`
  - Currently returns `[]` for `fetchNaturbeskyttelse`.
- `src/services/drawing/assemble-beliggenhedsplan.service.ts`
  - Currently sets `naturbeskyttelse: []`.

Current persistence:

- `site_constraints` has typed columns for `strandbeskyttelse`, `fredskov`,
  `klitfredning`, plus several arealdata booleans.
- It does not have typed authority columns for `skovbyggelinje`,
  `aabeskyttelseslinje`, or `fortidsmindebeskyttelseslinje`.
- `address_source_results` exists and is the right cache for raw geometry
  payloads that are not yet hard-stop source of truth.

---

## 5. Implementation sequence

### Phase A - Codex-safe geometry adapter

Create:

```text
src/integrations/naturbeskyttelse/wfs-types.ts
src/integrations/naturbeskyttelse/wfs-client.ts
src/integrations/naturbeskyttelse/geometry-adapter.ts
src/integrations/naturbeskyttelse/geometry-adapter.test.ts
```

Responsibilities:

1. Fetch DMP GeoJSON layers by `bbox` in `EPSG:25832`.
2. Fetch SLKS GeoJSON layer by `bbox` in `EPSG:25832`.
3. Fetch MAT WFS for strand/klit with `DATAFORDELER_API_KEY`.
4. Validate every external response with Zod or explicit decoders.
5. Convert verified features into `NaturbeskyttelseLayer[]`.
6. Return layer-level degraded states instead of silently returning `false`.
7. Keep all WFS details inside the adapter.

Do not call this adapter from React components.

### Phase B - Drawing port integration

Modify:

```text
src/integrations/geodanmark/drawing-layers.ts
src/services/drawing/assemble-beliggenhedsplan.service.ts
```

Required changes:

1. Implement `fetchNaturbeskyttelse(bbox25832)`.
2. Replace hardcoded `naturbeskyttelse: []` with fetched/cached layers.
3. Compute `intersectsProposedBuilding` deterministically against the proposed
   footprint before rule/readiness decisions consume the layer.
4. Keep `utilities`, `LER`, `kloak`, and other phase-2 layers separate.

### Phase C - Cache through `address_source_results`

Use existing cache helpers where possible:

```text
src/integrations/cache/client.ts
src/integrations/cache/decoders.ts
```

Recommended cache key:

```text
source_kind = "naturbeskyttelse_geometry"
```

Payload:

```text
SourceResult<NaturbeskyttelseLayer[]>
```

Rules:

1. Validate payload before writing.
2. Validate payload after reading.
3. Cache raw/intermediate geometry here.
4. Do not treat `address_source_results` as compliance source of truth.

### Phase D - Application service

Create or update:

```text
src/lib/site-geometry.server.ts
src/lib/site-geometry.functions.ts
```

Pattern:

1. Server function validates input.
2. Server function resolves auth with `withAuth()`.
3. Server function dynamically imports application service.
4. Application service calls adapters and repositories.
5. Repositories own Supabase writes.

No raw Supabase queries in server functions.

### Phase E - Review-gated compliance authority

This phase requires architecture/human review before implementation.

Potential typed columns:

```text
site_constraints.skovbyggelinje
site_constraints.aabeskyttelseslinje
site_constraints.soebeskyttelseslinje
site_constraints.fortidsmindebeskyttelseslinje
site_constraints.naturbeskyttelse_geometry_fetched_at
site_constraints.naturbeskyttelse_geometry_confidence
```

Review questions:

1. Which findings are hard stops, warnings, or dispensation-required?
2. Should server AI/design gates block on WFS geometry overlap or on parcel
   membership?
3. How should degraded source state affect design generation?
4. Should `fredskov` remain in the same rule bucket as `skovbyggelinje`?
   Recommendation: no, split them.

---

## 6. Adapter output contract

Use existing domain type:

```text
NaturbeskyttelseLayer[]
```

Required mapping:

| Source layer                                   | Output `type`                             | `bufferDistanceM` |
| ---------------------------------------------- | ----------------------------------------- | ----------------: |
| `mat:StrandbeskyttelseFlade_Gaeldende`         | `strandbeskyttelse`                       |               300 |
| `dai:skovbyggelinjer`                          | `skovbyggelinje`                          |               300 |
| `dai:aa_bes_linjer`                            | existing domain literal for aabeskyttelse |               150 |
| `public:fundogfortidsminder_areal_beskyttelse` | `fortidsmindebeskyttelse`                 |               100 |
| `mat:KlitfredningFlade_Gaeldende`              | `klitfredning`                            |                 0 |

Implementation should use the existing `NaturbeskyttelseType` literals exactly
and avoid adding duplicate spellings.

---

## 7. Test plan

Unit tests:

1. Decode DMP `FeatureCollection` with `MultiPolygon`.
2. Decode SLKS `FeatureCollection` with `MultiPolygon`.
3. Reject malformed `features`.
4. Preserve degraded layer state when one source fails.
5. Assert no failed layer becomes authoritative `false`.
6. Assert bbox URL generation uses `EPSG:25832`.

Service tests:

1. Fake adapter returns layers and service writes validated cache.
2. Cache hit returns decoded layers.
3. Cache miss calls adapter.
4. Partial adapter failure returns degraded result and logs structured event.

Drawing tests:

1. `assembleBeliggenhedsplan` includes fetched naturbeskyttelse layers.
2. `intersectsProposedBuilding` is true when footprint crosses a layer polygon.
3. `intersectsProposedBuilding` is false when footprint is outside.

Optional live smoke tests, gated by env:

```text
RUN_LIVE_NATURBESKYTTELSE_WFS=true bun --env-file=.env.local test src/integrations/naturbeskyttelse/geometry-adapter.test.ts
```

Use the probe bboxes in section 2. Do not run live WFS tests in default unit CI.

Completion commands:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

---

## 8. Acceptance criteria

The implementation is complete when:

1. Beliggenhedsplan input contains non-empty `naturbeskyttelse` layers for known
   hit bboxes.
2. DMP and SLKS responses are validated at the boundary.
3. Fortidsmindebeskyttelseslinje is no longer permanently `null` due to missing
   source knowledge.
4. MIM `/natur` is not used for these five datapoints.
5. Datafordeler strand/klit geometry is live-verified and smoke-test gated.
6. No new direct Supabase calls are introduced outside repositories/helpers.
7. No compliance-critical value is made authoritative from JSONB alone.
8. `fredskov` and `skovbyggelinje` are not conflated in new authority-grade
   behavior.
