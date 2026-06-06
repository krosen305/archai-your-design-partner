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
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
import { runtimeConfig } from "@/lib/runtime-config";
import {
  anvendelseLabel,
  opvarmningsmiddelLabel,
  tagdaekningLabel,
  varmeinstallationLabel,
  ydervaegsMaterialeLabel,
  vandforsyningLabel,
  afloebsforholdLabel,
} from "@/domain/bbr/code-lists";
import {
  deriveBbrSummary as deriveBbrSummaryPure,
  selectCanonicalBuilding as selectCanonicalBuildingPure,
} from "@/domain/bbr/canonical-building";
import { parseBbrBygninger } from "@/domain/bbr/node-decoder";
import {
  bbrBuildingsResponseSchema,
  bbrGroundResponseSchema,
  bbrTechnicalInstallationsResponseSchema,
  bbrUnitsResponseSchema,
  type BbrBuildingDueDiligenceNode,
  type BbrGroundNode,
  type BbrTechnicalInstallationNode,
  type BbrUnitNode,
} from "@/domain/bbr/bbr-due-diligence.schemas";
import { resolveBbrCode } from "@/domain/bbr/code-registry";
import type {
  BbrBuildingRecord,
  BbrCodeValue,
  BbrDueDiligenceData,
  BbrGroundRecord,
  BbrObjectDisplayState,
  BbrQualityNotice,
  BbrTechnicalInstallationRecord,
  BbrUnitRecord,
} from "@/domain/contracts/bbr-due-diligence.types";

type BbrClientConfig = {
  apiKey?: string;
  endpoint?: string;
};

