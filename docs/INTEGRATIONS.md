# Integrations

> Current-state reference for `src/integrations/`. `AGENTS.md` and `CLAUDE.md`
> define agent rules; this file gives the operational detail.

Server-side integrations must not be imported directly in route files. Wrap calls in
`createServerFn` and keep env access behind `src/lib/env.ts`.

## Source Policy

- Datafordeler GraphQL is the authoritative source for DAR, BBR, MAT, EBR,
  VUR and GeoDanmark Vektor (`GEODKV`). MAT parcel geometry still uses the
  approved MAT WFS geometry endpoint.
- DAWA/Dataforsyningen REST must not be used as compliance or register fallback.
- Allowed exception: `GsearchService` may call Dataforsyningen GSearch v2 for
  address autocomplete only. Selected addresses are enriched from DAR before use.
- Allowed exception: WMTS/map tiles may be used as visual background, never SSOT.
- `NaboService` remains deprecated. Neighbor context must use GeoDanmark via
  Datafordeler, not DAWA.

## Services (`src/integrations/`)

| Service                            | File                                        | Status                   | Notes                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GsearchService`                   | `gsearch/client.ts`                         | ✅ Live                  | Address autocomplete via GSearch v2. UX-only; not a compliance source.                                                                                                                                                                                                      |
| `DarService`                       | `dar/client.ts`                             | ✅ Live                  | Address, husnummer, adressepunkt, coordinates and MAT keys via DAR GraphQL v1.                                                                                                                                                                                              |
| `BbrService`                       | `bbr/client.ts`                             | ✅ Live                  | Canonical building selection, BBR areas/materials/heating/fredning via BBR GraphQL v2.                                                                                                                                                                                      |
| `MatService`                       | `mat/client.ts`                             | ✅ Live                  | Plot area and MAT hard-stop flags from MAT_Jordstykke.                                                                                                                                                                                                                      |
| `MatGeometryService`               | `mat/geometry.ts`                           | ✅ Live                  | Parcel polygon + metrics (area, centroid, bbox) via MAT WFS CQL_FILTER on jordstykke id_lokalId.                                                                                                                                                                            |
| `GrundarealResolver`               | `mat/grundareal-resolver.ts`                | ✅ Live                  | Datafordeler-only fallback for plot area via EBR/BFE/SFE/MAT_Ejerlejlighed.                                                                                                                                                                                                 |
| `EbrService`                       | `ebr/client.ts`                             | ✅ Live                  | BFE lookup from `husnummerLokalId`; feeds VUR and property context.                                                                                                                                                                                                         |
| `VurService`                       | `vur/client.ts`                             | ✅ Live                  | Public property/land valuation via VUR GraphQL.                                                                                                                                                                                                                             |
| `PlandataService`                  | `plandata/client.ts`                        | ✅ Live                  | Lokalplaner, kommuneplanrammer and PDF links via WFS.                                                                                                                                                                                                                       |
| `FjernvarmeService`                | `plandata/fjernvarme.ts`                    | ✅ Live                  | District-heating coverage via Plandata WFS.                                                                                                                                                                                                                                 |
| `NaturbeskyttelseService`          | `sdfi/naturbeskyttelse.ts`                  | ✅ Live                  | DAI WFS protection lines; MAT remains SSOT for MAT-specific flags.                                                                                                                                                                                                          |
| `ArealdataService`                 | `arealdata/client.ts`                       | ⚠️ Endpoint verify       | Extended Arealdata screening for §3, Natura 2000, diger, fortidsminder, BNBO, OSD and råstofområder. Tri-state output (`true/false/null`) prevents API errors from being interpreted as no restriction while Miljøportal WFS endpoint/layer verification is still pending.  |
| `FbbService`                       | `fbb/client.ts`                             | ✅ Live                  | SAVE/fredning via Kulturarv/FBB WFS, keyed by BBR-derived `ois_id` values or address fallback.                                                                                                                                                                              |
| `CacheService`                     | `cache/client.ts`                           | ✅ Live                  | `address_analysis` and `address_source_results` cache helpers.                                                                                                                                                                                                              |
| Supabase                           | `supabase/`                                 | ✅ Live                  | Auth, `projects` persistence and typed compliance sync.                                                                                                                                                                                                                     |
| `PdfExtractorService`              | `ai/pdf-extractor.ts`                       | ✅ Live                  | Lokalplan PDF extraction via Claude when `ANTHROPIC_API_KEY` is available.                                                                                                                                                                                                  |
| `HusDnaGeneratorService`           | `ai/hus-dna-generator.ts`                   | ✅ Live                  | Inspiration images/text to Hus-DNA via Claude, with feature-flag mock fallback.                                                                                                                                                                                             |
| `BilledeAnalyseService`            | `ai/billede-analyse.ts`                     | ✅ Live                  | Inspiration image analysis via Claude, with feature-flag mock fallback.                                                                                                                                                                                                     |
| `ByggeanalyseService`              | `ai/byggeanalyse.ts`                        | ✅ Live                  | AI building analysis with rule-engine context.                                                                                                                                                                                                                              |
| `GeoDanmarkSiteContextService`     | `geodanmark/site-context.ts`                | Live                     | GeoDanmark Vektor via Datafordeler GraphQL `GEODKV/v2`. Fetches `GEODKV_Bygning` and optional `GEODKV_Vejmidte`, decodes `geometri.wkt`, classifies own vs neighbor buildings from MAT parcel geometry/BBR UUIDs, and returns typed site context.                           |
| `handleGeoDanmarkNeighborAnalysis` | `lib/geodanmark-neighbor-context.server.ts` | Live application service | Checks `address_source_results` cache for `geodanmark_nabo`, calls `GeoDanmarkSiteContextService` on miss, caches the validated site context, derives legacy `NeighborBuildingData`, and syncs typed neighbor summary columns to `site_constraints` for live non-mock data. |
| `GeoDanmarkNaboService`            | `geodanmark/client.ts`                      | Live facade              | Legacy `NeighborBuildingData` facade over `GeoDanmarkSiteContextService`. Replaces the old WFS skeleton after `GeoDanmark_WFS` returned 503. Controlled by `FEATURE_GEODANMARK_MOCK` for mock fallback.                                                                     |
| `NaboService`                      | `bbr/neighbor-client.ts`                    | ⚠️ Superseded            | Returnerer tom liste. Superseded by GeoDanmarkNaboService (ARCH-240).                                                                                                                                                                                                       |
| `TinglysningService`               | `tinglysning/client.ts`                     | 🟡 IS_MOCK=true          | TingbogenV2 requires separate Datafordeler access/schema verification.                                                                                                                                                                                                      |
| `DkJordService`                    | `miljoe/dkjord.ts`                          | 🟡 IS_MOCK=true          | Soil contamination model exists; live DK-Jord WFS remains to be verified.                                                                                                                                                                                                   |
| `GeusService`                      | `geus/client.ts`                            | 🟡 Mock flag default     | GEUS/Jupiter groundwater adapter on `SourceResult<T>`; live path is boundary-validated against `jupiter_pejlinger` on `ows/25832.jsp`. `radonRisk` remains explicit degraded `unknown` in live mode until a verified GEUS radon layer is available.                         |
| `DhmService`                       | `sdfi/dhm-client.ts`                        | 🟡 Mock flag default     | DHM terrain adapter on `SourceResult<T>`; wired to Datafordeler WCS 1.0.0 (`wcs.datafordeler.dk/.../dhm_wcs`) with `dhm_terraen`. Live path is gated by `FEATURE_DHM_MOCK=false` until GeoTIFF parsing is verified against production responses.                            |

## `BbrKompliantData`

| Field                                         | Source                 | Description                                        |
| --------------------------------------------- | ---------------------- | -------------------------------------------------- |
| `byggeaar`                                    | BBR `byg026`           | Construction year for canonical building.          |
| `bebygget_areal`                              | BBR `byg041`           | Footprint area for canonical building.             |
| `samlet_areal`                                | BBR `byg038`           | Total building area.                               |
| `antal_etager`                                | BBR `byg054`           | Number of floors.                                  |
| `anvendelseskode` / `anvendelse_tekst`        | BBR `byg021`           | Use code and readable label.                       |
| `grundareal`                                  | MAT/GrundarealResolver | Plot area; never from DAWA.                        |
| `bebyggelsesprocent` / `beregning_mulig`      | Calculated             | Footprint percentage and calculation availability. |
| `varmeinstallation` / `opvarmningsmiddel`     | BBR `byg056`/`byg057`  | Heating baseline.                                  |
| `ydervaegs_materiale` / `tagdaekning`         | BBR `byg032`/`byg033`  | Material context for AI/design.                    |
| `fredet`                                      | BBR `byg070`           | BBR fredning flag; supplemented by FBB/DAI.        |
| `mat_strandbeskyttelse`                       | MAT_Jordstykke         | Typed hard-stop input.                             |
| `mat_fredskov`                                | MAT_Jordstykke         | Typed hard-stop input.                             |
| `mat_klitfredning`                            | MAT_Jordstykke         | Typed hard-stop input.                             |
| `bygning_lokal_id` / `alle_bygning_lokal_ids` | BBR `id_lokalId`       | BBR UUIDs for canonical/all buildings.             |
| `alle_bbr_public_ids`                         | Derived from BBR ids   | FBB `ois_id` candidates; no BBR Public REST call.  |
| `fbb_reference`                               | BBR `byg071`           | Optional FBB registration reference.               |
| `jordstykke_lokal_id`                         | MAT_Jordstykke         | Primary parcel id for map/geometry.                |
| `canonical_building_lokal_id`                 | BBR selection          | Selected primary building id.                      |
| `canonical_selection_reason`                  | BBR selection          | Why the canonical building was selected.           |
| `canonical_candidates_count`                  | BBR selection          | Candidate count in selection.                      |
| `aggregated_bebygget_areal_all_primary`       | BBR aggregation        | Aggregate primary building footprint.              |
| `bygning_samlet_boligareal`                   | BBR `byg039`           | Residential floor area for canonical building.     |
| `fejl`                                        | Integration layer      | Error message, or `null` on success.               |

## Datafordeler GraphQL Constraints

These constraints fail quietly if violated:

- One root field per query (`DAF-GQL-0010`).
- `virkningstid` is required on Datafordeler queries (`DAF-GQL-0009`).
- Avoid aliases (`DAF-GQL-0008`).
- Introspection is disabled (`HC0046`).
- API key is sent as `?apiKey=...`, not as an `Authorization` header.

Use the bitemporal helper in `src/integrations/datafordeler/bitemporal.ts` for
new Datafordeler clients.

## Persistence Contract

- Compliance-critical values go to typed columns on `projects` and/or
  `site_constraints`.
- Raw/intermediate screening results go to `address_source_results`.
- GeoDanmark raw geometry/site context is cached as `address_source_results`
  `source_kind = "geodanmark_nabo"` with a Zod-validated payload and 90 day TTL.
  Error results are not cached, so transient Datafordeler failures such as HTTP
  503 do not become a fresh 90 day cache entry.
  Building lookups use a parcel-near query window for nearest/count facts, while
  road centerlines may use a wider query window for access-road context.
  Live non-mock derived neighbor facts are also written to typed
  `site_constraints` columns: `neighbor_building_count_40m`,
  `neighbor_nearest_building_distance_m`, `road_nearest_centerline_distance_m`,
  `access_road_nearby` and `neighbor_context_confidence`.
  The cockpit restores these typed columns into the consumer read model as
  due-diligence context; they are not Hard Stop inputs by themselves.
- Drawing road names are resolved from DAR/Datafordeler address labels through
  `DarService`, not from Dataforsyningen REST.
- `compliance_data JSONB` is an archive, not the source of truth.
- Never read or write `projekter`; it was dropped in migration `20260515100000`.

## Live Smoke Flags

- `RUN_LIVE_DATAFORDELER_SMOKE=true` enables existing Datafordeler smoke tests.
- `RUN_LIVE_GEODANMARK_SMOKE=true` enables the GEODKV live smoke in
  `src/integrations/geodanmark/site-context.live-smoke.test.ts`.
- `RUN_LIVE_GEUS_SMOKE=true` with `FEATURE_GEUS_MOCK=false` enables GEUS live smoke in `tests/live/geus-dhm.live.test.ts`.
- `RUN_LIVE_DHM_SMOKE=true` with `FEATURE_DHM_MOCK=false` enables DHM live smoke in `tests/live/geus-dhm.live.test.ts`.
