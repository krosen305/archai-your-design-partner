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
// EBR v1 kræver bitemporal parameter (virkningstid) for at filtrere på husnummerLokalId
// (ikke-indekseret felt). Kæde: DAR_Husnummer.id_lokalId → EBR.husnummerLokalId → BFEnr → VUR.

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

import { getEnvRequired } from "@/lib/env";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import { logServerEvent } from "@/lib/server-logger";
import { runtimeConfig } from "@/lib/runtime-config";
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";

type EbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: EbrClientConfig) {
  const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");

  const endpoint = explicit?.endpoint ?? runtimeConfig.integrations.datafordeler.ebrEndpoint;

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// GraphQL query — filtrerer på husnummerLokalId (= DAR_Husnummer.id_lokalId)
// ---------------------------------------------------------------------------

const BELIGGENHED_QUERY = `
query GetEjendomsbeliggenhed($husnummerLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { husnummerLokalId: { eq: $husnummerLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      bestemtFastEjendomBFENr
      husnummerLokalId
      id_lokalId
    }
  }
}`;

const BELIGGENHED_ADRESSE_QUERY = `
query GetEjendomsbeliggenhedByAdresse($adresseLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { adresseLokalId: { eq: $adresseLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      bestemtFastEjendomBFENr
      adresseLokalId
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

type EbrBeliggenhedNode = {
  bestemtFastEjendomBFENr: string | null;
  husnummerLokalId: string | null;
  id_lokalId: string | null;
  adresseLokalId?: string | null;
};

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
      const data = await datafordelerGraphqlFetch<{
        EBR_Ejendomsbeliggenhed: { nodes: EbrBeliggenhedNode[] };
      }>(
        url,
        BELIGGENHED_QUERY,
        { husnummerLokalId: id, ...currentBitemporalArgs() },
        "EBR_Ejendomsbeliggenhed",
        { trace, phase: "layer1", metadata: { endpoint: "EBR/v1" } },
      );
      const nodes = data.EBR_Ejendomsbeliggenhed.nodes;

      if (!nodes.length) {
        return {
          bfeNr: null,
          fejl: `EBR_Ejendomsbeliggenhed ikke fundet for husnummerLokalId ${id}`,
        };
      }

      const bfeNr: string | null = nodes[0].bestemtFastEjendomBFENr ?? null;
      return { bfeNr, fejl: null };
    } catch (e) {
      logServerEvent({
        module: "ebr/client",
        operation: "getBfeNrByHusnummer",
        severity: "fatal",
        message: "Service fejl",
        error: e,
      });
      return { bfeNr: null, fejl: (e as Error).message };
    }
  }

  /**
   * Slår BFE-nummer op via DAR_Adresse.id_lokalId (= adresseLokalId).
   * Bruges til ejerlejligheder hvor adresseLokalId giver ejerlejlighedens BFE.
   *
   * @param adresseLokalId  DAR_Adresse.id_lokalId (= adresseid i vores system)
   */
  static async getBfeNrByAdresse(
    adresseLokalId: string,
    config?: EbrClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<EbrResult> {
    const id = adresseLokalId.trim();
    if (!id) return { bfeNr: null, fejl: "adresseLokalId er påkrævet" };

    try {
      const { apiKey, endpoint } = getConfig(config);
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);
      const data = await datafordelerGraphqlFetch<{
        EBR_Ejendomsbeliggenhed: { nodes: EbrBeliggenhedNode[] };
      }>(
        url,
        BELIGGENHED_ADRESSE_QUERY,
        { adresseLokalId: id, ...currentBitemporalArgs() },
        "EBR_Ejendomsbeliggenhed",
        { trace, phase: "layer1", metadata: { endpoint: "EBR/v1" } },
      );
      const nodes = data.EBR_Ejendomsbeliggenhed.nodes;

      if (!nodes.length) {
        return {
          bfeNr: null,
          fejl: `EBR_Ejendomsbeliggenhed ikke fundet for adresseLokalId ${id}`,
        };
      }

      return { bfeNr: nodes[0].bestemtFastEjendomBFENr ?? null, fejl: null };
    } catch (e) {
      logServerEvent({
        module: "ebr/client",
        operation: "getBfeNrByAdresse",
        severity: "fatal",
        message: "getBfeNrByAdresse fejl",
        error: e,
      });
      return { bfeNr: null, fejl: (e as Error).message };
    }
  }
}
