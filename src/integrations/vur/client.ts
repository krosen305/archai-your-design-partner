// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// VUR (Vurdering) GraphQL via Datafordeler.
//
// Bruges til: ejendomsværdi + grundværdi fra seneste ejendomsvurdering.
// Input: BFE-nummer (fra EBR_Ejendomsbeliggenhed.bestemtFastEjendomBFENr)
//
// Schema: schema/VUR.graphql (gitignored, lokal kopi)
// Opslag-kæde (2 kald):
//   VUR_BFEKrydsreference(BFEnummer) → fkEjendomsvurderingID
//   VUR_Ejendomsvurdering(fkVurderingsejendomID) → ejendomvaerdiBeloeb, grundvaerdiBeloeb, vurderetAreal
//
// VUR har ingen @filterRequirement → virkningstid er ikke obligatorisk.
// Hent seneste vurdering med first:1 + orderBy seneste aar.

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

type VurClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: VurClientConfig) {
  const apiKey = explicit?.apiKey ?? (process as any)?.env?.DATAFORDELER_API_KEY ?? "";

  const endpoint =
    explicit?.endpoint ??
    (process as any)?.env?.DATAFORDELER_VUR_ENDPOINT ??
    "https://graphql.datafordeler.dk/VUR/v1";

  if (!apiKey) {
    throw new Error(
      "VUR GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

// Trin 1: Find fkEjendomsvurderingID via BFE-nummer
const BFE_KRYDS_QUERY = `
query GetBFEKrydsreference($bfe: Long!) {
  VUR_BFEKrydsreference(
    where: { BFEnummer: { eq: $bfe } }
    first: 1
  ) {
    nodes {
      fkEjendomsvurderingID
      BFEnummer
    }
  }
}`;

// Trin 2: Hent seneste ejendomsvurdering via fkVurderingsejendomID
// first:1 returnerer den nyeste (Datafordeler returnerer nyeste pr. default)
const VURDERING_QUERY = `
query GetEjendomsvurdering($vurderingsejendomId: Long!) {
  VUR_Ejendomsvurdering(
    where: { fkVurderingsejendomID: { eq: $vurderingsejendomId } }
    first: 1
  ) {
    nodes {
      ejendomvaerdiBeloeb
      grundvaerdiBeloeb
      vurderetAreal
      aar
    }
  }
}`;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type VurData = {
  ejendomsvaerdi: number | null;
  grundvaerdi: number | null;
  vurderetAreal: number | null;
  vurderingsaar: number | null;
  bfeNr: string;
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
    console.error("[VUR] HTTP-fejl:", {
      status: response.status,
      keyHint: `${keyHint}…`,
      body: bodyText.slice(0, 500),
    });
    throw new Error(`VUR Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);

  if (parsed.errors?.length) {
    console.error("[VUR] GraphQL-fejl:", parsed.errors);
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// VurService
// ---------------------------------------------------------------------------

export class VurService {
  /**
   * Henter seneste ejendomsvurdering (ejendomsværdi + grundværdi) via BFE-nummer.
   *
   * Kæde: BFEnummer → VUR_BFEKrydsreference.fkEjendomsvurderingID → VUR_Ejendomsvurdering
   *
   * @param bfeNr  BFE-nummer fra EBR (streng, konverteres til Long)
   */
  static async getVurdering(bfeNr: string, config?: VurClientConfig): Promise<VurData> {
    const bfe = parseInt(bfeNr, 10);
    if (isNaN(bfe)) {
      return { ejendomsvaerdi: null, grundvaerdi: null, vurderetAreal: null, vurderingsaar: null, bfeNr, fejl: `Ugyldigt BFE-nummer: ${bfeNr}` };
    }

    try {
      const { apiKey, endpoint } = getConfig(config);
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);

      // ── Trin 1: BFEKrydsreference ──────────────────────────────────────────
      const krydsData = await gqlFetch(url, BFE_KRYDS_QUERY, { bfe });
      const krydsNodes: any[] = krydsData?.VUR_BFEKrydsreference?.nodes ?? [];

      if (!krydsNodes.length) {
        return {
          ejendomsvaerdi: null, grundvaerdi: null, vurderetAreal: null, vurderingsaar: null,
          bfeNr,
          fejl: `VUR_BFEKrydsreference ikke fundet for BFEnummer ${bfe}`,
        };
      }

      const vurderingsejendomId: number | null = krydsNodes[0].fkEjendomsvurderingID ?? null;
      if (vurderingsejendomId === null) {
        return {
          ejendomsvaerdi: null, grundvaerdi: null, vurderetAreal: null, vurderingsaar: null,
          bfeNr,
          fejl: "fkEjendomsvurderingID mangler på VUR_BFEKrydsreference",
        };
      }

      // ── Trin 2: Ejendomsvurdering ──────────────────────────────────────────
      const vurData = await gqlFetch(url, VURDERING_QUERY, { vurderingsejendomId });
      const vurNodes: any[] = vurData?.VUR_Ejendomsvurdering?.nodes ?? [];

      if (!vurNodes.length) {
        return {
          ejendomsvaerdi: null, grundvaerdi: null, vurderetAreal: null, vurderingsaar: null,
          bfeNr,
          fejl: `VUR_Ejendomsvurdering ikke fundet for fkVurderingsejendomID ${vurderingsejendomId}`,
        };
      }

      const v = vurNodes[0];
      return {
        ejendomsvaerdi: v.ejendomvaerdiBeloeb ?? null,
        grundvaerdi: v.grundvaerdiBeloeb ?? null,
        vurderetAreal: v.vurderetAreal ?? null,
        vurderingsaar: v.aar ?? null,
        bfeNr,
        fejl: null,
      };
    } catch (e) {
      console.error("[VUR] Service fejl:", e);
      return {
        ejendomsvaerdi: null, grundvaerdi: null, vurderetAreal: null, vurderingsaar: null,
        bfeNr,
        fejl: (e as Error).message,
      };
    }
  }
}
