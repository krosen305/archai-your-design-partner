import proj4 from "proj4";
import type * as GeoJSON from "geojson";
import { getEnvRequired, getEnvOptional } from "@/lib/env";
import {
  getCachedJordstykkePolygon,
  setCachedJordstykkePolygon,
} from "@/integrations/cache/client";
import { parseMatJordstykkeFeatureCollection } from "@/lib/mat-wfs-geojson";

export const EPSG25832 = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs";

const MAT_WFS_URL = "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";
const MAT_WMS_URL = "https://wms.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWMS/1.0.0/WMS";
const WGS84 = "EPSG:4326";

export type MapPoint = {
  lat: number;
  lng: number;
};

export type ParcelGeometryRequest = {
  point: MapPoint;
  adresseid?: string | null;
  bufferMeters?: number;
};

export type ParcelPreviewRequest = {
  point: MapPoint;
  width?: number;
  height?: number;
  bufferMeters?: number;
};

export type BBox25832 = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type TileRequest = {
  layer?: MapTileLayer;
  z: string;
  x: string;
  y: string;
};

export type MapTileLayer = "skaermkort" | "ortofoto";

const SKAERMKORT_WMTS =
  "https://api.dataforsyningen.dk/topo_skaermkort_daempet_wmts_topo_skaermkort_daempet/1.0.0/wmts";
const ORTOFOTO_WMTS = "https://wmts.datafordeler.dk/GeoDanmarkOrto/orto_foraar_webm/1.0.0/WMTS";

export async function fetchMapTileProxy(req: TileRequest): Promise<string | null> {
  if (req.layer === "ortofoto") {
    return fetchOrtofotoTileProxy(req);
  }

  return fetchSkaermkortTileProxy(req);
}

export async function fetchSkaermkortTileProxy(req: TileRequest): Promise<string | null> {
  const token = getEnvOptional("DATAFORSYNINGEN_TOKEN");
  if (!token) return null;

  const url = new URL(SKAERMKORT_WMTS);
  url.searchParams.set("SERVICE", "WMTS");
  url.searchParams.set("REQUEST", "GetTile");
  url.searchParams.set("VERSION", "1.0.0");
  url.searchParams.set("LAYER", "topo_skaermkort_daempet");
  url.searchParams.set("STYLE", "default");
  url.searchParams.set("TILEMATRIXSET", "GoogleMapsCompatible");
  url.searchParams.set("TILEMATRIX", req.z);
  url.searchParams.set("TILEROW", req.y);
  url.searchParams.set("TILECOL", req.x);
  url.searchParams.set("token", token);

  const res = await fetch(url);
  if (!res.ok) return null;

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) return null;
  return toDataUrl(res.headers.get("content-type") ?? "image/png", buf);
}

export async function fetchOrtofotoTileProxy(req: TileRequest): Promise<string | null> {
  const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
  const url = new URL(ORTOFOTO_WMTS);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("SERVICE", "WMTS");
  url.searchParams.set("REQUEST", "GetTile");
  url.searchParams.set("VERSION", "1.0.0");
  url.searchParams.set("LAYER", "orto_foraar_webm");
  url.searchParams.set("STYLE", "default");
  url.searchParams.set("FORMAT", "image/jpeg");
  url.searchParams.set("TILEMATRIXSET", "DFD_GoogleMapsCompatible");
  url.searchParams.set("TILEMATRIX", req.z);
  url.searchParams.set("TILEROW", req.y);
  url.searchParams.set("TILECOL", req.x);

  const res = await fetch(url);
  if (!res.ok) return null;

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) return null;
  return toDataUrl(res.headers.get("content-type") ?? "image/jpeg", buf);
}

export type ProxiedMapImage = {
  contentType: string;
  dataUrl: string;
  bbox25832: [number, number, number, number];
  width: number;
  height: number;
};

export type ParcelGeometryResult = {
  bbox25832: [number, number, number, number] | null;
  featureCollection: GeoJSON.FeatureCollection | null;
  source: "wfs" | "fallback" | "missing";
};

export function toUtm32(point: MapPoint): [number, number] {
  return proj4(WGS84, EPSG25832, [point.lng, point.lat]) as [number, number];
}

export function toWgs84(x: number, y: number): [number, number] {
  return proj4(EPSG25832, WGS84, [x, y]) as [number, number];
}

export function createBboxAroundPoint(point: MapPoint, bufferMeters = 140): BBox25832 {
  const [x, y] = toUtm32(point);
  return {
    minX: x - bufferMeters,
    minY: y - bufferMeters,
    maxX: x + bufferMeters,
    maxY: y + bufferMeters,
  };
}

function bboxToArray(bbox: BBox25832): [number, number, number, number] {
  return [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY];
}

function bboxToWkt(bbox: BBox25832): string {
  return `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY},urn:ogc:def:crs:EPSG::25832`;
}

