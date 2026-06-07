import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  BBox25832,
  GeoJsonPolygon25832,
  NeighborParcel,
  TerrainLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import {
  ParcelLayerSchema,
  ExistingFeaturesLayerSchema,
} from "@/domain/drawing/beliggenhedsplan.schemas";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import { splitPolygonIntoBoundarySegments, polygonAreaM2 } from "@/domain/drawing/geometry-engine";
import { fetchParcelGeometryByJordstykkeId } from "@/lib/map-proxy";
import type * as GeoJSON from "geojson";

export function roadNameFromDarAddressLabel(addressLabel: string): string | null {
  const streetAndNumber = addressLabel.split(",")[0]?.trim() ?? "";
  if (!streetAndNumber) return null;
  const roadName = streetAndNumber.replace(/\s+\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?\s*$/u, "").trim();
  return roadName || null;
}

export class GeoDanmarkDrawingLayersAdapter implements DrawingGeometrySourcePort {
  async fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null> {
    const { featureCollection, source } = await fetchParcelGeometryByJordstykkeId(matrikelId);
    if (source === "notfound" || !featureCollection?.features.length) return null;

    const feature = featureCollection.features[0];
    if (!feature?.geometry || feature.geometry.type !== "Polygon") return null;

    const geometry = feature.geometry as GeoJSON.Polygon;
    const now = new Date().toISOString();

    const polygon25832: GeoJsonPolygon25832 = {
      type: "Polygon",
      crs: "EPSG:25832",
      coordinates: geometry.coordinates as [number, number][][],
    };

    const props = feature.properties ?? {};
    const idLokalId = (props["id_lokalId"] as string | undefined) ?? matrikelId;
    const matrikelnummer = (props["matrikelnummer"] as string | undefined) ?? "";
    const ejerlavskode = (props["ejerlavskode"] as number | undefined) ?? 0;
    const ejerlavsnavn = (props["ejerlavsnavn"] as string | undefined) ?? "";

    // Prefer registered area from WFS properties; fall back to computed geometric area
    const rawRegistreretAreal = props["registreretAreal"] as number | undefined;
    const geomAreaM2 = polygonAreaM2(polygon25832);
    const regAreaM2 =
      rawRegistreretAreal != null && rawRegistreretAreal > 0 ? rawRegistreretAreal : geomAreaM2;

    // Compute centroid as mean of exterior ring coordinates
    const ring = polygon25832.coordinates[0] ?? [];
    const cx = ring.reduce((s, c) => s + c[0], 0) / Math.max(ring.length, 1);
    const cy = ring.reduce((s, c) => s + c[1], 0) / Math.max(ring.length, 1);

    const layer: ParcelLayer = {
      idLokalId,
      bfeNr: "",
      matrikelnummer,
      ejerlavskode,
      ejerlavsnavn,
      polygon25832,
      areaRegisteredM2: regAreaM2,
      areaGeometryM2: geomAreaM2,
      areaDiscrepancyM2: Math.abs(geomAreaM2 - regAreaM2),
      boundarySegments: splitPolygonIntoBoundarySegments(polygon25832),
      neighborParcels: [],
      roadName: null,
      labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [cx, cy] },
      source: registrySourceMeta(now),
    };

