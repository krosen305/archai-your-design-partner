import type * as GeoJSON from "geojson";
import type { NeighborCoverage } from "./surroundings.types";

export type GeoDanmarkParcelRelation = "own" | "neighbor" | "unknown";

export type GeoDanmarkBuildingFeature = {
  sourceId: string;
  bbrUuid: string | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  footprintAreaM2: number | null;
  distanceToParcelM: number | null;
  relationToParcel: GeoDanmarkParcelRelation;
  geometrySource: "geodanmark";
};

export type GeoDanmarkRoadCenterline = {
  sourceId: string;
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  distanceToParcelM: number | null;
  geometrySource: "geodanmark";
};

export type GeoDanmarkSiteContext = {
  ownBuildings: GeoDanmarkBuildingFeature[];
  neighborBuildings: GeoDanmarkBuildingFeature[];
  roadCenterlines: GeoDanmarkRoadCenterline[];
  coverage: NeighborCoverage;
};
