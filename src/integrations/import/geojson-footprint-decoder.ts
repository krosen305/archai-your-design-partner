// src/integrations/import/geojson-footprint-decoder.ts
import { z } from "zod";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

const polygonCoordinatesSchema = z.array(z.array(z.tuple([z.number(), z.number()]))).min(1);

function extractPolygonCoordinates(raw: unknown): [number, number][][] {
  const anyObj = raw as Record<string, unknown>;
  const type = anyObj["type"];

  if (type === "FeatureCollection") {
    const features = anyObj["features"];
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error("FeatureCollection har ingen features");
    }
    return extractPolygonCoordinates(features[0]);
  }

  if (type === "Feature") {
    return extractPolygonCoordinates(anyObj["geometry"]);
  }

  if (type === "Polygon") {
    return polygonCoordinatesSchema.parse(anyObj["coordinates"]);
  }

  throw new Error(`Geometritype "${String(type)}" er ikke understøttet — forventet Polygon`);
}

export function decodeGeoJsonFootprint(raw: unknown): GeoJsonPolygon25832 {
  if (!raw || typeof raw !== "object") {
    throw new Error("Input er ikke et gyldigt GeoJSON-objekt");
  }

  const coordinates = extractPolygonCoordinates(raw);

  return {
    type: "Polygon",
    coordinates,
    crs: "EPSG:25832",
  };
}
