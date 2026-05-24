// src/lib/analysis/geo-risk-step.ts
// SERVER-SIDE ONLY. Layer 4: geodata services — matGeometri, FBB, naturbeskyttelse,
// dkjord, geus, terrain, naboer, fjernvarme.
//
// Ordering requirements:
//   1. matGeometri  — runs first so bbox25832 is available for GeoDanmark.
//   2. FBB          — runs second so SAVE value is available even on hard-stopped sites.
//   3. All others   — run in parallel (skipped if skipExpensive=true).

import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { summarizeSourceResult } from "@/lib/source-result";
import type {
  FjernvarmeResultat,
  MatParcelGeometryPayload,
  NeighborBuildingData,
} from "@/domain/contracts/analysis.types";
import type {
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
} from "@/domain/contracts/rule-engine.types";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";

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
  matGeometri: MatParcelGeometryPayload | null;
  states: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

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
          MatGeometryService.getParcelGeometry(jordstykkeId, grundareal),
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
    if (koordinater) {
      naturbeskyttelse = await import("@/integrations/sdfi/naturbeskyttelse")
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
          ),
        )
        .catch(() => null);
    }

    states.fbb = fbbData ? "success" : "no_hit";
    states.naturbeskyttelse = naturbeskyttelse ? "success" : "no_hit";
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
      matGeometri,
      states,
    };
  }

  // ── Step 4: Full parallel block ─────────────────────────────────────────
  if (koordinater) {
    const [natur, jord, geus, terr, nabo, varme] = await Promise.all([
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
          const polygon = await getCachedJordstykkePolygon(addressId).catch(() => null);

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
      import("@/integrations/geus/client")
        .then(({ GeusService }) =>
          traceStep(
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
          ),
        )
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
      import("@/integrations/sdfi/dhm-client")
        .then(({ DhmService, bboxFromPoint }) => {
          const bbox = bboxFromPoint(koordinater.lat, koordinater.lng, grundareal);
          return traceStep(
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
        })
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
    ]);

    naturbeskyttelse = natur;
    dkjord = jord?.data ?? null;
    states.dkjord =
      jord === null ? "error" : jord.isMock ? "mock" : jord.data != null ? "success" : "no_hit";
    geusRisk = geus?.data ?? null;
    states.geusRisk =
      geus === null
        ? "error"
        : geus.status === "mock"
          ? "mock"
          : geus.status === "error"
            ? "error"
            : geus.data !== null
              ? "success"
              : "no_hit";
    terrain = terr?.data ?? null;
    states.terrain =
      terr === null
        ? "error"
        : terr.status === "mock"
          ? "mock"
          : terr.status === "error"
            ? "error"
            : terr.data !== null
              ? "success"
              : "no_hit";
    naboer = nabo?.data ?? null;
    states.naboer =
      nabo == null
        ? "error"
        : nabo.status === "mock"
          ? "mock"
          : nabo.status === "error"
            ? "error"
            : nabo.data != null
              ? "success"
              : "no_hit";
    fjernvarme = varme;
  }

  // Set all remaining service states.
  states.fbb = fbbData ? "success" : "no_hit";
  states.naturbeskyttelse = naturbeskyttelse ? "success" : "no_hit";
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
    matGeometri,
    states,
  };
}
