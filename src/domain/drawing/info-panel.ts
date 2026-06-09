// src/domain/drawing/info-panel.ts
//
// Pure domain transform: derives the structured left-column info panel of a
// beliggenhedsplan from already-validated input + the completeness engine.
//
// Hard rule: this module never invents compliance, kote, utility or terrain
// data. Every value is either present in the validated input or rendered as a
// typed "ikke dokumenteret" / MissingDataWarning. No thresholds live here.

import type { BeliggenhedsplanInput, LayerSourceMeta } from "./beliggenhedsplan.types";
import type { DrawingCompleteness } from "./completeness-engine";
import type {
  InfoPanel,
  MissingDataWarning,
  SiteMetricRow,
  SiteMetrics,
  SourceRegisterEntry,
  TechnicalNote,
  TerrainSummary,
} from "./drawing-model";

const NOT_DOCUMENTED = "ikke dokumenteret";

/** Deterministic Danish number formatting (period thousands, comma decimal). */
function daNumber(n: number, decimals: number): string {
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = n < 0 ? "-" : "";
  return frac && frac.length > 0 ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

function formatAreaM2(n: number): string {
  const isInteger = Math.round(n * 100) % 100 === 0;
  return `${daNumber(n, isInteger ? 0 : 2)} m²`;
}

function metricRow(label: string, value: number | null, kind: "area" | "percent"): SiteMetricRow {
  const documented = value !== null && value > 0;
  if (!documented) {
    return { label, value, display: NOT_DOCUMENTED, documented: false };
  }
  const display = kind === "area" ? formatAreaM2(value) : `${daNumber(value, 2)} %`;
  return { label, value, display, documented: true };
}

export function buildSiteMetrics(plan: BeliggenhedsplanInput): SiteMetrics {
  const area = plan.metadata.areaTable;
  const grundarealM2 = area?.grundarealM2 ?? (plan.parcel.areaRegisteredM2 || null);
  const bebyggetArealM2 = area?.groundFloorM2 ?? (plan.proposed.footprintAreaM2 || null);
  const etagearealM2 = area?.totalResidentialM2 ?? null;
  const bebyggelsesprocent =
    area?.coveragePercent ??
    (grundarealM2 && bebyggetArealM2 && grundarealM2 > 0
      ? (bebyggetArealM2 / grundarealM2) * 100
      : null);

  return {
    grundarealM2,
    bebyggetArealM2,
    etagearealM2,
    bebyggelsesprocent,
    calculationBasis: area?.calculationBasis ?? "BR18",
    rows: [
      metricRow("Grundareal", grundarealM2, "area"),
      metricRow("Bebygget areal (fodaftryk)", bebyggetArealM2, "area"),
      metricRow("Samlet etageareal", etagearealM2, "area"),
      metricRow("Bebyggelsesprocent", bebyggelsesprocent, "percent"),
    ],
  };
}

function sourceEntry(label: string, meta: LayerSourceMeta): SourceRegisterEntry {
  return {
    label,
    source: meta.source,
    confidence: meta.confidence,
    fetchedAt: meta.fetchedAt,
    documented: true,
  };
}

export function buildSourceRegister(plan: BeliggenhedsplanInput): SourceRegisterEntry[] {
  const entries: SourceRegisterEntry[] = [];
  entries.push(sourceEntry("Matrikel (MAT WFS)", plan.parcel.source));
  entries.push(sourceEntry("Foreslået bygning", plan.proposed.source));

  if (plan.vej) entries.push(sourceEntry("Vejgeometri", plan.vej.source));
  if (plan.existing.buildings.length > 0) {
    entries.push(sourceEntry("Eksisterende bygninger (GeoDanmark)", plan.existing.source));
  }
  if (plan.survey) entries.push(sourceEntry("Landinspektøropmåling", plan.survey.source));
  if (plan.terrain) entries.push(sourceEntry("Terræn (DHM/SDFI)", plan.terrain.source));
  if (plan.naturbeskyttelse.length > 0) {
    entries.push(sourceEntry("Naturbeskyttelseslinjer", plan.naturbeskyttelse[0]!.source));
  }
  if (plan.lerLedninger.length > 0) {
    entries.push(sourceEntry("Ledninger (LER)", plan.lerLedninger[0]!.source));
  }
  const plandataConstraint = plan.constraints.find((c) => c.source.source !== "generated");
  if (plandataConstraint) {
    entries.push(sourceEntry("Lokalplan / byggelinjer (Plandata)", plandataConstraint.source));
  }
  return entries;
}

export function buildTerrainSummary(
  plan: BeliggenhedsplanInput,
  completeness: DrawingCompleteness,
): TerrainSummary {
  const surveyedPoints = plan.survey?.terrainPoints.length ?? 0;
  const documented = surveyedPoints > 0 || plan.terrain !== null;

  const sokkelKoteDisplay = (() => {
    if (plan.proposed.sokkelKoteM === null) return "angives af kloakmester";
    const suffix =
      completeness.fields.sokkelKote.status === "auto"
        ? "(opmålt)"
        : "(estimat — ikke verificeret)";
    return `DVR90 +${daNumber(plan.proposed.sokkelKoteM, 2)} m ${suffix}`;
  })();

  const gulvKoteDisplay =
    plan.proposed.finishedFloorKoteM === null
      ? NOT_DOCUMENTED
      : `DVR90 +${daNumber(plan.proposed.finishedFloorKoteM, 2)} m`;

  const rygningsKoteDisplay =
    plan.proposed.rygningsKoteM === null
      ? "angives af arkitekt"
      : `ca. DVR90 +${daNumber(plan.proposed.rygningsKoteM, 2)} m (beregnet)`;

  return {
    koteDatum: plan.mandatoryAnnotations.koteDatum,
    sokkelKoteDisplay,
    gulvKoteDisplay,
    rygningsKoteDisplay,
    terrainPointCount: surveyedPoints,
    documented,
    note: documented ? null : "Koter ikke dokumenteret i tilgængelige datakilder",
  };
}

export function buildTechnicalNotes(plan: BeliggenhedsplanInput): TechnicalNote[] {
  const notes: TechnicalNote[] = [];
  const a = plan.mandatoryAnnotations;
  if (a.koteDatum) notes.push({ category: "kote", text: a.koteDatum });
  if (a.terrainSurveyedBy) notes.push({ category: "generel", text: a.terrainSurveyedBy });
  if (a.sewerResponsibility) notes.push({ category: "kloak", text: a.sewerResponsibility });
  if (a.ratBarrierNote) notes.push({ category: "rottespaerre", text: a.ratBarrierNote });

  if (plan.lerLedninger.length === 0) {
    notes.push({
      category: "ledning",
      text: "Ledningsdata ikke hentet (LER). Regnvand/spildevand vist som principforslag — ikke en dokumenteret ledningsplan.",
    });
  }

  const varme = plan.fjernvarme;
  if (varme) {
    const status =
      varme.fjernvarmeDaekket === true
        ? "bekræftet"
        : varme.fjernvarmePlanlagt === true
          ? "planlagt"
          : varme.fjernvarmeDaekket === false
            ? "ikke bekræftet"
            : "ukendt";
    notes.push({
      category: "generel",
      text: `Fjernvarme: ${status}${varme.planNavn ? ` (${varme.planNavn})` : ""}`,
    });
  }
  return notes;
}

const FIELD_LABELS: Record<string, string> = {
  parcelPolygon: "Matrikelgeometri",
  proposedFootprint: "Bygningsfodprint",
  sokkelKote: "Sokkelkote",
  rygningsKote: "Rygningskote",
  vejGeometry: "Vejgeometri",
  koterTerræn: "Terrænkoter",
  kloakStikledning: "Kloakstikledning",
  regnvandsløsning: "Regnvandsløsning",
  overkørsel: "Overkørsel",
  naturbeskyttelse: "Naturbeskyttelse",
  tinglysteServitutter: "Servitutter",
};

export function buildMissingDataWarnings(completeness: DrawingCompleteness): MissingDataWarning[] {
  const warnings: MissingDataWarning[] = [];
  for (const [key, field] of Object.entries(completeness.fields)) {
    if (field.status === "auto") continue;
    if (field.status === "placeholder") {
      warnings.push({
        label: field.displayLabel,
        responsibleParty: field.responsibleParty,
        blocksSubmission: false,
        severity: "placeholder",
      });
    } else if (field.status === "missing") {
      warnings.push({
        label: field.displayLabel,
        responsibleParty: null,
        blocksSubmission: field.blocksSubmission,
        severity: field.blocksSubmission ? "blocking" : "placeholder",
      });
    } else if (field.status === "estimated") {
      warnings.push({
        label: `${FIELD_LABELS[key] ?? key}: ${field.note}`,
        responsibleParty: null,
        blocksSubmission: false,
        severity: "estimat",
      });
    }
  }
  return warnings;
}

export function buildInfoPanel(args: {
  plan: BeliggenhedsplanInput;
  completeness: DrawingCompleteness;
}): InfoPanel {
  const { plan, completeness } = args;
  const missingCount = completeness.blockingCount + completeness.placeholderCount;
  return {
    siteMetrics: buildSiteMetrics(plan),
    sourceRegister: buildSourceRegister(plan),
    terrain: buildTerrainSummary(plan, completeness),
    technicalNotes: buildTechnicalNotes(plan),
    missingDataWarnings: buildMissingDataWarnings(completeness),
    completenessStatus: missingCount > 0 ? `UDKAST — ${missingCount} punkter mangler` : null,
  };
}
