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

export function objectField<T>(value: unknown, key: string): T | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "object" && field !== null ? (field as T) : null;
}
