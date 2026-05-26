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
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborParcel } from "@/domain/contracts/surroundings.types";
import type * as GeoJSON from "geojson";
import { z } from "zod";

const IS_MOCK = true;

const MAT_WFS_BASE =
  "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";
const JORDSTYKKE_TYPENAME = "mat:Jordstykke";
const SOURCE_URL = MAT_WFS_BASE;

const matFeatureSchema = z.object({
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

const matWfsResponseSchema = z.object({
  features: z.array(matFeatureSchema).default([]),
});

export class MatNeighborParcelService {
  static async getNeighborParcels(
    ownJordstykkeId: string,
    bbox25832: [number, number, number, number],
  ): Promise<SourceResult<NeighborParcel[]>> {
    if (IS_MOCK) {
      return makeMockResult<NeighborParcel[]>([], {
        kilde: "mat_neighbor_parcels",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
      });
    }

    try {
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
      url.searchParams.set("outputFormat", "application/json");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`MAT WFS HTTP ${res.status}`);

      const raw = await res.json();
      const features = matWfsResponseSchema.parse(raw).features;

      const parcels: NeighborParcel[] = features
        .filter(
          (f) =>
            (f.properties?.["id_lokalId"] as string | undefined) !== ownJordstykkeId &&
            (f.id ?? "").split(".").pop() !== ownJordstykkeId,
        )
        .map((f): NeighborParcel => {
          const geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = f.geometry
            ? (f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)
            : null;

          return {
            jordstykkeLokalId:
              (f.properties?.["id_lokalId"] as string | undefined) ?? f.id ?? "ukendt",
            matrikelnummer: (f.properties?.["matrikelnummer"] as string | undefined) ?? null,
            ejerlavskode: (f.properties?.["ejerlavskode"] as number | undefined) ?? null,
            relation: "nearby",
            sharedBoundaryLengthM: null,
            distanceM: null,
            geometry: geom,
          };
        });

      return makeOkResult<NeighborParcel[]>(parcels, {
        kilde: "mat_neighbor_parcels",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: features.length,
      });
    } catch (e) {
      return makeErrorResult(e, { kilde: "mat_neighbor_parcels", sourceUrl: SOURCE_URL });
    }
  }
}
