import type { RuleEngineKommuneplanramme } from "@/domain/contracts/rule-engine.types";
import type { RuleEngineInput } from "./types";

export function parseSetbackM(byggelinjer: string | null): number | null {
  if (!byggelinjer) return null;
  const normalized = byggelinjer.replace(",", ".");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*m/gi)];
  if (matches.length === 0) return null;
  const vals = matches.map((m) => parseFloat(m[1])).filter((v) => isFinite(v) && v > 0);
  return vals.length > 0 ? Math.min(...vals) : null;
}

export function parseRoofTypes(tagform: string | null): string[] | null {
  if (!tagform) return null;
  const lower = tagform.toLowerCase();
  const types: string[] = [];
  if (lower.includes("sadeltag") || lower.includes("to-fald")) types.push("saddeltag");
  if (lower.includes("fladt") || lower.includes("ensidig")) types.push("fladt");
  if (lower.includes("valm")) types.push("valm");
  if (lower.includes("mansard")) types.push("mansard");
  return types.length > 0 ? types : [tagform.trim()];
}

export function parseZone(
  ramme: RuleEngineKommuneplanramme | null,
): RuleEngineInput["plot"]["zone"] {
  const raw = (ramme?.fremtidigzonestatus ?? "").toUpperCase();
  if (raw.includes("BYZONE") || raw.includes("BY")) return "urban";
  if (raw.includes("SOMMERHUS")) return "summerhouse";
  if (raw.includes("LANDZONE") || raw.includes("LAND")) return "rural";
  return ramme ? "unknown" : "urban";
}
