// SERVER-SIDE ONLY.
//
// Arealdata udvidede miljølag — opdateret efter DAI WFS lukning (arealinformation.miljoeportal.dk → HTTP 308 → SPA).
//
// Data er nu splittet på tre autoritative kilder:
//
// Kilde A — Miljøportalens GeoServer (offentlig):
//   URL:      https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs
//   Lag:      dai:bes_naturtyper, dai:habitat_omr, dai:fugle_bes_omr, dai:ramsar_omr,
//             dai:bes_sten_jorddiger_2022, dai:status_bnbo, dai:raastofomr
//   Geometri: Shape (MultiSurface eller MultiCurve afhængigt af lag)
//
// Kilde B — Miljøstyrelsen Grukos WFS (offentlig):
//   URL:      https://wfs2-miljoegis.mim.dk/grukos/ows
//   Lag:      grukos:drikkevandsinteresser (OSD)
//   Geometri: wkb_geometry
//
// Kilde C — Uafklaret (degraderer til null):
//   fortidsminde og fortidsmindeBuffer mangler verificeret erstatningsendpoint.
//   kulturarv.dk/ffgeoserver er utilgængeligt. null = ukendt, IKKE false.

import { makeErrorResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";
import { z } from "zod";

const GEOSERVER_WFS = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs";
const MILJOEGIS_GRUKOS_WFS = "https://wfs2-miljoegis.mim.dk/grukos/ows";
const SOURCE_URL = `${GEOSERVER_WFS}, ${MILJOEGIS_GRUKOS_WFS}`;

export type ArealdataContextResult = {
  paragraph3Nature: boolean | null;
  natura2000: boolean | null;
  protectedDige: boolean | null;
  fortidsminde: boolean | null;
  fortidsmindeBuffer: boolean | null;
  bnbo: boolean | null;
  osd: boolean | null;
  rawMaterialArea: boolean | null;
};

type Koordinat = { lat: number; lng: number };

// ---- Zod-schema til GeoServer JSON-boundary (Rule 1) ----

const geoServerResponseSchema = z.object({
  totalFeatures: z.number().optional(),
  features: z.array(z.unknown()).optional(),
});

// ---- WFS geometry helpers ----

function wgsPointFilter(geomField: string, koordinat: Koordinat): string {
  return `INTERSECTS(${geomField},SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}))`;
}

function wgsDwithinFilter(geomField: string, koordinat: Koordinat, distanceMeters: number): string {
  return `DWITHIN(${geomField},SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}),${distanceMeters},meters)`;
}

function wgsPolygonFilter(
  geomField: string,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection,
): string | null {
  const feature = polygon.type === "FeatureCollection" ? polygon.features[0] : polygon;
  if (!feature) return null;
  const geom = feature.geometry;
  if (!geom || geom.type !== "Polygon") return null;
  const ring = geom.coordinates[0];
  if (!ring || ring.length < 4) return null;
  const wkt = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `INTERSECTS(${geomField},SRID=4326;POLYGON((${wkt})))`;
}

function buildCqlFilter(
  geomField: string,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
  filterType: "intersects" | "dwithin",
  dwithinMeters?: number,
): string {
  if (filterType === "dwithin") {
    return wgsDwithinFilter(geomField, koordinat, dwithinMeters ?? 2);
  }
  if (polygon) {
    const wkt = wgsPolygonFilter(geomField, polygon);
    if (wkt) return wkt;
  }
  return wgsPointFilter(geomField, koordinat);
}

// ---- GeoServer fetcher (JSON) ----

async function fetchGeoServer(typename: string, cqlFilter: string): Promise<number> {
  const url =
    `${GEOSERVER_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=${typename}&count=1&outputFormat=application/json` +
    `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`GeoServer HTTP ${res.status} for ${typename}`);

  const parsed = geoServerResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`GeoServer: unexpected response shape for ${typename}`);
  return parsed.data.totalFeatures ?? parsed.data.features?.length ?? 0;
}

// ---- Miljoegis Grukos fetcher (JSON) ----

async function fetchGrukos(typename: string, cqlFilter: string): Promise<number> {
  const url =
    `${MILJOEGIS_GRUKOS_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=${typename}&count=1&outputFormat=application/json` +
    `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Grukos WFS HTTP ${res.status} for ${typename}`);

  const parsed = geoServerResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`Grukos: unexpected response shape for ${typename}`);
  return parsed.data.totalFeatures ?? parsed.data.features?.length ?? 0;
}

// ---- Per-lag fetching ----

type LayerOutcome = {
  key: keyof ArealdataContextResult;
  value: boolean | null;
  errored: boolean;
};

async function fetchLayer(
  key: keyof ArealdataContextResult,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): Promise<LayerOutcome> {
  try {
    switch (key) {
      case "paragraph3Nature": {
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const count = await fetchGeoServer("dai:bes_naturtyper", filter);
        return { key, value: count > 0, errored: false };
      }

      case "natura2000": {
        // OR på tværs af tre lag: habitat, fugle og ramsar.
        // Hvert sub-lag håndterer fejl individuelt: et hit på ét lag er nok til true.
        // Hvis alle tre fejler, returneres null (ukendt).
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const subResults = await Promise.all([
          fetchGeoServer("dai:habitat_omr", filter).catch(() => -1),
          fetchGeoServer("dai:fugle_bes_omr", filter).catch(() => -1),
          fetchGeoServer("dai:ramsar_omr", filter).catch(() => -1),
        ]);
        const anyHit = subResults.some((n) => n > 0);
        const allFailed = subResults.every((n) => n === -1);
        if (allFailed) return { key, value: null, errored: true };
        return { key, value: anyHit, errored: false };
      }

      case "protectedDige": {
        // Laget er MultiCurve (linjer) — brug DWITHIN 2m i stedet for INTERSECTS
        const filter = buildCqlFilter("Shape", koordinat, undefined, "dwithin", 2);
        const count = await fetchGeoServer("dai:bes_sten_jorddiger_2022", filter);
        return { key, value: count > 0, errored: false };
      }

      case "bnbo": {
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const count = await fetchGeoServer("dai:status_bnbo", filter);
        return { key, value: count > 0, errored: false };
      }

      case "osd": {
        // Grukos WFS bruger wkb_geometry som geometrifelt
        const filter = buildCqlFilter("wkb_geometry", koordinat, polygon, "intersects");
        const count = await fetchGrukos("grukos:drikkevandsinteresser", filter);
        return { key, value: count > 0, errored: false };
      }

      case "rawMaterialArea": {
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const count = await fetchGeoServer("dai:raastofomr", filter);
        return { key, value: count > 0, errored: false };
      }

      case "fortidsminde":
      case "fortidsmindeBuffer":
        // Ingen verificeret erstatningsendpoint efter DAI WFS lukning.
        // kulturarv.dk/ffgeoserver er utilgængeligt. Returnér null (ukendt), IKKE false.
        return { key, value: null, errored: true };

      default:
        return { key, value: null, errored: true };
    }
  } catch {
    return { key, value: null, errored: true };
  }
}

function emptyResult(): ArealdataContextResult {
  return {
    paragraph3Nature: null,
    natura2000: null,
    protectedDige: null,
    fortidsminde: null,
    fortidsmindeBuffer: null,
    bnbo: null,
    osd: null,
    rawMaterialArea: null,
  };
}

const ALL_KEYS: ReadonlyArray<keyof ArealdataContextResult> = [
  "paragraph3Nature",
  "natura2000",
  "protectedDige",
  "fortidsminde",
  "fortidsmindeBuffer",
  "bnbo",
  "osd",
  "rawMaterialArea",
];

export class ArealdataService {
  static async getContext(
    koordinat: Koordinat,
    parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
  ): Promise<SourceResult<ArealdataContextResult>> {
    try {
      const outcomes = await Promise.all(
        ALL_KEYS.map((key) => fetchLayer(key, koordinat, parcelPolygon)),
      );

      // Tæl kun de lag der faktisk har et live endpoint
      // fortidsminde og fortidsmindeBuffer tæller ikke som "fejl" i confidence-forstand
      // — de er eksplicit uafklarede, ikke netværksfejl
      const resolvedKeys = new Set<keyof ArealdataContextResult>([
        "paragraph3Nature",
        "natura2000",
        "protectedDige",
        "bnbo",
        "osd",
        "rawMaterialArea",
      ]);
      const resolvedOutcomes = outcomes.filter((o) => resolvedKeys.has(o.key));
      const successCount = resolvedOutcomes.filter((o) => !o.errored).length;

      if (successCount === 0) {
        return makeErrorResult(new Error("Arealdata: alle live lag fejlede"), {
          kilde: "arealdata",
          sourceUrl: SOURCE_URL,
        });
      }

      const result = emptyResult();
      for (const outcome of outcomes) {
        result[outcome.key] = outcome.value;
      }

      const someLiveFailed = resolvedOutcomes.some((o) => o.errored);
      return makeOkResult(result, {
        kilde: "arealdata",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
        confidence: someLiveFailed ? "unknown" : "confirmed",
      });
    } catch (error) {
      return makeErrorResult<ArealdataContextResult>(error, {
        kilde: "arealdata",
        sourceUrl: SOURCE_URL,
      });
    }
  }
}
