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

export type BbrBygning = {
  id_lokalId: string | null;
  byg007Bygningsnummer: number | null;
  byg021BygningensAnvendelse: string | null;
  byg024AntalLejlighederMedKoekken: number | null;
  byg025AntalLejlighederUdenKoekken: number | null;
  byg026Opfoerelsesaar: number | null;
  byg027OmTilbygningsaar: number | null;
  byg029DatoForMidlertidigOpfoertBygning: string | null;
  byg032YdervaeggensMateriale: string | null;
  byg033Tagdaekningsmateriale: string | null;
  byg038SamletBygningsareal: number | null;
  byg039BygningensSamledeBoligAreal: number | null;
  byg040BygningensSamledeErhvervsAreal: number | null;
  byg041BebyggetAreal: number | null;
  byg054AntalEtager: number | null;
  byg055AfvigendeEtager: string | null;
  byg056Varmeinstallation: string | null;
  byg057Opvarmningsmiddel: string | null;
  byg070Fredning: string | null;
  byg071BevaringsvaerdighedReference: string | null;
  byg094Revisionsdato: string | null;
  status: string | null;
  registreringFra: string | null;
  registreringTil: string | null;
  virkningFra: string | null;
  virkningTil: string | null;
};

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
  bygning_lokal_id: string | null; // BBR UUID for canonical bygning (= FBB bygningLokalId)
  fbb_reference: string | null; // byg071 — URI-link til FBB-registrering (null = ikke i FBB)
  alle_bygning_lokal_ids: string[]; // UUIDs for alle bygninger på adressen (inkl. sekundære)
  alle_bbr_public_ids: string[]; // FBB ois_id værdier afledt direkte fra BBR id_lokalId (ARCH-166)
  jordstykke_lokal_id: string | null; // primær MAT_Jordstykke id_lokalId til MatrikelMap (ARCH-223/229)
  // Canonical building metadata — which building was selected and why
  canonical_building_lokal_id: string | null;
  canonical_selection_reason: string | null;
  canonical_candidates_count: number;
  aggregated_bebygget_areal_all_primary: number | null;
  bygning_samlet_boligareal: number | null; // byg039BygningensSamledeBoligAreal from canonical
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
      byg007Bygningsnummer
      byg021BygningensAnvendelse
      byg024AntalLejlighederMedKoekken
      byg025AntalLejlighederUdenKoekken
      byg026Opfoerelsesaar
      byg027OmTilbygningsaar
      byg029DatoForMidlertidigOpfoertBygning
      byg032YdervaeggensMateriale
      byg033Tagdaekningsmateriale
      byg038SamletBygningsareal
      byg039BygningensSamledeBoligAreal
      byg040BygningensSamledeErhvervsAreal
      byg041BebyggetAreal
      byg054AntalEtager
      byg055AfvigendeEtager
      byg056Varmeinstallation
      byg057Opvarmningsmiddel
      byg070Fredning
      byg071BevaringsvaerdighedReference
      byg094Revisionsdato
      status
      registreringFra
      registreringTil
      virkningFra
      virkningTil
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

// ---------------------------------------------------------------------------
// selectCanonicalBuilding — ARCH-task (Byledet 3 fix)
// ---------------------------------------------------------------------------

const BOLIG_KODER = new Set(["110", "120", "121", "122", "130", "140", "510"]);

function scoreBygning(b: BbrBygning): number {
  let score = 0;
  if (BOLIG_KODER.has(b.byg021BygningensAnvendelse ?? "")) score += 1000;
  if (b.byg039BygningensSamledeBoligAreal != null) score += 200;
  if (b.byg038SamletBygningsareal != null) score += 150;
  if (b.byg041BebyggetAreal != null) score += 100;
  if (b.byg054AntalEtager != null) score += 80;
  if (b.byg094Revisionsdato != null) score += 60;
  if (b.byg026Opfoerelsesaar != null) score += 40;
  return score;
}

