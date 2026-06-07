import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  SurveyLayer,
  BBox25832,
  NeighborParcel,
  TerrainLayer,
  VejLayer,
  NaturbeskyttelseLayer,
  LerLedning,
} from "./beliggenhedsplan.types";

export interface DrawingGeometrySourcePort {
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer>;
  fetchRoadGeometry(addressId: string, bbox25832: BBox25832): Promise<VejLayer | null>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox25832): Promise<ConstraintLayer[]>;
  fetchNeighborParcels(ownJordstykkeId: string, bbox25832: BBox25832): Promise<NeighborParcel[]>;
  fetchRoadName(addressId: string): Promise<{ name: string | null }>;
  fetchDhmKoter(
    bbox25832: BBox25832,
    centroidLat: number,
    centroidLng: number,
  ): Promise<TerrainLayer | null>;
  fetchNaturbeskyttelse(bbox25832: BBox25832): Promise<NaturbeskyttelseLayer[]>;
  fetchLerLedninger(bbox25832: BBox25832): Promise<LerLedning[]>;
  fetchKloakopland(
    kommunekode: string,
    bbox25832: BBox25832,
  ): Promise<"separat" | "faelles" | null>;
  fetchFjernvarmeDaekning(centroidLat: number, centroidLng: number): Promise<boolean | null>;
}

export interface SurveyUploadDecoderPort {
  decode(raw: unknown): Promise<SurveyLayer>;
}

export type DrawingExportRecord = {
  id: string;
  projectId: string;
  svgPath: string | null;
  pdfPath: string | null;
  readinessStatus: string;
  generatedAt: string;
  approvedAt: string | null;
};

export interface DrawingExportStorePort {
  saveSvg(projectId: string, svg: string): Promise<string>;
  savePdf(projectId: string, pdf: Uint8Array): Promise<string>;
  getExport(exportId: string): Promise<DrawingExportRecord | null>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
}
