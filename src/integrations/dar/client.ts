// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// DAR (Danmarks Adresseregister) GraphQL v1 via Datafordeler.
//
// ⚠️  SKELETON – kræver DAR-schema bekræftelse (fase 2 i DAWA_MIGRATION.md).
//
// Erstatter: DAWA's /adresser/{id} og /adgangsadresser/{id}
//
// Download DAR-schema (kør én gang):
//   $s = Invoke-RestMethod 'https://graphql.datafordeler.dk/DAR/v1/schema'
//   $s | Out-File dar-schema.txt -Encoding utf8
//
// Forventede typer baseret på Datafordeler-konventioner:
//   DAR_Adresse       – id_lokalId, adressebetegnelse, kommunekode, husnummerId
//   DAR_Husnummer     – id_lokalId, adgangspunkt (koordinater), vejkode, kommunekode
//                       ejerlavskode (?), matrikelnr (?) – SKAL BEKRÆFTES i schema
//   DAR_NavngivenVej  – vejnavn, kommunekode
//
// Datafordeler GraphQL-begrænsninger (samme som BBR/MAT):
//   - Kun ét root-felt pr. query (DAF-GQL-0010)
//   - virkningstid PÅKRÆVET (DAF-GQL-0009)
//   - Ingen aliases (DAF-GQL-0008)

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type DarClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: DarClientConfig) {
  const apiKey =
    explicit?.apiKey ??
    (process as any)?.env?.DATAFORDELER_API_KEY ??
    '';

  const endpoint =
    explicit?.endpoint ??
    (process as any)?.env?.DATAFORDELER_DAR_ENDPOINT ??
    'https://graphql.datafordeler.dk/DAR/v1';

  if (!apiKey) {
    throw new Error(
      'DAR GraphQL: Manglende DATAFORDELER_API_KEY. ' +
      'Sæt denne som environment variable (uden VITE_ prefix).'
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// Output type – matcher DawaAddressDetails for drop-in erstatning
// ---------------------------------------------------------------------------

export type DarAddressDetails = {
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  kommunenavn: string;
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number };
  bbrId: string | null;
  grundareal: number | null;     // hentes via mat/client.ts
  ejerlavskode: number | null;   // til MAT-opslag
  matrikelnummer: string | null; // til MAT-opslag
};

// ---------------------------------------------------------------------------
// GraphQL queries (feltnavne er UBEKRÆFTEDE – opdatér efter schema-download)
// ---------------------------------------------------------------------------

// TODO: Bekræft feltnavne mod DAR v1 schema
// Forventede filterfelt: id_lokalId eller husnummeridentificerer (DAR-ID)
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
      postnummer
      postnummernavn
      kommunekode
      husnummerId
    }
  }
}`;

// TODO: Bekræft om DAR_Husnummer har ejerlavskode + matrikelnr direkte,
// eller om disse skal slås op via separat Matrikel-reference
const HUSNUMMER_QUERY = `
query GetDarHusnummer($id: String!, $virkningstid: DafDateTime!) {
  DAR_Husnummer(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      id_lokalId
      adgangspunkt
      ejerlavskode
      matrikelnummer
      kommunekode
    }
  }
}`;

// ---------------------------------------------------------------------------
// Hjælpefunktion
// ---------------------------------------------------------------------------

async function gqlFetch(
  url: URL,
  query: string,
  variables: Record<string, unknown>
): Promise<any> {
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`DAR Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);
  if (parsed.errors?.length) {
    console.error('[DAR] GraphQL-fejl:', parsed.errors);
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// DarService
// ---------------------------------------------------------------------------

export class DarService {
  /**
   * ⚠️  IKKE KLAR TIL PRODUKTION – kræver DAR-schema bekræftelse.
   *
   * Henter adressedetaljer fra DAR GraphQL.
   * Tiltænkt som drop-in erstatning for DawaService.getAddressDetails().
   *
   * @param darAdresseLokalId  DAR's id_lokalId for adressen
   *                           (svarer til DAWA's adresseid)
   */
  static async getAddressDetails(
    darAdresseLokalId: string,
    config?: DarClientConfig
  ): Promise<DarAddressDetails> {
    const id = darAdresseLokalId.trim();
    if (!id) throw new Error('DAR: darAdresseLokalId er påkrævet');

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set('apiKey', apiKey);

    const virkningstid = new Date().toISOString();

    // Kald 1: DAR_Adresse
    const adresseData = await gqlFetch(url, ADRESSE_QUERY, { id, virkningstid });
    const adresseNodes: any[] = adresseData?.DAR_Adresse?.nodes ?? [];
    if (!adresseNodes.length) {
      throw new Error(`DAR_Adresse ikke fundet for id ${id}`);
    }
    const adresse = adresseNodes[0];
    const husnummerId: string = adresse.husnummerId;

    // Kald 2: DAR_Husnummer (koordinater + matrikeldata)
    let koordinater = { lat: 0, lng: 0 };
    let ejerlavskode: number | null = null;
    let matrikelnummer: string | null = null;

    try {
      const husnummerData = await gqlFetch(url, HUSNUMMER_QUERY, {
        id: husnummerId,
        virkningstid,
      });
      const husnummerNodes: any[] = husnummerData?.DAR_Husnummer?.nodes ?? [];
      if (husnummerNodes.length) {
        const h = husnummerNodes[0];
        // TODO: Bekræft koordinat-format fra DAR schema (WGS84 lat/lng eller EPSG:25832 x/y)
        koordinater = {
          lat: h.adgangspunkt?.y ?? h.adgangspunkt?.bredde ?? 0,
          lng: h.adgangspunkt?.x ?? h.adgangspunkt?.laengde ?? 0,
        };
        ejerlavskode = h.ejerlavskode ?? null;
        matrikelnummer = h.matrikelnummer ?? null;
      }
    } catch (e) {
      console.warn('[DAR] husnummer-kald fejlede:', (e as Error).message);
    }

    // Grundareal hentes separat via MatService.getGrundareal()
    // (kaldt fra server-funktionen i projekt.compliance.tsx)
    return {
      adresse: adresse.adressebetegnelse ?? '',
      postnr: adresse.postnummer ?? '',
      postnrnavn: adresse.postnummernavn ?? '',
      kommunekode: adresse.kommunekode ?? '',
      kommunenavn: '',         // TODO: opslag i DAR_NavngivenVej eller kommuneregister
      matrikel: matrikelnummer ? `${matrikelnummer}` : null,
      adgangsadresseid: husnummerId,
      koordinater,
      bbrId: null,
      grundareal: null,        // hentes via MatService
      ejerlavskode,
      matrikelnummer,
    };
  }
}
