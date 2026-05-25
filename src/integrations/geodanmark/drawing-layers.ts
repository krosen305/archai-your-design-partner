import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  BBox25832,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";
import {
  ParcelLayerSchema,
  ExistingFeaturesLayerSchema,
} from "@/domain/drawing/beliggenhedsplan.schemas";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import {
  splitPolygonIntoBoundarySegments,
  polygonAreaM2,
} from "@/domain/drawing/geometry-engine";
import { fetchParcelGeometryByJordstykkeId } from "@/lib/map-proxy";
import type * as GeoJSON from "geojson";

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
      labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [cx, cy] },
      source: registrySourceMeta(now),
    };

    return ParcelLayerSchema.parse(layer);
  }

  async fetchNeighborBuildings(_bbox25832: BBox25832): Promise<ExistingFeaturesLayer> {
    // GeoDanmark WFS IS_MOCK=true — return empty layer until live endpoint is verified
    const now = new Date().toISOString();
    return ExistingFeaturesLayerSchema.parse({
      buildings: [],
      fences: [],
      source: { source: "registry", confidence: "low", fetchedAt: now, requiresReview: true },
    });
  }

  async fetchRoadGeometry(
    _addressId: string,
  ): Promise<{ centerline25832: import("@/domain/drawing/beliggenhedsplan.types").GeoJsonLineString25832 | null }> {
    return { centerline25832: null };
  }

  async fetchPlandataLayers(
    _kommunekode: string,
    _bbox25832: BBox25832,
  ): Promise<ConstraintLayer[]> {
    return [];
  }
}
