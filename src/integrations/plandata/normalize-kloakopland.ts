// src/integrations/plandata/normalize-kloakopland.ts

/**
 * Mapper rå tekststrenge fra Plandata kloakopland-lag og BBR afløbsforhold
 * til den kanoniske kloakopland-type brugt i beliggenhedsplanen.
 *
 * Plandata-felter (vaerd1201a/b) og BBR-koder indeholder varierende dansk tekst.
 * Matching sker case-insensitivt på karakteristiske delstrenge.
 */
export function normalizeKloakoplandType(raw: string | null): "separat" | "faelles" | null {
  if (!raw) return null;

  const lower = raw.toLowerCase();

  if (lower.includes("fæl") || lower.includes("fael")) return "faelles";
  if (lower.includes("sep")) return "separat";

  return null;
}
