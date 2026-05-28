import type * as GeoJSON from "geojson";
import { z } from "zod";

const matFeatureSchema = z.object({
  id: z.string().optional(),
  geometry: z
    .object({
      type: z.enum(["Polygon", "MultiPolygon"]),
      coordinates: z.array(z.unknown()),
    })
    .nullable()
    .optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
});

const matWfsResponseSchema = z.object({
  features: z.array(matFeatureSchema).default([]),
});

function xmlText(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>(.*?)<\\/(?:[^:>]+:)?${tag}>`, "s");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function parsePosList(posList: string): [number, number][] {
  const values = posList
    .trim()
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const points: [number, number][] = [];

  for (let i = 0; i < values.length - 1; i += 2) {
    points.push([values[i]!, values[i + 1]!]);
  }

  const first = points[0];
  const last = points.at(-1);
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    points.push([first[0], first[1]]);
  }

  return points;
}

function parsePolygonGeometry(block: string): GeoJSON.Polygon | null {
  const posList = xmlText(block, "posList");
  if (!posList) return null;
  const ring = parsePosList(posList);
  if (ring.length < 4) return null;
  return { type: "Polygon", coordinates: [ring] };
}

function parseOptionalNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseXmlFeatureCollection(
  body: string,
): GeoJSON.FeatureCollection<GeoJSON.Geometry | null> {
  const blockRe =
    /<(?:[^:>]+:)?Jordstykke_Gaeldende\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Jordstykke_Gaeldende>/g;
  const features: GeoJSON.Feature<GeoJSON.Geometry | null>[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(body)) !== null) {
    const block = match[1];
    const idLokalId = xmlText(block, "id.lokalId");
    if (!idLokalId) continue;

    features.push({
      type: "Feature",
      id: idLokalId,
      geometry: parsePolygonGeometry(block),
      properties: {
        id_lokalId: idLokalId,
        matrikelnummer: xmlText(block, "matrikelnummer"),
        ejerlavskode: parseOptionalNumber(xmlText(block, "ejerlavskode")),
        ejerlavsnavn: xmlText(block, "ejerlavsnavn"),
        registreretAreal: parseOptionalNumber(xmlText(block, "registreretAreal")),
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function normalizeJsonFeatureCollection(
  body: string,
): GeoJSON.FeatureCollection<GeoJSON.Geometry | null> {
  const parsed = matWfsResponseSchema.parse(JSON.parse(body));
  return {
    type: "FeatureCollection",
    features: parsed.features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: feature.geometry
        ? (feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)
        : null,
      properties: feature.properties ?? {},
    })),
  };
}

export function parseMatJordstykkeFeatureCollection(
  body: string,
  contentType = "",
): GeoJSON.FeatureCollection<GeoJSON.Geometry | null> {
  if (contentType.includes("json") || body.trimStart().startsWith("{")) {
    return normalizeJsonFeatureCollection(body);
  }

  return parseXmlFeatureCollection(body);
}
