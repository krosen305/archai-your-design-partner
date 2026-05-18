import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  fetchMatriklenPreviewProxy,
  fetchParcelGeometryByJordstykkeId,
  fetchParcelGeometryProxy,
  fetchSkærmkortTileProxy,
  type ParcelGeometryRequest,
  type ParcelPreviewRequest,
  type TileRequest,
} from "@/lib/map-proxy";

export const fetchParcelGeometry = createServerFn({ method: "POST" })
  .inputValidator((data: ParcelGeometryRequest) => data)
  .handler(async ({ data }) => fetchParcelGeometryProxy(data));

export const fetchMatriklenPreview = createServerFn({ method: "POST" })
  .inputValidator((data: ParcelPreviewRequest) => data)
  .handler(async ({ data }) => fetchMatriklenPreviewProxy(data));

export const fetchParcelGeometryById = createServerFn({ method: "POST" })
  .inputValidator((data: { jordstykkeLokalId: string }) => data)
  .handler(async ({ data }) => fetchParcelGeometryByJordstykkeId(data.jordstykkeLokalId));

export const fetchSkærmkortTile = createServerFn({ method: "GET" })
  .inputValidator((data: TileRequest) => data)
  .handler(async ({ data }) => fetchSkærmkortTileProxy(data));

function ApiMapTilesRoute() {
  return null;
}

export const Route = createFileRoute("/api/map-tiles")({
  component: ApiMapTilesRoute,
});
