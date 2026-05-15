// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// EBR (Ejendomsbeliggenhedsregistret) GraphQL via Datafordeler.
//
// Bruges til: opslag af BFE-nummer (Bestemt Fast Ejendom) fra adresse.
// Kæde: DAR_Husnummer.id_lokalId → EBR_Ejendomsbeliggenhed.husnummerLokalId → bestemtFastEjendomBFENr
//
// EBR har TO adresse-felter — brug husnummerLokalId (ikke adresseLokalId):
//   adresseLokalId    → DAR_Adresse.id_lokalId  (er NULL for rækkehuse/ejerlejligheder)
//   husnummerLokalId  → DAR_Husnummer.id_lokalId (virker altid)
//
// Verificeret 2026-05-08: Hasselvej 48 (rækkehus) — adresseLokalId=null,
// husnummerLokalId match giver BFE 2073922.
//
// @filterRequirement: kræver enten requiresOneOfFields (id_lokalId/datafordelerRowId)
//   ELLER requiresOneOfArguments (virkningstid/registreringstid).
//   Vi sender virkningstid → filtrerbar på husnummerLokalId uden indexed felt.

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

import { getEnvOptional, getEnvRequired } from "@/lib/env";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

type EbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: EbrClientConfig) {
  const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");

  const endpoint =
    explicit?.endpoint ??
    getEnvOptional("DATAFORDELER_EBR_ENDPOINT") ??
    "https://graphql.datafordeler.dk/EBR/v1";

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// GraphQL query — filtrerer på husnummerLokalId (= DAR_Husnummer.id_lokalId)
// ---------------------------------------------------------------------------

const BELIGGENHED_QUERY = `
query GetEjendomsbeliggenhed($husnummerLokalId: String!, $virkningstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { husnummerLokalId: { eq: $husnummerLokalId } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      bestemtFastEjendomBFENr
      husnummerLokalId
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

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";

async function gqlFetch(
  url: URL,
  query: string,
  variables: Record<string, unknown>,
  trace?: AnalysisTraceContext | null,
): Promise<any> {
  const response = await fetchWithRetry(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    { timeoutMs: 12_000 },
    {
      trace,
      service: "Datafordeler EBR",
      operation: "EBR_Ejendomsbeliggenhed",
      phase: "layer1",
      metadata: { endpoint: "EBR/v1" },
    },
  );

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
   * Slår BFE-nummer op via DAR_Husnummer.id_lokalId (= adgangsadresseid).
   * Filtrerer på husnummerLokalId — virker for alle ejendomstyper inkl. rækkehuse.
   *
   * @param husnummerLokalId  DAR_Husnummer.id_lokalId (= adgangsadresseid i vores system)
   */
  static async getBfeNr(
    husnummerLokalId: string,
    config?: EbrClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<EbrResult> {
    const id = husnummerLokalId.trim();
    if (!id) return { bfeNr: null, fejl: "husnummerLokalId er påkrævet" };

    try {
      const { apiKey, endpoint } = getConfig(config);
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);
      const virkningstid = new Date().toISOString();

      const data = await gqlFetch(
        url,
        BELIGGENHED_QUERY,
        { husnummerLokalId: id, virkningstid },
        trace,
      );
      const nodes: any[] = data?.EBR_Ejendomsbeliggenhed?.nodes ?? [];

      if (!nodes.length) {
        return {
          bfeNr: null,
          fejl: `EBR_Ejendomsbeliggenhed ikke fundet for husnummerLokalId ${id}`,
        };
      }

      const bfeNr: string | null = nodes[0].bestemtFastEjendomBFENr ?? null;
      return { bfeNr, fejl: null };
    } catch (e) {
      console.error("[EBR] Service fejl:", e);
      return { bfeNr: null, fejl: (e as Error).message };
    }
  }
}
