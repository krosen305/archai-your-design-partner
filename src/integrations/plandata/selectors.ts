type LokalplanLike = {
  status: string | null;
  datoVedtaget: string | null;
};

type KommuneplanrammeLike = {
  bebygpct: number | null;
  maxetager: number | null;
  maxbygnhjd: number | null;
};

type PlanFeatureLike = {
  planid: string | null;
  datoIkraft: string | null;
  datoVedtaget: string | null;
  status: string | null;
};

type DelomraadeLike = PlanFeatureLike & {
  delnr: string | null;
  zoneStatus: string | null;
};

type ByggefeltLike = PlanFeatureLike & {
  id: string | null;
  lokplanId: string | null;
  delnr: string | null;
};

type WastewaterLike = {
  sourceId: string | null;
  datoIkraft: string | null;
  datoVedtaget: string | null;
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

function planStatusScore(status: string | null): number {
  if (status === "V") return 0;
  if (status === "F") return 1;
  return 2;
}

function descendingDateScore(value: string | null): string {
  return value ?? "0";
}

export function selectMostSpecificDelomraade<T extends DelomraadeLike>(
  delomraader: T[],
  preferredPlanId: string | null,
): T | null {
  if (!delomraader.length) return null;

  return [...delomraader].sort((a, b) => {
    const aPlanScore = preferredPlanId && a.planid === preferredPlanId ? 0 : 1;
    const bPlanScore = preferredPlanId && b.planid === preferredPlanId ? 0 : 1;
    if (aPlanScore !== bPlanScore) return aPlanScore - bPlanScore;

    const aZoneScore = a.zoneStatus ? 0 : 1;
    const bZoneScore = b.zoneStatus ? 0 : 1;
    if (aZoneScore !== bZoneScore) return aZoneScore - bZoneScore;

    const aStatusScore = planStatusScore(a.status);
    const bStatusScore = planStatusScore(b.status);
    if (aStatusScore !== bStatusScore) return aStatusScore - bStatusScore;

    const dateCompare = descendingDateScore(b.datoIkraft).localeCompare(
      descendingDateScore(a.datoIkraft),
    );
    if (dateCompare !== 0) return dateCompare;

    return descendingDateScore(b.datoVedtaget).localeCompare(descendingDateScore(a.datoVedtaget));
  })[0];
}

export function selectPreferredByggefelt<T extends ByggefeltLike>(
  byggefelter: T[],
  preferredPlanId: string | null,
  preferredDelnr: string | null,
): T | null {
  if (!byggefelter.length) return null;

  return [...byggefelter].sort((a, b) => {
    const aPlanScore = preferredPlanId && a.lokplanId === preferredPlanId ? 0 : 1;
    const bPlanScore = preferredPlanId && b.lokplanId === preferredPlanId ? 0 : 1;
    if (aPlanScore !== bPlanScore) return aPlanScore - bPlanScore;

    const aDelScore = preferredDelnr && a.delnr === preferredDelnr ? 0 : 1;
    const bDelScore = preferredDelnr && b.delnr === preferredDelnr ? 0 : 1;
    if (aDelScore !== bDelScore) return aDelScore - bDelScore;

    const aStatusScore = planStatusScore(a.status);
    const bStatusScore = planStatusScore(b.status);
    if (aStatusScore !== bStatusScore) return aStatusScore - bStatusScore;

    const dateCompare = descendingDateScore(b.datoIkraft).localeCompare(
      descendingDateScore(a.datoIkraft),
    );
    if (dateCompare !== 0) return dateCompare;

    return descendingDateScore(b.datoVedtaget).localeCompare(descendingDateScore(a.datoVedtaget));
  })[0];
}

export function selectPreferredWastewaterPlan<T extends WastewaterLike>(entries: T[]): T | null {
  if (!entries.length) return null;

  return [...entries].sort((a, b) => {
    const ikraftCompare = descendingDateScore(b.datoIkraft).localeCompare(
      descendingDateScore(a.datoIkraft),
    );
    if (ikraftCompare !== 0) return ikraftCompare;

    return descendingDateScore(b.datoVedtaget).localeCompare(descendingDateScore(a.datoVedtaget));
  })[0];
}
