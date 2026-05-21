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

import { getEnvRequired } from "@/lib/env";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import { runtimeConfig } from "@/lib/runtime-config";
import {
  anvendelseLabel,
  opvarmningsmiddelLabel,
  tagdaekningLabel,
  varmeinstallationLabel,
  ydervaegsMaterialeLabel,
} from "@/domain/bbr/code-lists";
import {
  deriveBbrSummary as deriveBbrSummaryPure,
  selectCanonicalBuilding as selectCanonicalBuildingPure,
} from "@/domain/bbr/canonical-building";
import { parseBbrBygninger } from "@/domain/bbr/node-decoder";

type BbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

function getConfig(explicit?: BbrClientConfig) {
  const apiKey = explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY");

  const endpoint = explicit?.endpoint ?? runtimeConfig.integrations.datafordeler.bbrEndpoint;

  if (!apiKey) {
    throw new Error(
      "BBR GraphQL: Manglende DATAFORDELER_API_KEY. " +
        "Sæt denne som environment variable (uden VITE_ prefix).",
    );
  }

  return { apiKey, endpoint };
}

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
// (BBR_Grund har intet grundareal-felt – grundareal sendes fra DAR/MAT-laget)
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
    logServerEvent({
      module: "bbr/client",
      operation: "graphqlFetch",
      severity: "fatal",
      message: "HTTP-fejl",
      metadata: {
        status: response.status,
        keyHint: `${keyHint}…`,
        body: bodyText.slice(0, 500),
        wwwAuth: response.headers.get("www-authenticate") ?? "",
      },
    });
    throw new Error(`Datafordeler HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText);

  if (parsed.errors?.length) {
    logServerEvent({
      module: "bbr/client",
      operation: "graphqlFetch",
      severity: "fatal",
      message: "GraphQL-fejl",
      metadata: { errors: parsed.errors },
    });
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Aggregeringskonstanter og -helper — ARCH-227
// ---------------------------------------------------------------------------

export const selectCanonicalBuilding = selectCanonicalBuildingPure;

/**
 * Aggregerer BBR-bygningsliste til compliance-summary.
 * Eksporteret for testbarhed uden netværk.
 *
 * - canonicalBuilding: bedste kandidat valgt af selectCanonicalBuilding
 * - bebygget_areal: canonical buildings footprint (byg041) — ikke en sum
 * - aggregated_bebygget_areal_all_primary: sum af alle ikke-sekundære bygningers footprint (debug)
 * - fredet: true hvis NOGEN bygning har byg070Fredning != null/"0"/""
 */
export const deriveBbrSummary = deriveBbrSummaryPure;

// ---------------------------------------------------------------------------
// BbrService
// ---------------------------------------------------------------------------

export class BbrService {
  /**
   * Henter BBR-bygningsdata via Datafordelers GraphQL v2-endpoint.
   *
   * @param adgangsadresseid  DAR/BBR husnummer-UUID (= BBR's husnummer-filter)
   * @param grundareal        Grundareal i m² fra DAR/MAT (jordstykke.registreretAreal)
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
      const bygninger: BbrBygning[] = parseBbrBygninger(data);
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

      await recordAnalysisEvent(trace, {
        eventType: "pipeline_step",
        phase: "layer1",
        service: "BBR",
        operation: "canonical_selection",
        status: "ok",
        outputSummary:
          `building_count=${bygninger.length}` +
          ` primary_candidates=${candidatesCount}` +
          ` canonical=${canonicalBuilding.id_lokalId?.slice(0, 8) ?? "null"}` +
          ` footprint_selected=${bebygget_areal}` +
          ` footprint_aggregated=${aggregated_bebygget_areal_all_primary}` +
          ` reason=${canonicalReason}`,
      });

      // byg039 = net boligareal (preferred); byg038 = gross total incl. utility areas (fallback)
      const samlet_areal: number | null =
        canonicalBuilding.byg039BygningensSamledeBoligAreal ??
        canonicalBuilding.byg038SamletBygningsareal ??
        null;

      // 3. Bebyggelsesprocent (kræver grundareal fra MAT/DAR-laget)
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
        ...new Set(bygninger.map((b) => b.id_lokalId).filter((id): id is string => !!id)),
      ];

      return {
        byggeaar: canonicalBuilding.byg026Opfoerelsesaar?.toString() ?? null,
        bebygget_areal,
        samlet_areal,
        antal_etager: canonicalBuilding.byg054AntalEtager ?? null,
        anvendelseskode: anv_kode,
        anvendelse_tekst: anvendelseLabel(anv_kode),
        grundareal,
        bebyggelsesprocent,
        beregning_mulig: bebyggelsesprocent !== null,
        fejl: grundareal
          ? null
          : "Grundareal ikke tilgængeligt – bebyggelsesprocent kan ikke beregnes",
        varmeinstallation: varmeinstallationLabel(varme_kode),
        opvarmningsmiddel: opvarmningsmiddelLabel(opv_kode),
        ydervaegs_materiale: ydervaegsMaterialeLabel(yv_kode),
        tagdaekning: tagdaekningLabel(tag_kode),
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
      logServerEvent({
        module: "bbr/client",
        operation: "getBbrData",
        severity: "fatal",
        message: "Service fejl",
        error: e,
      });
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
