// SERVER-SIDE ONLY — never import from browser code.
//
// SDFI naturbeskyttelseslinjer — ARCH-65.
// Hårde bygge-stop fra naturbeskyttelsesloven der gælder OVENI lokalplanen.
//
// Endpoint verificeret 2026-05-08 (ARCH-65): alle 5 typenames returnerer HTTP 200.
//
// API: Danmarks Arealinformation (DAI) WFS via Miljøportalen.
//   Endpoint:   https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer
//   Auth:       Ingen (offentlig tjeneste)
//   Format:     WFS 2.0, CQL_FILTER med INTERSECTS(Shape,...), outputformat=application/json
//   Typenames:  dmp:STRANDBESKYTTELSESLINJE, dmp:SKOVBYGGELINJE,
//               dmp:SOEBESKYTTELSESLINJE, dmp:AABESKYTTELSESLINJE, dmp:KLITFREDNING
//
// OBS: strandbeskyttelse + klitfredning dækkes OGSÅ af MAT_Jordstykke (live).
// DAI WFS er den spatiale kilde; MAT er den registrerede kilde — komplementære checks.

const IS_MOCK = false;

const DAI_WFS = "https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer";

export type NaturbeskyttelsesResultat = {
  strandbeskyttelse: boolean;
  skovbyggelinje: boolean;
  soebeskyttelse: boolean;
  aabeskyttelse: boolean;
  klitfredning: boolean;
  kirkebyggelinje: boolean; // ikke i DAI — kræver separat kilde
};

type Koordinat = { lat: number; lng: number };

async function erIndenforLag(typename: string, koordinat: Koordinat): Promise<boolean> {
  const { lat, lng } = koordinat;
  const filter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${lng} ${lat}))`);
  const url =
    `${DAI_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typename=${typename}&count=1&outputformat=application%2Fjson` +
    `&CQL_FILTER=${filter}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`DAI WFS HTTP ${res.status} for ${typename}`);
  }

  const data = (await res.json()) as { totalFeatures?: number; features?: unknown[] };
  return (data.totalFeatures ?? data.features?.length ?? 0) > 0;
}

export class NaturbeskyttelseService {
  static async getTilstand(koordinat: Koordinat): Promise<NaturbeskyttelsesResultat> {
    if (IS_MOCK) {
      // Typisk resultat for urban adresse (fx Hasselvej 48, Skovlunde)
      return {
        strandbeskyttelse: false,
        skovbyggelinje: false,
        soebeskyttelse: false,
        aabeskyttelse: false,
        klitfredning: false,
        kirkebyggelinje: false,
      };
    }

    const [strandbeskyttelse, skovbyggelinje, soebeskyttelse, aabeskyttelse, klitfredning] =
      await Promise.all([
        erIndenforLag("dmp:STRANDBESKYTTELSESLINJE", koordinat).catch(() => false),
        erIndenforLag("dmp:SKOVBYGGELINJE", koordinat).catch(() => false),
        erIndenforLag("dmp:SOEBESKYTTELSESLINJE", koordinat).catch(() => false),
        erIndenforLag("dmp:AABESKYTTELSESLINJE", koordinat).catch(() => false),
        erIndenforLag("dmp:KLITFREDNING", koordinat).catch(() => false),
      ]);

    return {
      strandbeskyttelse,
      skovbyggelinje,
      soebeskyttelse,
      aabeskyttelse,
      klitfredning,
      kirkebyggelinje: false,
    };
  }
}