function buildingIsActive(b: BbrBygning): boolean {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  if (b.virkningTil != null && b.virkningTil <= now) return false;
  if (b.registreringTil != null && b.registreringTil <= now) return false;
  if (
    b.byg029DatoForMidlertidigOpfoertBygning != null &&
    b.byg029DatoForMidlertidigOpfoertBygning < today
  )
    return false;
  return true;
}

export function selectCanonicalBuilding(bygninger: BbrBygning[]): {
  canonical: BbrBygning | null;
  reason: string | null;
} {
  if (!bygninger.length) return { canonical: null, reason: null };

  const nonSecondary = bygninger.filter(
    (b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? ""),
  );

  const active = nonSecondary.filter(buildingIsActive);
  const candidates = active.length > 0 ? active : nonSecondary;

  if (!candidates.length) return { canonical: bygninger[0], reason: "fallback_no_primary" };
  if (candidates.length === 1) return { canonical: candidates[0], reason: "only_candidate" };

  const sorted = [...candidates].sort((a, b) => {
    const diff = scoreBygning(b) - scoreBygning(a);
    if (diff !== 0) return diff;

    // Tie-break 1: newest revisionsdato
    const revA = a.byg094Revisionsdato ?? "";
    const revB = b.byg094Revisionsdato ?? "";
    if (revA !== revB) return revB.localeCompare(revA);

    // Tie-break 2: highest opfoerelsesaar
    const aarA = a.byg026Opfoerelsesaar ?? 0;
    const aarB = b.byg026Opfoerelsesaar ?? 0;
    if (aarA !== aarB) return aarB - aarA;

    // Tie-break 3: highest boligareal
    const boligA = a.byg039BygningensSamledeBoligAreal ?? 0;
    const boligB = b.byg039BygningensSamledeBoligAreal ?? 0;
    if (boligA !== boligB) return boligB - boligA;

    // Tie-break 4: highest samlet areal
    const samletA = a.byg038SamletBygningsareal ?? 0;
    const samletB = b.byg038SamletBygningsareal ?? 0;
    if (samletA !== samletB) return samletB - samletA;

    // Tie-break 5: highest bebygget areal
    return (b.byg041BebyggetAreal ?? 0) - (a.byg041BebyggetAreal ?? 0);
  });

  const canonical = sorted[0];
  const reason = canonical.byg094Revisionsdato
    ? "newest_complete_residential"
    : canonical.byg026Opfoerelsesaar
      ? "newest_residential_by_year"
      : "highest_score_residential";

  return { canonical, reason };
}

/**
 * Aggregerer BBR-bygningsliste til compliance-summary.
 * Eksporteret for testbarhed uden netværk.
 *
 * - canonicalBuilding: bedste kandidat valgt af selectCanonicalBuilding
 * - bebygget_areal: canonical buildings footprint (byg041) — ikke en sum
 * - aggregated_bebygget_areal_all_primary: sum af alle ikke-sekundære bygningers footprint (debug)
 * - fredet: true hvis NOGEN bygning har byg070Fredning != null/"0"/""
 */
