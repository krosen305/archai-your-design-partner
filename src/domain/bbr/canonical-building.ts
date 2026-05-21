export type BbrBuildingCandidate = {
  id_lokalId: string | null;
  byg021BygningensAnvendelse: string | null;
  byg026Opfoerelsesaar: number | null;
  byg029DatoForMidlertidigOpfoertBygning: string | null;
  byg038SamletBygningsareal: number | null;
  byg039BygningensSamledeBoligAreal: number | null;
  byg041BebyggetAreal: number | null;
  byg054AntalEtager: number | null;
  byg070Fredning: string | null;
  byg094Revisionsdato: string | null;
  registreringTil: string | null;
  virkningTil: string | null;
};

const SECONDARY_CODES = new Set(["910", "920", "930", "940"]);
const BOLIG_KODER = new Set(["110", "120", "121", "122", "130", "140", "510"]);

function scoreBygning(b: BbrBuildingCandidate): number {
  let score = 0;
  if (BOLIG_KODER.has(b.byg021BygningensAnvendelse ?? "")) score += 1000;
  if (b.byg039BygningensSamledeBoligAreal != null) score += 200;
  if (b.byg038SamletBygningsareal != null) score += 150;
  if (b.byg041BebyggetAreal != null) score += 100;
  if (b.byg054AntalEtager != null) score += 80;
  if (b.byg094Revisionsdato != null) score += 60;
  if (b.byg026Opfoerelsesaar != null) score += 40;
  return score;
}

function buildingIsActive(b: BbrBuildingCandidate): boolean {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  if (b.virkningTil != null && b.virkningTil <= now) return false;
  if (b.registreringTil != null && b.registreringTil <= now) return false;
  if (
    b.byg029DatoForMidlertidigOpfoertBygning != null &&
    b.byg029DatoForMidlertidigOpfoertBygning < today
  ) {
    return false;
  }
  return true;
}

export function selectCanonicalBuilding<T extends BbrBuildingCandidate>(
  bygninger: T[],
): {
  canonical: T | null;
  reason: string | null;
} {
  if (!bygninger.length) return { canonical: null, reason: null };

  const nonSecondary = bygninger.filter(
    (b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? ""),
  );
  const candidatePool = nonSecondary.length > 0 ? nonSecondary : bygninger;
  const active = candidatePool.filter(buildingIsActive);
  const candidates = active.length > 0 ? active : candidatePool;

  if (candidates.length === 1) return { canonical: candidates[0], reason: "only_candidate" };

  const sorted = [...candidates].sort((a, b) => {
    const diff = scoreBygning(b) - scoreBygning(a);
    if (diff !== 0) return diff;

    const revA = a.byg094Revisionsdato ?? "";
    const revB = b.byg094Revisionsdato ?? "";
    if (revA !== revB) return revB.localeCompare(revA);

    const aarA = a.byg026Opfoerelsesaar ?? 0;
    const aarB = b.byg026Opfoerelsesaar ?? 0;
    if (aarA !== aarB) return aarB - aarA;

    const boligA = a.byg039BygningensSamledeBoligAreal ?? 0;
    const boligB = b.byg039BygningensSamledeBoligAreal ?? 0;
    if (boligA !== boligB) return boligB - boligA;

    const samletA = a.byg038SamletBygningsareal ?? 0;
    const samletB = b.byg038SamletBygningsareal ?? 0;
    if (samletA !== samletB) return samletB - samletA;

    return (b.byg041BebyggetAreal ?? 0) - (a.byg041BebyggetAreal ?? 0);
  });

  const canonical = sorted[0];
  const reason = canonical.byg094Revisionsdato
    ? "newest_complete_residential"
    : canonical.byg026Opfoerelsesaar
      ? "newest_residential_by_year"
      : "highest_score_residential";

  return { canonical, reason };
}

export function deriveBbrSummary<T extends BbrBuildingCandidate>(
  bygninger: T[],
): {
  canonicalBuilding: T | null;
  canonicalReason: string | null;
  candidatesCount: number;
  bebygget_areal: number | null;
  aggregated_bebygget_areal_all_primary: number | null;
  fredet: boolean | null;
} {
  if (!bygninger.length) {
    return {
      canonicalBuilding: null,
      canonicalReason: null,
      candidatesCount: 0,
      bebygget_areal: null,
      aggregated_bebygget_areal_all_primary: null,
      fredet: null,
    };
  }

  const seen = new Set<string>();
  const deduped = bygninger.filter((b) => {
    const id = b.id_lokalId;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const { canonical: canonicalBuilding, reason: canonicalReason } =
    selectCanonicalBuilding(deduped);

  const primaryCandidates = deduped.filter(
    (b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? ""),
  );
  const candidatesCount = primaryCandidates.length;
  const bebygget_areal = canonicalBuilding?.byg041BebyggetAreal ?? null;
  const footprints = primaryCandidates
    .map((b) => b.byg041BebyggetAreal)
    .filter((a): a is number => a != null);
  const aggregated_bebygget_areal_all_primary =
    footprints.length > 0 ? footprints.reduce((s, a) => s + a, 0) : null;

  const fredningsValues = deduped.map((b) => b.byg070Fredning ?? null);
  const hasAnyExplicit = fredningsValues.some((v) => v !== null);
  const fredet = hasAnyExplicit
    ? fredningsValues.some((v) => v !== null && v !== "0" && v !== "")
    : null;

  return {
    canonicalBuilding,
    canonicalReason,
    candidatesCount,
    bebygget_areal,
    aggregated_bebygget_areal_all_primary,
    fredet,
  };
}
