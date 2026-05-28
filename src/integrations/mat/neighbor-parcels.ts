// src/integrations/mat/neighbor-parcels.ts
// SERVER-SIDE ONLY.
//
// MAT WFS — nabomatrikler (jordstykker) tilstødende eget jordstykke.
// Bruger samme Datafordeler MAT WFS endpoint som MatGeometryService.
//
// IS_MOCK=true — live aktivering kræver verifikation af spatial adjacency
// via WFS BBOX og efterfølgende tolerance-test (0.25 m) for shared boundary.
//
// Endpoint: https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS
// Auth: DATAFORDELER_API_KEY

import { getEnvRequired } from "@/lib/env";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { parseMatJordstykkeFeatureCollection } from "@/lib/mat-wfs-geojson";
import { fetchParcelGeometryByJordstykkeId } from "@/lib/map-proxy";
import { polygonToPolygonDistanceM } from "@/lib/geometry-utils";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborParcel } from "@/domain/contracts/surroundings.types";
import type * as GeoJSON from "geojson";

const MAT_WFS_BASE = "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";
const JORDSTYKKE_TYPENAME = "mat:Jordstykke_Gaeldende";
const SOURCE_URL = MAT_WFS_BASE;

type RawNeighborParcel = Omit<NeighborParcel, "relation" | "sharedBoundaryLengthM" | "distanceM">;

type Segment = [[number, number], [number, number]];

function buildSegments(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Segment[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const segments: Segment[] = [];

  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer?.length) continue;
    for (let i = 0; i < outer.length - 1; i += 1) {
      segments.push([outer[i] as [number, number], outer[i + 1] as [number, number]]);
    }
  }

  return segments;
}

function segmentLength(segment: Segment): number {
  return Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]);
}

function sharedSegmentLength(segmentA: Segment, segmentB: Segment, tolerance = 0.05): number {
  const [a1, a2] = segmentA;
  const [b1, b2] = segmentB;
  const ax = a2[0] - a1[0];
  const ay = a2[1] - a1[1];
  const bx = b2[0] - b1[0];
  const by = b2[1] - b1[1];
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) > tolerance) return 0;

  const segALength = segmentLength(segmentA);
  const segBLength = segmentLength(segmentB);
  if (segALength === 0 || segBLength === 0) return 0;

  const distanceToLine = Math.abs((b1[0] - a1[0]) * ay - (b1[1] - a1[1]) * ax) / segALength;
  if (distanceToLine > tolerance) return 0;

  const useX = Math.abs(ax) >= Math.abs(ay);
  const aValues = useX ? [a1[0], a2[0]] : [a1[1], a2[1]];
  const bValues = useX ? [b1[0], b2[0]] : [b1[1], b2[1]];
  const aMin = Math.min(...aValues);
  const aMax = Math.max(...aValues);
  const bMin = Math.min(...bValues);
  const bMax = Math.max(...bValues);
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);

  return overlap > tolerance ? overlap : 0;
}

function computeSharedBoundaryLengthM(
  ownGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  neighborGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  const ownSegments = buildSegments(ownGeometry);
  const neighborSegments = buildSegments(neighborGeometry);
  let sharedLength = 0;

  for (const ownSegment of ownSegments) {
    for (const neighborSegment of neighborSegments) {
      sharedLength += sharedSegmentLength(ownSegment, neighborSegment);
    }
  }

  return Math.round(sharedLength * 100) / 100;
}

function classifyRelation(
  ownGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
  neighborGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): Pick<NeighborParcel, "relation" | "sharedBoundaryLengthM" | "distanceM"> {
  if (!ownGeometry || !neighborGeometry) {
    return { relation: "unknown", sharedBoundaryLengthM: null, distanceM: null };
  }

  const distanceM = polygonToPolygonDistanceM(ownGeometry, neighborGeometry);
  if (distanceM === null) {
    return { relation: "unknown", sharedBoundaryLengthM: null, distanceM: null };
  }

  const sharedBoundaryLengthM = computeSharedBoundaryLengthM(ownGeometry, neighborGeometry);
  if (sharedBoundaryLengthM > 0.25) {
    return { relation: "shared_boundary", sharedBoundaryLengthM, distanceM: 0 };
  }

  if (distanceM <= 0.25) {
    return { relation: "corner_touch", sharedBoundaryLengthM: null, distanceM: 0 };
  }

  return {
    relation: "nearby",
    sharedBoundaryLengthM: null,
    distanceM: Math.round(distanceM * 100) / 100,
  };
}

export class MatNeighborParcelService {
  static async getNeighborParcels(
    ownJordstykkeId: string,
    bbox25832: [number, number, number, number],
  ): Promise<SourceResult<NeighborParcel[]>> {
    if (FEATURE_FLAGS.matNeighborParcelsMock) {
      return makeMockResult<NeighborParcel[]>([], {
        kilde: "mat_neighbor_parcels",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
      });
    }

    try {
      const ownGeometryResult = await fetchParcelGeometryByJordstykkeId(ownJordstykkeId);
      const ownGeometryFromById = (ownGeometryResult.featureCollection?.features[0]?.geometry ??
        null) as GeoJSON.Polygon | GeoJSON.MultiPolygon | null;

      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
      const bboxStr = `${bbox25832[0]},${bbox25832[1]},${bbox25832[2]},${bbox25832[3]},urn:ogc:def:crs:EPSG::25832`;

      const url = new URL(MAT_WFS_BASE);
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("service", "WFS");
      url.searchParams.set("version", "2.0.0");
      url.searchParams.set("request", "GetFeature");
      url.searchParams.set("typenames", JORDSTYKKE_TYPENAME);
      url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
      url.searchParams.set("bbox", bboxStr);

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json, application/xml, text/xml, */*;q=0.8" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`MAT WFS HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();
      const featureCollection = parseMatJordstykkeFeatureCollection(body, contentType);
      const parcels = featureCollection.features.map((feature): RawNeighborParcel => {
        const properties = feature.properties ?? {};

        return {
          jordstykkeLokalId:
            (properties["id_lokalId"] as string | undefined) ??
            (typeof feature.id === "string" ? feature.id : "ukendt"),
          matrikelnummer: (properties["matrikelnummer"] as string | undefined) ?? null,
          ejerlavskode: (properties["ejerlavskode"] as number | undefined) ?? null,
          geometry: (feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | null) ?? null,
        };
      });
      const ownGeometry =
        ownGeometryFromById ??
        parcels.find((parcel) => parcel.jordstykkeLokalId === ownJordstykkeId)?.geometry ??
        null;

      const filteredParcels = parcels
        .filter((parcel) => parcel.jordstykkeLokalId !== ownJordstykkeId)
        .map((parcel): NeighborParcel => {
          const relation = classifyRelation(ownGeometry, parcel.geometry);
          return {
            ...parcel,
            relation: relation.relation,
            sharedBoundaryLengthM: relation.sharedBoundaryLengthM,
            distanceM: relation.distanceM,
          };
        })
        .sort((a, b) => {
          const aDistance = a.distanceM ?? Number.POSITIVE_INFINITY;
          const bDistance = b.distanceM ?? Number.POSITIVE_INFINITY;
          return aDistance - bDistance;
        });

      return makeOkResult<NeighborParcel[]>(filteredParcels, {
        kilde: "mat_neighbor_parcels",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: parcels.length,
      });
    } catch (e) {
      return makeErrorResult(e, { kilde: "mat_neighbor_parcels", sourceUrl: SOURCE_URL });
    }
  }
}
