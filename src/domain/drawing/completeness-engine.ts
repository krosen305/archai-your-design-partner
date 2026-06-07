import type { DataSource, TerrainLayer, VejLayer, SiteUseLayer } from "./beliggenhedsplan.types";

export type ResponsibleParty = "kloakmester" | "landinspektør" | "arkitekt" | "bruger";

export type FieldStatus =
  | { status: "auto" }
  | { status: "estimated"; note: string }
  | { status: "placeholder"; responsibleParty: ResponsibleParty; displayLabel: string }
  | { status: "missing"; blocksSubmission: boolean; displayLabel: string };

export type DrawingFields = {
  parcelPolygon: FieldStatus;
  proposedFootprint: FieldStatus;
  sokkelKote: FieldStatus;
  rygningsKote: FieldStatus;
  vejGeometry: FieldStatus;
  koterTerræn: FieldStatus;
  kloakStikledning: FieldStatus;
  regnvandsløsning: FieldStatus;
  overkørsel: FieldStatus;
  naturbeskyttelse: FieldStatus;
  tinglysteServitutter: FieldStatus;
};

export type DrawingCompleteness = {
  overallStatus: "ready" | "draft";
  fields: DrawingFields;
  blockingCount: number;
  placeholderCount: number;
  permanentWarnings: string[];
};

export type CompletenessInput = {
  hasParcelPolygon: boolean;
  proposedFootprintSource: DataSource | null;
  sokkelKoteM: number | null;
  sokkelSource: DataSource | null;
  tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
  taghaldningGrad: number | null;
  rygningsKoteM: number | null;
  vejLayer: VejLayer | null;
  terrainLayer: TerrainLayer | null;
  surveyTerrainPointCount: number;
  kloakoplandType: "separat" | "faelles" | null;
  siteUseLayers: SiteUseLayer[];
  naturbeskyttelseFetchedAt: string | null;
};

export function computeDrawingCompleteness(input: CompletenessInput): DrawingCompleteness {
  const fields: DrawingFields = {
    parcelPolygon: { status: "auto" },

    proposedFootprint: (() => {
      if (!input.proposedFootprintSource)
        return { status: "missing", blocksSubmission: true, displayLabel: "Bygningsfodprint mangler — angiv i Maskinrummet" };
      if (input.proposedFootprintSource === "survey" || input.proposedFootprintSource === "cad_upload")
        return { status: "auto" };
      return { status: "estimated", note: "Genereret fra dimensioner" };
    })(),

    sokkelKote: (() => {
      if (input.sokkelKoteM === null)
        return { status: "placeholder", responsibleParty: "kloakmester", displayLabel: "Sokkelkote DVR90 [af kloakmester]" };
      if (input.sokkelSource === "survey")
        return { status: "auto" };
      return { status: "estimated", note: `ca. DVR90 +${input.sokkelKoteM.toFixed(2)} m (DHM + 0,30 m)` };
    })(),

    rygningsKote: (() => {
      if (!input.tagform)
        return { status: "placeholder", responsibleParty: "arkitekt", displayLabel: "Rygningskote DVR90 [angives af arkitekt]" };
      if (input.rygningsKoteM !== null)
        return { status: "estimated", note: `ca. DVR90 +${input.rygningsKoteM.toFixed(2)} m (beregnet)` };
      return { status: "placeholder", responsibleParty: "arkitekt", displayLabel: "Rygningskote DVR90 [angives af arkitekt]" };
    })(),

    vejGeometry: (() => {
      if (!input.vejLayer) return { status: "estimated", note: "Vejgeometri ikke hentet" };
      if (input.vejLayer.centerline25832 !== null) return { status: "auto" };
      if (input.vejLayer.vejkant25832.length > 0) return { status: "estimated", note: "Vejkant tilgængeligt, vejmidte ikke kortlagt" };
      return { status: "estimated", note: "Vejnavn fra DAR — geometri ikke kortlagt" };
    })(),

    koterTerræn: (() => {
      if (input.surveyTerrainPointCount > 0) return { status: "auto" };
      if (input.terrainLayer) return { status: "estimated", note: "DHM estimat (SDFI)" };
      return { status: "placeholder", responsibleParty: "landinspektør", displayLabel: "Terrænkoter [landinspektør]" };
    })(),

    kloakStikledning: {
      status: "placeholder",
      responsibleParty: "kloakmester",
      displayLabel: "Stikledning og bundkote [aut. kloakmester]",
    },

    regnvandsløsning: (() => {
      if (input.kloakoplandType === "faelles") return { status: "auto" };
      return { status: "placeholder", responsibleParty: "kloakmester", displayLabel: "Regnvandsløsning [kloakmester]" };
    })(),

    overkørsel: (() => {
      const hasDriveway = input.siteUseLayers.some(
        (l) => l.type === "driveway" && l.source.source !== "estimated",
      );
      if (hasDriveway) return { status: "auto" };
      return { status: "placeholder", responsibleParty: "bruger", displayLabel: "Overkørsel [placering bekræftes af kommunen]" };
    })(),

    naturbeskyttelse: (() => {
      if (input.naturbeskyttelseFetchedAt) return { status: "auto" };
      return { status: "estimated", note: "Naturbeskyttelse ikke hentet — kør adresseanalyse" };
    })(),

    tinglysteServitutter: {
      status: "placeholder",
      responsibleParty: "bruger",
      displayLabel: "Kontroller tinglysning.dk",
    },
  };

  const blockingCount = Object.values(fields).filter(
    (f) => f.status === "missing" && (f as { blocksSubmission: boolean }).blocksSubmission,
  ).length;

  const placeholderCount = Object.values(fields).filter(
    (f) => f.status === "placeholder",
  ).length;

  return {
    overallStatus: blockingCount === 0 ? "ready" : "draft",
    fields,
    blockingCount,
    placeholderCount,
    permanentWarnings: [
      "Kontroller tinglyste servitutter og privatretlige deklarationer via tinglysning.dk inden indgivelse til kommunen.",
    ],
  };
}
