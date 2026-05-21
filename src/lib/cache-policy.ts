// Named TTL constants for address analysis cache layers.
// Import from here — never hardcode day values in cache/client.ts.

export const CACHE_TTL_DAYS = {
  lokalplan: 30,
  servitut: 7,
  compliance: 30,
  report: 30,
  jordstykke: 90,
} as const;

export const SOURCE_RESULT_TTL_DAYS_DEFAULT = 30;

const SOURCE_RESULT_TTL_OVERRIDES: Partial<Record<string, number>> = {
  dkjord: 30,
  geus: 30,
  hip: 30,
  dhm: 30,
  geodanmark_mat: 90,
  dai_extended: 30,
  plandata_ext: 14,
};

export function sourceResultTtlDays(sourceKind: string): number {
  return SOURCE_RESULT_TTL_OVERRIDES[sourceKind] ?? SOURCE_RESULT_TTL_DAYS_DEFAULT;
}

export function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}
