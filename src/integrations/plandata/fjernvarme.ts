// SERVER-SIDE ONLY — never import from browser code.
//
// FjernvarmeService — afgør om en adresse er inden for et fjernvarmeforsyningsområde.
// ARCH-111: Discovery-sprint (ARCH-103) bekræftede varmeforsyningsplaner i Plandata WFS.
//
// Endpoint verificeret 2026-05-08 (ARCH-111):
//   Typename:     pdk:theme_pdk_varmeplansomraade_vedtaget_v  (bekræftet via GetCapabilities)
//   Geometry-felt: geometri (MultiSurface, bekræftet via DescribeFeatureType)
//   HTTP 200 + 0 features for Hasselvej 48 (ikke fjernvarmedækket — korrekt)
//
// OBS: Det tidligere antagne typename `pdk:theme_pdk_varmeforsyning_vedtaget` eksisterer ikke.

const IS_MOCK = false;

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";
const VARMEFORSYNING_TYPE = "pdk:theme_pdk_varmeplansomraade_vedtaget_v";

type Koordinat = { lat: number; lng: number };

export type FjernvarmeResultat = {
  fjernvarmeDaekket: boolean | null;
  fejl: string | null;
};

async function erIndenforFjernvarme(koordinat: Koordinat): Promise<boolean> {
  const { lat, lng } = koordinat;
  const filter = encodeURIComponent(`INTERSECTS(geometri,SRID=4326;POINT(${lng} ${lat}))`);
  const url =
    `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typename=${VARMEFORSYNING_TYPE}&count=1&outputformat=application%2Fjson` +
    `&CQL_FILTER=${filter}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`Plandata WFS HTTP ${res.status} for ${VARMEFORSYNING_TYPE}`);
  }

  const data = (await res.json()) as { totalFeatures?: number; features?: unknown[] };
  return (data.totalFeatures ?? data.features?.length ?? 0) > 0;
}

export class FjernvarmeService {
  /**
   * Afgør om koordinatet er inden for et vedtaget fjernvarmeforsyningsområde.
   *
   * Returnerer null ved API-fejl (fail-open — ikke en blocker).
   * IS_MOCK=true: returnerer null (ukendt) for alle adresser.
   */
  static async getDaekning(koordinat: Koordinat): Promise<FjernvarmeResultat> {
    if (IS_MOCK) {
      return { fjernvarmeDaekket: null, fejl: null };
    }

    try {
      const daekket = await erIndenforFjernvarme(koordinat);
      return { fjernvarmeDaekket: daekket, fejl: null };
    } catch (e) {
      console.warn("[FjernvarmeService] fejl:", (e as Error).message);
      return { fjernvarmeDaekket: null, fejl: (e as Error).message };
    }
  }
}
