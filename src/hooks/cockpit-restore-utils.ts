import type { ZodType } from "zod";

export function routeMatchesAddress(
  currentAddress: { adresseid?: string | null; adgangsadresseid?: string | null } | null,
  routeAddressId: string,
): boolean {
  return (
    !!currentAddress &&
    (currentAddress.adresseid === routeAddressId ||
      currentAddress.adgangsadresseid === routeAddressId)
  );
}

export function decodeWithSchema<T>(value: unknown, schema: ZodType<T>): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function objectField<T>(value: unknown, key: string, schema: ZodType<T>): T | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return decodeWithSchema(field, schema);
}
