import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
// Side-effect import: patches Geometry.prototype with distance, buffer, intersects, intersection, getBoundary, etc.
// eslint-disable-next-line import/no-unassigned-import
import "jsts/org/locationtech/jts/monkey.js";
import type { GeoJsonPolygon25832, BoundarySegment } from "./beliggenhedsplan.types";
import { generatedSourceMeta } from "./source-quality";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JstsGeometry = any;

// GeoJSONReader's jsts type declaration requires a geometryFactory arg, but the
// implementation makes it optional — cast to `any` to match the runtime behaviour.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reader: { read: (geojson: object) => JstsGeometry } = new (GeoJSONReader as any)();
const writer: { write: (geom: JstsGeometry) => object } = new GeoJSONWriter();

function toJsts(geom: GeoJsonPolygon25832): JstsGeometry {
  const { crs: _crs, ...geojson } = geom;
  return reader.read(geojson);
}

function fromJstsPolygon(geom: JstsGeometry): GeoJsonPolygon25832 {
  const raw = writer.write(geom) as { type: string; coordinates: [number, number][][] };
  return { type: "Polygon", coordinates: raw.coordinates, crs: "EPSG:25832" };
}

export function polygonAreaM2(polygon: GeoJsonPolygon25832): number {
  return Math.abs(toJsts(polygon).getArea());
}

export function distanceToNearestBoundaryM(
  building: GeoJsonPolygon25832,
  parcel: GeoJsonPolygon25832,
): number {
  return toJsts(building).distance(toJsts(parcel).getBoundary());
}

export function polygonOverlapAreaM2(a: GeoJsonPolygon25832, b: GeoJsonPolygon25832): number {
  const ga = toJsts(a);
  const gb = toJsts(b);
  if (!ga.intersects(gb)) return 0;
  return Math.abs(ga.intersection(gb).getArea());
}

export function generateBuffer25832(polygon: GeoJsonPolygon25832, bufferM: number): GeoJsonPolygon25832 {
  return fromJstsPolygon(toJsts(polygon).buffer(bufferM));
}

export function splitPolygonIntoBoundarySegments(polygon: GeoJsonPolygon25832): BoundarySegment[] {
  const coords = polygon.coordinates[0];
  return coords.slice(0, -1).map((coord, i) => {
    const next = coords[i + 1];
    return {
      id: `seg-${i}`,
      start: { type: "Point", coordinates: coord as [number, number], crs: "EPSG:25832" },
      end: { type: "Point", coordinates: next as [number, number], crs: "EPSG:25832" },
      type: "unknown" as const,
      source: generatedSourceMeta(),
    };
  });
}

export function distanceToBoundarySegments(
  building: GeoJsonPolygon25832,
  parcel: GeoJsonPolygon25832,
): Array<{ segmentId: string; distanceM: number }> {
  const buildingGeom = toJsts(building);
  return splitPolygonIntoBoundarySegments(parcel).map((seg) => {
    const segGeom = reader.read({
      type: "LineString",
      coordinates: [seg.start.coordinates, seg.end.coordinates],
    });
    return { segmentId: seg.id, distanceM: buildingGeom.distance(segGeom) };
  });
}
