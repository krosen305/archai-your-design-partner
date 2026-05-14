// SERVER-SIDE ONLY — never import from browser code.
//
// SDFI Danmarks Højdemodel (DHM/Terræn) — kotepunkter for parcel (ARCH-102).
//
// ⚠️  IS_MOCK=true — WCS GetCoverage endpoint kræver verificering af
//     layer-navn og TIFF-parsing mod live data.
//
// API: Datafordeler DHM WCS
//   Endpoint:  https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS
//   Auth:      DATAFORDELER_API_KEY som query parameter
//   Coverage:  dhm_terraen (verificér mod GetCapabilities)
//   Format:    image/tiff (GeoTIFF med én float32 kote per pixel)
//   CRS:       EPSG:25832 (ETRS89 / UTM zone 32N)
//   Opløsning: 0.4 m (DHM standard)
//
// North orientation:
//   ETRS89 (UTM32) Y-aksen peger mod geografisk nord.
//   Fasaderetning estimeres fra parcelcentrum relativt til adressepunkt:
//   adressen er typisk på vejsiden, dvs. modsat facades orientering.
//   Live-implementering kræver vejgeometri fra DAR vejnavngivning.

import { getEnvRequired } from "@/lib/env";

const IS_MOCK = true;

const DHM_WCS = "https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WCS";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BoundingBox = {
  minX: number; // ETRS89/UTM32 easting (m)
  minY: number; // northing (m)
  maxX: number;
  maxY: number;
};

export type NorthOrientation = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type TerrainData = {
  minElevationM: number;
  maxElevationM: number;
  avgElevationM: number;
  slopePercent: number; // (max-min) / parcel_width * 100
  northOrientation: NorthOrientation;
  kotepunkter: Array<{ x: number; y: number; z: number }>;
  kilde: "dhm" | "mock";
};

// ---------------------------------------------------------------------------
// North orientation helper
// ---------------------------------------------------------------------------

// Estimer fasaderetning fra WGS84-koordinater.
// Fremgangsmåde: adressen sidder på vejsiden af parcellen.
// Uden vejgeometri: dansk bolig er typisk sydvendt (mod gaden) — returnér 'S'.
// Live-implementering: sammenlign adressepunkt med parcelcentroid via MAT.
export function getNorthOrientation(_lat: number, _lng: number): NorthOrientation {
  // TODO (ARCH-102 live): hent parcelcentroid fra MAT og beregn bearing
  // fra adressepunkt til centroid → modsat retning er fasaderetning.
  return "S";
}

// Konverter koordinater fra WGS84 til approx ETRS89/UTM32.
// Nøjagtighed: ±1 m (tilstrækkeligt til WCS bbox).
function wgs84ToUtm32(lat: number, lng: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = 2 * f - f * f;
  const lon0 = (9 * Math.PI) / 180; // UTM zone 32 central meridian

  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(latR) ** 2);
  const T = Math.tan(latR) ** 2;
  const C = (e2 / (1 - e2)) * Math.cos(latR) ** 2;
  const A = Math.cos(latR) * (lngR - lon0);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64) * latR -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32) * Math.sin(2 * latR) +
      ((15 * e2 ** 2) / 256) * Math.sin(4 * latR));

  const x =
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C) * A ** 5) / 120) +
    500000;

  const y =
    k0 * (M + N * Math.tan(latR) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24));

  return { x: Math.round(x), y: Math.round(y) };
}

// Beregn WCS bbox fra adressepunkt + halv parcel-bredde.
export function bboxFromPoint(lat: number, lng: number, grundareal: number | null): BoundingBox {
  const { x, y } = wgs84ToUtm32(lat, lng);
  // Estimer parcel-bredde fra grundareal (antag kvadratisk form)
  const halfWidth = grundareal ? Math.round(Math.sqrt(grundareal) / 2) + 5 : 30;
  return {
    minX: x - halfWidth,
    minY: y - halfWidth,
    maxX: x + halfWidth,
    maxY: y + halfWidth,
  };
}

// ---------------------------------------------------------------------------
// Live API helpers
// ---------------------------------------------------------------------------

