// SERVER-SIDE ONLY - WFS geometry adapter for authority-grade drawing layers.
// Compliance authority still belongs in rule-engine/site_constraints; this
// adapter only normalizes registry geometry for beliggenhedsplan output.

import { z } from "zod";
import type {
  BBox25832,
  GeoJsonPolygon25832,
  LayerSourceMeta,
  NaturbeskyttelseLayer,
  NaturbeskyttelseType,
} from "@/domain/drawing/beliggenhedsplan.types";
import { NaturbeskyttelseLayerSchema } from "@/domain/drawing/beliggenhedsplan.schemas";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { getEnvOptional } from "@/lib/env";

const DMP_WFS = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs";
const SLKS_WFS = "https://www.kulturarv.dk/ffgeoserver/public/wfs";
const MAT_WFS = "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";
const MAT_CRS = "urn:ogc:def:crs:EPSG::25832";

const WFS_RETRY = {
  timeoutMs: 10_000,
  retries: 1,
  retryDelayBaseMs: 500,
  retryOnStatuses: [502, 503, 504],
  retryOnAbort: false,
};

type SourceKind = "dmp" | "slks" | "mat";

type LayerConfig = {
  source: SourceKind;
  type: NaturbeskyttelseType;
  typeName: string;
  bufferDistanceM: number;
};

const DMP_LAYERS: readonly LayerConfig[] = [
  {
    source: "dmp",
    type: "skovbyggelinje",
    typeName: "dai:skovbyggelinjer",
    bufferDistanceM: 300,
  },
  {
    source: "dmp",
    type: "åbeskyttelse",
    typeName: "dai:aa_bes_linjer",
    bufferDistanceM: 150,
  },
] as const;

const SLKS_LAYERS: readonly LayerConfig[] = [
  {
    source: "slks",
    type: "fortidsmindebeskyttelse",
    typeName: "public:fundogfortidsminder_areal_beskyttelse",
    bufferDistanceM: 100,
  },
] as const;

const MAT_LAYERS: readonly LayerConfig[] = [
  {
    source: "mat",
    type: "strandbeskyttelse",
    typeName: "mat:StrandbeskyttelseFlade_Gaeldende",
    bufferDistanceM: 300,
  },
  {
    source: "mat",
    type: "klitfredning",
    typeName: "mat:KlitfredningFlade_Gaeldende",
    bufferDistanceM: 0,
  },
] as const;

const position25832Schema = z
  .tuple([z.number(), z.number()])
  .rest(z.number())
  .transform((coordinate): [number, number] => [coordinate[0], coordinate[1]]);

const linearRing25832Schema = z.array(position25832Schema).min(4);

const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(linearRing25832Schema).min(1),
});

const multiPolygonGeometrySchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(linearRing25832Schema).min(1)).min(1),
});

const wfsFeatureSchema = z.object({
  type: z.literal("Feature").optional(),
  id: z.union([z.string(), z.number()]).optional(),
  properties: z.record(z.unknown()).nullable().optional(),
  geometry: z.union([polygonGeometrySchema, multiPolygonGeometrySchema]).nullable(),
});

const wfsFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection").optional(),
  features: z.array(wfsFeatureSchema).default([]),
});

export type NaturbeskyttelseGeometryAdapterConfig = {
  dmpEndpoint?: string;
  slksEndpoint?: string;
  matEndpoint?: string;
  datafordelerApiKey?: string;
  now?: Date;
  includeMatLayers?: boolean;
};

function fetchedAt(config: NaturbeskyttelseGeometryAdapterConfig | undefined): string {
  return (config?.now ?? new Date()).toISOString();
}

function sourceMeta(
  config: NaturbeskyttelseGeometryAdapterConfig | undefined,
  reviewReasons?: string[],
  confidence: LayerSourceMeta["confidence"] = "medium",
): LayerSourceMeta {
  return {
    source: "registry",
    confidence: reviewReasons?.length ? "unknown" : confidence,
    fetchedAt: fetchedAt(config),
    requiresReview: (reviewReasons?.length ?? 0) > 0,
    ...(reviewReasons?.length ? { reviewReasons } : {}),
  };
}

