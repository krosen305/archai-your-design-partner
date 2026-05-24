import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { logServerEvent } from "@/lib/server-logger";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { z } from "zod";

const GEUS_OWS = "https://data.geus.dk/geusmap/ows/4258.jsp";
const GROUNDWATER_RADIUS_M = 500;

type Koordinat = { lat: number; lng: number };

const geusRadonResponseSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z
          .object({
            radon_klasse: z.string().optional(),
          })
          .passthrough()
          .optional(),
      }),
    )
    .optional(),
});

const geusBoringResponseSchema = z.object({
  features: z
    .array(
      z.object({
        id: z.string().optional(),
        properties: z
          .object({
            boringnr: z.string().optional(),
            grundvand_kote: z.number().nullable().optional(),
            terrænkote: z.number().nullable().optional(),
            jordart: z.string().nullable().optional(),
            lithologi: z.string().nullable().optional(),
          })
          .passthrough()
          .optional(),
      }),
    )
    .optional(),
});

export type GeusRiskData = {
  radonRisk: "low" | "medium" | "high" | "unknown";
  groundwaterDepthM: number | null;
  groundwaterDataSource: string | null;
  groundwaterDepthWinterM: number | null;
  groundwaterDepthSummerM: number | null;
  groundwaterModelUncertaintyM: number | null;
  geoteknikJordart: string | null;
  kilde: "geus" | "mock";
};

async function fetchRadonRisk(
  koordinat: Koordinat,
): Promise<"low" | "medium" | "high" | "unknown"> {
  const { lat, lng } = koordinat;
  const delta = 0.001;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const url =
    `${GEUS_OWS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
    `&LAYERS=radon_risiko&QUERY_LAYERS=radon_risiko` +
    `&INFO_FORMAT=application%2Fjson` +
    `&I=50&J=50&WIDTH=101&HEIGHT=101` +
    `&CRS=EPSG:4326&BBOX=${bbox}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`GEUS radon WMS HTTP ${res.status}`);

  const raw = await res.json();
  const data = geusRadonResponseSchema.parse(raw);
  const klasse = data.features?.[0]?.properties?.radon_klasse?.toLowerCase() ?? "";

  if (klasse.includes("hoj") || klasse.includes("høj") || klasse.includes("high")) return "high";
  if (klasse.includes("middel") || klasse.includes("medium")) return "medium";
  if (klasse.includes("lav") || klasse.includes("low")) return "low";
  return "unknown";
}

async function fetchGroundwater(
  koordinat: Koordinat,
): Promise<{ depthM: number | null; boringId: string | null; jordart: string | null }> {
  const { lat, lng } = koordinat;
  const filter = encodeURIComponent(
    `DWITHIN(geometri,POINT(${lng} ${lat}),${GROUNDWATER_RADIUS_M},meters)`,
  );
  const url =
    `${GEUS_OWS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=jupiter_boring&SRSNAME=EPSG:4326&COUNT=5` +
    `&OUTPUTFORMAT=application%2Fjson&CQL_FILTER=${filter}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`GEUS Jupiter WFS HTTP ${res.status}`);

  const raw = await res.json();
  const data = geusBoringResponseSchema.parse(raw);
  const boring = data.features?.[0];
  if (!boring) return { depthM: null, boringId: null, jordart: null };

  const terraen = boring.properties?.terrænkote ?? null;
  const vandkote = boring.properties?.grundvand_kote ?? null;
  const depthM = terraen !== null && vandkote !== null ? terraen - vandkote : null;

  return {
    depthM: depthM !== null ? Math.round(depthM * 10) / 10 : null,
    boringId: boring.properties?.boringnr ?? boring.id ?? null,
    jordart: boring.properties?.jordart ?? boring.properties?.lithologi ?? null,
  };
}

type RadonFetchResult = {
  value: "low" | "medium" | "high" | "unknown";
  failed: boolean;
};

type GroundwaterFetchResult = {
  value: { depthM: number | null; boringId: string | null; jordart: string | null };
  failed: boolean;
};

export const GeusService = {
  async getRiskData(lat: number, lng: number): Promise<SourceResult<GeusRiskData>> {
    if (FEATURE_FLAGS.geusMock) {
      return makeMockResult(
        {
          radonRisk: "medium",
          groundwaterDepthM: 3.8,
          groundwaterDataSource: "DGU-boring 199.3042",
          groundwaterDepthWinterM: 3.4,
          groundwaterDepthSummerM: 3.8,
          groundwaterModelUncertaintyM: 0.6,
          geoteknikJordart: "Moræneler",
          kilde: "mock",
        },
        { kilde: "geus", sourceUrl: GEUS_OWS, rawFeatureCount: 1, confidence: "estimated" },
      );
    }

    const koordinat = { lat, lng };

    try {
      const [radonRisk, groundwater] = await Promise.all([
        fetchRadonRisk(koordinat)
          .then(
            (value): RadonFetchResult => ({
              value,
              failed: false,
            }),
          )
          .catch((error: Error): RadonFetchResult => {
            logServerEvent({
              module: "geus/client",
              operation: "fetchRadonRisk",
              severity: "degraded",
              message: "Radon WMS fejlede",
              error,
            });
            return { value: "unknown", failed: true };
          }),
        fetchGroundwater(koordinat)
          .then(
            (value): GroundwaterFetchResult => ({
              value,
              failed: false,
            }),
          )
          .catch((error: Error): GroundwaterFetchResult => {
            logServerEvent({
              module: "geus/client",
              operation: "fetchGroundwater",
              severity: "degraded",
              message: "Jupiter WFS fejlede",
              error,
            });
            return {
              value: { depthM: null, boringId: null, jordart: null },
              failed: true,
            };
          }),
      ]);

      if (radonRisk.failed && groundwater.failed) {
        return makeErrorResult<GeusRiskData>(new Error("GEUS live fetch failed"), {
          kilde: "geus",
          sourceUrl: GEUS_OWS,
        });
      }

      return makeOkResult(
        {
          radonRisk: radonRisk.value,
          groundwaterDepthM: groundwater.value.depthM,
          groundwaterDataSource: groundwater.value.boringId,
          groundwaterDepthWinterM: groundwater.value.depthM,
          groundwaterDepthSummerM: groundwater.value.depthM,
          groundwaterModelUncertaintyM: null,
          geoteknikJordart: groundwater.value.jordart,
          kilde: "geus",
        },
        {
          kilde: "geus",
          sourceUrl: GEUS_OWS,
          rawFeatureCount: groundwater.value.boringId ? 1 : 0,
          confidence: radonRisk.failed || groundwater.failed ? "unknown" : "confirmed",
        },
      );
    } catch (error) {
      return makeErrorResult<GeusRiskData>(error, { kilde: "geus", sourceUrl: GEUS_OWS });
    }
  },
};