// Parse raw GeoTIFF float32 data til kotepunkter.
// GeoTIFF fra DHM er IEEE 754 little-endian float32 per pixel.
function parseTiff(
  buffer: ArrayBuffer,
  bbox: BoundingBox,
  pixelSizeM: number,
): TerrainData["kotepunkter"] {
  const data = new DataView(buffer);

  // Find IFD offset (bytes 4-7) — minimal TIFF reader
  const littleEndian = data.getUint16(0) === 0x4949;
  const ifdOffset = data.getUint32(4, littleEndian);

  // Count IFD entries to find image dimensions + strip offsets
  const numEntries = data.getUint16(ifdOffset, littleEndian);
  let width = 0;
  let height = 0;
  let stripOffset = 0;

  for (let i = 0; i < numEntries; i++) {
    const base = ifdOffset + 2 + i * 12;
    const tag = data.getUint16(base, littleEndian);
    const val = data.getUint32(base + 8, littleEndian);
    if (tag === 256) width = val;
    else if (tag === 257) height = val;
    else if (tag === 273) stripOffset = val;
  }

  if (!width || !height || !stripOffset) return [];

  const points: TerrainData["kotepunkter"] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const offset = stripOffset + (row * width + col) * 4;
      if (offset + 4 > buffer.byteLength) continue;
      const z = data.getFloat32(offset, littleEndian);
      if (!isFinite(z) || z < -100 || z > 3000) continue; // no-data guard
      points.push({
        x: Math.round((bbox.minX + col * pixelSizeM) * 10) / 10,
        y: Math.round((bbox.maxY - row * pixelSizeM) * 10) / 10,
        z: Math.round(z * 100) / 100,
      });
    }
  }

  return points;
}

async function fetchLiveTerrain(bbox: BoundingBox, lat: number, lng: number): Promise<TerrainData> {
  const apiKey = getEnvRequired("DATAFORDELER_API_KEY");

  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;
  const pixelSizeM = 0.4;
  const cols = Math.ceil(width / pixelSizeM);
  const rows = Math.ceil(height / pixelSizeM);

  const url =
    `${DHM_WCS}?SERVICE=WCS&VERSION=1.1.1&REQUEST=GetCoverage` +
    `&IDENTIFIER=dhm_terraen&apiKey=${apiKey}` +
    `&BOUNDINGBOX=${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY},urn:ogc:def:crs:EPSG::25832` +
    `&FORMAT=image/tiff&GridBaseCRS=urn:ogc:def:crs:EPSG::25832` +
    `&GridOffsets=${pixelSizeM},-${pixelSizeM}&GridCS=urn:ogc:def:cs:OGC:0.0:Grid2dSquareCS` +
    `&GridOrigin=${bbox.minX},${bbox.maxY}&width=${cols}&height=${rows}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DHM WCS HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  const kotepunkter = parseTiff(buffer, bbox, pixelSizeM);

  if (kotepunkter.length === 0) throw new Error("DHM: ingen kotepunkter fundet i GeoTIFF");

  const zValues = kotepunkter.map((p) => p.z);
  const minElevationM = Math.min(...zValues);
  const maxElevationM = Math.max(...zValues);
  const avgElevationM = Math.round((zValues.reduce((a, b) => a + b, 0) / zValues.length) * 10) / 10;
  const parcelWidth = Math.sqrt((bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY));
  const slopePercent = Math.round(((maxElevationM - minElevationM) / parcelWidth) * 100 * 10) / 10;

  return {
    minElevationM: Math.round(minElevationM * 10) / 10,
    maxElevationM: Math.round(maxElevationM * 10) / 10,
    avgElevationM,
    slopePercent,
    northOrientation: getNorthOrientation(lat, lng),
    kotepunkter,
    kilde: "dhm",
  };
}

// ---------------------------------------------------------------------------
// DhmService
// ---------------------------------------------------------------------------

export const DhmService = {
  async getTerrainData(bbox: BoundingBox, lat: number, lng: number): Promise<TerrainData> {
    if (IS_MOCK) {
      // Realistisk mock for Hasselvej 48, Virum — let skrånende terræn mod syd
      return {
        minElevationM: 18.4,
        maxElevationM: 21.7,
        avgElevationM: 20.1,
        slopePercent: 4.2,
        northOrientation: getNorthOrientation(lat, lng),
        kotepunkter: [
          { x: bbox.minX + 5, y: bbox.minY + 5, z: 18.4 },
          { x: bbox.maxX - 5, y: bbox.maxY - 5, z: 21.7 },
        ],
        kilde: "mock",
      };
    }

    return fetchLiveTerrain(bbox, lat, lng);
  },
};
