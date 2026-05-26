// src/integrations/plandata/surroundings.ts
// SERVER-SIDE ONLY.
//
// Plandata WFS — kommuneplanretningslinjer for støj, lugt og konsekvensområder.
//
// IS_MOCK=true — aktiveres efter Task 0 step 4-5 verificerer typenavn og property-navne.
//
// Forventede typenames (verificer fra Task 0):
//   vedtaget: pdk:theme_pdk_kommuneplanretningslinje_vedtaget
//   forslag:  pdk:theme_pdk_kommuneplanretningslinje_forslag
//
// Relevante temakoder (verificer mod kodelisten):
//   1109    — støjbelastede arealer
//   115201  — støj fra eksisterende produktionsvirksomheder
//   115202  — lugt fra eksisterende produktionsvirksomheder
//   110129  — lugtbelastede arealer
//   110130  — konsekvensområder for tekniske anlæg og støj i landzone
//   114200  — store husdyrbrug

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type {
  PlanningSurroundingsContext,
  PlanningSurroundingsHit,
} from "@/domain/contracts/surroundings.types";
import { z } from "zod";

const IS_MOCK = true;

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";
const VEDTAGET_TYPENAME = "pdk:theme_pdk_kommuneplanretningslinje_vedtaget";
const FORSLAG_TYPENAME = "pdk:theme_pdk_kommuneplanretningslinje_forslag";

const NOISE_THEME_CODES = new Set(["1109", "115201"]);
const ODOR_THEME_CODES = new Set(["115202", "110129"]);
const TECHNICAL_THEME_CODES = new Set(["110130"]);
const LIVESTOCK_THEME_CODES = new Set(["114200"]);

const SOURCE_URL = `${WFS_BASE}?service=WFS&request=GetFeature&typeName=${VEDTAGET_TYPENAME}`;

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
  themeCode: string;
  planId: string;
  planTitle: string | null;
  municipalityName: string | null;
  status: "vedtaget" | "forslag";
};

async function fetchSurroundingsFeatures(
  typename: string,
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
    themeCode: str(f.properties?.["themeCode"] ?? f.properties?.["temaKode"] ?? "") ?? "",
    planId: str(f.properties?.["planId"] ?? f.id) ?? "",
    planTitle: str(f.properties?.["navn"] ?? f.properties?.["planNavn"]),
    municipalityName: str(f.properties?.["kommuneNavn"] ?? f.properties?.["kommunenavn"]),
    status,
  }));
}

export class PlandataSurroundingsService {
  static async getSurroundings(
    bbox25832: [number, number, number, number],
  ): Promise<SourceResult<PlanningSurroundingsContext>> {
    if (IS_MOCK) {
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
      const [vedtaget, forslag] = await Promise.all([
        fetchSurroundingsFeatures(VEDTAGET_TYPENAME, bbox25832),
        fetchSurroundingsFeatures(FORSLAG_TYPENAME, bbox25832).catch(
          () => [] as SurroundingsFeature[],
        ),
      ]);

      const all = [...vedtaget, ...forslag];

      const hits: PlanningSurroundingsHit[] = all.map((f) => ({
        planId: f.planId,
        planTitle: f.planTitle,
        themeCode: f.themeCode,
        status: f.status,
        municipalityName: f.municipalityName,
        geometryOverlap: true,
      }));

      const hasCode = (codes: Set<string>): boolean | null => {
        const hit = all.find((f) => codes.has(f.themeCode));
        return hit ? true : all.length > 0 ? false : null;
      };

      const proposedConflict = forslag.length > 0 ? true : all.length > 0 ? false : null;

      const result: PlanningSurroundingsContext = {
        noiseDesignatedArea: hasCode(NOISE_THEME_CODES),
        productionNoiseConsequenceArea: hasCode(new Set(["115201"])),
        odorConsequenceArea: hasCode(new Set(["115202"])),
        odorDesignatedArea: hasCode(new Set(["110129"])),
        technicalFacilityConsequenceArea: hasCode(TECHNICAL_THEME_CODES),
        largeLivestockFarmArea: hasCode(LIVESTOCK_THEME_CODES),
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