function toDataUrl(contentType: string, arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function ensureApiKey(): string {
  return getEnvRequired("DATAFORDELER_API_KEY");
}

function matJordstykkeFilterByLokalId(jordstykkeLokalId: string): string {
  return [
    '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0">',
    "<fes:PropertyIsEqualTo>",
    "<fes:ValueReference>id.lokalId</fes:ValueReference>",
    `<fes:Literal>${jordstykkeLokalId}</fes:Literal>`,
    "</fes:PropertyIsEqualTo>",
    "</fes:Filter>",
  ].join("");
}

export async function fetchParcelGeometryProxy(
  request: ParcelGeometryRequest,
): Promise<ParcelGeometryResult> {
  const bbox = createBboxAroundPoint(request.point, request.bufferMeters ?? 140);

  if (request.adresseid) {
    try {
      const cached = await getCachedJordstykkePolygon(request.adresseid);
      if (cached) {
        return { bbox25832: bboxToArray(bbox), featureCollection: cached, source: "wfs" };
      }
    } catch {
      // Cache errors are non-blocking.
    }
  }

  const apiKey = ensureApiKey();
  const url = new URL(MAT_WFS_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", "mat:Jordstykke_Gaeldende");
  url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
  url.searchParams.set("bbox", bboxToWkt(bbox));
  url.searchParams.set("outputFormat", "application/json");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json, application/geo+json;q=0.9, */*;q=0.8",
    },
  });

  if (!res.ok) {
    return { bbox25832: bboxToArray(bbox), featureCollection: null, source: "missing" };
  }

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!text.trim()) {
    return { bbox25832: bboxToArray(bbox), featureCollection: null, source: "missing" };
  }

  if (!contentType.includes("json") && !text.trim().startsWith("{")) {
    return { bbox25832: bboxToArray(bbox), featureCollection: null, source: "missing" };
  }

  try {
    const parsed = JSON.parse(text) as GeoJSON.FeatureCollection;
    const result: ParcelGeometryResult = {
      bbox25832: bboxToArray(bbox),
      featureCollection: parsed,
      source: parsed.features.length > 0 ? "wfs" : "missing",
    };

    if (request.adresseid && result.source === "wfs" && result.featureCollection) {
      setCachedJordstykkePolygon(request.adresseid, result.featureCollection).catch(() => {
        // Fire-and-forget
      });
    }

    return result;
  } catch {
    return { bbox25832: bboxToArray(bbox), featureCollection: null, source: "missing" };
  }
}

export async function fetchParcelGeometryByJordstykkeId(
  jordstykkeLokalId: string,
): Promise<{ featureCollection: GeoJSON.FeatureCollection | null; source: "wfs" | "notfound" }> {
  if (!jordstykkeLokalId.trim()) return { featureCollection: null, source: "notfound" };

  try {
    const apiKey = ensureApiKey();
    const url = new URL(MAT_WFS_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typenames", "mat:Jordstykke_Gaeldende");
    url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
    url.searchParams.set("FILTER", matJordstykkeFilterByLokalId(jordstykkeLokalId));

    const res = await fetch(url, {
      headers: { Accept: "application/json, application/xml, text/xml, */*;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { featureCollection: null, source: "notfound" };

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!text.trim()) return { featureCollection: null, source: "notfound" };

    const parsedFeatureCollection = parseMatJordstykkeFeatureCollection(text, contentType);
    const features = parsedFeatureCollection.features.filter(
      (feature): feature is GeoJSON.Feature<GeoJSON.Geometry> => feature.geometry !== null,
    );
    if (!features.length) return { featureCollection: null, source: "notfound" };

    return { featureCollection: { type: "FeatureCollection", features }, source: "wfs" };
  } catch {
    return { featureCollection: null, source: "notfound" };
  }
}

export async function fetchMatriklenPreviewProxy(
  request: ParcelPreviewRequest,
): Promise<ProxiedMapImage | null> {
  const bbox = createBboxAroundPoint(request.point, request.bufferMeters ?? 180);
  const width = Math.max(640, Math.min(1280, request.width ?? 1024));
  const height = Math.max(480, Math.min(1280, request.height ?? 768));
  const apiKey = ensureApiKey();
  const url = new URL(MAT_WMS_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.3.0");
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", "mat:Jordstykke_Gaeldende,mat:Matrikelskel_Gaeldende");
  url.searchParams.set("styles", "");
  url.searchParams.set("crs", "EPSG:25832");
  url.searchParams.set("bbox", `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`);
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("exceptions", "application/vnd.ogc.se_inimage");

  const res = await fetch(url, {
    headers: {
      Accept: "image/png,image/*;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength === 0) return null;

  return {
    contentType,
    dataUrl: toDataUrl(contentType, buffer),
    bbox25832: bboxToArray(bbox),
    width,
    height,
  };
}
