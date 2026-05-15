// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// MAT (Matrikelregistret) GraphQL v2 via Datafordeler.
//
// Bruges til: grundareal (registreretAreal) på et jordstykke.
// Erstatter: DAWA's /adgangsadresser/{id} + /jordstykker/{ejerlav}/{matr} kald.
//
// Datafordeler GraphQL-begrænsninger (samme som BBR v2):
//   - Introspection deaktiveret (HC0046)
//   - Aliases ikke tilladt (DAF-GQL-0008)
//   - Kun ét root-felt pr. query (DAF-GQL-0010)
//   - virkningstid PÅKRÆVET (DAF-GQL-0009)
//   → MAT_Ejerlav og MAT_Jordstykke kræver separate kald
//
// Schema-kilde: https://graphql.datafordeler.dk/MAT/v2/schema (lokal kopi: schema/MAT.graphql)
// Feltnavne bekræftet mod schema:
//   MAT_Ejerlav:    ejerlavskode (Long!), id_lokalId (String!)
//   MAT_Jordstykke: ejerlavLokalId, matrikelnummer, registreretAreal,
//                   strandbeskyttelse_omfang, fredskov_omfang, klitfredning_omfang
//
// Opslag-kæde:
//   ejerlavskode (fra DAWA/DAR) → MAT_Ejerlav.id_lokalId → MAT_Jordstykke
//
// Beskyttelseslinjer hentes gratis i samme kald som grundareal og merges ind i
// BbrKompliantData.mat_* af analysis-orchestrator.ts.

