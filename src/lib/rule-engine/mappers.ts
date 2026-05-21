import type { Byggeoenske } from "@/types/project-state";
import type { ProjectType, BuildingUsage } from "./types";

export function mapByggetypeToProjectType(
  byggetype: Byggeoenske["byggetype"] | undefined,
): ProjectType {
  switch (byggetype) {
    case "nybyg":
      return "new_build";
    case "tilbyg":
      return "extension";
    case "ombyg":
      return "renovation";
    default:
      return "new_build";
  }
}

export function mapAntalEtager(
  antalEtager: Byggeoenske["antalEtager"] | undefined,
): number | null {
  if (antalEtager === undefined) return null;
  return Math.ceil(antalEtager);
}

export function mapUsageFromBbr(kode: string | null): BuildingUsage {
  if (!kode) return "residential";
  const n = parseInt(kode, 10);
  if (n >= 110 && n <= 190) return "residential";
  if (n === 910 || n === 920) return "garage";
  if (n >= 320 && n <= 399) return "commercial";
  return "mixed";
}
