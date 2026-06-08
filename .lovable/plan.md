# ArchAI Frontend Alignment Plan

## 1. Backend Surface That The Frontend Must Consume

### 1.1 New / changed server functions (`createServerFn`)

| Module                                       | Function                                                                                                            | Status in UI                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/lib/cockpit.functions.ts`               | `fetchCompliance`, `runByggeanalyse` (now server-gated by `projectId` + Hard-Stop)                                  | Used by `useCockpitAnalysis` — input shape changed (must pass `projectId`, schema-validated)    |
| `src/lib/ai-design.functions.ts`             | `generateDesignProposals` (server-side Hard-Stop gate via `projectId`/`addressId`)                                  | `useAiDesignWorkflow` already calls it; UI must surface `kilde: "placeholder"` fallback         |
| `src/lib/billede-analyse.functions.ts`       | `uploadBillede`, `analyserBillederFn`                                                                               | Wired via `useAiDesignWorkflow`                                                                 |
| `src/lib/br18.functions.ts`                  | `getBr18Compliance`, `updateBr18Evidence`                                                                           | **No route consumes these yet** — `Br18KravMatrix` is orphaned                                  |
| `src/lib/floor-plan/floor-plan.functions.ts` | `loadActiveFloorPlanFn`, `generateFloorPlanFn`, `verifyFloorPlanFn`, `applyFloorPlanCommandFn`, `exportFloorPlanFn` | Wired in `projekt.$id.plantegning` via `FloorPlanEditor` — needs verification panel + export UI |
| `src/routes/api.drawing.ts`                  | `exportBeliggenhedsplanFn` (now writes `drawing_exports`)                                                           | Used in `projekt.teknik` — missing history list + readiness gating                              |
| `src/lib/adresse.functions.ts`               | `searchAddresses` (new `/husnummer` endpoint, deprecated DAWA)                                                      | Used in `/projekt/adresse` — verify result shape                                                |
| `src/lib/project-sync.ts`                    | `serverCreateProject/SaveProject/LoadProject/DeleteProject`                                                         | Used; `ProjectPatch` shape expanded — see § 1.3                                                 |

### 1.2 New `ComplianceResult` fields (must flow into `useProject`)

Added since the overhaul, currently **not rendered**:

- `tjekditnetCoverage` (bredbåndsdækning, ARCH-247)
- `energimaerke` (EMOData, ARCH-248)
- `plandataContext` (zone, byggefelt, spildevand, ARCH-244)
- `arealdataContext` (natur/kultur/miljø overlap, ARCH-245)
- `matGeometri` (parcelpolygon + skel-metrics, ARCH-240)
- `addressPatch` (DAR/MAT enrichment to merge back into `address`)
- `serviceStates` (per-source `success | no_hit | error | skipped | mock | cache_hit | mock_cache_hit | not_run`)
- `analysisRunId` (tracing — needed for "source details" drawer)
- Surroundings: `neighborContextFacts`, plandata-surroundings, MST-noise

### 1.3 New persisted columns on `projects` already restored by `project-persistence`

- `heritage_save_value`, `is_fredet`, `grundareal_m2`, `bebygget_areal_m2`
- `hard_stop`, `hard_stop_reason`
- `budget_estimate`, `bfe_nr`
- `billedanalyse` (JSONB), `hus_dna` (JSONB)
- `address_*` enrichment fields

Sister tables: `site_constraints` (BR18 + jordforurening + GEUS/DHM + plandata/arealdata ext + broadband + noise/neighbor), `address_source_results` (per-source trace), `design_iterations` (canonical), `building_tasks` (derived), `drawing_exports`, `floor_plan_iterations/_commands/_verifications/_exports`, `br18_*`.

### 1.4 New data contracts

- `RuleEngine*` types now live in `src/domain/contracts/rule-engine.types.ts`
- `analysis.types.ts`, `surroundings.types.ts`, `noise.types.ts`, `geodanmark.types.ts`, `beliggenhedsplan.types.ts`, `floor-plan.types.ts`
- All boundary I/O validated by Zod in `src/types/project-restore.schemas.ts` + `project-sync.schemas.ts` — frontend must use these schemas, never raw `as` casts.

## 2. Frontend Gaps

1. **Cockpit "Analyse" tab** does not show: tjekditnet, energimærke, arealdata, dkjord, matGeometri, plandataContext, surroundings/noise, neighborContextFacts → must be added as new `DetailsSection` cards in `AnalyseTab`.
2. **Per-source state pills**: `PIPELINE_SERVICE_STATE_LABELS` is rendered only for `naboer` — must propagate to every datakilde card + the `CockpitStatusBar`.
3. **`addressPatch`** returned by orchestrator is not merged into `useProject.address` — DAR enrichment is lost on next render.
4. **BR18 route is missing**: no `/projekt/$id/br18` exists; `Br18KravMatrix` + `use-project-br18-compliance` hook are wired but no route uses them.
5. **Beliggenhedsplan history**: `drawing_exports` table is populated but `projekt.teknik` shows only the latest result.
6. **Floor plan editor**: `VerificationPanel` exists but the editor route does not surface verification results, command-replay history, or export downloads.
7. **AI design Hard-Stop UX**: server now refuses without `projectId`/`addressId`; the `AiDesignHero` button must disable + explain when no project exists yet.
8. **Free design cockpit** (`/projekt/$id/cockpit` with `id="frit"`) must hide all compliance UI and route around the new server gates.
9. **`useCockpitAnalysis`** must (a) write `serviceStates` + `analysisRunId` into store, (b) apply `addressPatch`, (c) mark `dataStatus` per source from the new states.
10. **Restore flow** (`useCockpitRestore`) must hydrate all new typed fields and surface "stale/missing" via `deriveSourceStatus` for the new kinds (`tjekditnet`, `energimaerke`, `arealdata`, `dkjord`, `matGeometri`).

## 3. Frontend Architecture Decisions

- **State**: keep Zustand `useProject` as the single read model; do **not** introduce per-view `useState` mirrors. New fields must follow the existing `setX/setXBulk` pattern.
- **Data fetching**: continue using `useServerFn` + thin custom hooks (`useCockpitAnalysis`, `useAiDesignWorkflow`, `useFloorPlanEditor`, new `useBr18Compliance`, new `useBeliggenhedsplan`). No direct Supabase calls from components (Rule 2).
- **Caching/refresh**: `CockpitStatusBar` already exposes "Genindlæs alt"; extend it with per-source refresh hooks (later phase) when single-source refresh fns are added.
- **Auth/error**: keep `withAuth`/`requireSupabaseAuth` server-side; in UI rely on `getSession()` + the `_authenticated`-style guard in cockpit. Display structured errors from server fns; never parse free-text. Use `kilde` field for source attribution.
- **Loading**: prefer "render now, mark missing sources" (already implemented via `CockpitStatusBar`) over blocking spinners. Floor plan + BR18 routes follow the same pattern.

## 4. Phased Implementation Roadmap

### Phase 0 — Contract Sync (no UI changes)

Verify `src/types/project-sync.schemas.ts` and `project-restore.schemas.ts` cover every new field in `ComplianceResult`, `ProjectPatch`, and persisted columns. Add missing entries (`tjekditnetCoverage`, `energimaerke`, `plandataContext`, `arealdataContext`, `matGeometri`, `neighborContextFacts`, `addressPatch`, `serviceStates`, `analysisRunId`) and corresponding store setters in `project-store.ts`.
Aligns with: `cockpit.functions.ts`, `analysis-orchestrator.ts`, `project-persistence.ts`.

### Phase 1 — Cockpit Restore + Sync Pipeline

- Extend `useCockpitRestore` to hydrate new typed fields and seed `dataStatus` via `deriveSourceStatus` for all new `DataSourceKind`s.
- Extend `useCockpitAnalysis` `.then(result => ...)` to:
  - apply `result.addressPatch` to `address`,
  - write `result.serviceStates` to store,
  - bulk-mark `dataStatus` from `serviceStates` (success/cache_hit → fresh, no_hit/skipped → missing, error → error, mock\* → stale-with-warning).
- Update `syncPatch` callers to include new fields.
  Aligns with: `useCockpitAnalysis.ts`, `useCockpitRestore.ts`, `project-sync.ts`, `project-persistence.ts`.

### Phase 2 — Cockpit Surface for New Data Sources

Add `DetailsSection` cards (with `PipelineServiceState` pills) to `AnalyseTab` for:

- Bredbåndsdækning (`tjekditnetCoverage`)
- Energimærke (`energimaerke`)
- Arealdata & miljø (`arealdataContext`)
- Jordforurening (`dkjord`)
- Plandata-kontekst (zone/byggefelt/spildevand) — `plandataContext`
- Parcelgeometri / skel-metrics — `matGeometri`
- Stoej & omgivelser — surroundings + noise
  Extend `EjendomPanel` "Datakilder" to enumerate every kind from `DATA_SOURCE_LABELS`.
  Aligns with: `AnalyseTab.tsx`, `EjendomPanel.tsx`, `DataSourceStatus.tsx`, `CockpitStatusBar.tsx`.

### Phase 3 — AI Design + Byggeanalyse Gating

- `AiDesignHero`: require `currentProjectId` before enabling "Generér"; show "Vælg adresse + opret projekt først" otherwise. Display `kilde: "placeholder"` badge when AI gateway is unavailable.
- Wire `runByggeanalyse` (now server-gated) into cockpit with `projectId` from store; surface returned `hardStopTriggered`/`hardStopReason` via existing `HardStopBanner`.
  Aligns with: `ai-design.functions.ts`, `byggeanalyse.server.ts`, `useAiDesignWorkflow.ts`, `AiDesignHero.tsx`.

### Phase 4 — BR18 Module

New route `src/routes/projekt.$id.br18.tsx`:

- Calls `getBr18Compliance` with `Br18ProjectFacts` assembled from store (`bbrData`, `byggeoenske`, site_constraints fields).
- Renders existing `Br18KravMatrix` with `applicabilityResults` + per-requirement evidence ledger.
- `updateBr18Evidence` wired from row-level "Markér som dokumenteret" actions.
- Show `authorityReadiness` badge + reuse `HardStopBanner` for `hardStopTriggered`.
  Aligns with: `br18.functions.ts`, `services/br18-compliance.service.server.ts`, `Br18KravMatrix.tsx`, `use-project-br18-compliance.ts`.

### Phase 5 — Floor Plan Editor Polish

- `projekt.$id.plantegning`: surface `verifyFloorPlanFn` results via `VerificationPanel`; show `exportFloorPlanFn` downloads (SVG + PDF) and persist via existing repo.
- Add command-history strip (read from `floor_plan_commands` via a new `listFloorPlanCommandsFn` if not present — otherwise inline in `applyFloorPlanCommandFn` result).
- Ensure `useFloorPlanEditor` stops re-fetching active iteration when the canonical hash matches.
  Aligns with: `floor-plan.functions.ts`, `FloorPlanEditor.tsx`, `VerificationPanel.tsx`, `useFloorPlanEditor.ts`.

### Phase 6 — Beliggenhedsplan / Myndighedstegning

- Extend `projekt.teknik`:
  - Pre-flight readiness card driven by `decision-engine` (`AUTO_REVIEW` / `SURVEY_REQUIRED` / `BLOCKED_*`).
  - History list of `drawing_exports` (new server fn `listDrawingExportsFn`) with download links.
  - Surveyor attestation form (`surveyorName`, `surveyorLicenseNr`) when readiness === `SURVEY_REQUIRED`.
- Keep export logic in `exportBeliggenhedsplanFn`; UI only orchestrates form + display.
  Aligns with: `api.drawing.ts`, `services/drawing/*`, `domain/drawing/decision-engine.ts`, `drawing.repository.ts`.

### Phase 7 — Datacheck + Tracing Transparency

- Datacheck page: hook into `address_source_results` (new `listSourceResultsFn`) to show per-source `errorDetails` + cache transparency badges.
- Add "Datakilde-detaljer"-drawer in cockpit using `analysisRunId` → list source results.
  Aligns with: `address_source_results`, `analysis-tracing.ts`, `source-result.ts`.

### Phase 8 — QA + Regressions

- Playwright: address → cockpit (BBR+lokalplan render < 2s from cache), hard-stop banner, BR18 evidence toggle, floor-plan generate+verify+export, beliggenhedsplan export to PDF.
- Unit tests: pure renderers + classifiers only (per CLAUDE.md "what not to test").

## 5. Cross-Cutting Concerns

- **Auth**: every server-fn call must pass `accessToken` from `getSession()` exactly once (project-sync pattern). Components do not call Supabase directly.
- **Error UX**: use structured `serviceStates` instead of try/catch text; render typed pills with `PIPELINE_SERVICE_STATE_LABELS` and an optional "Se detaljer" link to the source result.
- **Loading UX**: prefer skeletons inside section cards over full-page spinners (the existing render-first pattern).
- **Feature flags**: gate Phase 4–6 behind `FEATURE_FLAGS` so they can ship incrementally.

## 6. Summary

The backend now exposes a much richer surface (10+ new data sources, BR18 engine, floor-plan editor, authority-grade beliggenhedsplan, per-source tracing). The frontend has the foundations (store, hooks, status bar, panels) but is missing: rendering of ~7 new data sources, the BR18 route, beliggenhedsplan history + readiness gating, floor-plan verify/export surfacing, AI-design Hard-Stop UX, and `addressPatch`/`serviceStates` integration.

Recommended order: **Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**, with each phase shippable independently behind feature flags.

Please confirm:

1. Should I follow this 9-phase order, or do you want to reprioritise (e.g. BR18 before new datakilde-cards)?
2. Should new datakilde-cards land in the existing **ANALYSE** tab or a new **DATAKILDER** tab?
3. Phase 7 (tracing/transparency) — is this for end-users or only for internal debug? That changes the UI surface significantly.
