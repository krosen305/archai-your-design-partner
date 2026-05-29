// SERVER-SIDE ONLY.
//
// Maps validated GeoDanmark site context into the surroundings domain contract.

import type * as GeoJSON from "geojson";
import type { GeoDanmarkSiteContext } from "@/domain/contracts/geodanmark.types";
import type { NeighborBuilding, NeighborContext } from "@/domain/contracts/surroundings.types";
import { computeBbox25832 } from "@/lib/geometry-utils";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { expandBbox25832, GeoDanmarkSiteContextService, unionBbox25832 } from "./site-context";

const SOURCE_URL = "https://graphql.datafordeler.dk/GEODKV/v2";
const SOURCE_KIND = "geodanmark_nabo";

function mapBuilding(
  building: GeoDanmarkSiteContext["neighborBuildings"][number],
): NeighborBuilding {
  return {
    sourceId: building.sourceId,
    addressLabel: null,
    distanceM: building.distanceToParcelM ?? 0,
    footprintAreaM2: building.footprintAreaM2,
    geometry: building.geometry,
    geometrySource: "geodanmark",
  };
}

export function siteContextToNeighborContext(siteContext: GeoDanmarkSiteContext): NeighborContext {
  const buildings = siteContext.neighborBuildings
    .map(mapBuilding)
    .sort((a, b) => a.distanceM - b.distanceM);
  const nearestDistanceM = buildings[0]?.distanceM ?? null;
  const nearestRoadCenterlineDistanceM =
    siteContext.roadCenterlines.find((road) => road.distanceToParcelM !== null)
      ?.distanceToParcelM ?? null;
  const within100m = buildings.filter((building) => building.distanceM <= 100).length;

  return {
    count40m: buildings.filter((building) => building.distanceM <= 40).length,
    nearestDistanceM,
    nearestRoadCenterlineDistanceM,
    accessRoadNearby:
      nearestRoadCenterlineDistanceM !== null
        ? nearestRoadCenterlineDistanceM <= 100
        : siteContext.roadCenterlines.length > 0
          ? true
          : null,
    buildingDensityWithin100m: within100m / Math.PI,
    buildings,
    coverage: siteContext.coverage,
  };
}

function queryBboxForParcel(
  parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
  addressBbox25832: [number, number, number, number],
): [number, number, number, number] {
  const parcelBbox = parcelPolygon ? computeBbox25832(parcelPolygon) : null;
  if (!parcelBbox) return addressBbox25832;
  return unionBbox25832(expandBbox25832(parcelBbox, 100), addressBbox25832);
}

export class GeoDanmarkNeighborService {
  /**
   * @param parcelPolygon       Own parcel geometry in EPSG:25832. Used for distance and own-building filtering.
   * @param adresseBbox25832    Fallback bbox around the address point.
   * @param ownJordstykkeId     Legacy parameter. GeoDanmark GraphQL does not expose MAT parcel ids here.
   * @param ownBbrUuids         Optional BBR UUIDs for deterministic own-building classification.
   */
  static async getNeighborContext(
    parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
    adresseBbox25832: [number, number, number, number],
    ownJordstykkeId: string | null,
    ownBbrUuids: string[] = [],
  ): Promise<SourceResult<NeighborContext>> {
    void ownJordstykkeId;

    const siteResult = await GeoDanmarkSiteContextService.getSiteContext({
      bbox25832: queryBboxForParcel(parcelPolygon, adresseBbox25832),
      parcelPolygon,
      ownBbrUuids,
    });

    if (siteResult.status === "mock" && siteResult.data) {
      return makeMockResult(siteContextToNeighborContext(siteResult.data), {
        kilde: SOURCE_KIND,
        sourceUrl: siteResult.sourceUrl ?? SOURCE_URL,
        rawFeatureCount: siteResult.rawFeatureCount,
      });
    }

    if (siteResult.status === "ok" && siteResult.data) {
      return makeOkResult(siteContextToNeighborContext(siteResult.data), {
        kilde: SOURCE_KIND,
        sourceUrl: siteResult.sourceUrl ?? SOURCE_URL,
        rawFeatureCount: siteResult.rawFeatureCount,
        confidence: siteResult.confidence,
      });
    }

    return makeErrorResult<NeighborContext>(
      new Error(siteResult.errorDetails?.message ?? "GeoDanmark site context unavailable"),
      { kilde: SOURCE_KIND, sourceUrl: siteResult.sourceUrl ?? SOURCE_URL },
      siteResult.errorDetails,
    );
  }
}
