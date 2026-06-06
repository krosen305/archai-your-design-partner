export type BbrObjectDisplayState =
  | "current"
  | "historical"
  | "error_registered"
  | "future"
  | "unknown";

export type BbrQualityNotice = {
  code:
    | "unknown_code"
    | "disabled_code"
    | "multiple_primary_buildings"
    | "missing_unit_building_reference"
    | "no_buildings"
    | "integration_error";
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
  objectId?: string | null;
};

export type BbrCodeValue = {
  code: string | null;
  label: string | null;
  disabled: boolean;
  known: boolean;
};

export type BbrBuildingRecord = {
  id: string | null;
  buildingNumber: number | null;
  statusCode: string | null;
  statusLabel: string | null;
  displayState: BbrObjectDisplayState;
  usage: BbrCodeValue;
  yearBuilt: number | null;
  remodelYear: number | null;
  footprintAreaM2: number | null;
  totalBuildingAreaM2: number | null;
  residentialAreaM2: number | null;
  commercialAreaM2: number | null;
  floors: number | null;
  deviatingFloors: BbrCodeValue;
  outerWall: BbrCodeValue;
  roof: BbrCodeValue;
  heatingInstallation: BbrCodeValue;
  heatingFuel: BbrCodeValue;
  supplementaryHeating: BbrCodeValue;
  listedBuilding: boolean | null;
  fbbReference: string | null;
  revisionDate: string | null;
  isCanonical: boolean;
  isSecondary: boolean;
};

export type BbrUnitRecord = {
  id: string | null;
  buildingId: string | null;
  addressId: string | null;
  statusCode: string | null;
  statusLabel: string | null;
  displayState: BbrObjectDisplayState;
  usage: BbrCodeValue;
  totalAreaM2: number | null;
  residentialAreaM2: number | null;
  rooms: number | null;
  toilet: BbrCodeValue;
  toilets: number | null;
  bath: BbrCodeValue;
  bathrooms: number | null;
  kitchen: BbrCodeValue;
};

export type BbrTechnicalInstallationRecord = {
  id: string | null;
  installationNumber: number | null;
  statusCode: string | null;
  statusLabel: string | null;
  displayState: BbrObjectDisplayState;
  classification: BbrCodeValue;
  yearEstablished: number | null;
  sizeClass: BbrCodeValue;
  location: BbrCodeValue;
  decommissioning: BbrCodeValue;
  size: number | null;
  content: BbrCodeValue;
  revisionDate: string | null;
  decommissioningDeadline: string | null;
  validUntil: string | null;
  onSeaTerritory: BbrCodeValue;
};

export type BbrGroundRecord = {
  id: string | null;
  statusCode: string | null;
  statusLabel: string | null;
  displayState: BbrObjectDisplayState;
  waterSupply: BbrCodeValue;
  drainage: BbrCodeValue;
};

export type BbrDueDiligenceData = {
  source: "datafordeler-bbr";
  fetchedAt: string;
  husnummerId: string;
  buildings: BbrBuildingRecord[];
  units: BbrUnitRecord[];
  technicalInstallations: BbrTechnicalInstallationRecord[];
  ground: BbrGroundRecord | null;
  canonicalBuildingId: string | null;
  quality: BbrQualityNotice[];
};
