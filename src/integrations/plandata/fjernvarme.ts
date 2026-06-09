// SERVER-SIDE ONLY - never import from browser code.
//
// Plandata heat supply context.
// Legacy fjernvarmeDaekket is now derived from district-heating supply-area
// hits only. Planned heat areas are reported separately.

import { z } from "zod";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import type {
  FjernvarmeConfidence,
  FjernvarmePlanHit,
  FjernvarmeResultat,
  FjernvarmeSourceKind,
} from "@/domain/contracts/analysis.types";
import { logServerEvent } from "@/lib/server-logger";
import { makeErrorResult, makeOkResult, type SourceResult } from "@/lib/source-result";

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";
export const FJERNVARME_SOURCE_KIND = "plandata_heat";

const WFS_RETRY = {
  timeoutMs: 15_000,
  retries: 1,
  retryDelayBaseMs: 500,
  retryOnStatuses: [502, 503, 504],
  retryOnAbort: false,
};

const HEAT_LAYERS: ReadonlyArray<{
  sourceKind: FjernvarmeSourceKind;
  typename: string;
  maxFeatures: number;
}> = [
  {
    sourceKind: "forsyningsomraade",
    typename: "pdk:theme_pdk_forsyningomraade_vedtaget_v",
    maxFeatures: 10,
  },
  {
    sourceKind: "tilslutningspligtomraade",
    typename: "pdk:theme_pdk_tilslutningspligtomraade_vedtaget_v",
    maxFeatures: 10,
  },
  {
    sourceKind: "forsyningsforbudomraade",
    typename: "pdk:theme_pdk_forsyningsforbudomraade_vedtaget_v",
    maxFeatures: 10,
  },
  {
    sourceKind: "varmeplansomraade",
    typename: "pdk:theme_pdk_varmeplansomraade_vedtaget_v",
    maxFeatures: 10,
  },
];

const SOURCE_URL = `${WFS_BASE}?service=WFS&request=GetFeature&typeName=${encodeURIComponent(
  HEAT_LAYERS.map((layer) => layer.typename).join(","),
)}`;

type Koordinat = { lat: number; lng: number };

const plandataFeatureSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    properties: z.record(z.unknown()).nullable().optional().default(null),
  })
  .passthrough();

const plandataResponseSchema = z
  .object({
    totalFeatures: z.union([z.number(), z.string()]).optional(),
    numberMatched: z.union([z.number(), z.string()]).optional(),
    features: z.array(plandataFeatureSchema).optional().default([]),
  })
  .passthrough();

type PlandataFeature = z.infer<typeof plandataFeatureSchema>;

export type { FjernvarmeResultat } from "@/domain/contracts/analysis.types";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstString(props: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = str(props[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstNumber(props: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = num(props[key]);
    if (value !== null) return value;
  }
  return null;
}

function includesFjernvarme(value: string | null): boolean | null {
  if (value === null) return null;
  return value.toLowerCase().includes("fjernvarme");
}

function isDistrictHeatingFeature(
  sourceKind: FjernvarmeSourceKind,
  typeCode: number | null,
  typeLabel: string | null,
): boolean | null {
  const labelMatch = includesFjernvarme(typeLabel);
  if (labelMatch !== null) return labelMatch;

  // Plandata varmeplansomraader: type1207=1 is Fjernvarme, type1207=2 is
  // Individuel varmeforsyning.
  if (sourceKind === "varmeplansomraade" && typeCode !== null) {
    return typeCode === 1;
  }

  return null;
}

function buildPointFilter(koordinat: Koordinat): string {
  return `INTERSECTS(geometri,SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}))`;
}

function buildWfsUrl(typename: string, koordinat: Koordinat, count: number): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: typename,
    count: String(count),
    outputFormat: "application/json",
    CQL_FILTER: buildPointFilter(koordinat),
  });

  return `${WFS_BASE}?${params.toString()}`;
}

