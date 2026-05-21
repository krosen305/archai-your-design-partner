// src/types/project-state.ts
// Domain and pipeline types that are safe to import in both server and client code.
// project-store.ts imports these — it does NOT define them.

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { VurData } from "@/integrations/vur/client";
import type { ComplianceMetrics } from "@/lib/compliance-engine";

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

export type Address = {
  adresseid: string;
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommune: string;
  kommunekode: string;
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number } | null;
  bbrId: string | null;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
  centroid?: { lat: number; lng: number } | null;
  rotationDeg?: number;
  footprintAreaM2?: number | null;
  minDistanceToBoundaryM?: number | null;
  outsideParcelAreaM2?: number;
};

// ---------------------------------------------------------------------------
// Projekt-formdata
// ---------------------------------------------------------------------------

export type ProjectData = {
  area?: string;
  floors?: string;
  budget?: string;
  timeline?: string;
  description?: string;
  inspirations?: string[];
};

// ---------------------------------------------------------------------------
// 5-fase arkitektur
// ---------------------------------------------------------------------------

export type PhaseName = "hus-dna" | "match" | "finans" | "engineering" | "udbud";
export type PhaseStatus = "locked" | "active" | "complete" | "error";

// ---------------------------------------------------------------------------
// Hus-DNA
// ---------------------------------------------------------------------------

export type HusDna = {
  stil: string;
  bruttoareal: string;
  etager: string;
  tagform: string;
  energiklasse: string;
  saerligeKrav: string[];
  confidence: number;
  kilde: "mock" | "anthropic";
};

// ---------------------------------------------------------------------------
// Byggeønske
// ---------------------------------------------------------------------------

export type Byggeoenske = {
  byggetype?: "nybyg" | "tilbyg" | "ombyg";
  husstandsstoerrelse?: number;
  voksne?: number;
  boern?: number;
  livsfase?: "ung" | "etableret" | "senior";
  oensketAreal?: number;
  antalEtager?: 1 | 1.5 | 2 | 3;
  antalSovevaerelser?: number;
  antalBadevaerelser?: number;
  hjemmekontor?: boolean;
  arkitektoniskStil?: "moderne" | "klassisk" | "skandinavisk" | "industriel" | "minimalistisk";
  tagform?: "fladt" | "saddeltag" | "valm" | "ensidig";
  facademateriale?: "tegl" | "trae" | "puds" | "metal" | "kombineret";
  vinduesandel?: "lille" | "mellem" | "stor";
  udeomraade?: "terrasse" | "have" | "altan" | "tagterrasse";
  energiklasse?: "BR18" | "lavenergi" | "passiv" | "plusenergi";
  varmekilde?: "varmepumpe" | "fjernvarme" | "jordvarme" | "solvarme";
  solceller?: boolean;
  ventilation?: "naturlig" | "mekanisk" | "balanceret";
  ladestander?: boolean;
  budget?: "under-3" | "3-5" | "5-8" | "8-12" | "over-12";
  inspirationsbilleder?: string[];
  inspirationsbilledePaths?: string[];
  designDroem?: string;
  valgteDesignforslag?: string;
  genererededDesignforslag?: string[];
};

// ---------------------------------------------------------------------------
// Design placement
// ---------------------------------------------------------------------------

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type DesignPlacement = {
  footprintGeojson: GeoJsonPolygon | null;
  footprintAreaM2: number | null;
  centroid: { lat: number; lng: number } | null;
  rotationDeg: number;
  floors: number | null;
  heightM: number | null;
  minDistanceToBoundaryM: number | null;
  outsideParcelAreaM2: number;
  source: "user" | "generated";
};

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export type ComplianceFlag = {
  id: string;
  label: string;
  status: "ok" | "advarsel" | "blocker";
  detalje: string | null;
  aktuelVærdi: string | null;
  tilladt: string | null;
  kilde:
    | "bbr"
    | "plandata"
    | "servitut"
    | "beregnet"
    | "sdfi"
    | "dkjord"
    | "geus"
    | "regelkerne"
    | "fbb";
  dispensationMulig?: boolean;
  dispensationMyndighed?: string;
};

export type BoligoenskeValidering = {
  etagerStatus: "ok" | "dispensation" | "ingen_data";
  arealStatus: "ok" | "dispensation" | "ingen_data";
  beregnetBebyggelsespct: number | null;
  etagerDispensationAcknowledged: boolean;
  arealDispensationAcknowledged: boolean;
};

// ---------------------------------------------------------------------------
// AdressePreCheckResultat — defined here to avoid circular deps with pre-check-adresse.ts
// ---------------------------------------------------------------------------

