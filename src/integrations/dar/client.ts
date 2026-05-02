// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// DAR (Danmarks Adresseregister) GraphQL v1 via Datafordeler.
//
// Schema verificeret mod https://graphql.datafordeler.dk/DAR/v1/schema (ARCH-21, 2026-04-30).
//
// Relevant type-kæde for en adresse:
//   DAR_Adresse        – adressebetegnelse, husnummer (FK → DAR_Husnummer.id_lokalId)
//   DAR_Husnummer      – adgangsadressebetegnelse, adgangspunkt (FK → DAR_Adressepunkt),
//                        postnummer (FK → DAR_Postnummer), navngivenVej (FK → DAR_NavngivenVej),
//                        kommuneinddeling (FK → kommuneregister udenfor DAR), jordstykke (FK)
//   DAR_Postnummer     – postnr (4-cifret kode), navn (bynavn)
//   DAR_Adressepunkt   – position (SpatialPointEpsg25832Type) → wkt i EPSG:25832
//
// Datafordeler GraphQL-begrænsninger (bekræftet):
//   - Kun ét root-felt pr. query (DAF-GQL-0010)
//   - virkningstid PÅKRÆVET (DAF-GQL-0009)
//   - Ingen aliases (DAF-GQL-0008)
//   - filterRequirement: id_lokalId eller datafordelerRowId PÅKRÆVET i where
//
// Begrænsninger i DAR v1 schema:
//   - ejerlavskode/matrikelnummer: IKKE i DAR – kun jordstykke (FK-string til Matrikelregistret)
//   - kommunenavn: IKKE i DAR direkte – kommuneinddeling er FK udenfor DAR
//   - Koordinater: EPSG:25832 WKT på DAR_Adressepunkt.position.wkt – kræver UTM→WGS84 konvertering

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type DarClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: DarClientConfig) {
  const apiKey = explicit?.apiKey ?? (process as any)?.env?.DATAFORDELER_API_KEY ?? "";

  const endpoint =
    explicit?.endpoint ??
    (process as any)?.env?.DATAFORDELER_DAR_ENDPOINT ??
    "https://graphql.datafordeler.dk/DAR/v1";

  if (!apiKey) {
    throw new Error(
      "DAR GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// Output type – kompatibel med DawaAddressDetails for drop-in i DAWA Phase 2
//
// ejerlavskode + matrikelnummer hentes via DAR_Husnummer.jordstykke → MAT_Jordstykke → MAT_Ejerlav.
// kommunenavn forbliver tom string (kræver kommuneregister udenfor DAR).
// ---------------------------------------------------------------------------

export type DarAddressDetails = {
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string; // tom string – kommuneinddeling FK er ikke en kode
  kommunenavn: string; // tom string – kræver register udenfor DAR
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number };
  bbrId: string | null;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
};

// ---------------------------------------------------------------------------
// GraphQL queries (feltnavne verificeret mod live DAR v1 schema)
// ---------------------------------------------------------------------------

// Kald 1: DAR_Adresse – henter adressebetegnelse og husnummer-FK
const ADRESSE_QUERY = `
query GetDarAdresse($id: String!, $virkningstid: DafDateTime!) {
  DAR_Adresse(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      id_lokalId
      adressebetegnelse
      husnummer
      etagebetegnelse
      doerbetegnelse
      status
    }
  }
}`;

// Kald 2: DAR_Husnummer – henter FK-referencer til adressepunkt, postnummer mv.
const HUSNUMMER_QUERY = `
query GetDarHusnummer($id: String!, $virkningstid: DafDateTime!) {
  DAR_Husnummer(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      id_lokalId
      adgangsadressebetegnelse
      husnummertekst
      adgangspunkt
      postnummer
      kommuneinddeling
      navngivenVej
      jordstykke
      status
    }
  }
}`;

// Kald 3a: DAR_Postnummer – henter postnr (4-cifret kode) og bynavn
const POSTNUMMER_QUERY = `
query GetDarPostnummer($id: String!, $virkningstid: DafDateTime!) {
  DAR_Postnummer(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      postnr
      navn
    }
  }
}`;

// Kald 3b: DAR_Adressepunkt – henter koordinat som WKT i EPSG:25832
const ADRESSEPUNKT_QUERY = `
query GetDarAdressepunkt($id: String!, $virkningstid: DafDateTime!) {
  DAR_Adressepunkt(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      position { wkt }
    }
  }
}`;

// Kald 3c: MAT_Jordstykke – henter matrikelnummer + ejerlavLokalId via jordstykke-FK fra DAR_Husnummer.
// OBS: Kald går til MAT endpoint (v2), ikke DAR.
const MAT_JORDSTYKKE_QUERY = `
query GetMatJordstykke($id: String!, $virkningstid: DafDateTime!) {
  MAT_Jordstykke(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      matrikelnummer
      ejerlavLokalId
      registreretAreal
    }
  }
}`;

// Kald 4: MAT_Ejerlav – henter numerisk ejerlavskode via ejerlavLokalId fra MAT_Jordstykke.
const MAT_EJERLAV_QUERY = `
query GetMatEjerlav($id: String!, $virkningstid: DafDateTime!) {
  MAT_Ejerlav(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      ejerlavskode
      ejerlavsnavn
    }
  }
}`;

// ---------------------------------------------------------------------------
// Koordinatkonvertering: EPSG:25832 (UTM 32N) → WGS84
//
// DAR_Adressepunkt.position.wkt returnerer f.eks. "POINT(725000.12 6174000.34)"
// i EPSG:25832. Ingen ekstern afhængighed – standard Transverse Mercator invers.
// ---------------------------------------------------------------------------

function parseWktPoint(wkt: string | null | undefined): { x: number; y: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(\s*([\d.+-]+)\s+([\d.+-]+)\s*\)/i);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

function utm32NToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const k0 = 0.9996;
  const a = 6378137.0;
  const e2 = 0.00669437999014;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lon0 = 9 * (Math.PI / 180); // central meridian zone 32

  const x = easting - 500000;
  const y = northing;

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = (e2 * cosPhi1 * cosPhi1) / (1 - e2);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2) * D * D * D * D) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 - 3 * C1 * C1) *
          D *
          D *
          D *
          D *
          D *
          D) /
          720);

  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 + 24 * T1 * T1) * D * D * D * D * D) / 120) /
      cosPhi1;

  return {
    lat: lat * (180 / Math.PI),
    lng: lon * (180 / Math.PI),
  };
}

