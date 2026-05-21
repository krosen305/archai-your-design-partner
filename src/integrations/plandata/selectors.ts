type LokalplanLike = {
  status: string | null;
  datoVedtaget: string | null;
};

type KommuneplanrammeLike = {
  bebygpct: number | null;
  maxetager: number | null;
  maxbygnhjd: number | null;
};

/**
 * Vælger den mest restriktive kommuneplanramme til compliance-beregning.
 * Sorterer på laveste bebygpct → laveste maxetager → laveste maxbygnhjd.
 * Null-værdier taber for eksplicitte værdier (Infinity som proxy for null).
 */
export function selectKommuneplanrammeForCompliance<T extends KommuneplanrammeLike>(
  rammer: T[],
): T | null {
  if (!rammer.length) return null;
  if (rammer.length === 1) return rammer[0];
  return [...rammer].sort((a, b) => {
    const pctA = a.bebygpct ?? Infinity;
    const pctB = b.bebygpct ?? Infinity;
    if (pctA !== pctB) return pctA - pctB;
    const etA = a.maxetager ?? Infinity;
    const etB = b.maxetager ?? Infinity;
    if (etA !== etB) return etA - etB;
    return (a.maxbygnhjd ?? Infinity) - (b.maxbygnhjd ?? Infinity);
  })[0];
}

/**
 * Vælger primær lokalplan til PDF-analyse.
 * Vedtagne (status="V") prioriteres over forslag.
 * Inden for samme status vælges nyeste datoVedtaget.
 */
export function selectPrimaryLokalplanForPdf<T extends LokalplanLike>(lokalplaner: T[]): T | null {
  if (!lokalplaner.length) return null;
  return [...lokalplaner].sort((a, b) => {
    const aScore = a.status === "V" ? 0 : 1;
    const bScore = b.status === "V" ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return (b.datoVedtaget ?? "0").localeCompare(a.datoVedtaget ?? "0");
  })[0];
}