export function deriveBbrSummary(bygninger: BbrBygning[]): {
  canonicalBuilding: BbrBygning | null;
  canonicalReason: string | null;
  candidatesCount: number;
  bebygget_areal: number | null;
  aggregated_bebygget_areal_all_primary: number | null;
  fredet: boolean | null;
} {
  if (!bygninger.length) {
    return {
      canonicalBuilding: null,
      canonicalReason: null,
      candidatesCount: 0,
      bebygget_areal: null,
      aggregated_bebygget_areal_all_primary: null,
      fredet: null,
    };
  }

  // Deduplicate on id_lokalId
  const seen = new Set<string>();
  const deduped = bygninger.filter((b) => {
    const id = b.id_lokalId;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const { canonical: canonicalBuilding, reason: canonicalReason } =
    selectCanonicalBuilding(deduped);

  // Count primary (non-secondary) candidates after dedup
  const primaryCandidates = deduped.filter(
    (b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? ""),
  );
  const candidatesCount = primaryCandidates.length;

  // canonical building's footprint (not an aggregate sum)
  const bebygget_areal = canonicalBuilding?.byg041BebyggetAreal ?? null;

  // Aggregate footprint for all primary buildings — debug field only
  const footprints = primaryCandidates
    .map((b) => b.byg041BebyggetAreal)
    .filter((a): a is number => a != null);
  const aggregated_bebygget_areal_all_primary =
    footprints.length > 0 ? footprints.reduce((s, a) => s + a, 0) : null;

  // fredet: true if ANY building has fredning set
  const fredningsValues = deduped.map((b) => b.byg070Fredning ?? null);
  const hasAnyExplicit = fredningsValues.some((v) => v !== null);
  const fredet = hasAnyExplicit
    ? fredningsValues.some((v) => v !== null && v !== "0" && v !== "")
    : null;

  return {
    canonicalBuilding,
    canonicalReason,
    candidatesCount,
    bebygget_areal,
    aggregated_bebygget_areal_all_primary,
    fredet,
  };
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
      const bygninger: BbrBygning[] = data?.BBR_Bygning?.nodes ?? [];
      const {
        canonicalBuilding,
        canonicalReason,
        candidatesCount,
        bebygget_areal,
        aggregated_bebygget_areal_all_primary,
        fredet,
      } = deriveBbrSummary(bygninger);

      if (!canonicalBuilding) {
        return this.getEmptyData("Ingen bygning fundet på adressen");
      }

      // samlet_areal: prefer byg039 (net residential area) over byg038 (gross total)
      const samlet_areal: number | null =
        canonicalBuilding.byg039BygningensSamledeBoligAreal ??
        canonicalBuilding.byg038SamletBygningsareal ??
        null;

      // 3. Bebyggelsesprocent (kræver grundareal fra DAWA-laget)
      let bebyggelsesprocent: number | null = null;
      if (bebygget_areal && grundareal && grundareal > 0) {
        bebyggelsesprocent = Math.round((bebygget_areal / grundareal) * 1000) / 10;
      }

      const anv_kode: string | null = canonicalBuilding.byg021BygningensAnvendelse ?? null;
      const varme_kode: string | null =
        canonicalBuilding.byg056Varmeinstallation?.toString() ?? null;
      const opv_kode: string | null = canonicalBuilding.byg057Opvarmningsmiddel?.toString() ?? null;
      const yv_kode: string | null =
        canonicalBuilding.byg032YdervaeggensMateriale?.toString() ?? null;
      const tag_kode: string | null =
        canonicalBuilding.byg033Tagdaekningsmateriale?.toString() ?? null;

      // FBB: saml alle bygnings-UUIDs — bruges til SAVE-opslag (ARCH-131)
      // Deduplikér på id_lokalId for at undgå redundante FBB-opslag ved bitemporal-dubletter
      const alle_bygning_lokal_ids: string[] = [
        ...new Set(
          bygninger
            .map((b: any) => b.id_lokalId as string | null)
            .filter((id): id is string => !!id),
        ),
      ];

      return {
        byggeaar: canonicalBuilding.byg026Opfoerelsesaar?.toString() ?? null,
        bebygget_areal,
        samlet_areal,
        antal_etager: canonicalBuilding.byg054AntalEtager ?? null,
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
        bygning_lokal_id: canonicalBuilding.id_lokalId ?? null,
        fbb_reference: canonicalBuilding.byg071BevaringsvaerdighedReference ?? null,
        alle_bygning_lokal_ids,
        alle_bbr_public_ids: alle_bygning_lokal_ids,
        jordstykke_lokal_id: null,
        canonical_building_lokal_id: canonicalBuilding.id_lokalId ?? null,
        canonical_selection_reason: canonicalReason,
        canonical_candidates_count: candidatesCount,
        aggregated_bebygget_areal_all_primary,
        bygning_samlet_boligareal: canonicalBuilding.byg039BygningensSamledeBoligAreal ?? null,
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
      jordstykke_lokal_id: null,
      canonical_building_lokal_id: null,
      canonical_selection_reason: null,
      canonical_candidates_count: 0,
      aggregated_bebygget_areal_all_primary: null,
      bygning_samlet_boligareal: null,
    };
  }
}
