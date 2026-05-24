import { getEnvRequired } from "@/lib/env";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { ruleEngineTerrainDataSchema } from "@/types/project-restore.schemas";

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

function wgs84ToUtm32(lat: number, lng: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = 2 * f - f * f;
  const lon0 = (9 * Math.PI) / 180;

  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(latR) ** 2);
  const t = Math.tan(latR) ** 2;
  const c = (e2 / (1 - e2)) * Math.cos(latR) ** 2;
  const angle = Math.cos(latR) * (lngR - lon0);

  const m =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64) * latR -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32) * Math.sin(2 * latR) +
      ((15 * e2 ** 2) / 256) * Math.sin(4 * latR));

  const x =
    k0 *
      n *
      (angle +
        ((1 - t + c) * angle ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c) * angle ** 5) / 120) +
    500000;

  const y =
    k0 *
    (m + n * Math.tan(latR) * (angle ** 2 / 2 + ((5 - t + 9 * c + 4 * c ** 2) * angle ** 4) / 24));

  return { x: Math.round(x), y: Math.round(y) };
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

function parseTiff(
  buffer: ArrayBuffer,
  bbox: BoundingBox,
  pixelSizeM: number,
): TerrainData["kotepunkter"] {
  const data = new DataView(buffer);
  const littleEndian = data.getUint16(0) === 0x4949;
  const ifdOffset = data.getUint32(4, littleEndian);
  const numEntries = data.getUint16(ifdOffset, littleEndian);
  let width = 0;
  let height = 0;
  let stripOffset = 0;

  for (let i = 0; i < numEntries; i++) {
    const base = ifdOffset + 2 + i * 12;
    const tag = data.getUint16(base, littleEndian);
    const value = data.getUint32(base + 8, littleEndian);
    if (tag === 256) width = value;
    else if (tag === 257) height = value;
    else if (tag === 273) stripOffset = value;
  }

  if (!width || !height || !stripOffset) return [];

  const points: TerrainData["kotepunkter"] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const offset = stripOffset + (row * width + col) * 4;
      if (offset + 4 > buffer.byteLength) continue;
      const z = data.getFloat32(offset, littleEndian);
      if (!Number.isFinite(z) || z < -100 || z > 3000) continue;
      points.push({
        x: Math.round((bbox.minX + col * pixelSizeM) * 10) / 10,
        y: Math.round((bbox.maxY - row * pixelSizeM) * 10) / 10,
        z: Math.round(z * 100) / 100,
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
    const kotepunkter = parseTiff(buffer, bbox, pixelSizeM);
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
