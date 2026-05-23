// SERVER-SIDE ONLY — calls Datafordeler WFS via fetchParcelGeometryByJordstykkeId.
//
// Returns SourceResult<MatParcelGeometryPayload>. The GeoJSON FeatureCollection
// is cached separately in address_analysis.jordstykke_polygon (90-day TTL).
// Computed metrics (area, centroid, bbox) are the payload of this service.

import type { MatParcelGeometryPayload } from "@/domain/contracts/analysis.types";
import { fetchParcelGeometryByJordstykkeId } from "@/lib/map-proxy";
import {
  computePolygonAreaM2,
  computeCentroidUtm32,
  computeBbox25832,
  utm32ToWgs84,
} from "@/lib/geometry-utils";
import { makeErrorResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";

export type { MatParcelGeometryPayload } from "@/domain/contracts/analysis.types";

const SOURCE_URL = "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";

export class MatGeometryService {
  /**
   * Henter parcelpolygon for ét jordstykke og beregner skel-metrics.
   *
   * @param jordstykkeLokalId  MAT_Jordstykke.id_lokalId fra MatService/GrundarealResolver
   * @param registreretArealM2 Registreret areal fra MAT GraphQL — til area-sammenligning
   */
  static async getParcelGeometry(
    jordstykkeLokalId: string,
    registreretArealM2: number | null,
  ): Promise<SourceResult<MatParcelGeometryPayload>> {
    try {
      const { featureCollection, source } =
        await fetchParcelGeometryByJordstykkeId(jordstykkeLokalId);

      if (source === "notfound" || !featureCollection) {
        return makeOkResult<MatParcelGeometryPayload>(
          {
            polygonAreaM2: null,
            registreretArealM2,
            areaDiscrepancyM2: null,
            centroidLat: null,
            centroidLng: null,
            bbox25832: null,
            featureCount: 0,
            hasCanonicalPolygon: false,
          },
          { kilde: "mat_wfs", sourceUrl: SOURCE_URL, rawFeatureCount: 0, confidence: "missing" },
        );
      }

      const geometry = featureCollection.features[0]?.geometry as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon
        | null;

      const polygonAreaM2 = geometry ? computePolygonAreaM2(geometry) : null;
      const centroidUtm32 = geometry ? computeCentroidUtm32(geometry) : null;
      const centroidWgs84 = centroidUtm32 ? utm32ToWgs84(centroidUtm32[0], centroidUtm32[1]) : null;
      const bbox25832 = geometry ? computeBbox25832(geometry) : null;
      const areaDiscrepancyM2 =
        polygonAreaM2 !== null && registreretArealM2 !== null
          ? polygonAreaM2 - registreretArealM2
          : null;

      return makeOkResult<MatParcelGeometryPayload>(
        {
          polygonAreaM2,
          registreretArealM2,
          areaDiscrepancyM2,
          centroidLat: centroidWgs84?.lat ?? null,
          centroidLng: centroidWgs84?.lng ?? null,
          bbox25832,
          featureCount: featureCollection.features.length,
          hasCanonicalPolygon: featureCollection.features.length === 1,
        },
        {
          kilde: "mat_wfs",
          sourceUrl: SOURCE_URL,
          rawFeatureCount: featureCollection.features.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "mat_wfs", sourceUrl: SOURCE_URL });
    }
  }
}
