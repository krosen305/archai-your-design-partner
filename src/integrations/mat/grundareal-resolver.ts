// SERVER-SIDE ONLY — credentials must never be exposed to the browser.
//
// GrundarealResolver — Datafordeler-only fallback-ruter for grundareal.
// Implementerer ARCH-222 option B: EBR/SFE → MAT_Ejerlejlighed.
// Bruges fra compliance-layer1 når ejerlavskode/matrikelnummer mangler eller
// MatService.getGrundareal returnerer null.
//
// Rute-rækkefølge:
//   1. ebr_husnummer_sfe: EBR.husnummerLokalId → BFE → MAT_SFE → jordstykker
//   2. ebr_adresse_ejerlejlighed: EBR.adresseLokalId → BFE → MAT_Ejerlejlighed → SFE → jordstykker

import { getEnvRequired, getEnvOptional } from "@/lib/env";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

// ---------------------------------------------------------------------------
// Output-typer (eksporterede — bruges af compliance-layer1 og MatrikelMap)
// ---------------------------------------------------------------------------

export type GrundarealSource = "ebr_husnummer_sfe" | "ebr_adresse_ejerlejlighed";

export type GrundarealJordstykke = {
  id_lokalId: string;
  matrikelnummer: string | null;
  ejerlavLokalId: string | null;
  registreretAreal: number;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
};

