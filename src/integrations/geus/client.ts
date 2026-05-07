// SERVER-SIDE ONLY — never import from browser code.
//
// GEUS (Danmarks og Grønlands Geologiske Undersøgelse) — geoteknisk risikoprofil.
// Dækker radonrisiko og grundvandsdybde — ARCH-101.
//
// ⚠️  IS_MOCK=true — live endpoints kræver layer-verificering mod GetCapabilities.
//
// API: GEUS OGC tjenester (geologi.dk / data.geus.dk)
//   Endpoint:    https://data.geus.dk/geusmap/ows/4258.jsp
//   Auth:        Ingen (åbne tjenester)
//   Radon:       WMS GetFeatureInfo, lag: "radon_risiko" (verificér navn)
//   Grundvand:   WFS GetFeature, typeName: "jupiter_boring" (verificér navn)
//   CRS:         EPSG:4326 (WGS84 lat/lng)
//
// Aktiver live API: sæt IS_MOCK = false og verificér layer-navne mod GetCapabilities.

const IS_MOCK = true;

const GEUS_OWS = "https://data.geus.dk/geusmap/ows/4258.jsp";
const GROUNDWATER_RADIUS_M = 500;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type GeusRiskData = {
  radonRisk: "low" | "medium" | "high" | "unknown";
  groundwaterDepthM: number | null;
  groundwaterDataSource: string | null; // nærmeste boring-ID
  kilde: "geus" | "mock";
};

// ---------------------------------------------------------------------------
// Live API helpers
// ---------------------------------------------------------------------------

type Koordinat = { lat: number; lng: number };

// WMS GetFeatureInfo — returnerer radonklasse for et punkt.
// Bygger en ±0.001° bounding box (~100m) og spørger centerpixel.
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

  if (klasse.includes("høj") || klasse.includes("high")) return "high";
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
    };
  }[];
};

// WFS DWITHIN — henter nærmeste boring inden for GROUNDWATER_RADIUS_M.
async function fetchGroundwater(
  koordinat: Koordinat,
): Promise<{ depthM: number | null; boringId: string | null }> {
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
  if (!boring) return { depthM: null, boringId: null };

  const terræn = boring.properties?.terrænkote ?? null;
  const vandkote = boring.properties?.grundvand_kote ?? null;
  const depthM = terræn !== null && vandkote !== null ? terræn - vandkote : null;

  return {
    depthM: depthM !== null ? Math.round(depthM * 10) / 10 : null,
    boringId: boring.properties?.boringnr ?? boring.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// GeusService
// ---------------------------------------------------------------------------

export const GeusService = {
  async getRiskData(lat: number, lng: number): Promise<GeusRiskData> {
    if (IS_MOCK) {
      // Realistisk mock for nordsjællandsk parcelhuskvarter (Hasselvej 48, Virum)
      return {
        radonRisk: "medium",
        groundwaterDepthM: 3.8,
        groundwaterDataSource: "DGU-boring 199.3042",
        kilde: "mock",
      };
    }

    const koordinat = { lat, lng };

    const [radonRisk, groundwater] = await Promise.all([
      fetchRadonRisk(koordinat).catch((e: Error) => {
        console.warn("[GEUS] Radon WMS fejlede:", e.message);
        return "unknown" as const;
      }),
      fetchGroundwater(koordinat).catch((e: Error) => {
        console.warn("[GEUS] Jupiter WFS fejlede:", e.message);
        return { depthM: null, boringId: null };
      }),
    ]);

    return {
      radonRisk,
      groundwaterDepthM: groundwater.depthM,
      groundwaterDataSource: groundwater.boringId,
      kilde: "geus",
    };
  },
};
