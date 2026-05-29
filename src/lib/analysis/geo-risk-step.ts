// src/lib/analysis/geo-risk-step.ts
// SERVER-SIDE ONLY. Layer 4: geodata services — matGeometri, FBB, naturbeskyttelse,
// dkjord, geus, terrain, naboer, fjernvarme.
//
// Ordering requirements:
//   1. matGeometri  — runs first so bbox25832 is available for GeoDanmark.
//   2. FBB          — runs second so SAVE value is available even on hard-stopped sites.
//   3. All others   — run in parallel (skipped if skipExpensive=true).

import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent, traceCacheRead } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { summarizeSourceResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type {
  FjernvarmeResultat,
  MatParcelGeometryPayload,
  NeighborBuildingData,
} from "@/domain/contracts/analysis.types";
import type {
  RuleEngineArealdataContext,
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEnginePlandataContext,
  RuleEngineTerrainData,
} from "@/domain/contracts/rule-engine.types";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";
import {
  ruleEngineArealdataContextSchema,
  ruleEngineGeusRiskDataSchema,
  ruleEnginePlandataContextSchema,
  ruleEngineTerrainDataSchema,
} from "@/types/project-restore.schemas";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GeoRiskInput = {
  addressId: string;
  koordinater: { lat: number; lng: number } | null;
  jordstykkeId: string | null; // complianceBase.bbr?.jordstykke_lokal_id ?? null
  bygningIds: string[]; // complianceBase.bbr?.alle_bygning_lokal_ids ?? []
  grundareal: number | null;
  skipExpensive: boolean; // result of shouldSkipExpensiveLayer4()
};

export type GeoRiskResult = {
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  dkjord: RuleEngineDkJordResultat | null;
  geusRisk: RuleEngineGeusRiskData | null;
  terrain: RuleEngineTerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: RuleEngineFbbResult | null;
  plandataContext: RuleEnginePlandataContext | null;
  arealdataContext: RuleEngineArealdataContext | null;
  matGeometri: MatParcelGeometryPayload | null;
  states: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

function deriveSourceState<T>(
  result: SourceResult<T> | null,
  cacheHit = false,
): PipelineServiceState {
  if (result === null) return "error";
  // P0/P1 #5: skeln cache-hits mellem mock og live så UI ikke fejlagtigt
  // viser mock-data som myndighedsdata. address_source_results.is_mock=true
  // → "mock_cache_hit"; live cache → "cache_hit".
  if (cacheHit) return result.isMock ? "mock_cache_hit" : "cache_hit";
  if (result.status === "mock") return "mock";
  if (result.status === "error") return "error";
  if (result.status === "skipped") return "skipped";
  return result.data !== null ? "success" : "no_hit";
}

// ---------------------------------------------------------------------------
// runGeoRiskStep
// ---------------------------------------------------------------------------

export async function runGeoRiskStep(
  input: GeoRiskInput,
  trace: AnalysisTraceContext,
): Promise<GeoRiskResult> {
  const { addressId, koordinater, jordstykkeId, bygningIds, grundareal, skipExpensive } = input;

  const states: Partial<Record<DataSourceKind, PipelineServiceState>> = {};

  let naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null = null;
  let dkjord: RuleEngineDkJordResultat | null = null;
  let geusRisk: RuleEngineGeusRiskData | null = null;
  let terrain: RuleEngineTerrainData | null = null;
  let naboer: NeighborBuildingData | null = null;
  let fjernvarme: FjernvarmeResultat | null = null;
  let fbbData: RuleEngineFbbResult | null = null;
  let plandataContext: RuleEnginePlandataContext | null = null;
  let arealdataContext: RuleEngineArealdataContext | null = null;
  let matGeometri: MatParcelGeometryPayload | null = null;

  // ── Step 1: MAT geometry ─────────────────────────────────────────────────
  // Runs before the parallel block so bbox25832 is available for GeoDanmark.
  if (jordstykkeId) {
    const matGeoResult = await traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer4",
        service: "Datafordeler MAT WFS",
        operation: "MatGeometryService.getParcelGeometry",
        inputSummary: `jordstykkeId=${jordstykkeId}`,
      },
      () =>
        import("@/integrations/mat/geometry").then(({ MatGeometryService }) =>
          MatGeometryService.getParcelGeometry(jordstykkeId, grundareal, addressId),
        ),
      {
        outputSummary: (r) =>
          summarizeSourceResult(
            r,
            (d) =>
              `area=${d.polygonAreaM2?.toFixed(0) ?? "null"} canonical=${d.hasCanonicalPolygon}`,
          ),
        metadata: (r) => ({
          source: r.kilde,
          isMock: r.isMock,
          feature_count: r.rawFeatureCount,
        }),
      },
    ).catch((e: Error) => {
      logServerEvent({
        module: "geo-risk-step",
        operation: "layer4.mat_geometry",
        severity: "degraded",
        message: "MatGeometryService fejlede",
        error: e,
        trace,
      });
      return null;
    });
    matGeometri = matGeoResult?.data ?? null;
    states.matGeometri =
      matGeoResult == null
        ? "error"
        : matGeoResult.status === "mock"
          ? "mock"
          : matGeoResult.status === "error"
            ? "error"
            : matGeoResult.data != null
              ? "success"
              : "no_hit";
  } else {
    states.matGeometri = "no_hit";
  }

  // ── Step 2: FBB (SAVE-værdi) ─────────────────────────────────────────────
  // Runs before skip check — SAVE value is needed even on hard-stopped sites
  // for correct flag display.
  if (bygningIds.length) {
    fbbData = await import("@/integrations/fbb/client")
      .then(({ FbbService }) =>
        traceStep(
          trace,
          {
            eventType: "api_call",
            phase: "layer4",
            service: "FBB WFS",
            operation: "getSaveData",
          },
          () => FbbService.getSaveData(bygningIds),
          { metadata: { building_ids_count: bygningIds.length } },
        ),
      )
      .catch((e: Error) => {
        logServerEvent({
          module: "geo-risk-step",
          operation: "layer4.fbb",
          severity: "degraded",
          message: "FBB fejlede",
          error: e,
          trace,
        });
        return null;
      });
  }

  // ── Step 3: Skip gate ────────────────────────────────────────────────────
  // ARCH-167: skip dyre WFS/API-kald (geus, dkjord, terrain, naboer, fjernvarme)
  // når Layer 1 allerede viser absolut byggestop — spar ~3-5s responstid.
  // naturbeskyttelse kører stadig (supplerer MAT-data med WFS-verifikation).
  if (skipExpensive) {
    await recordAnalysisEvent(trace, {
      eventType: "pipeline_step",
      phase: "layer4",
      service: "Orchestrator",
      operation: "skip_expensive_layer4",
      status: "skipped",
      metadata: { reason: "bbr_hard_stop" },
    });
    let naturSkipResult: SourceResult<RuleEngineNaturbeskyttelsesResultat> | null = null;
    if (koordinater) {
      naturSkipResult = await import("@/integrations/sdfi/naturbeskyttelse")
        .then(({ NaturbeskyttelseService }) =>
          traceStep(
            trace,
            {
              eventType: "api_call",
              phase: "layer4",
              service: "DAI WFS",
              operation: "naturbeskyttelse.getTilstand",
            },
            () => NaturbeskyttelseService.getTilstand(koordinater),
            {
              outputSummary: (r) =>
                summarizeSourceResult(
                  r,
                  (d) =>
                    `strand=${d.strandbeskyttelse} skov=${d.skovbyggelinje} soe=${d.soebeskyttelse}`,
                ),
            },
          ),
        )
        .catch(() => null);
      naturbeskyttelse = naturSkipResult?.data ?? null;
    }

    states.fbb = fbbData ? "success" : "no_hit";
    states.naturbeskyttelse = deriveSourceState(naturSkipResult);
    states.arealdata = "skipped";
    states.geusRisk = "skipped";
    states.terrain = "skipped";
    states.servitutter = "mock";
    states.fjernvarme = "no_hit";

    return {
      naturbeskyttelse,
      dkjord,
      geusRisk,
      terrain,
      naboer,
      fjernvarme,
      fbbData,
      plandataContext,
      arealdataContext,
      matGeometri,
      states,
    };
  }

  // ── Step 4: Full parallel block ─────────────────────────────────────────
  if (koordinater) {
    const [natur, jord, geus, terr, nabo, varme, plandataExt, arealdataExt] = await Promise.all([
      // naturbeskyttelse
      import("@/integrations/sdfi/naturbeskyttelse")
        .then(({ NaturbeskyttelseService }) =>
          traceStep(
            trace,
            {
              eventType: "api_call",
              phase: "layer4",
              service: "DAI WFS",
              operation: "naturbeskyttelse.getTilstand",
            },
            () => NaturbeskyttelseService.getTilstand(koordinater),
            {
              outputSummary: (r) =>
                summarizeSourceResult(
                  r,
                  (d) =>
                    `strand=${d.strandbeskyttelse} skov=${d.skovbyggelinje} soe=${d.soebeskyttelse}`,
                ),
              metadata: (r) => ({ source: r.kilde, feature_count: r.rawFeatureCount }),
            },
          ),
        )
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.naturbeskyttelse",
            severity: "degraded",
            message: "naturbeskyttelse fejlede",
            error: e,
            trace,
          });
          return null;
        }),

      // dkjord
      import("@/integrations/miljoe/dkjord")
        .then(async ({ DkJordService }) => {
          const { getCachedJordstykkePolygon } = await import("@/integrations/cache/client");
          const polygon = await traceCacheRead(
            trace,
            { service: "Cache", operation: "getCachedJordstykkePolygon", phase: "layer4" },
            () => getCachedJordstykkePolygon(addressId),
          );

          return traceStep(
            trace,
            {
              eventType: "api_call",
              phase: "layer4",
              service: "DK-Jord WFS",
              operation: "getTilstand",
              inputSummary: `koordinater=${koordinater.lat.toFixed(4)},${koordinater.lng.toFixed(4)} polygon=${polygon ? "yes" : "no"}`,
            },
            () => DkJordService.getTilstand(koordinater, polygon),
            {
              outputSummary: (r) =>
                summarizeSourceResult(r, (d) => `v1=${d.v1Kortlagt} v2=${d.v2Kortlagt}`),
              metadata: (r) => ({
                source: r.kilde,
                isMock: r.isMock,
                feature_count: r.rawFeatureCount,
              }),
            },
          );
        })
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.dkjord",
            severity: "degraded",
            message: "DK-Jord fejlede",
            error: e,
            trace,
          });
          return null;
        }),

      // geus
      Promise.all([import("@/integrations/geus/client"), import("@/integrations/cache/client")])
        .then(async ([{ GeusService }, { getCachedSourceResult, setCachedSourceResult }]) => {
          const cached = await traceCacheRead(
            trace,
            { service: "Cache", operation: "getCachedSourceResult(geus)", phase: "layer4" },
            () => getCachedSourceResult(addressId, "geus", ruleEngineGeusRiskDataSchema),
          );

          if (cached) {
            return { result: cached, cacheHit: true as const };
          }

          const result = await traceStep(
            trace,
            {
              eventType: "api_call",
              phase: "layer4",
              service: "GEUS",
              operation: "getRiskData",
            },
            () => GeusService.getRiskData(koordinater.lat, koordinater.lng),
            {
              outputSummary: (r) =>
                summarizeSourceResult(
                  r,
                  (d) =>
                    `radon=${d.radonRisk} gw_summer=${d.groundwaterDepthSummerM ?? "null"} jordart=${d.geoteknikJordart ?? "null"}`,
                ),
              metadata: (r) => ({
                source: r.kilde,
                isMock: r.isMock,
                feature_count: r.rawFeatureCount,
              }),
            },
          );

          await setCachedSourceResult(addressId, "geus", result).catch(() => undefined);
          return { result, cacheHit: false as const };
        })
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.geus",
            severity: "degraded",
            message: "GEUS fejlede",
            error: e,
            trace,
          });
          return null;
        }),

      // terrain
      Promise.all([import("@/integrations/sdfi/dhm-client"), import("@/integrations/cache/client")])
        .then(
          async ([
            { DhmService, bboxFromPoint },
            { getCachedSourceResult, setCachedSourceResult },
          ]) => {
            const cached = await traceCacheRead(
              trace,
              { service: "Cache", operation: "getCachedSourceResult(dhm)", phase: "layer4" },
              () => getCachedSourceResult(addressId, "dhm", ruleEngineTerrainDataSchema),
            );

            if (cached) {
              return { result: cached, cacheHit: true as const };
            }

            const bbox = bboxFromPoint(koordinater.lat, koordinater.lng, grundareal);
            const result = await traceStep(
              trace,
              {
                eventType: "api_call",
                phase: "layer4",
                service: "SDFI DHM",
                operation: "getTerrainData",
              },
              () => DhmService.getTerrainData(bbox, koordinater.lat, koordinater.lng),
              {
                outputSummary: (r) =>
                  summarizeSourceResult(
                    r,
                    (d) =>
                      `slope=${d.slopePercent} low=${d.lowPointM} bluespot=${d.bluespotRisk ?? "null"}`,
                  ),
                metadata: (r) => ({
                  source: r.kilde,
                  isMock: r.isMock,
                  feature_count: r.rawFeatureCount,
                }),
              },
            );

            await setCachedSourceResult(addressId, "dhm", result).catch(() => undefined);
            return { result, cacheHit: false as const };
          },
        )
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.terrain",
            severity: "degraded",
            message: "DHM terrain fejlede",
            error: e,
            trace,
          });
          return null;
        }),

      // naboer
      (async () => {
        const { createBboxAroundPoint } = await import("@/lib/map-proxy");
        const fallbackBboxRaw = koordinater ? createBboxAroundPoint(koordinater, 150) : null;
        if (!fallbackBboxRaw) return null;
        const fallbackBbox: [number, number, number, number] = [
          fallbackBboxRaw.minX,
          fallbackBboxRaw.minY,
          fallbackBboxRaw.maxX,
          fallbackBboxRaw.maxY,
        ];
        return import("@/integrations/geodanmark/client")
          .then(({ GeoDanmarkNaboService }) =>
            traceStep(
              trace,
              {
                eventType: "api_call",
                phase: "layer4",
                service: "GeoDanmark WFS",
                operation: "getNabobygninger",
                inputSummary: `hasParcelBbox=${!!matGeometri?.bbox25832}`,
              },
              () =>
                GeoDanmarkNaboService.getNabobygninger(
                  matGeometri?.bbox25832 ?? null,
                  fallbackBbox,
                  jordstykkeId,
                ),
              {
                outputSummary: (r) =>
                  summarizeSourceResult(r, (d) => `count=${d.count} kilde=${d.kilde}`),
                metadata: (r) => ({
                  source: r.kilde,
                  isMock: r.isMock,
                  feature_count: r.rawFeatureCount,
                }),
              },
            ),
          )
          .catch((e: Error) => {
            logServerEvent({
              module: "geo-risk-step",
              operation: "layer4.geodanmark_naboer",
              severity: "degraded",
              message: "GeoDanmarkNaboService fejlede",
              error: e,
              trace,
            });
            return null;
          });
      })(),

      // fjernvarme
      import("@/integrations/plandata/fjernvarme")
        .then(({ FjernvarmeService }) =>
          traceStep(
            trace,
            {
              eventType: "api_call",
              phase: "layer4",
              service: "Plandata WFS",
              operation: "fjernvarme.getDaekning",
            },
            () => FjernvarmeService.getDaekning(koordinater),
          ),
        )
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.fjernvarme",
            severity: "degraded",
            message: "FjernvarmeService fejlede",
            error: e,
            trace,
          });
          return null;
        }),

      // plandata extension
      Promise.all([import("@/integrations/plandata/client"), import("@/integrations/cache/client")])
        .then(
          async ([
            { PlandataService },
            { getCachedJordstykkePolygon, getCachedSourceResult, setCachedSourceResult },
          ]) => {
            const cached = await traceCacheRead(
              trace,
              {
                service: "Cache",
                operation: "getCachedSourceResult(plandata_ext)",
                phase: "layer4",
              },
              () =>
                getCachedSourceResult(addressId, "plandata_ext", ruleEnginePlandataContextSchema),
            );

            if (cached) {
              return { result: cached, cacheHit: true as const };
            }

            const polygon = await traceCacheRead(
              trace,
              {
                service: "Cache",
                operation: "getCachedJordstykkePolygon(plandata_ext)",
                phase: "layer4",
              },
              () => getCachedJordstykkePolygon(addressId),
            );
            const result = await traceStep(
              trace,
              {
                eventType: "api_call",
                phase: "layer4",
                service: "Plandata WFS",
                operation: "getPlanContextForParcel",
                inputSummary: `polygon=${polygon ? "yes" : "no"} koordinater=${koordinater.lat.toFixed(4)},${koordinater.lng.toFixed(4)}`,
              },
              () =>
                PlandataService.getPlanContextForParcel({
                  koordinat: koordinater,
                  parcelPolygon: polygon,
                }),
              {
                outputSummary: (r) =>
                  summarizeSourceResult(
                    r,
                    (d) =>
                      `zone=${d.zoneType ?? "null"} future=${d.futureZoneType ?? "null"} byggefelt=${d.withinBuildingField ?? "null"}`,
                  ),
                metadata: (r) => ({
                  source: r.kilde,
                  isMock: r.isMock,
                  feature_count: r.rawFeatureCount,
                }),
              },
            );

            await setCachedSourceResult(addressId, "plandata_ext", result).catch(() => undefined);
            return { result, cacheHit: false as const };
          },
        )
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.plandata_ext",
            severity: "degraded",
            message: "PlandataService.getPlanContextForParcel fejlede",
            error: e,
            trace,
          });
          return null;
        }),

      // arealdata extension
      Promise.all([
        import("@/integrations/arealdata/client"),
        import("@/integrations/cache/client"),
      ])
        .then(
          async ([
            { ArealdataService },
            { getCachedJordstykkePolygon, getCachedSourceResult, setCachedSourceResult },
          ]) => {
            const cached = await traceCacheRead(
              trace,
              {
                service: "Cache",
                operation: "getCachedSourceResult(arealdata_ext)",
                phase: "layer4",
              },
              () =>
                getCachedSourceResult(addressId, "arealdata_ext", ruleEngineArealdataContextSchema),
            );

            if (cached) {
              return { result: cached, cacheHit: true as const };
            }

            const polygon = await traceCacheRead(
              trace,
              {
                service: "Cache",
                operation: "getCachedJordstykkePolygon(arealdata_ext)",
                phase: "layer4",
              },
              () => getCachedJordstykkePolygon(addressId),
            );
            const result = await traceStep(
              trace,
              {
                eventType: "api_call",
                phase: "layer4",
                service: "DAI WFS",
                operation: "getArealdataContext",
                inputSummary: `polygon=${polygon ? "yes" : "no"} koordinater=${koordinater.lat.toFixed(4)},${koordinater.lng.toFixed(4)}`,
              },
              () => ArealdataService.getContext(koordinater, polygon),
              {
                outputSummary: (r) =>
                  summarizeSourceResult(
                    r,
                    (d) =>
                      `paragraph3=${d.paragraph3Nature ?? "null"} natura2000=${d.natura2000 ?? "null"} fortidsminde=${d.fortidsminde ?? "null"}`,
                  ),
                metadata: (r) => ({
                  source: r.kilde,
                  isMock: r.isMock,
                  feature_count: r.rawFeatureCount,
                }),
              },
            );

            await setCachedSourceResult(addressId, "arealdata_ext", result).catch(() => undefined);
            return { result, cacheHit: false as const };
          },
        )
        .catch((e: Error) => {
          logServerEvent({
            module: "geo-risk-step",
            operation: "layer4.arealdata_ext",
            severity: "degraded",
            message: "ArealdataService.getContext fejlede",
            error: e,
            trace,
          });
          return null;
        }),
    ]);

    naturbeskyttelse = natur?.data ?? null;
    states.naturbeskyttelse = deriveSourceState(natur);
    dkjord = jord?.data ?? null;
    states.dkjord = deriveSourceState(jord);
    geusRisk = geus?.result.data ?? null;
    states.geusRisk = deriveSourceState(geus?.result ?? null, geus?.cacheHit ?? false);
    terrain = terr?.result.data ?? null;
    states.terrain = deriveSourceState(terr?.result ?? null, terr?.cacheHit ?? false);
    naboer = nabo?.data ?? null;
    states.naboer = deriveSourceState(nabo);
    fjernvarme = varme;
    plandataContext = plandataExt?.result.data ?? null;
    arealdataContext = arealdataExt?.result.data ?? null;
    states.arealdata = deriveSourceState(
      arealdataExt?.result ?? null,
      arealdataExt?.cacheHit ?? false,
    );
  }

  // Set all remaining service states.
  states.fbb = fbbData ? "success" : "no_hit";
  // states.naturbeskyttelse er allerede sat fra deriveSourceState(natur) i parallel-blokken.
  // geus and terrain are IS_MOCK=true services.
  // servitutter is IS_MOCK=true (TingbogenV2 — feature flag).
  states.servitutter = "mock";
  // fjernvarme is live.
  states.fjernvarme = fjernvarme ? "success" : "no_hit";

  return {
    naturbeskyttelse,
    dkjord,
    geusRisk,
    terrain,
    naboer,
    fjernvarme,
    fbbData,
    plandataContext,
    arealdataContext,
    matGeometri,
    states,
  };
}
