import { isSaveDispensationRequired, isSaveWarning } from "@/lib/rule-engine/hard-stop-adapter";
import type { ComplianceFlag } from "@/types/project-state";

export type ComplianceRiskLevel = "ok" | "ukendt" | "advarsel" | "kritisk";

export type ComplianceRiskOverviewKey = "geoteknik" | "forsyning" | "naboer" | "fredning" | "natur";

export type ComplianceFeedCategory =
  | "alle"
  | "plan"
  | "fredning"
  | "geoteknik"
  | "natur"
  | "naboer"
  | "forsyning";

export type RiskOverviewItem = {
  key: ComplianceRiskOverviewKey;
  label: string;
  level: ComplianceRiskLevel;
  detail: string;
};

export type SaveFieldTone = "danger" | "warning" | "success";

export type SaveFieldView = {
  saveValue: number;
  tone: SaveFieldTone;
  consequence: string;
};

export type InvisibleBudgetRisk = {
  key: string;
  label: string;
  severity: "high" | "med";
  detalje: string;
};

const BUDGET_RISK_FLAG_IDS = new Set([
  "save-bevaringsvaerdi",
  "bbr-fredet",
  "fredet",
  "geus-radon",
  "geus-grundvand",
  "mat-fredskov",
  "mat-strandbeskyttelse",
  "mat-klitfredning",
  "naturbeskyttelse-strandbeskyttelse",
  "dkjord-v2",
  "dkjord-v1",
  "regelkerne-save_1_3_demolition",
  "regelkerne-save_4_paragraph14_risk",
  "regelkerne-listed_building_demolition",
]);

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function normalize(value: string | null | undefined): string {
  return value?.toLowerCase() ?? "";
}

function riskLevelFromFlags(
  flags: ComplianceFlag[],
  options: { blockerAsWarning?: boolean } = {},
): ComplianceRiskLevel | null {
  if (flags.some((flag) => flag.status === "blocker")) {
    return options.blockerAsWarning ? "advarsel" : "kritisk";
  }

  if (flags.some((flag) => flag.status === "advarsel")) {
    return "advarsel";
  }

  if (flags.length > 0) {
    return "ok";
  }

  return null;
}

function heritageRiskSummary(
  heritageSaveValue: number | null,
  isFredet: boolean | null,
): { level: ComplianceRiskLevel; detail: string } {
  if (isFredet === true) {
    return { level: "kritisk", detail: "Bygning er fredet" };
  }

  if (heritageSaveValue === null) {
    return { level: "ukendt", detail: "SAVE-værdi mangler" };
  }

  if (isSaveDispensationRequired(heritageSaveValue)) {
    return { level: "kritisk", detail: `SAVE-værdi: ${heritageSaveValue}` };
  }

  if (isSaveWarning(heritageSaveValue)) {
    return { level: "advarsel", detail: `SAVE-værdi: ${heritageSaveValue}` };
  }

  return { level: "ok", detail: `SAVE-værdi: ${heritageSaveValue}` };
}

export function buildSaveFieldView(heritageSaveValue: number | null): SaveFieldView | null {
  if (heritageSaveValue === null) return null;

  if (isSaveDispensationRequired(heritageSaveValue)) {
    return {
      saveValue: heritageSaveValue,
      tone: "danger",
      consequence: "Høj bevaringsværdi - nedrivning/ombygning kræver kommunens tilladelse",
    };
  }

  if (isSaveWarning(heritageSaveValue)) {
    return {
      saveValue: heritageSaveValue,
      tone: "warning",
      consequence: "§14-forbud risiko - kommunen kan nedlægge forbud mod nedrivning",
    };
  }

  if (heritageSaveValue <= 6) {
    return {
      saveValue: heritageSaveValue,
      tone: "warning",
      consequence: "Middel bevaringsværdi - kommunen bør høres",
    };
  }

  return {
    saveValue: heritageSaveValue,
    tone: "success",
    consequence: "Lav bevaringsværdi - ingen særlige krav",
  };
}

export function getComplianceFlagCategory(
  flag: ComplianceFlag,
): Exclude<ComplianceFeedCategory, "alle"> {
  const id = normalize(flag.id);
  const label = normalize(flag.label);

  if (
    flag.kilde === "geus" ||
    flag.kilde === "dkjord" ||
    includesAny(id, ["geo", "jord", "grund", "radon"])
  ) {
    return "geoteknik";
  }
  if (
    flag.kilde === "fbb" ||
    includesAny(id, ["save", "fredet", "bevaringsvaerdi", "fredning", "listed"])
  ) {
    return "fredning";
  }
  if (includesAny(id, ["strand", "fredskov", "klitfredning", "natur"])) return "natur";
  if (includesAny(id, ["nabo", "skel", "afstand"]) || includesAny(label, ["nabo", "skel"])) {
    return "naboer";
  }
  if (includesAny(id, ["fjernvarme", "forsyning", "tilslutning", "varme"])) {
    return "forsyning";
  }

  return "plan";
}

