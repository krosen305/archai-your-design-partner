// SERVER-SIDE ONLY.
//
// GeoDanmark Vektor WFS — nabobygninger og vejadgang.
// Erstatter den defekte live-sti i src/integrations/geodanmark/client.ts.
//
// IS_MOCK=true indtil Task 0 er gennemført og typenames er verificeret:
//   1. Kør GetCapabilities (se plan Task 0 step 1-3)
//   2. Opdatér BYGNING_TYPENAME og VEJ_TYPENAME nedenfor
//   3. Sæt IS_MOCK=false
//
// Endpoint: https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS
// Auth: DATAFORDELER_API_KEY som query-param "apikey="

import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborBuilding, NeighborContext } from "@/domain/contracts/surroundings.types";
import { computePolygonAreaM2, polygonToPolygonDistanceM } from "@/lib/geometry-utils";
import type * as GeoJSON from "geojson";
import { z } from "zod";

const IS_MOCK = true;

const WFS_BASE = "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS";
const BYGNING_TYPENAME = "gdk:Bygning";
const VEJ_TYPENAME = "gdk:Vejmidte";
const SOURCE_URL = WFS_BASE;

const wfsFeatureSchema = z.object({
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

const wfsResponseSchema = z.object({
  features: z.array(wfsFeatureSchema).default([]),
});

type WfsFeature = z.infer<typeof wfsFeatureSchema>;

async function fetchWfsFeatures(
  typename: string,
  bboxStr: string,
  apiKey: string,
): Promise<WfsFeature[]> {
  const url = new URL(WFS_BASE);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", typename);
  url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
  url.searchParams.set("bbox", bboxStr);
  url.searchParams.set("outputFormat", "application/json");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GeoDanmark WFS HTTP ${res.status} for ${typename}`);
  const raw = await res.json();
  return wfsResponseSchema.parse(raw).features;
}

function featureToGeometry(f: WfsFeature): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!f.geometry) return null;
  if (f.geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: f.geometry.coordinates as number[][][] };
  }
  if (f.geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: f.geometry.coordinates as number[][][][] };
  }
  return null;
}

export class GeoDanmarkNeighborService {
  /**
   * @param parcelPolygon       Egen parcelgeometri i EPSG:25832 (foretrukket til afstandsberegning).
   * @param adresseBbox25832    Fallback bbox ± 150 m fra adressepunkt.
   * @param ownJordstykkeId     Eget jordstykke-id — bruges til at filtrere egne bygninger fra.
   */
  static async getNeighborContext(
    parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
    adresseBbox25832: [number, number, number, number],
    ownJordstykkeId: string | null,
  ): Promise<SourceResult<NeighborContext>> {
    if (IS_MOCK) {
      return makeMockResult<NeighborContext>(
        {
          count40m: 0,
          nearestDistanceM: null,
          nearestRoadCenterlineDistanceM: null,
          accessRoadNearby: null,
          buildingDensityWithin100m: null,
          buildings: [],
          coverage: "unknown",
        },
        { kilde: "geodanmark_nabo", sourceUrl: SOURCE_URL, rawFeatureCount: 0 },
      );
    }

    try {
      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
      const queryBbox = adresseBbox25832;
      const bboxStr = `${queryBbox[0]},${queryBbox[1]},${queryBbox[2]},${queryBbox[3]},urn:ogc:def:crs:EPSG::25832`;

      const [buildingFeatures, roadFeatures] = await Promise.all([
        fetchWfsFeatures(BYGNING_TYPENAME, bboxStr, apiKey),
        fetchWfsFeatures(VEJ_TYPENAME, bboxStr, apiKey).catch(() => [] as WfsFeature[]),
      ]);

      const neighborFeatures = ownJordstykkeId
        ? buildingFeatures.filter(
            (f) =>
              (f.properties?.["jordstykke_lokal_id"] as string | undefined) !== ownJordstykkeId &&
              (f.properties?.["id_jordstykke"] as string | undefined) !== ownJordstykkeId,
          )
        : buildingFeatures;

      const buildings: NeighborBuilding[] = [];

      for (const f of neighborFeatures) {
        const geom = featureToGeometry(f);
        let distanceM = 0;

        if (geom && parcelPolygon) {
          distanceM = polygonToPolygonDistanceM(parcelPolygon, geom) ?? 0;
        }

        const footprintAreaM2 = geom ? computePolygonAreaM2(geom) : null;

        buildings.push({
          sourceId: (f.properties?.["id_lokalId"] as string | undefined) ?? f.id ?? "ukendt",
          addressLabel: null,
          distanceM,
          footprintAreaM2,
          geometry: geom,
          geometrySource: "geodanmark",
        });
      }

      buildings.sort((a, b) => a.distanceM - b.distanceM);

      const count40m = buildings.filter((b) => b.distanceM <= 40).length;
      const nearestDistanceM = buildings[0]?.distanceM ?? null;
      const roadDistanceM =
        roadFeatures.length > 0
          ? ((roadFeatures[0]?.properties?.["afstand"] as number | undefined) ?? null)
          : null;

      const within100m = buildings.filter((b) => b.distanceM <= 100).length;
      const buildingDensityWithin100m = within100m / Math.PI;

      return makeOkResult<NeighborContext>(
        {
          count40m,
          nearestDistanceM: nearestDistanceM !== undefined ? nearestDistanceM : null,
          nearestRoadCenterlineDistanceM: roadDistanceM,
          accessRoadNearby: roadFeatures.length > 0 ? true : null,
          buildingDensityWithin100m,
          buildings,
          coverage: "covered",
        },
        {
          kilde: "geodanmark_nabo",
          sourceUrl: SOURCE_URL,
          rawFeatureCount: buildingFeatures.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "geodanmark_nabo", sourceUrl: SOURCE_URL });
    }
  }
}
