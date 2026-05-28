// src/integrations/plandata/surroundings.ts
// SERVER-SIDE ONLY.
//
// Plandata WFS — verified kommuneplan guideline layers for surroundings context.
//
// Verified against live GetCapabilities/DescribeFeatureType on 2026-05-26.
// The earlier generic `kommuneplanretningslinje_*` layer names do not exist.
//
// Live-verified layers used here:
//   pdk:theme_pdk_stoejbelastetareal_{vedtaget|forslag}
//   pdk:theme_pdk_konsekvensomraade_{vedtaget|forslag}
//   pdk:theme_pdk_tekniskanlaegkonsekvensomraade_{vedtaget|forslag}
//   pdk:theme_pdk_storehusdyrbrug_{vedtaget|forslag}
//
// Note: odor-specific live layers are not currently verified in GetCapabilities.
// Those fields stay null rather than inventing compliance truth from free text.

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type {
  PlanningSurroundingsContext,
  PlanningSurroundingsHit,
} from "@/domain/contracts/surroundings.types";
import { z } from "zod";

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";
const VERIFIED_LAYER_GROUPS = [
  {
    hitKind: "noise_designated" as const,
    title: "Støjbelastede arealer",
    vedtaget: "pdk:theme_pdk_stoejbelastetareal_vedtaget",
    forslag: "pdk:theme_pdk_stoejbelastetareal_forslag",
  },
  {
    hitKind: "production_noise_consequence" as const,
    title: "Konsekvensområder",
    vedtaget: "pdk:theme_pdk_konsekvensomraade_vedtaget",
    forslag: "pdk:theme_pdk_konsekvensomraade_forslag",
  },
  {
    hitKind: "technical_facility_consequence" as const,
    title: "Konsekvensområder omkring tekniske anlæg",
    vedtaget: "pdk:theme_pdk_tekniskanlaegkonsekvensomraade_vedtaget",
    forslag: "pdk:theme_pdk_tekniskanlaegkonsekvensomraade_forslag",
  },
  {
    hitKind: "large_livestock" as const,
    title: "Store husdyrbrug",
    vedtaget: "pdk:theme_pdk_storehusdyrbrug_vedtaget",
    forslag: "pdk:theme_pdk_storehusdyrbrug_forslag",
  },
];

const SOURCE_URL = `${WFS_BASE}?service=WFS&request=GetFeature&typeName=${encodeURIComponent(
  VERIFIED_LAYER_GROUPS.map((group) => group.vedtaget).join(","),
)}`;

const plandataFeatureSchema = z.object({
  id: z.string().optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
});

const plandataResponseSchema = z.object({
  features: z.array(plandataFeatureSchema).default([]),
});

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

type SurroundingsFeature = {
  hitKind:
    | "noise_designated"
    | "production_noise_consequence"
    | "technical_facility_consequence"
    | "large_livestock";
  themeCode: string | null;
  planId: string;
  planTitle: string | null;
  municipalityName: string | null;
  status: "vedtaget" | "forslag";
};

async function fetchSurroundingsFeatures(
  typename: string,
  hitKind: SurroundingsFeature["hitKind"],
  title: string,
  bbox25832: [number, number, number, number],
): Promise<SurroundingsFeature[]> {
  const bboxStr = `${bbox25832[0]},${bbox25832[1]},${bbox25832[2]},${bbox25832[3]},EPSG:25832`;
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=${encodeURIComponent(typename)}&bbox=${encodeURIComponent(bboxStr)}&outputFormat=application/json`;

  const res = await fetchWithRetry(
    url,
    { headers: { Accept: "application/json" } },
    { timeoutMs: 15_000, retries: 1, retryOnStatuses: [502, 503, 504] },
  );

  if (!res.ok) throw new Error(`Plandata WFS HTTP ${res.status} for ${typename}`);
  const raw = await res.json();
  const features = plandataResponseSchema.parse(raw).features;

  const status = typename.includes("forslag") ? "forslag" : "vedtaget";

  return features.map((f) => ({
    hitKind,
    themeCode: str(f.properties?.["temakode"] ?? f.properties?.["omraadekode"]),
    planId: str(f.properties?.["komplan_id"] ?? f.properties?.["komtil_id"] ?? f.id) ?? "",
    planTitle: str(f.properties?.["plangrund"] ?? f.properties?.["omraadenavn"] ?? title),
    municipalityName: str(f.properties?.["komnavn"] ?? f.properties?.["kommunenavn"]),
    status,
  }));
}

export class PlandataSurroundingsService {
  static async getSurroundings(
    bbox25832: [number, number, number, number],
  ): Promise<SourceResult<PlanningSurroundingsContext>> {
    if (FEATURE_FLAGS.plandataSurroundingsMock) {
      return makeMockResult<PlanningSurroundingsContext>(
        {
          noiseDesignatedArea: null,
          productionNoiseConsequenceArea: null,
          odorConsequenceArea: null,
          odorDesignatedArea: null,
          technicalFacilityConsequenceArea: null,
          largeLivestockFarmArea: null,
          proposedPlanConflict: null,
          hits: [],
        },
        { kilde: "plandata_surroundings", sourceUrl: SOURCE_URL, rawFeatureCount: 0 },
      );
    }

    try {
      const groupedFeatures = await Promise.all(
        VERIFIED_LAYER_GROUPS.map(async (group) => {
          const [vedtaget, forslag] = await Promise.all([
            fetchSurroundingsFeatures(group.vedtaget, group.hitKind, group.title, bbox25832),
            fetchSurroundingsFeatures(group.forslag, group.hitKind, group.title, bbox25832).catch(
              () => [] as SurroundingsFeature[],
            ),
          ]);

          return [...vedtaget, ...forslag];
        }),
      );

      const all = groupedFeatures.flat();

      const hits: PlanningSurroundingsHit[] = all.map((f) => ({
        planId: f.planId,
        planTitle: f.planTitle,
        themeCode: f.themeCode ?? f.hitKind,
        status: f.status,
        municipalityName: f.municipalityName,
        geometryOverlap: true,
      }));

      const hasHitKind = (hitKind: SurroundingsFeature["hitKind"]): boolean | null => {
        const hit = all.find((f) => f.hitKind === hitKind);
        return hit ? true : all.length > 0 ? false : null;
      };

      const proposedConflict = all.some((feature) => feature.status === "forslag")
        ? true
        : all.length > 0
          ? false
          : null;

      const result: PlanningSurroundingsContext = {
        noiseDesignatedArea: hasHitKind("noise_designated"),
        productionNoiseConsequenceArea: hasHitKind("production_noise_consequence"),
        odorConsequenceArea: null,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: hasHitKind("technical_facility_consequence"),
        largeLivestockFarmArea: hasHitKind("large_livestock"),
        proposedPlanConflict: proposedConflict,
        hits,
      };

      return makeOkResult<PlanningSurroundingsContext>(result, {
        kilde: "plandata_surroundings",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: all.length,
      });
    } catch (e) {
      return makeErrorResult(e, { kilde: "plandata_surroundings", sourceUrl: SOURCE_URL });
    }
  }
}
