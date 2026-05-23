// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// VUR (Vurdering) GraphQL via Datafordeler.
//
// Opslag-kæde (3 kald):
//   VUR_BFEKrydsreference(BFEnummer) → fkEjendomsvurderingID (record-ID)
//   VUR_Ejendomsvurdering(id=recordId) → fkVurderingsejendomID (ejendoms-ID)
//   VUR_Ejendomsvurdering(fkVurderingsejendomID) → hent historik, vælg nyeste

import { z } from "zod";
import { getEnvRequired } from "@/lib/env";
import type { VurData } from "@/domain/contracts/analysis.types";
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import { runtimeConfig } from "@/lib/runtime-config";

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type { VurData } from "@/domain/contracts/analysis.types";

type VurClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

// ---------------------------------------------------------------------------
// GraphQL Queries
// ---------------------------------------------------------------------------

// Trin 1: Find et historisk Record-ID via BFE-nummer
const BFE_KRYDS_QUERY = `
query GetBFEKrydsreference($bfe: Long!) {
  VUR_BFEKrydsreference(where: { BFEnummer: { eq: $bfe } }, first: 1) {
    nodes {
      fkEjendomsvurderingID
      BFEnummer
    }
  }
}`;

// Trin 1.5: Find Ejendommens overordnede ID (fkVurderingsejendomID) ud fra Record-ID
const GET_PROPERTY_ID_QUERY = `
query GetPropertyID($recordId: Long!) {
  VUR_Ejendomsvurdering(where: { id: { eq: $recordId } }) {
    nodes {
      fkVurderingsejendomID
    }
  }
}`;

// Trin 2: Hent ALLE vurderinger knyttet til Ejendommens ID
const VURDERING_HISTORY_QUERY = `
query GetVurderingHistory($propId: Long!) {
  VUR_Ejendomsvurdering(
    where: { fkVurderingsejendomID: { eq: $propId } }
    first: 100
  ) {
    nodes {
      ejendomvaerdiBeloeb
      grundvaerdiBeloeb
      vurderetAreal
      aar
    }
  }
}`;

const vurKrydsreferenceSchema = z.object({
  VUR_BFEKrydsreference: z.object({
    nodes: z.array(
      z.object({
        fkEjendomsvurderingID: z.coerce.number().nullable().optional().default(null),
        BFEnummer: z.coerce.number().nullable().optional().default(null),
      }),
    ),
  }),
});

const vurPropertyIdSchema = z.object({
  VUR_Ejendomsvurdering: z.object({
    nodes: z.array(
      z.object({
        fkVurderingsejendomID: z.coerce.number().nullable().optional().default(null),
      }),
    ),
  }),
});

const vurHistorySchema = z.object({
  VUR_Ejendomsvurdering: z.object({
    nodes: z.array(
      z.object({
        ejendomvaerdiBeloeb: z.coerce.number().nullable().optional().default(null),
        grundvaerdiBeloeb: z.coerce.number().nullable().optional().default(null),
        vurderetAreal: z.coerce.number().nullable().optional().default(null),
        aar: z.coerce.number().nullable().optional().default(null),
      }),
    ),
  }),
});

// ---------------------------------------------------------------------------
// VurService
// ---------------------------------------------------------------------------

export class VurService {
  /**
   * Henter den absolut nyeste ejendomsvurdering via BFE-nummer.
   * Går gennem 3 led for at sikre, at vi ikke sidder fast i gamle historiske data.
   */
  static async getVurdering(
    bfeNr: string,
    config?: VurClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<VurData> {
    const bfe = parseInt(bfeNr, 10);
    if (isNaN(bfe)) {
      return this.errorResult(bfeNr, `Ugyldigt BFE-nummer format: ${bfeNr}`);
    }

    try {
      const { apiKey, endpoint } = this.getConfig(config);
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);

      // ── Trin 1: Find record-ID via BFE-krydsreference ──────────────────
      const krydsData = await this.gqlFetch(
        url,
        BFE_KRYDS_QUERY,
        { bfe },
        "VUR_BFEKrydsreference",
        vurKrydsreferenceSchema,
        trace,
      );
      const recordId = krydsData?.VUR_BFEKrydsreference?.nodes?.[0]?.fkEjendomsvurderingID;

      if (!recordId) {
        return this.errorResult(bfeNr, `Ingen VUR-krydsreference fundet for BFE ${bfe}`);
      }

      // ── Trin 1.5: Find ejendoms-ID via record-ID ────────────────────────
      const propData = await this.gqlFetch(
        url,
        GET_PROPERTY_ID_QUERY,
        { recordId },
        "VUR_Ejendomsvurdering_property_id",
        vurPropertyIdSchema,
        trace,
      );
      const propertyId = propData?.VUR_Ejendomsvurdering?.nodes?.[0]?.fkVurderingsejendomID;

      if (!propertyId) {
        return this.errorResult(bfeNr, "fkVurderingsejendomID ikke fundet via record-ID");
      }

      // ── Trin 2: Hent vurderingshistorik og vælg nyeste ──────────────────
      const historyData = await this.gqlFetch(
        url,
        VURDERING_HISTORY_QUERY,
        { propId: propertyId },
        "VUR_Ejendomsvurdering_history",
        vurHistorySchema,
        trace,
      );
      const nodes = historyData.VUR_Ejendomsvurdering.nodes;

      if (nodes.length === 0) {
        return this.errorResult(bfeNr, `Ingen vurderingsdata fundet for ejendoms-ID ${propertyId}`);
      }

      const nyeste = nodes.sort((a, b) => (b.aar || 0) - (a.aar || 0))[0];

      return {
        ejendomsvaerdi: nyeste.ejendomvaerdiBeloeb ?? null,
        grundvaerdi: nyeste.grundvaerdiBeloeb ?? null,
        vurderetAreal: nyeste.vurderetAreal ?? null,
        vurderingsaar: nyeste.aar ?? null,
        bfeNr,
        fejl: null,
      };
    } catch (e) {
      logServerEvent({
        module: "vur/client",
        operation: "getVurData",
        severity: "fatal",
        message: "Service fejl",
        error: e,
      });
      return this.errorResult(bfeNr, (e as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // Hjælpefunktioner (Private)
  // -------------------------------------------------------------------------

  private static getConfig(explicit?: VurClientConfig) {
    const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");
    const endpoint = explicit?.endpoint ?? runtimeConfig.integrations.datafordeler.vurEndpoint;
    return { apiKey, endpoint };
  }

  private static async gqlFetch<T>(
    url: URL,
    query: string,
    variables: Record<string, unknown>,
    operation: string,
    dataSchema: z.ZodType<T>,
    trace?: AnalysisTraceContext | null,
  ): Promise<T> {
    return datafordelerGraphqlFetch(url, query, variables, operation, dataSchema, {
      trace,
      phase: "layer1",
      metadata: { endpoint: "VUR/v1" },
    });
  }

  private static errorResult(bfeNr: string, msg: string): VurData {
    return {
      ejendomsvaerdi: null,
      grundvaerdi: null,
      vurderetAreal: null,
      vurderingsaar: null,
      bfeNr,
      fejl: msg,
    };
  }
}
