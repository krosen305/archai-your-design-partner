import { getEnvRequired } from "@/lib/env";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { wgs84ToUtm32 } from "@/lib/geometry-utils";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { ruleEngineTerrainDataSchema } from "@/types/project-restore.schemas";
import { fromArrayBuffer } from "geotiff";

const DHM_WCS = "https://wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS";
const DHM_COVERAGE = "dhm_terraen";

export type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type NorthOrientation = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type TerrainData = {
  minElevationM: number;
  maxElevationM: number;
  avgElevationM: number;
  slopePercent: number;
  lowPointM: number;
  bluespotRisk: boolean | null;
  northOrientation: NorthOrientation;
  kotepunkter: Array<{ x: number; y: number; z: number }>;
  kilde: "dhm" | "mock";
};

export function getNorthOrientation(_lat: number, _lng: number): NorthOrientation {
  return "S";
}

export function bboxFromPoint(lat: number, lng: number, grundareal: number | null): BoundingBox {
  const { x, y } = wgs84ToUtm32(lat, lng);
  const halfWidth = grundareal ? Math.round(Math.sqrt(grundareal) / 2) + 5 : 30;
  return {
    minX: x - halfWidth,
    minY: y - halfWidth,
    maxX: x + halfWidth,
    maxY: y + halfWidth,
  };
}

async function parseGeoTiff(
  buffer: ArrayBuffer,
  bbox: BoundingBox,
): Promise<TerrainData["kotepunkter"]> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const noDataRaw = image.getGDALNoData();
  const noData =
    noDataRaw === null || noDataRaw === undefined || `${noDataRaw}`.trim().length === 0
      ? null
      : Number(noDataRaw);
  const raster = await image.readRasters({ interleave: true });
  const pixelSizeX = (bbox.maxX - bbox.minX) / width;
  const pixelSizeY = (bbox.maxY - bbox.minY) / height;
  const points: TerrainData["kotepunkter"] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const value = raster[index];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (noData !== null && value === noData) continue;
      points.push({
        x: Math.round((bbox.minX + col * pixelSizeX) * 10) / 10,
        y: Math.round((bbox.maxY - row * pixelSizeY) * 10) / 10,
        z: Math.round(value * 100) / 100,
      });
    }
  }

  return points;
}

function summarizeTerrain(
  kotepunkter: TerrainData["kotepunkter"],
  bbox: BoundingBox,
  lat: number,
  lng: number,
): TerrainData {
  const zValues = kotepunkter.map((point) => point.z);
  const minElevationM = Math.min(...zValues);
  const maxElevationM = Math.max(...zValues);
  const avgElevationM =
    Math.round((zValues.reduce((sum, value) => sum + value, 0) / zValues.length) * 10) / 10;
  const parcelWidth = Math.sqrt((bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY));
  const slopePercent = Math.round(((maxElevationM - minElevationM) / parcelWidth) * 100 * 10) / 10;

  return ruleEngineTerrainDataSchema.parse({
    minElevationM: Math.round(minElevationM * 10) / 10,
    maxElevationM: Math.round(maxElevationM * 10) / 10,
    avgElevationM,
    slopePercent,
    lowPointM: Math.round(minElevationM * 10) / 10,
    bluespotRisk: slopePercent < 1.5 ? true : false,
    northOrientation: getNorthOrientation(lat, lng),
    kotepunkter,
    kilde: "dhm",
  });
}

async function fetchLiveTerrain(
  bbox: BoundingBox,
  lat: number,
  lng: number,
): Promise<SourceResult<TerrainData>> {
  const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;
  const pixelSizeM = 0.4;
  const cols = Math.ceil(width / pixelSizeM);
  const rows = Math.ceil(height / pixelSizeM);

  const url =
    `${DHM_WCS}?apikey=${apiKey}&SERVICE=WCS&REQUEST=GetCoverage&VERSION=1.0.0` +
    `&COVERAGE=${DHM_COVERAGE}&STYLE=default&FORMAT=GTiff` +
    `&BBOX=${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}` +
    `&CRS=EPSG:25832&RESPONSE_CRS=EPSG:25832&WIDTH=${cols}&HEIGHT=${rows}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`DHM WCS HTTP ${res.status}`);

    const buffer = await res.arrayBuffer();
    const kotepunkter = await parseGeoTiff(buffer, bbox);
    if (kotepunkter.length === 0) throw new Error("DHM: ingen kotepunkter fundet i GeoTIFF");

    return makeOkResult(summarizeTerrain(kotepunkter, bbox, lat, lng), {
      kilde: "dhm",
      sourceUrl: DHM_WCS,
      rawFeatureCount: kotepunkter.length,
    });
  } catch (error) {
    return makeErrorResult<TerrainData>(error, { kilde: "dhm", sourceUrl: DHM_WCS });
  }
}

export const DhmService = {
  async getTerrainData(
    bbox: BoundingBox,
    lat: number,
    lng: number,
  ): Promise<SourceResult<TerrainData>> {
    if (FEATURE_FLAGS.dhmMock) {
      return makeMockResult(
        {
          minElevationM: 18.4,
          maxElevationM: 21.7,
          avgElevationM: 20.1,
          slopePercent: 4.2,
          lowPointM: 18.4,
          bluespotRisk: false,
          northOrientation: getNorthOrientation(lat, lng),
          kotepunkter: [
            { x: bbox.minX + 5, y: bbox.minY + 5, z: 18.4 },
            { x: bbox.maxX - 5, y: bbox.maxY - 5, z: 21.7 },
          ],
          kilde: "mock",
        },
        { kilde: "dhm", sourceUrl: DHM_WCS, rawFeatureCount: 2, confidence: "estimated" },
      );
    }

    return fetchLiveTerrain(bbox, lat, lng);
  },
};
