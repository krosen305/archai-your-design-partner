import type * as GeoJSON from "geojson";

type Coordinate2D = [number, number];
type SupportedGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | GeoJSON.LineString
  | GeoJSON.MultiLineString;

function stripSrid(wkt: string): string {
  return wkt
    .trim()
    .replace(/^SRID=\d+;/i, "")
    .trim();
}

function parseHeader(wkt: string): { type: string; body: string } {
  const match = /^([A-Z]+)(?:\s+(?:ZM|Z|M))?\s*(.*)$/i.exec(stripSrid(wkt));
  if (!match) throw new Error("Invalid WKT header");

  const type = match[1]!.toUpperCase();
  const body = match[2]!.trim();
  if (body.toUpperCase() === "EMPTY") {
    throw new Error(`Empty WKT geometry: ${type}`);
  }

  return { type, body };
}

function stripOuterParens(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    throw new Error("Invalid WKT parentheses");
  }
  return trimmed.slice(1, -1).trim();
}

function splitTopLevelGroups(value: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) throw new Error("Invalid WKT group nesting");

    if (char === "," && depth === 0) {
      groups.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }

  if (depth !== 0) throw new Error("Invalid WKT group nesting");
  const finalGroup = value.slice(start).trim();
  if (finalGroup) groups.push(finalGroup);
  return groups;
}

function parseCoordinateTuple(value: string): Coordinate2D {
  const values = value
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));

  if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) {
    throw new Error("Invalid WKT coordinate tuple");
  }

  return [values[0], values[1]];
}

function parseCoordinateList(value: string): Coordinate2D[] {
  const coordinates = value
    .split(",")
    .map((tuple) => parseCoordinateTuple(tuple))
    .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));

  if (!coordinates.length) throw new Error("Invalid empty WKT coordinate list");
  return coordinates;
}

function closeRing(ring: Coordinate2D[]): Coordinate2D[] {
  if (ring.length < 3) throw new Error("Invalid WKT polygon ring");

  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function parsePolygonBody(body: string): Coordinate2D[][] {
  const ringGroups = splitTopLevelGroups(stripOuterParens(body));
  const rings = ringGroups.map((ring) => closeRing(parseCoordinateList(stripOuterParens(ring))));
  if (!rings.length) throw new Error("Invalid WKT polygon");
  return rings;
}

export function parseGeoDanmarkGeometryWkt(wkt: string): SupportedGeometry {
  const { type, body } = parseHeader(wkt);

  if (type === "LINESTRING") {
    return { type: "LineString", coordinates: parseCoordinateList(stripOuterParens(body)) };
  }

  if (type === "MULTILINESTRING") {
    const lineGroups = splitTopLevelGroups(stripOuterParens(body));
    return {
      type: "MultiLineString",
      coordinates: lineGroups.map((line) => parseCoordinateList(stripOuterParens(line))),
    };
  }

  if (type === "POLYGON") {
    return { type: "Polygon", coordinates: parsePolygonBody(body) };
  }

  if (type === "MULTIPOLYGON") {
    const polygonGroups = splitTopLevelGroups(stripOuterParens(body));
    return {
      type: "MultiPolygon",
      coordinates: polygonGroups.map((polygon) => parsePolygonBody(polygon)),
    };
  }

  throw new Error(`Unsupported WKT geometry type: ${type}`);
}

export function bboxToPolygonWkt25832(bbox: [number, number, number, number]): string {
  const [minX, minY, maxX, maxY] = bbox;
  return [
    "POLYGON((",
    `${minX} ${minY}, `,
    `${maxX} ${minY}, `,
    `${maxX} ${maxY}, `,
    `${minX} ${maxY}, `,
    `${minX} ${minY}`,
    "))",
  ].join("");
}