export type GrundarealResolution = {
  grundareal: number | null;
  source: GrundarealSource | null;
  bfeNr: string | null;
  samletFastEjendomLokalId: string | null;
  jordstykker: GrundarealJordstykke[];
  fejl: string | null;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type ResolverConfig = {
  apiKey?: string;
  ebrEndpoint?: string;
  matEndpoint?: string;
};

function getConfig(explicit?: ResolverConfig) {
  return {
    apiKey: explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY"),
    ebrEndpoint:
      explicit?.ebrEndpoint ??
      getEnvOptional("DATAFORDELER_EBR_ENDPOINT") ??
      "https://graphql.datafordeler.dk/EBR/v1",
    matEndpoint:
      explicit?.matEndpoint ??
      getEnvOptional("DATAFORDELER_MAT_ENDPOINT") ??
      "https://graphql.datafordeler.dk/MAT/v2",
  };
}

// ---------------------------------------------------------------------------
// GraphQL-kald
// ---------------------------------------------------------------------------

async function gqlFetch(
  endpoint: string,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  operationName: string,
  trace?: AnalysisTraceContext | null,
): Promise<any> {
  const url = new URL(endpoint);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetchWithRetry(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    { timeoutMs: 12_000 },
    {
      trace,
      service: "GrundarealResolver",
      operation: operationName,
      phase: "layer1",
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text);
  if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GraphQL-queries (én root-field per query — Datafordeler-constraint)
// ---------------------------------------------------------------------------

const EBR_BY_HUSNUMMER = `
query GrundarealEbrHusnummer($husnummerLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { husnummerLokalId: { eq: $husnummerLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { bestemtFastEjendomBFENr }
  }
}`;

const EBR_BY_ADRESSE = `
query GrundarealEbrAdresse($adresseLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { adresseLokalId: { eq: $adresseLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { bestemtFastEjendomBFENr }
  }
}`;

const MAT_SFE_BY_BFE = `
query GrundarealSfe($bfe: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_SamletFastEjendom(
    where: { BFEnummer: { eq: $bfe } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { id_lokalId BFEnummer }
  }
}`;

const MAT_EJERLEJLIGHED_BY_BFE = `
query GrundarealEjerlejlighed($bfe: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Ejerlejlighed(
    where: { BFEnummer: { eq: $bfe } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { BFEnummer samletFastEjendomLokalId }
  }
}`;

const MAT_JORDSTYKKER_BY_SFE = `
query GrundarealJordstykker($sfeLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Jordstykke(
    where: { samletFastEjendomLokalId: { eq: $sfeLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 20
  ) {
    nodes {
      id_lokalId
      matrikelnummer
      ejerlavLokalId
      registreretAreal
      strandbeskyttelse_omfang
      fredskov_omfang
      klitfredning_omfang
    }
  }
}`;

// ---------------------------------------------------------------------------
// Hjælpere
// ---------------------------------------------------------------------------

function parseOmfang(omfang: string | null | undefined): boolean | null {
  if (omfang == null) return null;
  const s = omfang.trim();
  return s !== "" && s !== "Ingen" ? true : false;
}

function mapJordstykker(nodes: any[]): GrundarealJordstykke[] {
  const seen = new Set<string>();
  return nodes
    .filter((n) => {
      if (!n.id_lokalId || seen.has(n.id_lokalId)) return false;
      seen.add(n.id_lokalId);
      return true;
    })
    .map((n) => ({
      id_lokalId: n.id_lokalId,
      matrikelnummer: n.matrikelnummer ?? null,
      ejerlavLokalId: n.ejerlavLokalId ?? null,
      registreretAreal: n.registreretAreal ?? 0,
      strandbeskyttelse: parseOmfang(n.strandbeskyttelse_omfang),
      fredskov: parseOmfang(n.fredskov_omfang),
      klitfredning: parseOmfang(n.klitfredning_omfang),
    }));
}

function sumAreal(jordstykker: GrundarealJordstykke[]): number | null {
  if (!jordstykker.length) return null;
  return jordstykker.reduce((s, j) => s + j.registreretAreal, 0);
}

// ---------------------------------------------------------------------------
// GrundarealResolver
// ---------------------------------------------------------------------------

export class GrundarealResolver {
  /**
   * Resolver-rækkefølge (ARCH-222 option B, Datafordeler-only):
   *   1. EBR husnummer → MAT SamletFastEjendom → jordstykker
   *   2. EBR adresse → MAT Ejerlejlighed → SFE → jordstykker
   */
  static async resolve(
    input: { adgangsadresseid: string; adresseid: string },
    config?: ResolverConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<GrundarealResolution> {
    const { apiKey, ebrEndpoint, matEndpoint } = getConfig(config);
    const bitemporalArgs = currentBitemporalArgs();

    // --- Rute 1: EBR husnummer → MAT SFE ---
    try {
      const ebrData = await gqlFetch(
        ebrEndpoint,
        apiKey,
        EBR_BY_HUSNUMMER,
        { husnummerLokalId: input.adgangsadresseid, ...bitemporalArgs },
        "EBR_husnummer",
        trace,
      );
      const bfeNr: string | null =
        ebrData?.EBR_Ejendomsbeliggenhed?.nodes?.[0]?.bestemtFastEjendomBFENr ?? null;

      if (bfeNr) {
        const sfeData = await gqlFetch(
          matEndpoint,
          apiKey,
          MAT_SFE_BY_BFE,
          { bfe: bfeNr, ...bitemporalArgs },
          "MAT_SFE",
          trace,
        );
        const sfeLokalId: string | null =
          sfeData?.MAT_SamletFastEjendom?.nodes?.[0]?.id_lokalId ?? null;

        if (sfeLokalId) {
          const jsData = await gqlFetch(
            matEndpoint,
            apiKey,
            MAT_JORDSTYKKER_BY_SFE,
            { sfeLokalId, ...bitemporalArgs },
            "MAT_Jordstykker",
            trace,
          );
          const jordstykker = mapJordstykker(jsData?.MAT_Jordstykke?.nodes ?? []);
          const grundareal = sumAreal(jordstykker);
          if (grundareal !== null) {
            return {
              grundareal,
              source: "ebr_husnummer_sfe",
              bfeNr,
              samletFastEjendomLokalId: sfeLokalId,
              jordstykker,
              fejl: null,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[GrundarealResolver] Rute 1 (EBR husnummer) fejlede:", (e as Error).message);
    }

    // --- Rute 2: EBR adresse → MAT Ejerlejlighed → SFE ---
    try {
      const ebrData = await gqlFetch(
        ebrEndpoint,
        apiKey,
        EBR_BY_ADRESSE,
        { adresseLokalId: input.adresseid, ...bitemporalArgs },
        "EBR_adresse",
        trace,
      );
      const bfeNr: string | null =
        ebrData?.EBR_Ejendomsbeliggenhed?.nodes?.[0]?.bestemtFastEjendomBFENr ?? null;

      if (bfeNr) {
        const ejData = await gqlFetch(
          matEndpoint,
          apiKey,
          MAT_EJERLEJLIGHED_BY_BFE,
          { bfe: bfeNr, ...bitemporalArgs },
          "MAT_Ejerlejlighed",
          trace,
        );
        const sfeLokalId: string | null =
          ejData?.MAT_Ejerlejlighed?.nodes?.[0]?.samletFastEjendomLokalId ?? null;

        if (sfeLokalId) {
          const jsData = await gqlFetch(
            matEndpoint,
            apiKey,
            MAT_JORDSTYKKER_BY_SFE,
            { sfeLokalId, ...bitemporalArgs },
            "MAT_Jordstykker_ej",
            trace,
          );
          const jordstykker = mapJordstykker(jsData?.MAT_Jordstykke?.nodes ?? []);
          const grundareal = sumAreal(jordstykker);
          if (grundareal !== null) {
            return {
              grundareal,
              source: "ebr_adresse_ejerlejlighed",
              bfeNr,
              samletFastEjendomLokalId: sfeLokalId,
              jordstykker,
              fejl: null,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[GrundarealResolver] Rute 2 (EBR adresse) fejlede:", (e as Error).message);
    }

    return {
      grundareal: null,
      source: null,
      bfeNr: null,
      samletFastEjendomLokalId: null,
      jordstykker: [],
      fejl: "GrundarealResolver: ingen af ruterne fandt grundareal",
    };
  }
}