// ---------------------------------------------------------------------------
// Hjælpefunktion: GraphQL-kald mod Datafordeler
// ---------------------------------------------------------------------------

async function gqlFetch(url: URL, query: string, variables: Record<string, unknown>): Promise<any> {
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`DAR Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);
  if (parsed.errors?.length) {
    console.error("[DAR] GraphQL-fejl:", parsed.errors);
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// MAT URL builder — MAT endpoint er forskellig fra DAR, men bruger samme API-nøgle
// ---------------------------------------------------------------------------

function getMatUrl(apiKey: string): URL {
  const matEndpoint =
    (process as any)?.env?.DATAFORDELER_MAT_ENDPOINT ?? "https://graphql.datafordeler.dk/MAT/v2";
  const url = new URL(matEndpoint);
  url.searchParams.set("apiKey", apiKey);
  return url;
}

// ---------------------------------------------------------------------------
// DarService
// ---------------------------------------------------------------------------

export class DarService {
  /**
   * Henter adressedetaljer fra DAR GraphQL.
   * Henter adressedetaljer til brug efter addressevalg (erstatter DawaService, DAWA Phase 2+3).
   *
   * Kæde: DAR_Adresse → DAR_Husnummer → [DAR_Postnummer + DAR_Adressepunkt + MAT_Jordstykke] → MAT_Ejerlav
   *
   * @param darAdresseLokalId  DAR's id_lokalId for adressen (= DAWA's adresseid)
   *
   * Kendte begrænsninger vs. DAWA:
   *   - kommunenavn returneres som '' (kræver kommuneregister udenfor DAR)
   */
  static async getAddressDetails(
    darAdresseLokalId: string,
    config?: DarClientConfig,
  ): Promise<DarAddressDetails> {
    const id = darAdresseLokalId.trim();
    if (!id) throw new Error("DAR: darAdresseLokalId er påkrævet");

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set("apiKey", apiKey);
    const virkningstid = new Date().toISOString();

    // ── Kald 1: DAR_Adresse ─────────────────────────────────────────────────
    const adresseData = await gqlFetch(url, ADRESSE_QUERY, { id, virkningstid });
    const adresseNodes: any[] = adresseData?.DAR_Adresse?.nodes ?? [];
    if (!adresseNodes.length) {
      throw new Error(`DAR_Adresse ikke fundet for id_lokalId: ${id}`);
    }
    const adresse = adresseNodes[0];
    const husnummerFK: string = adresse.husnummer ?? "";

    // ── Kald 2: DAR_Husnummer ───────────────────────────────────────────────
    let husnummer: any = null;
    if (husnummerFK) {
      const husnummerData = await gqlFetch(url, HUSNUMMER_QUERY, {
        id: husnummerFK,
        virkningstid,
      });
      husnummer = husnummerData?.DAR_Husnummer?.nodes?.[0] ?? null;
    }

    const adgangspunktFK: string = husnummer?.adgangspunkt ?? "";
    const postnummerFK: string = husnummer?.postnummer ?? "";
    const jordstykkeFK: string = husnummer?.jordstykke ?? "";
    const matUrl = getMatUrl(apiKey);

    // ── Kald 3a + 3b + 3c: postnummer, adressepunkt og MAT_Jordstykke (parallelt) ─
    const [postnummerData, adressepunktData, jordstykkeData] = await Promise.all([
      postnummerFK
        ? gqlFetch(url, POSTNUMMER_QUERY, { id: postnummerFK, virkningstid })
        : Promise.resolve(null),
      adgangspunktFK
        ? gqlFetch(url, ADRESSEPUNKT_QUERY, { id: adgangspunktFK, virkningstid })
        : Promise.resolve(null),
      jordstykkeFK
        ? gqlFetch(matUrl, MAT_JORDSTYKKE_QUERY, { id: jordstykkeFK, virkningstid }).catch(
            (e: Error) => {
              console.warn("[DAR] MAT_Jordstykke opslag fejlede:", e.message);
              return null;
            },
          )
        : Promise.resolve(null),
    ]);

    const postnummerNode = postnummerData?.DAR_Postnummer?.nodes?.[0] ?? null;
    const adressepunktNode = adressepunktData?.DAR_Adressepunkt?.nodes?.[0] ?? null;
    const jordstykkeNode = jordstykkeData?.MAT_Jordstykke?.nodes?.[0] ?? null;
    const matEjerlavLokalId: string = jordstykkeNode?.ejerlavLokalId ?? "";
    const matrikelnummer: string | null = jordstykkeNode?.matrikelnummer ?? null;

    // ── Kald 4: MAT_Ejerlav (afhænger af ejerlavLokalId fra kald 3c) ────────
    let ejerlavskode: number | null = null;
    if (matEjerlavLokalId) {
      try {
        const ejerlavData = await gqlFetch(matUrl, MAT_EJERLAV_QUERY, {
          id: matEjerlavLokalId,
          virkningstid,
        });
        ejerlavskode = ejerlavData?.MAT_Ejerlav?.nodes?.[0]?.ejerlavskode ?? null;
      } catch (e) {
        console.warn(
          "[DAR] MAT_Ejerlav opslag fejlede — ejerlavskode forbliver null:",
          (e as Error).message,
        );
      }
    }

    // ── Koordinatkonvertering: EPSG:25832 WKT → WGS84 ───────────────────────
    let koordinater = { lat: 0, lng: 0 };
    const wktPoint = parseWktPoint(adressepunktNode?.position?.wkt);
    if (wktPoint) {
      koordinater = utm32NToWgs84(wktPoint.x, wktPoint.y);
    }

    return {
      adresse: adresse.adressebetegnelse ?? "",
      postnr: postnummerNode?.postnr ?? "",
      postnrnavn: postnummerNode?.navn ?? "",
      kommunekode: "",
      kommunenavn: "",
      matrikel: matrikelnummer,
      adgangsadresseid: husnummerFK,
      koordinater,
      bbrId: null,
      ejerlavskode,
      matrikelnummer,
    };
  }
}
