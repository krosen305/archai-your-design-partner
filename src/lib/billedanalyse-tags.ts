import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";

export function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase("da-DK");
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}

export function removeTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: current.kategorier[kategori].filter((t) => t !== tag),
    },
  };
}

export function addTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  const nextTag = tag.trim();
  if (!nextTag) return current;
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: uniqueTags([...current.kategorier[kategori], nextTag]),
    },
  };
}

export function resolveKonflikt(
  kategori: keyof BilledeAnalyseKategorier,
  valgteTags: string[],
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: uniqueTags([...current.kategorier[kategori], ...valgteTags]),
    },
    konflikter: current.konflikter.filter((k) => k.kategori !== kategori),
  };
}

export function removeExtraTag(
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    ekstraTags: current.ekstraTags.filter((t) => t !== tag),
  };
}
