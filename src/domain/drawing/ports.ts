import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  SurveyLayer,
  BBox25832,
  GeoJsonLineString25832,
} from "./beliggenhedsplan.types";

export interface DrawingGeometrySourcePort {
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer>;
  fetchRoadGeometry(addressId: string): Promise<{ centerline25832: GeoJsonLineString25832 | null }>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox25832): Promise<ConstraintLayer[]>;
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
}