export function hasProvisionalRiskSignals(complianceFlags: ComplianceFlag[]): boolean {
  return complianceFlags.some((flag) => flag.kilde === "geus" || flag.kilde === "dkjord");
}

export function buildRiskOverviewCategories(params: {
  complianceFlags: ComplianceFlag[];
  heritageSaveValue: number | null;
  isFredet: boolean | null;
}): RiskOverviewItem[] {
  const { complianceFlags, heritageSaveValue, isFredet } = params;
  const findByCategory = (category: Exclude<ComplianceFeedCategory, "alle">) =>
    complianceFlags.filter((flag) => getComplianceFlagCategory(flag) === category);

  const geo = riskLevelFromFlags(findByCategory("geoteknik")) ?? "ukendt";
  const forsyning =
    riskLevelFromFlags(findByCategory("forsyning"), { blockerAsWarning: true }) ?? "ukendt";
  const naboer = riskLevelFromFlags(findByCategory("naboer")) ?? "ok";
  const heritage = heritageRiskSummary(heritageSaveValue, isFredet);
  const natur = riskLevelFromFlags(findByCategory("natur")) ?? "ok";

  return [
    {
      key: "geoteknik",
      label: "Geoteknik",
      level: geo,
      detail:
        geo === "kritisk"
          ? "Risiko for dyre fundamentsløsninger"
          : geo === "advarsel"
            ? "Vurdering anbefales"
            : geo === "ok"
              ? "Ingen kendte risici"
              : "Geoteknisk vurdering mangler",
    },
    {
      key: "forsyning",
      label: "Forsyning",
      level: forsyning,
      detail:
        forsyning === "advarsel"
          ? "Tilslutningspligt eller -mangel"
          : forsyning === "ok"
            ? "Tilslutning afklaret"
            : "Status mangler",
    },
    {
      key: "naboer",
      label: "Naboer",
      level: naboer,
      detail:
        naboer === "kritisk"
          ? "Nabopartshøring sandsynlig"
          : naboer === "advarsel"
            ? "Tæt på skel - vurder"
            : "Ingen kendte konflikter",
    },
    {
      key: "fredning",
      label: "Fredning / SAVE",
      level: heritage.level,
      detail: heritage.detail,
    },
    {
      key: "natur",
      label: "Naturbeskyttelse",
      level: natur,
      detail:
        natur === "kritisk"
          ? "Strand-/fredskov/klit - dispensation kræves"
          : natur === "advarsel"
            ? "Beskyttelseslinje i nærheden"
            : "Ingen kendte beskyttelser",
    },
  ];
}

export function buildInvisibleBudgetRisks(params: {
  complianceFlags: ComplianceFlag[];
  heritageSaveValue: number | null;
  isFredet: boolean | null;
}): InvisibleBudgetRisk[] {
  const { complianceFlags, heritageSaveValue, isFredet } = params;
  const flagRisks = complianceFlags
    .filter(
      (flag) =>
        BUDGET_RISK_FLAG_IDS.has(flag.id) || flag.kilde === "geus" || flag.kilde === "dkjord",
    )
    .map((flag) => ({
      key: flag.id,
      label: flag.label,
      severity: flag.status === "blocker" ? ("high" as const) : ("med" as const),
      detalje: flag.detalje ?? "",
    }));

  const flagKeys = new Set(flagRisks.map((risk) => risk.key));
  const storeRisks: InvisibleBudgetRisk[] = [];

  if (
    heritageSaveValue !== null &&
    isSaveDispensationRequired(heritageSaveValue) &&
    !flagKeys.has("save-bevaringsvaerdi") &&
    !flagKeys.has("regelkerne-save_1_3_demolition")
  ) {
    storeRisks.push({
      key: "save",
      label: `SAVE ${heritageSaveValue}/9 - Høj bevaringsværdi`,
      severity: "high",
      detalje: "Nedrivning/ombygning kræver kommunens tilladelse (Planlovens §14).",
    });
  }

  if (
    heritageSaveValue !== null &&
    isSaveWarning(heritageSaveValue) &&
    !flagKeys.has("regelkerne-save_4_paragraph14_risk")
  ) {
    storeRisks.push({
      key: "save-4",
      label: "SAVE 4/9 - §14-forbud risiko",
      severity: "med",
      detalje: "Kommunen kan nedlægge §14-forbud mod nedrivning. Kontakt teknisk forvaltning.",
    });
  }

  if (
    isFredet === true &&
    !flagKeys.has("bbr-fredet") &&
    !flagKeys.has("regelkerne-listed_building_demolition")
  ) {
    storeRisks.push({
      key: "fredet",
      label: "Fredet bygning",
      severity: "high",
      detalje: "Alle ændringer kræver tilladelse fra Slots- og Kulturstyrelsen.",
    });
  }

  return [...storeRisks, ...flagRisks];
}
