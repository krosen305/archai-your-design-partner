import { br18RequirementCatalogSchema } from "../schemas";
import { br18_2024_catalog } from "../fixtures/br18-2024-catalog";
import type { Br18Requirement } from "../types";

const CATALOGS: Record<string, Br18Requirement[]> = {
  "2024": br18_2024_catalog,
};

export function loadBr18Catalog(version: string): Br18Requirement[] {
  const raw = CATALOGS[version];
  if (!raw) throw new Error(`Unknown BR18 version: ${version}`);
  return br18RequirementCatalogSchema.parse(raw);
}

export function getCatalogVersions(): string[] {
  return Object.keys(CATALOGS);
}
