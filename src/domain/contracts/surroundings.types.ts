// src/domain/contracts/surroundings.types.ts
// Pure domain types. GeoJSON polygon geometrier er medtaget på NeighborBuilding og
// NeighborParcel fordi beliggenhedsplan-generatoren skal tegne nabolagene.
// CRS er altid EPSG:25832 (UTM32N) — adapterne er ansvarlige for at transformere.

import type * as GeoJSON from "geojson";

export type NeighborBuilding = {
  sourceId: string;
  addressLabel: string | null;
  distanceM: number;
  footprintAreaM2: number | null;
  /** Fuld bygningspolygon i EPSG:25832 — null hvis source ikke leverede geometri. */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  geometrySource: "geodanmark";
};

export type NeighborCoverage = "covered" | "source_unavailable" | "unknown";

export type NeighborContextFacts = {
  buildingCount40m: number | null;
  nearestBuildingDistanceM: number | null;
  nearestRoadCenterlineDistanceM: number | null;
  accessRoadNearby: boolean | null;
  confidence: NeighborCoverage | null;
};

export type NeighborContext = {
  count40m: number;
  nearestDistanceM: number | null;
  nearestRoadCenterlineDistanceM: number | null;
  accessRoadNearby: boolean | null;
  buildingDensityWithin100m: number | null;
  buildings: NeighborBuilding[];
  coverage: NeighborCoverage;
};

export type NeighborParcelRelation =
  | "shared_boundary"
  | "corner_touch"
  | "nearby"
  | "separated_by_road"
  | "unknown";

export type NeighborParcel = {
  jordstykkeLokalId: string;
  matrikelnummer: string | null;
  ejerlavskode: number | null;
  relation: NeighborParcelRelation;
  sharedBoundaryLengthM: number | null;
  /** null kun tilladt for relation="corner_touch" eller "unknown". */
  distanceM: number | null;
  /** Fuld parcelpolygon i EPSG:25832 — null hvis WFS ikke returnerede geometri. */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
};

export type PlanningSurroundingsHit = {
  planId: string;
  planTitle: string | null;
  themeCode: string;
  status: "vedtaget" | "forslag";
  municipalityName: string | null;
  geometryOverlap: boolean;
};

export type PlanningSurroundingsContext = {
  noiseDesignatedArea: boolean | null;
  productionNoiseConsequenceArea: boolean | null;
  odorConsequenceArea: boolean | null;
  odorDesignatedArea: boolean | null;
  technicalFacilityConsequenceArea: boolean | null;
  largeLivestockFarmArea: boolean | null;
  /** true = der er forslag (ikke vedtaget) der konflikter — fremtidig risiko */
  proposedPlanConflict: boolean | null;
  hits: PlanningSurroundingsHit[];
};
