// SERVER-SIDE ONLY - credentials must never be exposed to the browser.
//
// Legacy facade for the cockpit's NeighborBuildingData contract.
// Live data comes from GeoDanmark Vektor GraphQL (GEODKV/v2).

import type * as GeoJSON from "geojson";
import type { NeighborBuilding, NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { GeoDanmarkNeighborService } from "./neighbor-geometry";
import { expandBbox25832, unionBbox25832 } from "./site-context";

const SOURCE_URL = "https://graphql.datafordeler.dk/GEODKV/v2";
const SOURCE_KIND = "geodanmark";

function emptyNeighborData(): NeighborBuildingData {
  return {
    count: 0,
    nearestDistanceM: null,
    buildings: [],
    fejl: null,
    kilde: SOURCE_KIND,
    accessRoadNearby: null,
    roadDistanceM: null,
  };
}

function toLegacyNeighborBuilding(building: {
  sourceId: string;
  addressLabel: string | null;
  distanceM: number;
}): NeighborBuilding {
  return {
    adgangsadresseid: building.sourceId,
    adresse: building.addressLabel ?? building.sourceId,
    distanceM: building.distanceM,
  };
}

function queryBboxForLegacy(
  parcelBbox25832: [number, number, number, number] | null,
  adresseBbox25832: [number, number, number, number],
): [number, number, number, number] {
  if (!parcelBbox25832) return adresseBbox25832;
  return unionBbox25832(expandBbox25832(parcelBbox25832, 100), adresseBbox25832);
}

export class GeoDanmarkNaboService {
  /**
   * Henter nabobygninger og vejadgang fra GeoDanmark Vektor GraphQL.
   *
   * @param parcelBbox25832      Legacy bbox. Used only when parcelPolygon is unavailable.
   * @param adresseBbox25832     Fallback bbox around the address point.
   * @param ownJordstykkeLokalId Legacy MAT id. Kept for API compatibility.
   * @param parcelPolygon        Preferred parcel geometry for distances and own-building filtering.
   * @param ownBbrUuids          Optional BBR UUIDs for deterministic own-building filtering.
   */
  static async getNabobygninger(
    parcelBbox25832: [number, number, number, number] | null,
    adresseBbox25832: [number, number, number, number],
    ownJordstykkeLokalId: string | null,
    parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null,
    ownBbrUuids: string[] = [],
  ): Promise<SourceResult<NeighborBuildingData>> {
    const queryBbox = queryBboxForLegacy(parcelBbox25832, adresseBbox25832);

    const neighborResult = await GeoDanmarkNeighborService.getNeighborContext(
      parcelPolygon,
      queryBbox,
      ownJordstykkeLokalId,
      ownBbrUuids,
    );

    if (neighborResult.status === "mock") {
      return makeMockResult(emptyNeighborData(), {
        kilde: SOURCE_KIND,
        sourceUrl: neighborResult.sourceUrl ?? SOURCE_URL,
        rawFeatureCount: neighborResult.rawFeatureCount,
      });
    }

    if (neighborResult.status !== "ok" || !neighborResult.data) {
      return makeErrorResult<NeighborBuildingData>(
        new Error(neighborResult.errorDetails?.message ?? "GeoDanmark naboer unavailable"),
        { kilde: SOURCE_KIND, sourceUrl: neighborResult.sourceUrl ?? SOURCE_URL },
        neighborResult.errorDetails,
      );
    }

    const buildings = neighborResult.data.buildings.map(toLegacyNeighborBuilding);

    return makeOkResult(
      {
        count: neighborResult.data.count40m,
        nearestDistanceM: neighborResult.data.nearestDistanceM,
        buildings,
        fejl: null,
        kilde: SOURCE_KIND,
        accessRoadNearby: neighborResult.data.accessRoadNearby,
        roadDistanceM: neighborResult.data.nearestRoadCenterlineDistanceM,
      },
      {
        kilde: SOURCE_KIND,
        sourceUrl: neighborResult.sourceUrl ?? SOURCE_URL,
        rawFeatureCount: neighborResult.rawFeatureCount,
        confidence: neighborResult.confidence,
      },
    );
  }
}