export type AdressePreCheckResultat = {
  analysisRunId?: string | null;
  blockers: ComplianceFlag[];
  advarsler: ComplianceFlag[];
  kontekst: {
    grundareal: number | null;
    bebyggetAreal: number | null;
    bebyggelsesprocent: number | null;
    antalEtager: number | null;
    maxBebyggelsesprocent: number | null;
    maxEtager: number | null;
    maxBygningshoejde: number | null;
    restBygningsareal: number | null;
    ejendomsvaerdi: number | null;
    grundvaerdi: number | null;
  };
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  vurderingData: VurData | null;
  complianceMetrics: ComplianceMetrics | null;
};

// ---------------------------------------------------------------------------
// DataSource status + kind
// ---------------------------------------------------------------------------

export type DataSourceStatus = "fresh" | "stale" | "missing" | "loading" | "error";

export type DataSourceKind =
  | "bbr"
  | "lokalplaner"
  | "kommuneplanramme"
  | "fbb"
  | "naturbeskyttelse"
  | "dkjord"
  | "geusRisk"
  | "servitutter"
  | "terrain"
  | "fjernvarme"
  | "naboer"
  | "matGeometri"
  | "vurdering"
  | "byggeanalyse"
  | "billedanalyse"
  | "husDna";

export const DATA_SOURCE_LABELS: Record<DataSourceKind, string> = {
  bbr: "BBR & matrikel",
  lokalplaner: "Lokalplaner",
  kommuneplanramme: "Kommuneplanramme",
  fbb: "SAVE & fredning (FBB)",
  naturbeskyttelse: "Naturbeskyttelse",
  dkjord: "Jordforurening (DK-Jord)",
  geusRisk: "Geoteknisk risiko",
  servitutter: "Servitutter",
  terrain: "Terræn (DHM)",
  fjernvarme: "Fjernvarme",
  naboer: "Nabobygninger",
  matGeometri: "Parcelgeometri (MAT WFS)",
  vurdering: "Ejendomsvurdering",
  byggeanalyse: "AI byggeanalyse",
  billedanalyse: "AI billedanalyse",
  husDna: "Hus-DNA",
};

// ---------------------------------------------------------------------------
// PipelineServiceState
// ---------------------------------------------------------------------------

export type PipelineServiceState =
  | "success"
  | "no_hit"
  | "error"
  | "skipped"
  | "mock"
  | "cache_hit"
  | "not_run";

export const PIPELINE_SERVICE_STATE_LABELS: Record<PipelineServiceState, string> = {
  success: "Live",
  no_hit: "Ingen hit",
  error: "Fejl",
  skipped: "Sprunget over",
  mock: "Mock",
  cache_hit: "Cache",
  not_run: "Ikke kørt",
};

// ---------------------------------------------------------------------------
// Type guards and restore helpers
// ---------------------------------------------------------------------------

export function isHusDna(v: unknown): v is HusDna {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).stil === "string" &&
    typeof (v as Record<string, unknown>).confidence === "number"
  );
}

// Stale thresholds per source (days). Mirror of cache TTL — UI display only.
const STALE_DAYS: Record<DataSourceKind, number> = {
  bbr: 30,
  lokalplaner: 30,
  kommuneplanramme: 30,
  fbb: 30,
  naturbeskyttelse: 30,
  dkjord: 30,
  geusRisk: 30,
  servitutter: 7,
  terrain: 30,
  fjernvarme: 30,
  naboer: 30,
  matGeometri: 90,
  vurdering: 30,
  byggeanalyse: 60,
  billedanalyse: 60,
  husDna: 60,
};

export function deriveSourceStatus(
  kind: DataSourceKind,
  value: unknown,
  lastFetchedIso: string | null,
): DataSourceStatus {
  const hasValue = Array.isArray(value) ? value.length > 0 : value != null;
  if (!hasValue) return "missing";
  if (!lastFetchedIso) return "fresh";
  const ageMs = Date.now() - new Date(lastFetchedIso).getTime();
  const staleMs = STALE_DAYS[kind] * 24 * 60 * 60 * 1000;
  return ageMs > staleMs ? "stale" : "fresh";
}

type ParsedComplianceData = {
  bbr: BbrKompliantData | null;
  flags: ComplianceFlag[];
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  byggeanalyseResultat: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null;
  vurderingData: VurData | null;
};

export function parseComplianceData(v: unknown): ParsedComplianceData | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  return {
    bbr: (typeof o.bbr === "object" ? o.bbr : null) as BbrKompliantData | null,
    flags: Array.isArray(o.flags) ? (o.flags as ComplianceFlag[]) : [],
    lokalplaner: Array.isArray(o.lokalplaner) ? (o.lokalplaner as Lokalplan[]) : [],
    kommuneplanramme: (typeof o.kommuneplanramme === "object"
      ? o.kommuneplanramme
      : null) as Kommuneplanramme | null,
    byggeanalyseResultat: (typeof o.byggeanalyseResultat === "object"
      ? o.byggeanalyseResultat
      : null) as import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null,
    vurderingData: (typeof o.vurderingData === "object" ? o.vurderingData : null) as VurData | null,
  };
}