import { getEnvOptional, getEnvRequired } from "@/lib/env";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type MatClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: MatClientConfig) {
  const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");

  const endpoint =
    explicit?.endpoint ??
    getEnvOptional("DATAFORDELER_MAT_ENDPOINT") ??
    "https://graphql.datafordeler.dk/MAT/v2";

  if (!apiKey) {
    throw new Error(
      "MAT GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

// Trin 1: Slå ejerlav op via numerisk kode → hent id_lokalId (= ejerlavLokalId i jordstykke)
// Bemærk: @filterRequirement kræver virkningstid. ejerlavskode-filter forventes at virke
// på samme måde som husnummer-filter i BBR (requiresOneOfFields er performance-hint, ikke hard constraint).
const EJERLAV_QUERY = `
query GetEjerlav($kode: Long!, $virkningstid: DafDateTime!) {
  MAT_Ejerlav(
    where: { ejerlavskode: { eq: $kode } }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      id_lokalId
      ejerlavsnavn
    }
  }
}`;

// Trin 2: Slå jordstykke op via ejerlavLokalId + matrikelnummer
// Henter registreretAreal + beskyttelseslinjer (strandbeskyttelse, fredskov, klitfredning)
// direkte fra MAT_Jordstykke — samme kald, nul ekstra API-kost.
const JORDSTYKKE_QUERY = `
query GetJordstykke($ejerlavLokalId: String!, $matrikelnummer: String!, $virkningstid: DafDateTime!) {
  MAT_Jordstykke(
    where: {
      ejerlavLokalId: { eq: $ejerlavLokalId }
      matrikelnummer: { eq: $matrikelnummer }
    }
    virkningstid: $virkningstid
    first: 1
  ) {
    nodes {
      registreretAreal
      matrikelnummer
      strandbeskyttelse_omfang
      fredskov_omfang
      klitfredning_omfang
    }
  }
}`;

// ---------------------------------------------------------------------------
// Hjælpefunktion: GraphQL-kald
// ---------------------------------------------------------------------------

async function gqlFetch(
  url: URL,
  query: string,
  variables: Record<string, unknown>,
  operation: string,
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
      service: "Datafordeler MAT",
      operation,
      phase: "layer1",
      metadata: { endpoint: "MAT/v2" },
    },
  );

  const bodyText = await response.text();

  if (!response.ok) {
    const keyHint = url.searchParams.get("apiKey")?.slice(0, 4) ?? "?";
    console.error("[MAT] HTTP-fejl:", {
      status: response.status,
      keyHint: `${keyHint}…`,
      body: bodyText.slice(0, 500),
    });
    throw new Error(`MAT Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);

  if (parsed.errors?.length) {
    console.error("[MAT] GraphQL-fejl:", parsed.errors);
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// MatService
// ---------------------------------------------------------------------------

export type MatGrundarealResult = {
  registreretAreal: number | null;
  ejerlavLokalId: string | null;
  ejerlavsnavn: string | null;
  fejl: string | null;
  // Beskyttelseslinjer fra MAT_Jordstykke — null = ikke berørt eller data mangler
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
};

export class MatService {
  /**
   * Henter grundareal (registreretAreal) fra MAT_Jordstykke via Datafordeler.
   *
   * @param ejerlavskode  Ejerlav-kode som Long (fra DAWA: ejerlav.kode, f.eks. 12352)
   * @param matrikelnummer  Matrikelnummer som String (fra DAWA: matrikelnr, f.eks. "48a")
   * @param config  Valgfri override af API-nøgle og endpoint
   *
   * Kæde:
   *   ejerlavskode → MAT_Ejerlav.id_lokalId → MAT_Jordstykke.registreretAreal
   */
  static async getGrundareal(
    ejerlavskode: number,
    matrikelnummer: string,
    config?: MatClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<MatGrundarealResult> {
    const matr = matrikelnummer.trim();
    if (!ejerlavskode || !matr) {
      return {
        registreretAreal: null,
        ejerlavLokalId: null,
        ejerlavsnavn: null,
        fejl: "ejerlavskode og matrikelnummer er påkrævet",
        strandbeskyttelse: null,
        fredskov: null,
        klitfredning: null,
      };
    }

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set("apiKey", apiKey);

    const virkningstid = new Date().toISOString();

    try {
      // ---- Trin 1: Find MAT_Ejerlav via ejerlavskode ----
      const ejerlavData = await gqlFetch(
        url,
        EJERLAV_QUERY,
        {
          kode: ejerlavskode,
          virkningstid,
        },
        "MAT_Ejerlav",
        trace,
      );

      const ejerlaver: any[] = ejerlavData?.MAT_Ejerlav?.nodes ?? [];
      if (!ejerlaver.length) {
        return {
          registreretAreal: null,
          ejerlavLokalId: null,
          ejerlavsnavn: null,
          fejl: `MAT_Ejerlav ikke fundet for ejerlavskode ${ejerlavskode}`,
          strandbeskyttelse: null,
          fredskov: null,
          klitfredning: null,
        };
      }

      const ejerlav = ejerlaver[0];
      const ejerlavLokalId: string = ejerlav.id_lokalId;
      const ejerlavsnavn: string = ejerlav.ejerlavsnavn ?? null;

      // ---- Trin 2: Find MAT_Jordstykke via ejerlavLokalId + matrikelnummer ----
      const jordstykkeData = await gqlFetch(
        url,
        JORDSTYKKE_QUERY,
        {
          ejerlavLokalId,
          matrikelnummer: matr,
          virkningstid,
        },
        "MAT_Jordstykke",
        trace,
      );

      const jordstykker: any[] = jordstykkeData?.MAT_Jordstykke?.nodes ?? [];
      if (!jordstykker.length) {
        return {
          registreretAreal: null,
          ejerlavLokalId,
          ejerlavsnavn,
          fejl: `MAT_Jordstykke ikke fundet: ejerlav ${ejerlavLokalId}, matr ${matr}`,
          strandbeskyttelse: null,
          fredskov: null,
          klitfredning: null,
        };
      }

      const js = jordstykker[0];
      // omfang-felter: ikke-null og ikke-tom streng = berørt af beskyttelseslinje
      const omfangToBool = (v: string | null | undefined): boolean | null =>
        v == null ? null : v !== "" && v !== "Ingen";

      return {
        registreretAreal: js.registreretAreal ?? null,
        ejerlavLokalId,
        ejerlavsnavn,
        fejl: null,
        strandbeskyttelse: omfangToBool(js.strandbeskyttelse_omfang),
        fredskov: omfangToBool(js.fredskov_omfang),
        klitfredning: omfangToBool(js.klitfredning_omfang),
      };
    } catch (e) {
      console.error("[MAT] Service fejl:", e);
      return {
        registreretAreal: null,
        ejerlavLokalId: null,
        ejerlavsnavn: null,
        fejl: (e as Error).message,
        strandbeskyttelse: null,
        fredskov: null,
        klitfredning: null,
      };
    }
  }
}
