import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchMatriklenPreviewProxy,
  fetchMapTileProxy,
  fetchParcelGeometryByJordstykkeId,
  fetchParcelGeometryProxy,
  type ParcelGeometryRequest,
  type ParcelPreviewRequest,
  type TileRequest,
} from "@/lib/map-proxy";

const mapPointSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});

const parcelGeometryRequestSchema = z.object({
  point: mapPointSchema,
  adresseid: z.string().min(1).nullable().optional(),
  bufferMeters: z.number().finite().positive().max(10_000).optional(),
});

const parcelPreviewRequestSchema = z.object({
  point: mapPointSchema,
  width: z.number().int().min(1).max(4_096).optional(),
  height: z.number().int().min(1).max(4_096).optional(),
  bufferMeters: z.number().finite().positive().max(10_000).optional(),
});

const jordstykkeLokalIdRequestSchema = z.object({
  jordstykkeLokalId: z.string().min(1).max(128),
});

const tileRequestSchema = z.object({
  layer: z.enum(["skaermkort", "ortofoto"]).optional().default("skaermkort"),
  z: z.string().regex(/^-?\d+$/),
  x: z.string().regex(/^-?\d+$/),
  y: z.string().regex(/^-?\d+$/),
});

export const fetchParcelGeometry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): ParcelGeometryRequest => parcelGeometryRequestSchema.parse(data))
  .handler(async ({ data }) => fetchParcelGeometryProxy(data));

export const fetchMatriklenPreview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): ParcelPreviewRequest => parcelPreviewRequestSchema.parse(data))
  .handler(async ({ data }) => fetchMatriklenPreviewProxy(data));

export const fetchParcelGeometryById = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): { jordstykkeLokalId: string } =>
    jordstykkeLokalIdRequestSchema.parse(data),
  )
  .handler(async ({ data }) => fetchParcelGeometryByJordstykkeId(data.jordstykkeLokalId));

export const fetchSkaermkortTile = createServerFn({ method: "GET" })
  .inputValidator((data: unknown): TileRequest => tileRequestSchema.parse(data))
  .handler(async ({ data }) => fetchMapTileProxy(data));

export const fetchSkærmkortTile = fetchSkaermkortTile;

function ApiMapTilesRoute() {
  return null;
}

export const Route = createFileRoute("/api/map-tiles")({
  component: ApiMapTilesRoute,
});
