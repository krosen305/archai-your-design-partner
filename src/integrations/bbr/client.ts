// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// GraphQL integration til BBR via Datafordeleren (v2).
//
// Datafordeler GraphQL-begrænsninger (bekræftet via API-svar):
//   - Introspection er deaktiveret (HC0046)
//   - Aliases er ikke tilladt (DAF-GQL-0008)
//   - Kun ét root-felt pr. query (DAF-GQL-0010)
//   → BBR_Bygning og grundareal kræver separate kald
//
// Schema-kilde: https://graphql.datafordeler.dk/BBR/v2/schema (lokal kopi: schema/BBR.graphql)
// Feltnavne bekræftet mod schema:
//   BBR_Bygning:   byg021 (anvendelse), byg026 (opførelsesår), byg032 (ydervæg), byg033 (tag),
//                  byg038 (samlet areal), byg041 (bebygget areal), byg054 (etager),
//                  byg056 (varmeinstallation), byg057 (opvarmningsmiddel), byg070 (fredning)
//   BBR_Grund:     Indeholder IKKE grundareal – grundareal hentes fra MAT/DAR
//   Filter-felt:   husnummer (ikke husnummerIdentificerer)
//   mat_*-felter:  Sættes af analysis-orchestrator.ts via MatService (strandbeskyttelse/fredskov/klitfredning)

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

import { getEnvOptional, getEnvRequired } from "@/lib/env";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";

type BbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: BbrClientConfig) {
  const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");

  const endpoint =
    explicit?.endpoint ??
    getEnvOptional("DATAFORDELER_BBR_ENDPOINT") ??
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

// byg056 Varmeinstallation (primær)
const VARMEINSTALLATION_KODER: Record<string, string> = {
  "1": "Fjernvarme/blokvarme",
  "2": "Centralvarme (én fyringsenhed)",
  "3": "Ovn (el, gas, olie mv.)",
  "5": "Varmepumpe",
  "6": "Centralvarme (to fyringsenheder)",
  "7": "Etagecentralvarme",
  "8": "Ingen varmeinstallation",
  "9": "Blandet",
};

// byg057 Opvarmningsmiddel (primært brændstof)
const OPVARMNINGSMIDDEL_KODER: Record<string, string> = {
  "1": "El",
  "2": "Gasolin/olie",
  "3": "Gas",
  "4": "Fast brændsel (kul/koks/træ)",
  "6": "Halm",
  "7": "Naturgas",
  "8": "Fjernvarme",
  "9": "Biobrændsel",
  "10": "Solenergi",
  "11": "Andet",
};

// byg032 YdervaeggensMateriale
const YDERVAEGS_KODER: Record<string, string> = {
  "1": "Mursten/tegl",
  "2": "Letbeton/porebeton",
  "3": "Træbeklædning",
  "4": "Betonsten",
  "5": "Eternit/fibercement",
  "6": "Plastmateriale",
  "7": "Metal",
  "8": "Glas",
  "10": "Gul mursten",
  "11": "Rød mursten",
  "12": "Puds",
  "80": "Andet",
  "90": "Blandet",
};

// byg033 Tagdaekningsmateriale
const TAGDAEKNING_KODER: Record<string, string> = {
  "1": "Tagsten (tegl/beton)",
  "2": "Eternit/fibercement",
  "3": "Metaltagplader",
  "4": "Bygningsplader",
  "5": "Stråtag",
  "6": "Tagpap",
  "7": "Glas",
  "10": "Tagfolie",
  "11": "Grønt tag",
  "80": "Andet",
  "90": "Blandet",
};

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type BbrKompliantData = {
  // Eksisterende felter
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
  // Varme (byg056 + byg057) — bruges i energianalyse og fjernvarme-matching
  varmeinstallation: string | null;
  opvarmningsmiddel: string | null;
  // Materialer (byg032 + byg033) — bruges i AI-analyse og materialematch
  ydervaegs_materiale: string | null;
  tagdaekning: string | null;
  // Fredning (byg070) — direkte fra BBR, supplement til SAVE
  fredet: boolean | null;
  // Beskyttelseslinjer fra MAT_Jordstykke — sættes af orchestratoren
  mat_strandbeskyttelse: boolean | null;
  mat_fredskov: boolean | null;
  mat_klitfredning: boolean | null;
  // FBB-opslag (ARCH-131) — sættes af BbrService, bruges af FbbService
  bygning_lokal_id: string | null; // BBR UUID for primær bygning (= FBB bygningLokalId)
  fbb_reference: string | null; // byg071 — URI-link til FBB-registrering (null = ikke i FBB)
  alle_bygning_lokal_ids: string[]; // UUIDs for alle bygninger på adressen (inkl. sekundære)
  alle_bbr_public_ids: string[]; // FBB ois_id værdier afledt direkte fra BBR id_lokalId (ARCH-166)
};

// ---------------------------------------------------------------------------
// GraphQL Query – kun BBR_Bygning
// (BBR_Grund har intet grundareal-felt – grundareal sendes fra DAWA-laget)
// ---------------------------------------------------------------------------

// virkningstid er obligatorisk (DAF-GQL-0009) – Datafordeler er bitemporal.
// registreringstid medsendes også for at undgå historiske registreringsversioner (ARCH-221).
// byg071BevaringsvaerdighedReference: direkte link til FBB-registrering (ARCH-131)
const BYGNING_QUERY = `
query GetBygning($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  BBR_Bygning(
    where: { husnummer: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
  ) {
    nodes {
      id_lokalId
      byg021BygningensAnvendelse
      byg026Opfoerelsesaar
      byg032YdervaeggensMateriale
      byg033Tagdaekningsmateriale
      byg038SamletBygningsareal
      byg041BebyggetAreal
      byg054AntalEtager
      byg056Varmeinstallation
      byg057Opvarmningsmiddel
      byg070Fredning
      byg071BevaringsvaerdighedReference
    }
  }
}`;

// ---------------------------------------------------------------------------
// Hjælpefunktion: GraphQL-kald mod Datafordeler
// ---------------------------------------------------------------------------

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
      service: "Datafordeler BBR",
      operation: "BBR_Bygning",
      phase: "layer1",
      metadata: { endpoint: "BBR/v2" },
    },
  );

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
// Aggregeringskonstanter og -helper — ARCH-227
// ---------------------------------------------------------------------------

