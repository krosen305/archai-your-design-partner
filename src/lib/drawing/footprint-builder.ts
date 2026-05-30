// src/lib/drawing/footprint-builder.ts
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";
import proj4 from "proj4";

proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

export type FootprintParams = {
  centroidWgs84: [number, number]; // [lng, lat]
  areaM2: number;
  rotationDeg: number;
};

export function buildSquareFootprint25832(params: FootprintParams): GeoJsonPolygon25832 {
  const [cx, cy] = proj4("WGS84", "EPSG:25832", [params.centroidWgs84[0], params.centroidWgs84[1]]);
  const halfSide = Math.sqrt(Math.max(1, params.areaM2)) / 2;
  const angle = (params.rotationDeg * Math.PI) / 180;

  const corners: [number, number][] = (
    [
      [-halfSide, -halfSide],
      [halfSide, -halfSide],
      [halfSide, halfSide],
      [-halfSide, halfSide],
    ] as [number, number][]
  ).map(([dx, dy]) => [
    cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  ]);

  return {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [[...corners, corners[0]]],
  };
}

export type RectangularFootprintParams = {
  centroidWgs84: [number, number]; // [lng, lat]
  widthM: number;
  depthM: number;
  rotationDeg: number;
};

export function buildRectangularFootprint25832(
  params: RectangularFootprintParams,
): GeoJsonPolygon25832 {
  const [cx, cy] = proj4("WGS84", "EPSG:25832", [
    params.centroidWgs84[0],
    params.centroidWgs84[1],
  ]);
  const halfW = params.widthM / 2;
  const halfD = params.depthM / 2;
  const angle = (params.rotationDeg * Math.PI) / 180;

  const corners: [number, number][] = (
    [
      [-halfW, -halfD],
      [halfW, -halfD],
      [halfW, halfD],
      [-halfW, halfD],
    ] as [number, number][]
  ).map(([dx, dy]) => [
    cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  ]);

  return {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [[...corners, corners[0]]],
  };
}
