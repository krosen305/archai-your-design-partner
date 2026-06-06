import { BBR_CODE_REGISTRY } from "./bbr-code-registry.generated";

type Registry = typeof BBR_CODE_REGISTRY;
export type BbrCodelistName = keyof Registry;

export type BbrCodeLookupResult = {
  codelist: string;
  key: string;
  label: string;
  disabled: boolean;
  known: boolean;
};

export function resolveBbrCode(
  codelist: string,
  key: string | number | null | undefined,
): BbrCodeLookupResult | null {
  if (key === null || key === undefined || key === "") return null;

  const normalizedKey = String(key);
  const list = BBR_CODE_REGISTRY[codelist as BbrCodelistName] as
    | Record<string, { title: string; disabled: boolean }>
    | undefined;
  const entry = list?.[normalizedKey];

  if (!entry) {
    return {
      codelist,
      key: normalizedKey,
      label: `Ukendt BBR-kode ${normalizedKey}`,
      disabled: false,
      known: false,
    };
  }

  return {
    codelist,
    key: normalizedKey,
    label: entry.title,
    disabled: entry.disabled,
    known: true,
  };
}

export function bbrCodeLabel(codelist: string, key: string | number | null | undefined) {
  return resolveBbrCode(codelist, key)?.label ?? null;
}
