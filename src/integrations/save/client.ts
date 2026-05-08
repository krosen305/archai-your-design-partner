// SERVER-SIDE ONLY — never import from browser code.
//
// SaveService — SAVE-bevaringsværdi og fredningsstatus for bygninger (ARCH-29).
//
// ⚠️  IS_MOCK=true — live endpoints afventer verifikation.
//
// Forventet kildekæde:
//   1. Fredede bygninger — DAI WFS via Miljøportalen:
//        https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer
//        typename: dmp:FREDEDE_BYGNINGER
//        Filter: INTERSECTS(Shape, SRID=4326;POINT({lng} {lat}))
//
//   2. SAVE-bevaringsværdi (1-9) — Datafordeler BBR GraphQL v2:
//        Felt: byg032YdreRamme (Ja/Nej) angiver om SAVE-behandling er foretaget
//        Den faktiske bevaringsværdi kræver Kulturmiljøregisteret (Slots- og Kulturstyrelsen):
//        https://api.fredningsregistret.dk  (eller FBB via Datafordeler)
//
// Aktivér live API: sæt IS_MOCK = false og verificér typename + feltnavne.

const IS_MOCK = true;

const DAI_WFS = "https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer";

export type SaveData = {
  fredet: boolean;
  saveBevaringsvaerdi: number | null; // 1-9; null = ingen data / ikke SAVE-behandlet
  kilde: "mock" | "dai_wfs" | "bbr" | null;
};

type Koordinat = { lat: number; lng: number };

async function erFredet(koordinat: Koordinat): Promise<boolean> {
  const { lat, lng } = koordinat;
  const filter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${lng} ${lat}))`);
  const url =
    `${DAI_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typename=dmp:FREDEDE_BYGNINGER&count=1&outputformat=application%2Fjson` +
    `&CQL_FILTER=${filter}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`DAI WFS HTTP ${res.status} for FREDEDE_BYGNINGER`);

  const data = (await res.json()) as { totalFeatures?: number; features?: unknown[] };
  return (data.totalFeatures ?? data.features?.length ?? 0) > 0;
}

export class SaveService {
  /**
   * Returnerer fredningsstatus og SAVE-bevaringsværdi for en adresse.
   *
   * IS_MOCK=true: returnerer fredet=false, saveBevaringsvaerdi=null for alle adresser.
   * Fail-open: API-fejl returnerer null-værdier (ikke throw) da data er informativ, ikke blokerende.
   *
   * @param koordinat  WGS84 koordinater for adressepunktet
   */
  static async getBevaringsdata(koordinat: Koordinat): Promise<SaveData> {
    if (IS_MOCK) {
      return { fredet: false, saveBevaringsvaerdi: null, kilde: "mock" };
    }

    try {
      const fredet = await erFredet(koordinat);
      return {
        fredet,
        saveBevaringsvaerdi: null, // SAVE-score kræver separat endpoint (se kommentar øverst)
        kilde: "dai_wfs",
      };
    } catch (e) {
      console.warn("[SaveService] fejl:", (e as Error).message);
      return { fredet: false, saveBevaringsvaerdi: null, kilde: null };
    }
  }
}
