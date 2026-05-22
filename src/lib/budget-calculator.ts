export type GeoteknikKategori = 1 | 2 | 3;

export type BudgetInput = {
  bebyggetArealM2: number | null;
  byggeaar: string | null;
  oensketArealM2: number | null;
  energiklasse: string | null;
  harKaelder: boolean;
  geoteknikKategori: GeoteknikKategori;
  naturgas: boolean;
};

export type BudgetKategori = {
  label: string;
  min: number;
  max: number;
  note?: string;
};

export type BudgetResultat = {
  nedrivning: BudgetKategori;
  forsyning: BudgetKategori;
  geoteknik: BudgetKategori;
  nybyg: BudgetKategori;
  totalMin: number;
  totalMax: number;
  totalTypisk: number;
};

export function beregnNedrivning(
  bebyggetArealM2: number | null,
  byggeaar: string | null,
): BudgetKategori {
  if (!bebyggetArealM2) {
    return { label: "Nedrivning", min: 0, max: 0, note: "Intet registreret bebygget areal" };
  }
  const asbestRisiko = parseInt(byggeaar ?? "0") < 1978;
  const minSats = asbestRisiko ? 1_000 : 800;
  const maxSats = asbestRisiko ? 1_400 : 1_200;
  return {
    label: "Nedrivning",
    min: Math.round(bebyggetArealM2 * minSats),
    max: Math.round(bebyggetArealM2 * maxSats),
    note: asbestRisiko ? "Tillæg for asbestrisiko (byggeår < 1978)" : undefined,
  };
}

export function beregnForsyning(naturgas: boolean): BudgetKategori {
  const gasMin = naturgas ? 10_000 : 0;
  const gasMax = naturgas ? 15_000 : 0;
  return {
    label: "Forsyningsafkobling",
    min: 55_000 + gasMin,
    max: 110_000 + gasMax,
  };
}

export function beregnGeoteknik(kategori: GeoteknikKategori): BudgetKategori {
  const ranges: Record<GeoteknikKategori, [number, number]> = {
    1: [0, 50_000],
    2: [50_000, 200_000],
    3: [200_000, 500_000],
  };
  const [min, max] = ranges[kategori];
  const labels: Record<GeoteknikKategori, string> = {
    1: "Kategori 1 — god grund",
    2: "Kategori 2 — variabel",
    3: "Kategori 3 — dårlig / pæl",
  };
  return { label: "Geoteknik", min, max, note: labels[kategori] };
}

export function beregnNybyg(
  arealM2: number | null,
  energiklasse: string | null,
  harKaelder: boolean,
): BudgetKategori {
  if (!arealM2) {
    return { label: "Nybyg", min: 0, max: 0, note: "Intet ønsket areal angivet" };
  }
  const LAVENERGI_KLASSER = ["lavenergi", "passiv", "plusenergi"];
  const lavenergitillæg =
    energiklasse && LAVENERGI_KLASSER.includes(energiklasse.toLowerCase()) ? 2_000 : 0;
  const kaeldertillæg = harKaelder ? 5_000 : 0;
  const baseSatsMin = 22_000 + lavenergitillæg + kaeldertillæg;
  const baseSatsMax = baseSatsMin + 4_000;
  return {
    label: "Nybyg",
    min: Math.round(arealM2 * baseSatsMin),
    max: Math.round(arealM2 * baseSatsMax),
  };
}

export function beregnBudget(input: BudgetInput): BudgetResultat {
  const nedrivning = beregnNedrivning(input.bebyggetArealM2, input.byggeaar);
  const forsyning = beregnForsyning(input.naturgas);
  const geoteknik = beregnGeoteknik(input.geoteknikKategori);
  const nybyg = beregnNybyg(input.oensketArealM2, input.energiklasse, input.harKaelder);
  const totalMin = nedrivning.min + forsyning.min + geoteknik.min + nybyg.min;
  const totalMax = nedrivning.max + forsyning.max + geoteknik.max + nybyg.max;
  return {
    nedrivning,
    forsyning,
    geoteknik,
    nybyg,
    totalMin,
    totalMax,
    totalTypisk: Math.round((totalMin + totalMax) / 2),
  };
}
