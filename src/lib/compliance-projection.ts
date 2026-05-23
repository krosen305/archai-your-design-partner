import type { Byggeoenske } from "@/types/project-state";

export function calculateProjectedSamletAreal(
  byggetype: Byggeoenske["byggetype"],
  oensketAreal: number,
  eksisterendeAreal: number | null,
): number {
  const eksisterende = eksisterendeAreal ?? 0;
  if (byggetype === "nybyg") return oensketAreal;
  if (byggetype === "tilbyg") return eksisterende + oensketAreal;
  return eksisterende;
}

export function calculateProjectedBebyggelsespct(
  samletAreal: number,
  grundareal: number | null,
): number | null {
  if (!grundareal || samletAreal === 0) return null;
  return (samletAreal / grundareal) * 100;
}