    return ParcelLayerSchema.parse(layer);
  }

  async fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer> {
    const { GeoDanmarkNeighborService } = await import("./neighbor-geometry");
    const result = await GeoDanmarkNeighborService.getNeighborContext(null, bbox25832, null);

    const now = new Date().toISOString();
    const confidence = result.data?.coverage === "covered" && !result.isMock ? "medium" : "low";

    const perBuildingSource = {
      source: "registry" as const,
      confidence: confidence as "medium" | "low",
      fetchedAt: now,
      requiresReview: result.isMock || result.data?.coverage !== "covered",
    };

    const buildings = (result.data?.buildings ?? [])
      .filter((b) => b.geometry !== null)
      .map((b) => {
        const geom = b.geometry!;
        const polygon25832: GeoJsonPolygon25832 =
          geom.type === "Polygon"
            ? {
                type: "Polygon",
                coordinates: geom.coordinates as [number, number][][],
                crs: "EPSG:25832",
              }
            : {
                type: "Polygon",
                coordinates: (geom.coordinates as [number, number][][][])[0] ?? [],
                crs: "EPSG:25832",
              };

        return {
          bbrId: b.sourceId,
          footprint25832: polygon25832,
          usageCode: null,
          areaM2: b.footprintAreaM2 ?? 0,
          sokkelKoteM: null,
          nedrives: false,
          source: perBuildingSource,
        };
      });

    return ExistingFeaturesLayerSchema.parse({
      buildings,
      fences: [],
      source: {
        source: "registry",
        confidence,
        fetchedAt: now,
        requiresReview: result.isMock || result.data?.coverage !== "covered",
      },
    });
  }

  async fetchRoadGeometry(_addressId: string): Promise<{
    centerline25832:
      | import("@/domain/drawing/beliggenhedsplan.types").GeoJsonLineString25832
      | null;
  }> {
    return { centerline25832: null };
  }

  async fetchPlandataLayers(
    _kommunekode: string,
    bbox25832: BBox25832,
  ): Promise<ConstraintLayer[]> {
    const { fetchBuildingFieldConstraints } =
      await import("@/integrations/plandata/drawing-constraints");
    return fetchBuildingFieldConstraints(bbox25832);
  }

  async fetchNeighborParcels(
    ownJordstykkeId: string,
    bbox25832: BBox25832,
  ): Promise<NeighborParcel[]> {
    const { MatNeighborParcelService } = await import("@/integrations/mat/neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels(ownJordstykkeId, bbox25832);

    if (!result.data) return [];

    return result.data
      .filter((p) => p.matrikelnummer !== null)
      .map((p) => {
        const geom = p.geometry;
        const polygon25832: GeoJsonPolygon25832 | null =
          geom?.type === "Polygon"
            ? {
                type: "Polygon",
                coordinates: geom.coordinates as [number, number][][],
                crs: "EPSG:25832",
              }
            : geom?.type === "MultiPolygon"
              ? {
                  type: "Polygon",
                  coordinates: (geom.coordinates as [number, number][][][])[0] ?? [],
                  crs: "EPSG:25832",
                }
              : null;

        const coords = polygon25832?.coordinates[0] ?? [];
        const cx = coords.length > 0 ? coords.reduce((s, c) => s + c[0], 0) / coords.length : 0;
        const cy = coords.length > 0 ? coords.reduce((s, c) => s + c[1], 0) / coords.length : 0;

        return {
          matrikelnummer: p.matrikelnummer!,
          polygon25832,
          labelPoint25832: {
            type: "Point" as const,
            crs: "EPSG:25832" as const,
            coordinates: [cx, cy] as [number, number],
          },
        };
      });
  }

  async fetchRoadName(addressId: string): Promise<{ name: string | null }> {
    try {
      const { DarService } = await import("@/integrations/dar/client");
      const details = await DarService.getAddressDetails(addressId, {
        skipKoordinaterOgPostnummer: true,
      });
      return { name: roadNameFromDarAddressLabel(details.adresse) };
    } catch {
      return { name: null };
    }
  }

  async fetchDhmKoter(
    bbox25832: BBox25832,
    centroidLat: number,
    centroidLng: number,
  ): Promise<TerrainLayer | null> {
    try {
      const { DhmService } = await import("@/integrations/sdfi/dhm-client");
      const bboxParam = {
        minX: bbox25832[0],
        minY: bbox25832[1],
        maxX: bbox25832[2],
        maxY: bbox25832[3],
      };
      const result = await DhmService.getTerrainData(bboxParam, centroidLat, centroidLng);
      if (result.status === "error" || !result.data) return null;

      const now = new Date().toISOString();
      const td = result.data;

      return {
        verticalDatum: "DVR90",
        points: td.kotepunkter.map((pt) => ({
          x: pt.x,
          y: pt.y,
          z: pt.z,
          label: pt.z.toFixed(2),
          source: "registry" as const,
        })),
        slopePercent: td.slopePercent,
        lowPointM: td.lowPointM,
        source: {
          source: "registry",
          confidence: "medium",
          fetchedAt: now,
          requiresReview: false,
        },
      };
    } catch {
      return null;
    }
  }
}
