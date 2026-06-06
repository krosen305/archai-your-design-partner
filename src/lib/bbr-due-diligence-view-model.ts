import type {
  BbrBuildingRecord,
  BbrDueDiligenceData,
  BbrGroundRecord,
  BbrTechnicalInstallationRecord,
  BbrUnitRecord,
} from "@/domain/contracts/bbr-due-diligence.types";

export type BbrDueDiligenceViewModel = {
  primaryBuildings: BbrBuildingRecord[];
  secondaryBuildings: BbrBuildingRecord[];
  unitsByBuildingId: Map<string, BbrUnitRecord[]>;
  looseUnits: BbrUnitRecord[];
  currentTechnicalInstallations: BbrTechnicalInstallationRecord[];
  historicalTechnicalInstallations: BbrTechnicalInstallationRecord[];
  ground: BbrGroundRecord | null;
  qualityMessages: string[];
};

function byNumber<T extends { buildingNumber?: number | null; installationNumber?: number | null }>(
  a: T,
  b: T,
) {
  return (
    (a.buildingNumber ?? a.installationNumber ?? 9999) -
    (b.buildingNumber ?? b.installationNumber ?? 9999)
  );
}

export function buildBbrDueDiligenceViewModel(
  data: BbrDueDiligenceData | null,
): BbrDueDiligenceViewModel | null {
  if (!data) return null;

  const primaryBuildings = data.buildings
    .filter((building) => !building.isSecondary)
    .sort((a, b) => {
      if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
      return byNumber(a, b);
    });
  const secondaryBuildings = data.buildings
    .filter((building) => building.isSecondary)
    .sort(byNumber);
  const unitsByBuildingId = new Map<string, BbrUnitRecord[]>();
  const looseUnits: BbrUnitRecord[] = [];

  for (const unit of data.units) {
    if (!unit.buildingId) {
      looseUnits.push(unit);
      continue;
    }
    unitsByBuildingId.set(unit.buildingId, [
      ...(unitsByBuildingId.get(unit.buildingId) ?? []),
      unit,
    ]);
  }

  return {
    primaryBuildings,
    secondaryBuildings,
    unitsByBuildingId,
    looseUnits,
    currentTechnicalInstallations: data.technicalInstallations
      .filter((installation) => installation.displayState === "current")
      .sort(byNumber),
    historicalTechnicalInstallations: data.technicalInstallations
      .filter((installation) => installation.displayState !== "current")
      .sort(byNumber),
    ground: data.ground,
    qualityMessages: data.quality.map((notice) => notice.message),
  };
}
