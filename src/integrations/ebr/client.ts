// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// EBR (Ejendomsbeliggenhedsregistret) GraphQL via Datafordeler.
//
// Bruges til: opslag af BFE-nummer (Bestemt Fast Ejendom) fra adresse.
// Kæde: DAR_Husnummer.id_lokalId → EBR_Ejendomsbeliggenhed.adresseLokalId → bestemtFastEjendomBFENr
//
// Schema: schema/EBR.graphql (gitignored, lokal kopi)
// Feltnavne bekræftet mod schema:
//   EBR_Ejendomsbeliggenhed: adresseLokalId (filter), bestemtFastEjendomBFENr (String!)
//
// @filterRequirement: kræver enten requiresOneOfFields (id_lokalId/datafordelerRowId)
//   ELLER requiresOneOfArguments (virkningstid/registreringstid).
//   Vi sender virkningstid som argument → filtrerbar på adresseLokalId.

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type EbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: EbrClientConfig) {
  const apiKey = explicit?.apiKey ?? (process as any)?.env?.DATAFORDELER_API_KEY ?? "";

  const endpoint =
    explicit?.endpoint ??
    (process as any)?.env?.DATAFORDELER_EBR_ENDPOINT ??
    "https://graphql.datafordeler.dk/EBR/v1";

  if (!apiKey) {
    throw new Error(
      "EBR GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// GraphQL query
// ---------------------------------------------------------------------------

// virkningstid som argument (ikke i where) opfylder @filterRequirement.requiresOneOfArguments
// → vi kan filtrere på adresseLokalId selv om det ikke er et indexed felt.
const BELIGGENHED_QUERY = `
query GetEjendomsbeliggenhed($adresseLokalId: String!, $virkningstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { adresseLokalId: { eq: $adresseLokalId } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      bestemtFastEjendomBFENr
      id_lokalId
    }
  }
}`;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type EbrResult = {
  bfeNr: string | null;
  fejl: string | null;
};

// ---------------------------------------------------------------------------
// Hjælpefunktion: GraphQL-kald
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
    console.error("[EBR] HTTP-fejl:", {
      status: response.status,
      keyHint: `${keyHint}…`,
      body: bodyText.slice(0, 500),
    });
    throw new Error(`EBR Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);

  if (parsed.errors?.length) {
    console.error("[EBR] GraphQL-fejl:", parsed.errors);
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// EbrService
// ---------------------------------------------------------------------------

export class EbrService {
  /**
   * Slår BFE-nummer op fra DAR_Husnummer.id_lokalId via EBR_Ejendomsbeliggenhed.
   *
   * @param adresseLokalId  DAR_Husnummer.id_lokalId (= adgangsadresseid i vores system)
   */
  static async getBfeNr(adresseLokalId: string, config?: EbrClientConfig): Promise<EbrResult> {
    const id = adresseLokalId.trim();
    if (!id) return { bfeNr: null, fejl: "adresseLokalId er påkrævet" };

    try {
      const { apiKey, endpoint } = getConfig(config);
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);
      const virkningstid = new Date().toISOString();

      const data = await gqlFetch(url, BELIGGENHED_QUERY, { adresseLokalId: id, virkningstid });
      const nodes: any[] = data?.EBR_Ejendomsbeliggenhed?.nodes ?? [];

      if (!nodes.length) {
        return { bfeNr: null, fejl: `EBR_Ejendomsbeliggenhed ikke fundet for adresseLokalId ${id}` };
      }

      const bfeNr: string | null = nodes[0].bestemtFastEjendomBFENr ?? null;
      return { bfeNr, fejl: null };
    } catch (e) {
      console.error("[EBR] Service fejl:", e);
      return { bfeNr: null, fejl: (e as Error).message };
    }
  }
}