function mapHit(sourceKind: FjernvarmeSourceKind, feature: PlandataFeature): FjernvarmePlanHit {
  const props = feature.properties ?? {};
  const typeCode = firstNumber(props, [
    "type1203",
    "type1204",
    "type1204a",
    "type1204b",
    "type1205",
    "type1207",
  ]);
  const typeLabel = firstString(props, [
    "vaerdi1203",
    "vaerd1203",
    "vaerdi1204",
    "vaerd1204",
    "vaerdi1204b",
    "vaerd1204b",
    "vaerdi1205",
    "vaerd1205",
    "vaerdi1207",
    "vaerd1207",
    "forsyningsform",
    "forsyningstype",
  ]);

  return {
    sourceKind,
    featureId: str(feature.id),
    planId: firstString(props, [
      "planid",
      "komplan_id",
      "forsyid",
      "forsomoid",
      "objekt_id",
      "uuid",
    ]),
    planNavn: firstString(props, [
      "plannavn",
      "plannavn1203",
      "navn1203",
      "navn1204",
      "navn1205",
      "navn1207",
      "omraadenavn",
    ]),
    delomraadeNavn: firstString(props, ["delomrnavn", "delomraadenavn", "omrnavn"]),
    status: firstString(props, ["status", "planstatus"]),
    typeCode,
    typeLabel,
    vedtagetDato: firstString(props, ["datovedt", "dato_vedt", "vedtdato", "dato1204"]),
    ikraftDato: firstString(props, ["datoikraft", "ikraftdato"]),
    konverteringStartAar: firstNumber(props, ["konvstartaar"]),
    konverteringSlutAar: firstNumber(props, ["konvslutaar"]),
    forsyningsselskabNavn: firstString(props, ["virknavn", "selskabnavn", "forsyningsnavn"]),
    forsyningsselskabCvr: firstString(props, ["virkcvr", "cvr", "selskabcvr"]),
    dokumentUrl: firstString(props, ["doklink", "dokumentlink"]),
    webUrl: firstString(props, ["weblink", "weburl"]),
  };
}