const SECONDARY_CODES = new Set(["910", "920", "930", "940"]);

/**
 * Aggregerer BBR-bygningsliste til compliance-summary.
 * Eksporteret for testbarhed uden netværk.
 *
 * - bebygget_areal: sum af ikke-sekundære bygningers footprint (byg041)
 * - fredet: true hvis NOGEN bygning har byg070Fredning != null/"0"/""
 * - primærBygning: første ikke-sekundære bygning (til UI-felter som byggeår, materiale)
 */
export function deriveBbrSummary(bygninger: any[]): {
  primærBygning: any | null;
  bebygget_areal: number | null;
  fredet: boolean | null;
} {
  if (!bygninger.length) {
    return { primærBygning: null, bebygget_areal: null, fredet: null };
  }

  const primærBygning =
    bygninger.find((b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? "")) ??
    bygninger[0];

  // Deduplicer på id_lokalId før aggregering — bygninger uden id medtages altid
  const seen = new Set<string>();
  const unikke = bygninger.filter((b) => {
    const id = b.id_lokalId as string | null | undefined;
    if (!id) return true; // ingen id → behold altid
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Sum footprint for alle ikke-sekundære bygninger (ARCH-227)
  const relevante = unikke.filter(
    (b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? ""),
  );
  const footprints = relevante
    .map((b) => b.byg041BebyggetAreal as number | undefined)
    .filter((a): a is number => a != null);
  const bebygget_areal = footprints.length > 0 ? footprints.reduce((s, a) => s + a, 0) : null;

  // fredet = true hvis NOGEN bygning har fredning sat (ARCH-227)
  const fredningsValues = unikke.map((b) => (b.byg070Fredning as string | null | undefined) ?? null);
  const hasAnyExplicitValue = fredningsValues.some((v) => v !== null);
  const fredet = hasAnyExplicitValue
    ? fredningsValues.some((v) => v !== null && v !== "0" && v !== "")
    : null;

  return { primærBygning, bebygget_areal, fredet };
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
    trace?: AnalysisTraceContext | null,
  ): Promise<BbrKompliantData> {
    const id = adgangsadresseid.trim();
    if (!id) {
      return this.getEmptyData("adgangsadresseid er påkrævet");
    }

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set("apiKey", apiKey);

    try {
      const data = await gqlFetch(url, BYGNING_QUERY, { id, ...currentBitemporalArgs() }, trace);

      // 1–2. Aggregér bygningsliste (ARCH-227)
      const bygninger: any[] = data?.BBR_Bygning?.nodes ?? [];
      const { primærBygning, bebygget_areal, fredet } = deriveBbrSummary(bygninger);

      if (!primærBygning) {
        return this.getEmptyData("Ingen bygning fundet på adressen");
      }

      const samlet_areal: number | null = primærBygning.byg038SamletBygningsareal ?? null;

      // 3. Bebyggelsesprocent (kræver grundareal fra DAWA-laget)
      let bebyggelsesprocent: number | null = null;
      if (bebygget_areal && grundareal && grundareal > 0) {
        bebyggelsesprocent = Math.round((bebygget_areal / grundareal) * 1000) / 10;
      }

      const anv_kode: string | null = primærBygning.byg021BygningensAnvendelse ?? null;
      const varme_kode: string | null = primærBygning.byg056Varmeinstallation?.toString() ?? null;
      const opv_kode: string | null = primærBygning.byg057Opvarmningsmiddel?.toString() ?? null;
      const yv_kode: string | null = primærBygning.byg032YdervaeggensMateriale?.toString() ?? null;
      const tag_kode: string | null = primærBygning.byg033Tagdaekningsmateriale?.toString() ?? null;

      // FBB: saml alle bygnings-UUIDs — bruges til SAVE-opslag (ARCH-131)
      const alle_bygning_lokal_ids: string[] = bygninger
        .map((b: any) => b.id_lokalId as string | null)
        .filter((id): id is string => !!id);

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
        varmeinstallation: varme_kode
          ? (VARMEINSTALLATION_KODER[varme_kode] ?? `Kode ${varme_kode}`)
          : null,
        opvarmningsmiddel: opv_kode
          ? (OPVARMNINGSMIDDEL_KODER[opv_kode] ?? `Kode ${opv_kode}`)
          : null,
        ydervaegs_materiale: yv_kode ? (YDERVAEGS_KODER[yv_kode] ?? `Kode ${yv_kode}`) : null,
        tagdaekning: tag_kode ? (TAGDAEKNING_KODER[tag_kode] ?? `Kode ${tag_kode}`) : null,
        fredet,
        mat_strandbeskyttelse: null,
        mat_fredskov: null,
        mat_klitfredning: null,
        bygning_lokal_id: primærBygning.id_lokalId ?? null,
        fbb_reference: primærBygning.byg071BevaringsvaerdighedReference ?? null,
        alle_bygning_lokal_ids,
        alle_bbr_public_ids: alle_bygning_lokal_ids,
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
      varmeinstallation: null,
      opvarmningsmiddel: null,
      ydervaegs_materiale: null,
      tagdaekning: null,
      fredet: null,
      mat_strandbeskyttelse: null,
      mat_fredskov: null,
      mat_klitfredning: null,
      bygning_lokal_id: null,
      fbb_reference: null,
      alle_bygning_lokal_ids: [],
      alle_bbr_public_ids: [],
    };
  }
}
