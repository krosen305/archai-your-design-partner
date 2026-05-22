export type NeighborBuilding = {
  adgangsadresseid: string;
  adresse: string;
  distanceM: number;
};

export type NeighborBuildingData = {
  count: number;
  nearestDistanceM: number | null;
  buildings: NeighborBuilding[];
  fejl: string | null;
  kilde: string | null;
  accessRoadNearby: boolean | null;
  roadDistanceM: number | null;
};

export type MatParcelGeometryPayload = {
  polygonAreaM2: number | null;
  registreretArealM2: number | null;
  areaDiscrepancyM2: number | null;
  centroidLat: number | null;
  centroidLng: number | null;
  bbox25832: [number, number, number, number] | null;
  featureCount: number;
  hasCanonicalPolygon: boolean;
};

export type FjernvarmeResultat = {
  fjernvarmeDaekket: boolean | null;
  fejl: string | null;
};

export type VurData = {
  ejendomsvaerdi: number | null;
  grundvaerdi: number | null;
  vurderetAreal: number | null;
  vurderingsaar: number | null;
  bfeNr: string;
  fejl: string | null;
};
