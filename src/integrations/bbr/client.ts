// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// GraphQL integration til BBR via Datafordeleren (v2).
//
// Datafordeler GraphQL-begrænsninger (bekræftet via API-svar):
//   - Introspection er deaktiveret (HC0046)
//   - Aliases er ikke tilladt (DAF-GQL-0008)
//   - Kun ét root-felt pr. query (DAF-GQL-0010)
//   → BBR_Bygning og grundareal kræver separate kald
//
// Schema-kilde: https://graphql.datafordeler.dk/BBR/v2/schema
// Feltnavne bekræftet mod schema:
//   BBR_Bygning:   byg021, byg026Opfoerelsesaar, byg038SamletBygningsareal,
//                  byg041BebyggetAreal, byg054AntalEtager
//   BBR_Grund:     Indeholder IKKE grundareal – grundareal hentes fra DAWA
//                  (jordstykke.registreretAreal på adgangsadresse-responsen)
//   Filter-felt:   husnummer (ikke husnummerIdentificerer)

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type BbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: BbrClientConfig) {
  const apiKey = explicit?.apiKey ?? (process as any)?.env?.DATAFORDELER_API_KEY ?? "";

  const endpoint =
    explicit?.endpoint ??
    (process as any)?.env?.DATAFORDELER_BBR_ENDPOINT ??
    "https://graphql.datafordeler.dk/BBR/v2";

  if (!apiKey) {
    throw new Error(
      "BBR GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// Kodelister
// ---------------------------------------------------------------------------

const ANVENDELSE_KODER: Record<string, string> = {
  "110": "Stuehus til landbrugsejendom",
  "120": "Fritliggende enfamilieshus",
  "121": "Sammenbygget enfamilieshus",
  "122": "Dobbelthus",
  "130": "Række-, kæde- eller dobbelthus",
  "140": "Etagebolig",
  "510": "Sommerhus",
  "910": "Garage",
  "920": "Carport",
  "930": "Udhus",
};

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type BbrKompliantData = {
  byggeaar: string | null;
  bebygget_areal: number | null;
  samlet_areal: number | null;
  antal_etager: number | null;
  anvendelseskode: string | null;
  anvendelse_tekst: string | null;
  grundareal: number | null;
  bebyggelsesprocent: number | null;
  beregning_mulig: boolean;
  fejl: string | null;
};

// ---------------------------------------------------------------------------
// GraphQL Query – kun BBR_Bygning
// (BBR_Grund har intet grundareal-felt – grundareal sendes fra DAWA-laget)
// ---------------------------------------------------------------------------

// virkningstid er obligatorisk (DAF-GQL-0009) – Datafordeler er bitemporal.
// Vi sender aktuel tid for at få den nuværende aktive version af data.
const BYGNING_QUERY = `
query GetBygning($id: String!, $virkningstid: DafDateTime!) {
  BBR_Bygning(
    where: { husnummer: { eq: $id } }
    virkningstid: $virkningstid
  ) {
    nodes {
      byg021BygningensAnvendelse
      byg026Opfoerelsesaar
      byg038SamletBygningsareal
      byg041BebyggetAreal
      byg054AntalEtager
    }
  }
}`;

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
    const keyHint = url.searchParams.get("apiKey")?.slice(0, 4) ?? "?";
    console.error("[BBR] HTTP-fejl:", {
      status: response.status,
      keyHint: `${keyHint}…`,
      body: bodyText.slice(0, 500),
      wwwAuth: response.headers.get("www-authenticate") ?? "",
    });
    throw new Error(`Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);

  if (parsed.errors?.length) {
    console.error("[BBR] GraphQL-fejl:", parsed.errors);
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// BbrService
// ---------------------------------------------------------------------------

export class BbrService {
  /**
   * Henter BBR-bygningsdata via Datafordelers GraphQL v2-endpoint.
   *
   * @param adgangsadresseid  DAWA's adgangsadresse-UUID (= BBR's husnummer-filter)
   * @param grundareal        Grundareal i m² fra DAWA (jordstykke.registreretAreal)
   *                          – BBR_Grund indeholder ikke dette felt
   */
  static async getKompliantData(
    adgangsadresseid: string,
    grundareal: number | null = null,
    config?: BbrClientConfig,
  ): Promise<BbrKompliantData> {
    const id = adgangsadresseid.trim();
    if (!id) {
      return this.getEmptyData("adgangsadresseid er påkrævet");
    }

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set("apiKey", apiKey);

    try {
      const virkningstid = new Date().toISOString();
      const data = await gqlFetch(url, BYGNING_QUERY, { id, virkningstid });

      // 1. Find primær bygning (prioritér bolig over garage/carport/udhus)
      const bygninger: any[] = data?.BBR_Bygning?.nodes ?? [];
      const primærBygning =
        bygninger.find(
          (b: any) => !["910", "920", "930", "940"].includes(b.byg021BygningensAnvendelse),
        ) ?? bygninger[0];

      if (!primærBygning) {
        return this.getEmptyData("Ingen bygning fundet på adressen");
      }

      // 2. Arealer
      const bebygget_areal: number | null = primærBygning.byg041BebyggetAreal ?? null;
      const samlet_areal: number | null = primærBygning.byg038SamletBygningsareal ?? null;

      // 3. Bebyggelsesprocent (kræver grundareal fra DAWA-laget)
      let bebyggelsesprocent: number | null = null;
      if (bebygget_areal && grundareal && grundareal > 0) {
        bebyggelsesprocent = Math.round((bebygget_areal / grundareal) * 1000) / 10;
      }

      const anv_kode: string | null = primærBygning.byg021BygningensAnvendelse ?? null;

      return {
        byggeaar: primærBygning.byg026Opfoerelsesaar?.toString() ?? null,
        bebygget_areal,
        samlet_areal,
        antal_etager: primærBygning.byg054AntalEtager ?? null,
        anvendelseskode: anv_kode,
        anvendelse_tekst: anv_kode ? (ANVENDELSE_KODER[anv_kode] ?? `Kode ${anv_kode}`) : null,
        grundareal,
        bebyggelsesprocent,
        beregning_mulig: bebyggelsesprocent !== null,
        fejl: grundareal
          ? null
          : "Grundareal ikke tilgængeligt – bebyggelsesprocent kan ikke beregnes",
      };
    } catch (e) {
      console.error("[BBR] Service fejl:", e);
      return this.getEmptyData((e as Error).message);
    }
  }

  private static getEmptyData(fejl: string): BbrKompliantData {
    return {
      byggeaar: null,
      bebygget_areal: null,
      samlet_areal: null,
      antal_etager: null,
      anvendelseskode: null,
      anvendelse_tekst: null,
      grundareal: null,
      bebyggelsesprocent: null,
      beregning_mulig: false,
      fejl,
    };
  }
}
