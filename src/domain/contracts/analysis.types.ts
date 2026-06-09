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

export type FjernvarmeConfidence = "confirmed" | "estimated" | "missing" | "unknown";

export type FjernvarmeSourceKind =
  | "forsyningsomraade"
  | "tilslutningspligtomraade"
  | "forsyningsforbudomraade"
  | "varmeplansomraade";

export type FjernvarmePlanHit = {
  sourceKind: FjernvarmeSourceKind;
  featureId: string | null;
  planId: string | null;
  planNavn: string | null;
  delomraadeNavn: string | null;
  status: string | null;
  typeCode: number | null;
  typeLabel: string | null;
  vedtagetDato: string | null;
  ikraftDato: string | null;
  konverteringStartAar: number | null;
  konverteringSlutAar: number | null;
  forsyningsselskabNavn: string | null;
  forsyningsselskabCvr: string | null;
  dokumentUrl: string | null;
  webUrl: string | null;
};

export type FjernvarmeResultat = {
  fjernvarmeDaekket: boolean | null;
  fjernvarmePlanlagt: boolean | null;
  tilslutningspligt: boolean | null;
  forsyningsforbud: boolean | null;
  forsyningsselskabNavn: string | null;
  forsyningsselskabCvr: string | null;
  planNavn: string | null;
  delomraadeNavn: string | null;
  vedtagetDato: string | null;
  konverteringStartAar: number | null;
  konverteringSlutAar: number | null;
  dokumentUrl: string | null;
  sourceKinds: FjernvarmeSourceKind[];
  confidence: FjernvarmeConfidence;
  hits: FjernvarmePlanHit[];
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
