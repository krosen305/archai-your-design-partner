import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  fetchMatriklenPreviewProxy,
  fetchParcelGeometryProxy,
  type ParcelGeometryRequest,
  type ParcelPreviewRequest,
} from "@/lib/map-proxy";

export const fetchParcelGeometry = createServerFn({ method: "POST" })
  .inputValidator((data: ParcelGeometryRequest) => data)
  .handler(async ({ data }) => fetchParcelGeometryProxy(data));

export const fetchMatriklenPreview = createServerFn({ method: "POST" })
  .inputValidator((data: ParcelPreviewRequest) => data)
  .handler(async ({ data }) => fetchMatriklenPreviewProxy(data));

function ApiMapTilesRoute() {
  return null;
}

export const Route = createFileRoute("/api/map-tiles")({
  component: ApiMapTilesRoute,
});