type DueDiligenceInput = {
  husnummerId: string;
  adresseId?: string | null;
  grundarealM2?: number | null;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ukendt BBR-fejl";
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
  byg030Vandforsyning: string | null;
  byg031Afloebsforhold: string | null;
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
  byg058SupplerendeVarme: string | null;
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
  jordstykke_lokal_id: string | null; // primær MAT_Jordstykke id_lokalId til MatrikelMap (ARCH-223/229)
  // Canonical building metadata — which building was selected and why
  canonical_building_lokal_id: string | null;
  canonical_selection_reason: string | null;
  canonical_candidates_count: number;
  aggregated_bebygget_areal_all_primary: number | null;
  bygning_samlet_boligareal: number | null; // byg039BygningensSamledeBoligAreal from canonical
  // ARCH-246: Due-diligence felter
  ombygningsaar: number | null; // byg027 — nu eksponeret i output
  vandforsyning_kode: string | null; // byg030 raw kode
  vandforsyning: string | null; // byg030 label
  afloebsforhold_kode: string | null; // byg031 raw kode
  afloebsforhold: string | null; // byg031 label
  ydervaegs_materiale_kode: string | null; // byg032 raw kode (bruges i saneringsrisiko)
  tagdaekning_kode: string | null; // byg033 raw kode (bruges i saneringsrisiko)
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
      byg030Vandforsyning
      byg031Afloebsforhold
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
      byg058SupplerendeVarme
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

const DUE_DILIGENCE_BUILDING_QUERY = BYGNING_QUERY;

const UNIT_QUERY = `
query GetEnhed($buildingId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  BBR_Enhed(
    where: { bygning: { eq: $buildingId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
  ) {
    nodes {
      id_lokalId
      bygning
      adresseIdentificerer
      enh020EnhedensAnvendelse
      enh026EnhedensSamledeAreal
      enh027ArealTilBeboelse
      enh031AntalVaerelser
      enh032Toiletforhold
      enh033Badeforhold
      enh034Koekkenforhold
      enh065AntalVandskylledeToiletter
      enh066AntalBadevaerelser
      status
      registreringTil
      virkningTil
    }
  }
}`;

const TECHNICAL_INSTALLATION_QUERY = `
query GetTekniskAnlaeg($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  BBR_TekniskAnlaeg(
    where: { husnummer: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
  ) {
    nodes {
      id_lokalId
      tek007Anlaegsnummer
      tek020Klassifikation
      tek024Etableringsaar
      tek026StoerrelsesklasseOlietank
      tek027Placering
      tek028SloejfningOlietank
      tek032Stoerrelse
      tek034IndholdOlietank
      tek035SloejfningsfristOlietank
      tek042Revisionsdato
      tek101Gyldighedsdato
      tek107PlaceringPaaSoeterritorie
      status
      registreringTil
      virkningTil
    }
  }
}`;

const GROUND_QUERY = `
query GetGrund($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  BBR_Grund(
    where: { husnummer: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
  ) {
    nodes {
      id_lokalId
      gru009Vandforsyning
      gru010Afloebsforhold
      status
      registreringTil
      virkningTil
    }
  }
}`;

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

function codeValue(
  codelist: string,
  code: string | number | null | undefined,
  quality: BbrQualityNotice[],
  field: string,
  objectId: string | null,
): BbrCodeValue {
  const resolved = resolveBbrCode(codelist, code);
  if (!resolved) return { code: null, label: null, disabled: false, known: true };

  if (!resolved.known) {
    quality.push({
      code: "unknown_code",
      severity: "warning",
      message: `Ukendt BBR-kode ${resolved.key} i ${codelist}`,
      field,
      objectId,
    });
  } else if (resolved.disabled) {
    quality.push({
      code: "disabled_code",
      severity: "info",
      message: `BBR-kode ${resolved.key} i ${codelist} er markeret som udgået i kodelisten`,
      field,
      objectId,
    });
  }

  return {
    code: resolved.key,
    label: resolved.label,
    disabled: resolved.disabled,
    known: resolved.known,
  };
}

function displayState(node: {
  status: string | null;
  registreringTil: string | null;
  virkningTil: string | null;
}): BbrObjectDisplayState {
  const now = new Date().toISOString();
  if (node.status === "11") return "error_registered";
  if (node.registreringTil != null && node.registreringTil <= now) return "historical";
  if (node.virkningTil != null && node.virkningTil <= now) return "historical";
  if (node.status === "10") return "historical";
  if (node.status === "6") return "current";
  return "unknown";
}

function isSecondaryUsage(code: string | null): boolean {
  return ["910", "920", "930", "940"].includes(code ?? "");
}

function listedBuildingValue(value: string | null): boolean | null {
  if (value === null) return null;
  return value !== "" && value !== "0";
}

function mapBuilding(
  node: BbrBuildingDueDiligenceNode,
  canonicalBuildingId: string | null,
  quality: BbrQualityNotice[],
): BbrBuildingRecord {
  const objectId = node.id_lokalId;
  return {
    id: objectId,
    buildingNumber: node.byg007Bygningsnummer,
    statusCode: node.status,
    statusLabel: codeValue("Livscyklus", node.status, quality, "building.status", objectId).label,
    displayState: displayState(node),
    usage: codeValue(
      "BygAnvendelse",
      node.byg021BygningensAnvendelse,
      quality,
      "building.usage",
      objectId,
    ),
    yearBuilt: node.byg026Opfoerelsesaar,
    remodelYear: node.byg027OmTilbygningsaar,
    footprintAreaM2: node.byg041BebyggetAreal,
    totalBuildingAreaM2: node.byg038SamletBygningsareal,
    residentialAreaM2: node.byg039BygningensSamledeBoligAreal,
    commercialAreaM2: node.byg040BygningensSamledeErhvervsAreal,
    floors: node.byg054AntalEtager,
    deviatingFloors: codeValue(
      "AfvigendeEtager",
      node.byg055AfvigendeEtager,
      quality,
      "building.deviatingFloors",
      objectId,
    ),
    outerWall: codeValue(
      "YdervaeggenesMateriale",
      node.byg032YdervaeggensMateriale,
      quality,
      "building.outerWall",
      objectId,
    ),
    roof: codeValue(
      "Tagdaekningsmateriale",
      node.byg033Tagdaekningsmateriale,
      quality,
      "building.roof",
      objectId,
    ),
    heatingInstallation: codeValue(
      "Varmeinstallation",
      node.byg056Varmeinstallation,
      quality,
      "building.heatingInstallation",
      objectId,
    ),
    heatingFuel: codeValue(
      "Opvarmningsmiddel",
      node.byg057Opvarmningsmiddel,
      quality,
      "building.heatingFuel",
      objectId,
    ),
    supplementaryHeating: codeValue(
      "BygSupplerendeVarme",
      node.byg058SupplerendeVarme,
      quality,
      "building.supplementaryHeating",
      objectId,
    ),
    listedBuilding: listedBuildingValue(node.byg070Fredning),
    fbbReference: node.byg071BevaringsvaerdighedReference,
    revisionDate: node.byg094Revisionsdato,
    isCanonical: objectId != null && objectId === canonicalBuildingId,
    isSecondary: isSecondaryUsage(node.byg021BygningensAnvendelse),
  };
}

function mapUnit(node: BbrUnitNode, quality: BbrQualityNotice[]): BbrUnitRecord {
  const objectId = node.id_lokalId;
  if (!node.bygning) {
    quality.push({
      code: "missing_unit_building_reference",
      severity: "warning",
      message: "BBR-enhed mangler bygning-reference og er derfor kun løst koblet til ejendommen",
      field: "unit.buildingId",
      objectId,
    });
  }

  return {
    id: objectId,
    buildingId: node.bygning,
    addressId: node.adresseIdentificerer,
    statusCode: node.status,
    statusLabel: codeValue("Livscyklus", node.status, quality, "unit.status", objectId).label,
    displayState: displayState(node),
    usage: codeValue(
      "EnhAnvendelse",
      node.enh020EnhedensAnvendelse,
      quality,
      "unit.usage",
      objectId,
    ),
    totalAreaM2: node.enh026EnhedensSamledeAreal,
    residentialAreaM2: node.enh027ArealTilBeboelse,
    rooms: node.enh031AntalVaerelser,
    toilet: codeValue("Toiletforhold", node.enh032Toiletforhold, quality, "unit.toilet", objectId),
    toilets: node.enh065AntalVandskylledeToiletter,
    bath: codeValue("Badeforhold", node.enh033Badeforhold, quality, "unit.bath", objectId),
    bathrooms: node.enh066AntalBadevaerelser,
    kitchen: codeValue(
      "Koekkenforhold",
      node.enh034Koekkenforhold,
      quality,
      "unit.kitchen",
      objectId,
    ),
  };
}

function mapTechnicalInstallation(
  node: BbrTechnicalInstallationNode,
  quality: BbrQualityNotice[],
): BbrTechnicalInstallationRecord {
  const objectId = node.id_lokalId;
  return {
    id: objectId,
    installationNumber: node.tek007Anlaegsnummer,
    statusCode: node.status,
    statusLabel: codeValue("Livscyklus", node.status, quality, "technical.status", objectId).label,
    displayState: displayState(node),
    classification: codeValue(
      "Klassifikation",
      node.tek020Klassifikation,
      quality,
      "technical.classification",
      objectId,
    ),
    yearEstablished: node.tek024Etableringsaar,
    sizeClass: codeValue(
      "Stoerrelsesklasse",
      node.tek026StoerrelsesklasseOlietank,
      quality,
      "technical.sizeClass",
      objectId,
    ),
    location: codeValue("Placering", node.tek027Placering, quality, "technical.location", objectId),
    decommissioning: codeValue(
      "Sloejfning",
      node.tek028SloejfningOlietank,
      quality,
      "technical.decommissioning",
      objectId,
    ),
    size: node.tek032Stoerrelse,
    content: codeValue(
      "Indhold",
      node.tek034IndholdOlietank,
      quality,
      "technical.content",
      objectId,
    ),
    revisionDate: node.tek042Revisionsdato,
    decommissioningDeadline: node.tek035SloejfningsfristOlietank,
    validUntil: node.tek101Gyldighedsdato,
    onSeaTerritory: codeValue(
      "PaaSoeTerritorie",
      node.tek107PlaceringPaaSoeterritorie,
      quality,
      "technical.onSeaTerritory",
      objectId,
    ),
  };
}

function mapGround(node: BbrGroundNode, quality: BbrQualityNotice[]): BbrGroundRecord {
  const objectId = node.id_lokalId;
  return {
    id: objectId,
    statusCode: node.status,
    statusLabel: codeValue("Livscyklus", node.status, quality, "ground.status", objectId).label,
    displayState: displayState(node),
    waterSupply: codeValue(
      "GruVandforsyning",
      node.gru009Vandforsyning,
      quality,
      "ground.waterSupply",
      objectId,
    ),
    drainage: codeValue(
      "GruAfloebsforhold",
      node.gru010Afloebsforhold,
      quality,
      "ground.drainage",
      objectId,
    ),
  };
}

// ---------------------------------------------------------------------------
// BbrService
// ---------------------------------------------------------------------------

export class BbrService {
  static async getDueDiligenceData(
    input: DueDiligenceInput,
    config?: BbrClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<BbrDueDiligenceData> {
    const husnummerId = input.husnummerId.trim();
    const fetchedAt = new Date().toISOString();
    const quality: BbrQualityNotice[] = [];

    if (!husnummerId) {
      return {
        source: "datafordeler-bbr",
        fetchedAt,
        husnummerId,
        buildings: [],
        units: [],
        technicalInstallations: [],
        ground: null,
        canonicalBuildingId: null,
        quality: [
          {
            code: "integration_error",
            severity: "error",
            message: "husnummerId er påkrævet for BBR due-diligence opslag",
          },
        ],
      };
    }

    const { apiKey, endpoint } = getConfig(config);
    const url = new URL(endpoint);
    url.searchParams.set("apiKey", apiKey);
    const bitemporalArgs = currentBitemporalArgs();

    try {
      const buildingData = await datafordelerGraphqlFetch<unknown>(
        url,
        DUE_DILIGENCE_BUILDING_QUERY,
        { id: husnummerId, ...bitemporalArgs },
        "BBR_Bygning",
        { trace, phase: "layer1", metadata: { endpoint: "BBR/v2", detail: "due_diligence" } },
      );
      const buildingParsed = bbrBuildingsResponseSchema.safeParse(buildingData);
      if (!buildingParsed.success) {
        throw new Error("Ugyldigt BBR_Bygning due-diligence payload");
      }

      const buildingNodes = buildingParsed.data.BBR_Bygning.nodes;
      const { canonicalBuilding } = deriveBbrSummary(buildingNodes);
      const canonicalBuildingId = canonicalBuilding?.id_lokalId ?? null;

      if (!buildingNodes.length) {
        quality.push({
          code: "no_buildings",
          severity: "warning",
          message: "BBR returnerede ingen bygninger for husnummeret",
        });
      }

      const currentPrimaryCount = buildingNodes.filter(
        (node) =>
          displayState(node) === "current" && !isSecondaryUsage(node.byg021BygningensAnvendelse),
      ).length;
      if (currentPrimaryCount > 1) {
        quality.push({
          code: "multiple_primary_buildings",
          severity: "warning",
          message: "BBR returnerede flere aktuelle primære bygninger for samme husnummer",
        });
      }

      const buildingIds = [
        ...new Set(buildingNodes.map((node) => node.id_lokalId).filter((id): id is string => !!id)),
      ];

      const unitResults = await Promise.all(
        buildingIds.map((buildingId) =>
          datafordelerGraphqlFetch<unknown>(
            url,
            UNIT_QUERY,
            { buildingId, ...bitemporalArgs },
            "BBR_Enhed",
            { trace, phase: "layer1", metadata: { endpoint: "BBR/v2", detail: "units" } },
          ).catch((error: unknown) => {
            quality.push({
              code: "integration_error",
              severity: "warning",
              message: `BBR_Enhed-opslag fejlede for bygning ${buildingId}: ${getErrorMessage(error)}`,
              objectId: buildingId,
            });
            return null;
          }),
        ),
      );

      const unitNodes = unitResults.flatMap((data) => {
        if (!data) return [];
        const parsed = bbrUnitsResponseSchema.safeParse(data);
        if (!parsed.success) {
          quality.push({
            code: "integration_error",
            severity: "warning",
            message: "Ugyldigt BBR_Enhed payload",
          });
          return [];
        }
        return parsed.data.BBR_Enhed.nodes;
      });

      const [technicalData, groundData] = await Promise.all([
        datafordelerGraphqlFetch<unknown>(
          url,
          TECHNICAL_INSTALLATION_QUERY,
          { id: husnummerId, ...bitemporalArgs },
          "BBR_TekniskAnlaeg",
          { trace, phase: "layer1", metadata: { endpoint: "BBR/v2", detail: "technical" } },
        ).catch((error: unknown) => {
          quality.push({
            code: "integration_error",
            severity: "warning",
            message: `BBR_TekniskAnlaeg-opslag fejlede: ${getErrorMessage(error)}`,
          });
          return null;
        }),
        datafordelerGraphqlFetch<unknown>(
          url,
          GROUND_QUERY,
          { id: husnummerId, ...bitemporalArgs },
          "BBR_Grund",
          { trace, phase: "layer1", metadata: { endpoint: "BBR/v2", detail: "ground" } },
        ).catch((error: unknown) => {
          quality.push({
            code: "integration_error",
            severity: "warning",
            message: `BBR_Grund-opslag fejlede: ${getErrorMessage(error)}`,
          });
          return null;
        }),
      ]);

      const technicalParsed = technicalData
        ? bbrTechnicalInstallationsResponseSchema.safeParse(technicalData)
        : null;
      if (technicalParsed && !technicalParsed.success) {
        quality.push({
          code: "integration_error",
          severity: "warning",
          message: "Ugyldigt BBR_TekniskAnlaeg payload",
        });
      }

      const groundParsed = groundData ? bbrGroundResponseSchema.safeParse(groundData) : null;
      if (groundParsed && !groundParsed.success) {
        quality.push({
          code: "integration_error",
          severity: "warning",
          message: "Ugyldigt BBR_Grund payload",
        });
      }

      const groundNode = groundParsed?.success
        ? (groundParsed.data.BBR_Grund.nodes.find((node) => displayState(node) === "current") ??
          groundParsed.data.BBR_Grund.nodes[0] ??
          null)
        : null;

      return {
        source: "datafordeler-bbr",
        fetchedAt,
        husnummerId,
        buildings: buildingNodes.map((node) => mapBuilding(node, canonicalBuildingId, quality)),
        units: unitNodes.map((node) => mapUnit(node, quality)),
        technicalInstallations: technicalParsed?.success
          ? technicalParsed.data.BBR_TekniskAnlaeg.nodes.map((node) =>
              mapTechnicalInstallation(node, quality),
            )
          : [],
        ground: groundNode ? mapGround(groundNode, quality) : null,
        canonicalBuildingId,
        quality,
      };
    } catch (error) {
      logServerEvent({
        module: "bbr/client",
        operation: "getDueDiligenceData",
        severity: "degraded",
        message: "BBR due-diligence opslag fejlede",
        error,
        trace,
        metadata: { husnummerId },
      });
      return {
        source: "datafordeler-bbr",
        fetchedAt,
        husnummerId,
        buildings: [],
        units: [],
        technicalInstallations: [],
        ground: null,
        canonicalBuildingId: null,
        quality: [
          {
            code: "integration_error",
            severity: "error",
            message: getErrorMessage(error),
          },
        ],
      };
    }
  }

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
      const data = await datafordelerGraphqlFetch<unknown>(
        url,
        BYGNING_QUERY,
        { id, ...currentBitemporalArgs() },
        "BBR_Bygning",
        { trace, phase: "layer1", metadata: { endpoint: "BBR/v2" } },
      );
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

      // 3. Bebyggelsesprocent = samlet etageareal × 100 / grundareal
      // byg038/byg039 (total etageareal) — IKKE byg041 (grundplan-footprint).
      // Kommuneplanrammer angiver grænsen som etageareal, ikke grundplan.
      let bebyggelsesprocent: number | null = null;
      if (samlet_areal && grundareal && grundareal > 0) {
        bebyggelsesprocent = Math.round((samlet_areal / grundareal) * 1000) / 10;
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
        jordstykke_lokal_id: null,
        canonical_building_lokal_id: canonicalBuilding.id_lokalId ?? null,
        canonical_selection_reason: canonicalReason,
        canonical_candidates_count: candidatesCount,
        aggregated_bebygget_areal_all_primary,
        bygning_samlet_boligareal: canonicalBuilding.byg039BygningensSamledeBoligAreal ?? null,
        // ARCH-246: Due-diligence felter
        ombygningsaar: canonicalBuilding.byg027OmTilbygningsaar ?? null,
        vandforsyning_kode: canonicalBuilding.byg030Vandforsyning ?? null,
        vandforsyning: vandforsyningLabel(canonicalBuilding.byg030Vandforsyning ?? null),
        afloebsforhold_kode: canonicalBuilding.byg031Afloebsforhold ?? null,
        afloebsforhold: afloebsforholdLabel(canonicalBuilding.byg031Afloebsforhold ?? null),
        ydervaegs_materiale_kode: yv_kode,
        tagdaekning_kode: tag_kode,
      };
    } catch (e) {
      logServerEvent({
        module: "bbr/client",
        operation: "getBbrData",
        severity: "fatal",
        message: "Service fejl",
        error: e,
      });
      return this.getEmptyData(getErrorMessage(e));
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
      jordstykke_lokal_id: null,
      canonical_building_lokal_id: null,
      canonical_selection_reason: null,
      canonical_candidates_count: 0,
      aggregated_bebygget_areal_all_primary: null,
      bygning_samlet_boligareal: null,
      ombygningsaar: null,
      vandforsyning_kode: null,
      vandforsyning: null,
      afloebsforhold_kode: null,
      afloebsforhold: null,
      ydervaegs_materiale_kode: null,
      tagdaekning_kode: null,
    };
  }
}
