import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchMatriklenPreview,
  fetchParcelGeometry,
  fetchParcelGeometryById,
} from "@/routes/api.map-tiles";
import type * as GeoJSON from "geojson";

export type ParcelStatus = "idle" | "loading" | "ready" | "missing";

export type ParcelPreviewImage = {
  dataUrl: string;
  extent3857: [number, number, number, number];
};

export function useParcelData(params: {
  geo: { lat: number; lng: number } | null;
  jordstykkeLokalId: string | null;
  adresseid: string | null;
}): {
  parcelStatus: ParcelStatus;
  parcelGeojson: GeoJSON.FeatureCollection | null;
  previewImage: ParcelPreviewImage | null;
} {
  const { geo, jordstykkeLokalId, adresseid } = params;

  const [parcelStatus, setParcelStatus] = useState<ParcelStatus>("idle");
  const [parcelGeojson, setParcelGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [previewImage, setPreviewImage] = useState<ParcelPreviewImage | null>(null);

  const loadParcelGeometry = useServerFn(fetchParcelGeometry);
  const loadParcelGeometryById = useServerFn(fetchParcelGeometryById);
  const loadParcelPreview = useServerFn(fetchMatriklenPreview);

  const loadParcelPreviewRef = useRef(loadParcelPreview);
  useEffect(() => {
    loadParcelPreviewRef.current = loadParcelPreview;
  }, [loadParcelPreview]);

  useEffect(() => {
    let cancelled = false;

    async function loadGeometry() {
      if (!geo) {
        setParcelGeojson(null);
        setPreviewImage(null);
        setParcelStatus("idle");
        return;
      }

      setParcelStatus("loading");

      try {
        if (jordstykkeLokalId) {
          const result = await loadParcelGeometryById({ data: { jordstykkeLokalId } });
          if (cancelled) return;
          if (result.featureCollection) {
            setParcelGeojson(result.featureCollection);
            setParcelStatus("ready");
          } else {
            const fallback = await loadParcelGeometry({
              data: { point: geo, adresseid, bufferMeters: 180 },
            });
            if (cancelled) return;
            setParcelGeojson(fallback.featureCollection);
            setParcelStatus(fallback.featureCollection?.features.length ? "ready" : "missing");
          }
        } else {
          const geometry = await loadParcelGeometry({
            data: { point: geo, adresseid, bufferMeters: 180 },
          });
          if (cancelled) return;
          setParcelGeojson(geometry.featureCollection);
          setParcelStatus(geometry.featureCollection?.features.length ? "ready" : "missing");
        }

        const preview = await loadParcelPreviewRef.current({
          data: { point: geo, bufferMeters: 220 },
        });
        if (cancelled) return;

        if (!preview) {
          setPreviewImage(null);
          return;
        }

        const { transformExtent } = await import("ol/proj");
        const extent3857 = transformExtent(preview.bbox25832, "EPSG:25832", "EPSG:3857") as [
          number,
          number,
          number,
          number,
        ];
        setPreviewImage({ dataUrl: preview.dataUrl, extent3857 });
      } catch {
        if (cancelled) return;
        setParcelStatus("missing");
        setParcelGeojson(null);
        setPreviewImage(null);
      }
    }

    void loadGeometry();
    return () => {
      cancelled = true;
    };
  }, [
    geo?.lat,
    geo?.lng,
    jordstykkeLokalId,
    adresseid,
    loadParcelGeometry,
    loadParcelGeometryById,
  ]);

  return { parcelStatus, parcelGeojson, previewImage };
}