function bboxParam(bbox: BBox25832): string {
  return `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},EPSG:25832`;
}

function matBboxParam(bbox: BBox25832): string {
  return `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},${MAT_CRS}`;
}

function buildGeoJsonWfsUrl(endpoint: string, layer: LayerConfig, bbox: BBox25832): string {
  const url = new URL(endpoint);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", layer.source === "slks" ? "1.1.0" : "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set(layer.source === "slks" ? "typeName" : "typeNames", layer.typeName);
  url.searchParams.set("srsName", "EPSG:25832");
  url.searchParams.set("bbox", bboxParam(bbox));
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set(layer.source === "slks" ? "maxFeatures" : "count", "100");
  return url.toString();
}

function buildMatWfsUrl(
  endpoint: string,
  layer: LayerConfig,
  bbox: BBox25832,
  apiKey: string,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", layer.typeName);
  url.searchParams.set("srsname", MAT_CRS);
  url.searchParams.set("bbox", matBboxParam(bbox));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("count", "100");
  return url.toString();
}

function polygonLayer(
  layer: LayerConfig,
  coordinates: [number, number][][],
  source: LayerSourceMeta,
): NaturbeskyttelseLayer | null {
  const parsed = NaturbeskyttelseLayerSchema.safeParse({
    type: layer.type,
    geometry25832: {
      type: "Polygon",
      coordinates,
      crs: "EPSG:25832",
    },
    bufferDistanceM: layer.bufferDistanceM,
    intersectsProposedBuilding: false,
    source,
  });

  return parsed.success ? parsed.data : null;
}

export function decodeGeoJsonProtectionLayers(
  payload: unknown,
  layer: LayerConfig,
  config?: NaturbeskyttelseGeometryAdapterConfig,
): NaturbeskyttelseLayer[] {
  const parsed = wfsFeatureCollectionSchema.parse(payload);
  const source = sourceMeta(config);
  const layers: NaturbeskyttelseLayer[] = [];

  for (const feature of parsed.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      const normalized = polygonLayer(layer, geometry.coordinates, source);
      if (normalized) layers.push(normalized);
      continue;
    }

    for (const polygonCoordinates of geometry.coordinates) {
      const normalized = polygonLayer(layer, polygonCoordinates, source);
      if (normalized) layers.push(normalized);
    }
  }

  return layers;
}

function xmlTextDecode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parsePosList(posList: string): [number, number][] {
  const values = xmlTextDecode(posList)
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

export function decodeMatXmlProtectionLayers(
  xml: string,
  layer: LayerConfig,
  config?: NaturbeskyttelseGeometryAdapterConfig,
): NaturbeskyttelseLayer[] {
  const source = sourceMeta(config);
  const layers: NaturbeskyttelseLayer[] = [];
  const polygonRe = /<(?:[^:>\s]+:)?Polygon\b[^>]*>([\s\S]*?)<\/(?:[^:>\s]+:)?Polygon>/g;
  let polygonMatch: RegExpExecArray | null;

  while ((polygonMatch = polygonRe.exec(xml)) !== null) {
    const polygonBlock = polygonMatch[1] ?? "";
    const rings: [number, number][][] = [];
    const posListRe = /<(?:[^:>\s]+:)?posList\b[^>]*>([\s\S]*?)<\/(?:[^:>\s]+:)?posList>/g;
    let posListMatch: RegExpExecArray | null;

    while ((posListMatch = posListRe.exec(polygonBlock)) !== null) {
      const ring = parsePosList(posListMatch[1] ?? "");
      if (ring.length >= 4) rings.push(ring);
    }

    if (!rings.length) continue;
    const normalized = polygonLayer(layer, rings, source);
    if (normalized) layers.push(normalized);
  }

  return layers;
}

async function fetchGeoJsonLayer(
  endpoint: string,
  layer: LayerConfig,
  bbox25832: BBox25832,
  config?: NaturbeskyttelseGeometryAdapterConfig,
): Promise<NaturbeskyttelseLayer[]> {
  const url = buildGeoJsonWfsUrl(endpoint, layer, bbox25832);
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "application/json, application/geo+json;q=0.9",
        "Accept-Encoding": "identity",
      },
    },
    WFS_RETRY,
    {
      service: layer.source === "slks" ? "SLKS Fortidsminder WFS" : "Danmarks Miljoeportal WFS",
      operation: `GetFeature ${layer.typeName}`,
      phase: "drawing",
      metadata: { typeName: layer.typeName, naturbeskyttelseType: layer.type },
    },
  );

  if (!res.ok) return [];

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!contentType.includes("json") && !text.trim().startsWith("{")) return [];

  const payload: unknown = JSON.parse(text);
  return decodeGeoJsonProtectionLayers(payload, layer, config);
}

