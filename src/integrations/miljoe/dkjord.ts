// SERVER-SIDE ONLY — never import from browser code.
//
// DK-Jord integration — forurening, olietanke, områdeklassificering — ARCH-66.
// V2-kortlagt grund kan koste 500.000 kr.+ i oprensning inden byggeri.
//
// ⚠️  IS_MOCK=true — live API afventer netværksadgang til dkjord.mst.dk.
//
// API: Miljøstyrelsen DK-Jord WFS
//   Endpoint:  https://dkjord.mst.dk/wfs
//   Auth:      Ingen (offentlig tjeneste)
//   Format:    WFS 2.0, CQL_FILTER med INTERSECTS, SRSNAME=EPSG:4326
//   Layers:
//     dkjord:V1         — mulig forurening (undersøgelse kræves)
//     dkjord:V2         — dokumenteret forurening (oprensning kræves)
//     dkjord:olietank   — gammel olietank (prøvetagning kræves)
//     dkjord:omraadet   — områdeklassificering (krav om jordsundhedsattest)
//
// Aktiver live API: sæt IS_MOCK = false.

const IS_MOCK = true;

const DKJORD_WFS = "https://dkjord.mst.dk/wfs";

export type DkJordResultat = {
  v1Kortlagt: boolean;
  v2Kortlagt: boolean;
  olietank: { eksisterer: boolean; driftsstatus: string | null };
  omraadeklassificering: string | null;
};

type Koordinat = { lat: number; lng: number };

type WfsJsonResponse = {
  totalFeatures?: number;
  features?: { properties?: Record<string, unknown> }[];
};

async function getFeatures(typename: string, koordinat: Koordinat): Promise<WfsJsonResponse> {
  const { lat, lng } = koordinat;
  const filter = encodeURIComponent(`INTERSECTS(geometry,POINT(${lng} ${lat}))`);
  const url =
    `${DKJORD_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${typename}&SRSNAME=EPSG:4326&COUNT=5` +
    `&OUTPUTFORMAT=application/json&CQL_FILTER=${filter}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`DK-Jord WFS HTTP ${res.status} for ${typename}`);
  }

  return res.json() as Promise<WfsJsonResponse>;
}

export class DkJordService {
  static async getTilstand(koordinat: Koordinat): Promise<DkJordResultat> {
    if (IS_MOCK) {
      // Realistisk resultat for Hasselvej 48, Skovlunde (jf. Resights-data)
      return {
        v1Kortlagt: false,
        v2Kortlagt: false,
        olietank: { eksisterer: true, driftsstatus: "ikke i drift" },
        omraadeklassificering: "Lettere forurenet",
      };
    }

    const [v1Data, v2Data, olietankData, omraadeData] = await Promise.all([
      getFeatures("dkjord:V1", koordinat).catch((): WfsJsonResponse => ({ features: [] })),
      getFeatures("dkjord:V2", koordinat).catch((): WfsJsonResponse => ({ features: [] })),
      getFeatures("dkjord:olietank", koordinat).catch((): WfsJsonResponse => ({ features: [] })),
      getFeatures("dkjord:omraadet", koordinat).catch((): WfsJsonResponse => ({ features: [] })),
    ]);

    const olietankFeature = olietankData.features?.[0];
    const omraadeFeature = omraadeData.features?.[0];

    return {
      v1Kortlagt: (v1Data.totalFeatures ?? v1Data.features?.length ?? 0) > 0,
      v2Kortlagt: (v2Data.totalFeatures ?? v2Data.features?.length ?? 0) > 0,
      olietank: {
        eksisterer: (olietankData.totalFeatures ?? olietankData.features?.length ?? 0) > 0,
        driftsstatus: (olietankFeature?.properties?.["driftsstatus"] as string | undefined) ?? null,
      },
      omraadeklassificering:
        (omraadeFeature?.properties?.["omraadenavn"] as string | undefined) ?? null,
    };
  }
}
