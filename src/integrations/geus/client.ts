import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { logServerEvent } from "@/lib/server-logger";

const IS_MOCK = true;
const GEUS_OWS = "https://data.geus.dk/geusmap/ows/4258.jsp";
const GROUNDWATER_RADIUS_M = 500;

type Koordinat = { lat: number; lng: number };

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

  const data = (await res.json()) as { features?: { properties?: { radon_klasse?: string } }[] };
  const klasse = data.features?.[0]?.properties?.radon_klasse?.toLowerCase() ?? "";

  if (klasse.includes("hoj") || klasse.includes("høj") || klasse.includes("high")) return "high";
  if (klasse.includes("middel") || klasse.includes("medium")) return "medium";
  if (klasse.includes("lav") || klasse.includes("low")) return "low";
  return "unknown";
}

type WfsBoringResponse = {
  features?: {
    id?: string;
    properties?: {
      boringnr?: string;
      grundvand_kote?: number | null;
      terrænkote?: number | null;
      jordart?: string | null;
      lithologi?: string | null;
    };
  }[];
};

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

  const data = (await res.json()) as WfsBoringResponse;
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

export const GeusService = {
  async getRiskData(lat: number, lng: number): Promise<SourceResult<GeusRiskData>> {
    if (IS_MOCK) {
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
        fetchRadonRisk(koordinat).catch((error: Error) => {
          logServerEvent({
            module: "geus/client",
            operation: "fetchRadonRisk",
            severity: "degraded",
            message: "Radon WMS fejlede",
            error,
          });
          return "unknown" as const;
        }),
        fetchGroundwater(koordinat).catch((error: Error) => {
          logServerEvent({
            module: "geus/client",
            operation: "fetchGroundwater",
            severity: "degraded",
            message: "Jupiter WFS fejlede",
            error,
          });
          return { depthM: null, boringId: null, jordart: null };
        }),
      ]);

      return makeOkResult(
        {
          radonRisk,
          groundwaterDepthM: groundwater.depthM,
          groundwaterDataSource: groundwater.boringId,
          groundwaterDepthWinterM: groundwater.depthM,
          groundwaterDepthSummerM: groundwater.depthM,
          groundwaterModelUncertaintyM: null,
          geoteknikJordart: groundwater.jordart,
          kilde: "geus",
        },
        {
          kilde: "geus",
          sourceUrl: GEUS_OWS,
          rawFeatureCount: groundwater.boringId ? 1 : 0,
        },
      );
    } catch (error) {
      return makeErrorResult<GeusRiskData>(error, { kilde: "geus", sourceUrl: GEUS_OWS });
    }
  },
};
