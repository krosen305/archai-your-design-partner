// SERVER-SIDE ONLY — never import from browser code.
//
// SDFI naturbeskyttelseslinjer — ARCH-65.
// Hårde bygge-stop fra naturbeskyttelsesloven der gælder OVENI lokalplanen.
//
// ⚠️  IS_MOCK=true — live API afventer endpoint-verifikation.
//
// Forventet API: Danmarks Arealinformation (DAI) WFS via Miljøportalen.
//   Endpoint:   https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer
//   Auth:       Ingen (offentlig tjeneste)
//   Format:     WFS 2.0, BBOX eller CQL_FILTER, OUTPUTFORMAT=application/json
//   Typenames:  dmp:STRANDBESKYTTELSESLINJE, dmp:SKOVBYGGELINJE,
//               dmp:SOEBESKYTTELSESLINJE, dmp:AABESKYTTELSESLINJE, dmp:KLITFREDNING
//
// Alternativt endpoint (ubekræftet — kræver DATAFORSYNINGEN_TOKEN):
//   https://api.dataforsyningen.dk/<theme>?SERVICE=WFS&REQUEST=GetFeature&...
//   Themes: theme_pdk_strandbeskyttelseslinje_vedtaget, theme_pdk_skovbyggelinje,
//           theme_pdk_soebeskyttelseslinje, theme_pdk_aabeskyttelseslinje, theme_pdk_klitfredning
//
// Aktiver live API: sæt IS_MOCK = false og verificér endpoint + typename mod GetCapabilities.

const IS_MOCK = true;

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