async function fetchLayer(input: {
  sourceKind: FjernvarmeSourceKind;
  typename: string;
  maxFeatures: number;
  koordinat: Koordinat;
}): Promise<FjernvarmePlanHit[]> {
  const url = buildWfsUrl(input.typename, input.koordinat, input.maxFeatures);
  const res = await fetchWithRetry(
    url,
    { method: "GET", headers: { Accept: "application/json" } },
    WFS_RETRY,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Plandata WFS HTTP ${res.status} for ${input.typename}: ${body.slice(0, 240)}`);
  }

  const parsed = plandataResponseSchema.parse(await res.json());
  return parsed.features.map((feature) => mapHit(input.sourceKind, feature));
}

function firstValue<T>(hits: FjernvarmePlanHit[], pick: (hit: FjernvarmePlanHit) => T | null) {
  for (const hit of hits) {
    const value = pick(hit);
    if (value !== null) return value;
  }
  return null;
}

function deriveConfidence(input: {
  fjernvarmeDaekket: boolean | null;
  fjernvarmePlanlagt: boolean | null;
  tilslutningspligt: boolean | null;
  forsyningsforbud: boolean | null;
  hasErrors: boolean;
}): FjernvarmeConfidence {
  if (
    input.fjernvarmeDaekket === true ||
    input.tilslutningspligt === true ||
    input.forsyningsforbud === true
  ) {
    return "confirmed";
  }
  if (input.fjernvarmePlanlagt === true) return "estimated";
  if (input.hasErrors && input.fjernvarmeDaekket === null) return "unknown";
  return "missing";
}

function emptyResult(fejl: string | null): FjernvarmeResultat {
  return {
    fjernvarmeDaekket: null,
    fjernvarmePlanlagt: null,
    tilslutningspligt: null,
    forsyningsforbud: null,
    forsyningsselskabNavn: null,
    forsyningsselskabCvr: null,
    planNavn: null,
    delomraadeNavn: null,
    vedtagetDato: null,
    konverteringStartAar: null,
    konverteringSlutAar: null,
    dokumentUrl: null,
    sourceKinds: [],
    confidence: "unknown",
    hits: [],
    fejl,
  };
}

function deriveResult(hits: FjernvarmePlanHit[], errors: string[]): FjernvarmeResultat {
  const supplyHits = hits.filter((hit) => hit.sourceKind === "forsyningsomraade");
  const plannedDistrictHeatingHits = hits.filter(
    (hit) =>
      hit.sourceKind === "varmeplansomraade" &&
      isDistrictHeatingFeature(hit.sourceKind, hit.typeCode, hit.typeLabel) === true,
  );
  const districtHeatingSupplyHits = supplyHits.filter(
    (hit) => isDistrictHeatingFeature(hit.sourceKind, hit.typeCode, hit.typeLabel) === true,
  );
  const districtHeatingBanHits = hits.filter(
    (hit) =>
      hit.sourceKind === "forsyningsforbudomraade" &&
      isDistrictHeatingFeature(hit.sourceKind, hit.typeCode, hit.typeLabel) === true,
  );

  const fjernvarmeDaekket = districtHeatingSupplyHits.length > 0 ? true : false;
  const fjernvarmePlanlagt = plannedDistrictHeatingHits.length > 0 ? true : false;
  const tilslutningspligt = hits.some((hit) => hit.sourceKind === "tilslutningspligtomraade");
  const forsyningsforbud = districtHeatingBanHits.length > 0;
  const preferredHits = [
    ...districtHeatingSupplyHits,
    ...plannedDistrictHeatingHits,
    ...hits.filter((hit) => hit.sourceKind === "tilslutningspligtomraade"),
    ...districtHeatingBanHits,
    ...hits,
  ];
  const sourceKinds = Array.from(new Set(hits.map((hit) => hit.sourceKind)));

  const confidence = deriveConfidence({
    fjernvarmeDaekket,
    fjernvarmePlanlagt,
    tilslutningspligt,
    forsyningsforbud,
    hasErrors: errors.length > 0,
  });

  return {
    fjernvarmeDaekket,
    fjernvarmePlanlagt,
    tilslutningspligt,
    forsyningsforbud,
    forsyningsselskabNavn: firstValue(preferredHits, (hit) => hit.forsyningsselskabNavn),
    forsyningsselskabCvr: firstValue(preferredHits, (hit) => hit.forsyningsselskabCvr),
    planNavn: firstValue(preferredHits, (hit) => hit.planNavn),
    delomraadeNavn: firstValue(preferredHits, (hit) => hit.delomraadeNavn),
    vedtagetDato: firstValue(preferredHits, (hit) => hit.vedtagetDato),
    konverteringStartAar: firstValue(preferredHits, (hit) => hit.konverteringStartAar),
    konverteringSlutAar: firstValue(preferredHits, (hit) => hit.konverteringSlutAar),
    dokumentUrl: firstValue(preferredHits, (hit) => hit.dokumentUrl ?? hit.webUrl),
    sourceKinds,
    confidence,
    hits,
    fejl: errors.length > 0 ? errors.join(" | ") : null,
  };
}

export class FjernvarmeService {
  static async getHeatSupplyContext(
    koordinat: Koordinat | null,
  ): Promise<SourceResult<FjernvarmeResultat>> {
    if (!koordinat) {
      const result = emptyResult("Koordinater mangler");
      return makeOkResult(result, {
        kilde: FJERNVARME_SOURCE_KIND,
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
        confidence: "unknown",
      });
    }

    try {
      const settled = await Promise.allSettled(
        HEAT_LAYERS.map((layer) => fetchLayer({ ...layer, koordinat })),
      );
      const hits = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
      const errors = settled.flatMap((entry) =>
        entry.status === "rejected"
          ? [entry.reason instanceof Error ? entry.reason.message : String(entry.reason)]
          : [],
      );

      if (hits.length === 0 && errors.length === HEAT_LAYERS.length) {
        throw new Error(errors.join(" | "));
      }

      const result = deriveResult(hits, errors);
      return makeOkResult(result, {
        kilde: FJERNVARME_SOURCE_KIND,
        sourceUrl: SOURCE_URL,
        rawFeatureCount: hits.length,
        confidence: result.confidence,
      });
    } catch (e) {
      logServerEvent({
        module: "plandata/fjernvarme",
        operation: "getHeatSupplyContext",
        severity: "degraded",
        message: "FjernvarmeService fejl",
        error: e,
      });
      return makeErrorResult<FjernvarmeResultat>(e, {
        kilde: FJERNVARME_SOURCE_KIND,
        sourceUrl: SOURCE_URL,
      });
    }
  }

  /**
   * Backwards-compatible facade for existing analysis code and drawing ports.
   * Returnerer null ved API-fejl (fail-open - ikke en blocker).
   */
  static async getDaekning(koordinat: Koordinat | null): Promise<FjernvarmeResultat> {
    const result = await this.getHeatSupplyContext(koordinat);
    return result.data ?? emptyResult(result.errorDetails?.message ?? "Fjernvarme-opslag fejlede");
  }
}