async function fetchMatLayer(
  endpoint: string,
  layer: LayerConfig,
  bbox25832: BBox25832,
  apiKey: string,
  config?: NaturbeskyttelseGeometryAdapterConfig,
): Promise<NaturbeskyttelseLayer[]> {
  const url = buildMatWfsUrl(endpoint, layer, bbox25832, apiKey);
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "application/xml, text/xml, */*;q=0.8",
        "Accept-Encoding": "identity",
      },
    },
    WFS_RETRY,
    {
      service: "Datafordeler MAT WFS",
      operation: `GetFeature ${layer.typeName}`,
      phase: "drawing",
      metadata: { typeName: layer.typeName, naturbeskyttelseType: layer.type },
    },
  );

  if (!res.ok) return [];
  return decodeMatXmlProtectionLayers(await res.text(), layer, config);
}

async function safelyFetchLayer(fetchLayer: () => Promise<NaturbeskyttelseLayer[]>) {
  try {
    return await fetchLayer();
  } catch {
    return [];
  }
}

export async function fetchNaturbeskyttelseLayers(
  bbox25832: BBox25832,
  config: NaturbeskyttelseGeometryAdapterConfig = {},
): Promise<NaturbeskyttelseLayer[]> {
  const dmpEndpoint = config.dmpEndpoint ?? DMP_WFS;
  const slksEndpoint = config.slksEndpoint ?? SLKS_WFS;
  const matEndpoint = config.matEndpoint ?? MAT_WFS;
  const datafordelerApiKey = config.datafordelerApiKey ?? getEnvOptional("DATAFORDELER_API_KEY");
  const includeMatLayers = config.includeMatLayers ?? Boolean(datafordelerApiKey);

  const dmpFetches = DMP_LAYERS.map((layer) =>
    safelyFetchLayer(() => fetchGeoJsonLayer(dmpEndpoint, layer, bbox25832, config)),
  );
  const slksFetches = SLKS_LAYERS.map((layer) =>
    safelyFetchLayer(() => fetchGeoJsonLayer(slksEndpoint, layer, bbox25832, config)),
  );
  const matFetches =
    includeMatLayers && datafordelerApiKey
      ? MAT_LAYERS.map((layer) =>
          safelyFetchLayer(() =>
            fetchMatLayer(matEndpoint, layer, bbox25832, datafordelerApiKey, config),
          ),
        )
      : [];

  const layerGroups = await Promise.all([...dmpFetches, ...slksFetches, ...matFetches]);
  return layerGroups.flat();
}

export const verifiedNaturbeskyttelseTypeNames = {
  dmp: DMP_LAYERS.map((layer) => layer.typeName),
  slks: SLKS_LAYERS.map((layer) => layer.typeName),
  mat: MAT_LAYERS.map((layer) => layer.typeName),
} as const;
