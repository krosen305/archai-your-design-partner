// SERVER-SIDE ONLY — credentials must never be exposed to the browser.
//
// GeoDanmark Vektor WFS via Datafordeler — nabobygninger og vejadgang.
// Erstatter den deaktiverede NaboService (ARCH-226).
//
// IS_MOCK=true indtil GeoDanmark WFS endpoint og layer-navne er verificeret.
// For at aktivere live kald:
//   1. Kør GetCapabilities: GET https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS?SERVICE=WFS&REQUEST=GetCapabilities&apikey=<NØGLE>
//   2. Bekræft typename for bygninger (forventet: "gdk:Bygning") og veje (forventet: "gdk:Vejmidte")
//   3. Sæt IS_MOCK=false herunder
//
// Auth: samme DATAFORDELER_API_KEY som MAT/BBR — sendes som query-param "apikey=".

import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborBuilding, NeighborBuildingData } from "@/integrations/bbr/neighbor-client";

const IS_MOCK = true;

const GEODANMARK_WFS_URL = "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS";
const BYGNING_TYPENAME = "gdk:Bygning";
const VEJ_TYPENAME = "gdk:Vejmidte";

interface WfsFeature {
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

interface WfsFeatureCollection {
  features?: WfsFeature[];
}

async function wfsGetFeatures(
  typename: string,
  bboxStr: string,
  apiKey: string,
): Promise<WfsFeature[]> {
  const url = new URL(GEODANMARK_WFS_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", typename);
  url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
  url.searchParams.set("bbox", bboxStr);
  url.searchParams.set("outputFormat", "application/json");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json, application/geo+json;q=0.9" },
  });
  if (!res.ok) throw new Error(`GeoDanmark WFS HTTP ${res.status} for ${typename}`);
  const fc = (await res.json()) as WfsFeatureCollection;
  return fc.features ?? [];
}

export class GeoDanmarkNaboService {
  /**
   * Henter nabobygninger og vejadgang fra GeoDanmark Vektor WFS.
   *
   * @param parcelBbox25832      Bounding box fra parcelpolygon (foretrukket). Null = brug adresse-bbox.
   * @param adresseBbox25832     Fallback bbox ± 150 m fra adressepunkt.
   * @param ownJordstykkeLokalId Matrikel-ID — forsøg at filtrere egne bygninger fra resultatet.
   */
  static async getNabobygninger(
    parcelBbox25832: [number, number, number, number] | null,
    adresseBbox25832: [number, number, number, number],
    ownJordstykkeLokalId: string | null,
  ): Promise<SourceResult<NeighborBuildingData>> {
    if (IS_MOCK) {
      return makeMockResult<NeighborBuildingData>(
        {
          count: 0,
          nearestDistanceM: null,
          buildings: [],
          fejl: null,
          kilde: "geodanmark",
          accessRoadNearby: null,
          roadDistanceM: null,
        },
        { kilde: "geodanmark", sourceUrl: GEODANMARK_WFS_URL, rawFeatureCount: 0 },
      );
    }

    try {
      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
      const queryBbox = parcelBbox25832 ?? adresseBbox25832;
      const bboxStr = `${queryBbox[0]},${queryBbox[1]},${queryBbox[2]},${queryBbox[3]},urn:ogc:def:crs:EPSG::25832`;

      const [buildingFeatures, roadFeatures] = await Promise.all([
        wfsGetFeatures(BYGNING_TYPENAME, bboxStr, apiKey),
        wfsGetFeatures(VEJ_TYPENAME, bboxStr, apiKey).catch(() => [] as unknown[]),
      ]);

      // Exclude buildings on own parcel — match against likely property names.
      // Actual property name must be verified against GetCapabilities/schema.
      const neighborFeatures = ownJordstykkeLokalId
        ? buildingFeatures.filter(
            (f: WfsFeature) =>
              (f.properties?.jordstykke_lokal_id as string | undefined) !== ownJordstykkeLokalId &&
              (f.properties?.id_jordstykke as string | undefined) !== ownJordstykkeLokalId,
          )
        : buildingFeatures;

      const buildings: NeighborBuilding[] = neighborFeatures.map((f: WfsFeature, i: number) => ({
        adgangsadresseid: (f.properties?.id_lokalId as string | undefined) ?? `gdk-${i}`,
        adresse: (f.properties?.husnummer as string | undefined) ?? "ukendt",
        distanceM: 0,
      }));

      return makeOkResult<NeighborBuildingData>(
        {
          count: neighborFeatures.length,
          nearestDistanceM: buildings.length > 0 ? 0 : null,
          buildings,
          fejl: null,
          kilde: "geodanmark",
          accessRoadNearby: roadFeatures.length > 0 ? true : null,
          roadDistanceM: null,
        },
        {
          kilde: "geodanmark",
          sourceUrl: GEODANMARK_WFS_URL,
          rawFeatureCount: buildingFeatures.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "geodanmark", sourceUrl: GEODANMARK_WFS_URL });
    }
  }
}
