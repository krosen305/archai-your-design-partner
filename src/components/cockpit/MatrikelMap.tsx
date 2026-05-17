import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, LocateFixed, Move3D, MapPin, RotateCcw } from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { cn } from "@/lib/utils";
import { syncPatch } from "@/lib/project-sync";
import { useProject } from "@/lib/project-store";
import {
  fetchMatriklenPreview,
  fetchParcelGeometry,
  fetchSkærmkortTile,
} from "@/routes/api.map-tiles";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type * as GeoJSON from "geojson";

export type MatrikelMapProps = {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
};

type ParcelFeatureCollection = GeoJSON.FeatureCollection | null;

export function MatrikelMap({ bbr, metrics, naboer }: MatrikelMapProps) {
  const { address, complianceFlags, setAddress } = useProject();
  const geo = address?.centroid ?? address?.koordinater ?? null;
  const hasValidGeo = !!(geo && (geo.lat !== 0 || geo.lng !== 0));
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("ol/Map").default | null>(null);
  const parcelSourceRef = useRef<import("ol/source/Vector").default | null>(null);
  const footprintSourceRef = useRef<import("ol/source/Vector").default | null>(null);
  const previewLayerRef = useRef<import("ol/layer/Image").default<any> | null>(null);
  const footprintFeatureRef = useRef<import("ol/Feature").default | null>(null);
  const footprintCenterRef = useRef<[number, number] | null>(null);
  const translateRef = useRef<import("ol/interaction/Translate").default | null>(null);
  const initialCenterRef = useRef<[number, number] | null>(null);

  const [olReady, setOlReady] = useState(false);
  const [parcelStatus, setParcelStatus] = useState<"idle" | "loading" | "ready" | "missing">(
    "idle",
  );
  const [parcelGeojson, setParcelGeojson] = useState<ParcelFeatureCollection>(null);
  const [previewImage, setPreviewImage] = useState<{
    dataUrl: string;
    extent3857: [number, number, number, number];
  } | null>(null);
  const [rotationDeg, setRotationDeg] = useState(address?.rotationDeg ?? 0);
  const [dragHint, setDragHint] = useState("Træk bygningen for at flytte den");

  const loadParcelGeometry = useServerFn(fetchParcelGeometry);
  const loadParcelPreview = useServerFn(fetchMatriklenPreview);
  const loadTile = useServerFn(fetchSkærmkortTile);
  const loadTileRef = useRef(loadTile);
  useEffect(() => {
    loadTileRef.current = loadTile;
  }, [loadTile]);

  const activeBlockers = useMemo(
    () => complianceFlags.filter((flag) => flag.status === "blocker"),
    [complianceFlags],
  );
  const hardStop = activeBlockers.length > 0 || (address?.outsideParcelAreaM2 ?? 0) > 0;
  const currentPct =
    metrics?.currentBebyggelsesprocent ??
    (metrics?.grundareal && metrics?.currentBygningsareal
      ? (metrics.currentBygningsareal / metrics.grundareal) * 100
      : null);
  const minBoundaryDistance = address?.minDistanceToBoundaryM ?? null;
  const buildingArea =
    address?.footprintAreaM2 ?? bbr?.bebygget_areal ?? metrics?.currentBygningsareal ?? null;
  const hasAddress = hasValidGeo;
  const baseCenter: [number, number] = geo
    ? [geo.lng, geo.lat]
    : [10, 56];

  useEffect(() => {
    setRotationDeg(address?.rotationDeg ?? 0);
  }, [address?.rotationDeg]);

  useEffect(() => {
    if (!geo) return;
    initialCenterRef.current = [geo.lng, geo.lat];
    footprintCenterRef.current = [geo.lng, geo.lat];
  }, [address?.adresseid, geo?.lat, geo?.lng]);

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
        const geometry = await loadParcelGeometry({
          data: {
            point: geo,
            adresseid: address?.adresseid ?? null,
            bufferMeters: 180,
          },
        });
        if (cancelled) return;

        setParcelGeojson(geometry.featureCollection);
        setParcelStatus(geometry.featureCollection?.features.length ? "ready" : "missing");

        const preview = await loadParcelPreview({
          data: {
            point: geo,
            bufferMeters: 220,
          },
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
    address?.adresseid,
    geo?.lat,
    geo?.lng,
    loadParcelGeometry,
    loadParcelPreview,
  ]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    async function initMap() {
      if (!hostRef.current || mapRef.current) return;

      const imports = await Promise.all([
        import("ol/Map"),
        import("ol/View"),
        import("ol/layer/Tile"),
        import("ol/layer/Image"),
        import("ol/layer/Vector"),
        import("ol/source/Vector"),
        import("ol/Feature"),
        import("ol/geom/Point"),
        import("ol/geom/Polygon"),
        import("ol/source/OSM"),
        import("ol/interaction/Translate"),
        import("ol/format/GeoJSON"),
        import("ol/style/Style"),
        import("ol/style/Fill"),
        import("ol/style/Stroke"),
        import("ol/style/Circle"),
        import("proj4"),
        import("ol/proj/proj4"),
        import("ol/proj"),
      ]);

      const Map = (imports[0] as any).default;
      const View = (imports[1] as any).default;
      const TileLayer = (imports[2] as any).default;
      const ImageLayer = (imports[3] as any).default;
      const VectorLayer = (imports[4] as any).default;
      const VectorSource = (imports[5] as any).default;
      const Feature = (imports[6] as any).default;
      const Point = (imports[7] as any).default;
      const Polygon = (imports[8] as any).default;
      const OSM = (imports[9] as any).default;
      const Translate = (imports[10] as any).default;
      const GeoJSON = (imports[11] as any).default;
      const Style = (imports[12] as any).default;
      const Fill = (imports[13] as any).default;
      const Stroke = (imports[14] as any).default;
      const CircleStyle = (imports[15] as any).default;
      const proj4Module = imports[16] as any;
      const proj4 = proj4Module.default ?? proj4Module;
      const register = (imports[17] as any).register as (proj4: unknown) => void;
      const { fromLonLat, transform } = imports[18] as typeof import("ol/proj");

      if (cancelled || !hostRef.current) return;

      register(proj4);
      proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");

      const parcelSource = new VectorSource();
      const footprintSource = new VectorSource();

      parcelSourceRef.current = parcelSource;
      footprintSourceRef.current = footprintSource;

      const parcelLayer = new VectorLayer({
        source: parcelSource,
        style: new Style({
          fill: new Fill({ color: "rgba(74, 222, 128, 0.08)" }),
          stroke: new Stroke({ color: "rgba(74, 222, 128, 0.85)", width: 2 }),
        }),
      });

      const footprintLayer = new VectorLayer({
        source: footprintSource,
        style: new Style({
          fill: new Fill({ color: "rgba(59, 130, 246, 0.22)" }),
          stroke: new Stroke({ color: "rgba(255, 255, 255, 0.95)", width: 2 }),
        }),
      });

      const previewLayer = new ImageLayer({ opacity: 0.68 });
      previewLayerRef.current = previewLayer;

      const osmSource = new OSM();
      osmSource.setTileLoadFunction(async (tile: any, osmSrc: string) => {
        const [z, x, olY] = tile.getTileCoord() as [number, number, number];
        const tileRow = -(olY + 1);
        try {
          const dataUrl = await loadTileRef.current({
            data: { z: String(z), x: String(x), y: String(tileRow) },
          });
          tile.getImage().src = dataUrl ?? osmSrc;
        } catch {
          tile.getImage().src = osmSrc;
        }
      });

      const map = new Map({
        target: hostRef.current,
        layers: [new TileLayer({ source: osmSource }), previewLayer, parcelLayer, footprintLayer],
        view: new View({
          center: fromLonLat(baseCenter as [number, number]),
          zoom: hasAddress ? 19 : 6,
          maxZoom: 22,
        }),
        controls: [],
      });

      const translate = new Translate({
        features: footprintSource.getFeaturesCollection() ?? undefined,
      });
      translateRef.current = translate;
      map.addInteraction(translate);

      translate.on("translatestart", () => {
        setDragHint("Slip for at flytte placeringen");
      });

      translate.on("translateend", (event: any) => {
        const feature = event.features.item(0);
        const geometry = feature?.getGeometry();
        if (!feature || !geometry) return;

        const extent = geometry.getExtent();
        const center3857: [number, number] = [
          (extent[0] + extent[2]) / 2,
          (extent[1] + extent[3]) / 2,
        ];
        const [lng, lat] = transform(center3857, "EPSG:3857", "EPSG:4326") as [number, number];
        footprintCenterRef.current = [lng, lat];
        setDragHint("Placering opdateret");

        if (address) {
          const nextAddress = {
            ...address,
            centroid: { lat, lng },
          };
          setAddress(nextAddress);
          void syncPatch({ address: nextAddress });
        }
      });

      const marker = new Feature({
        geometry: new Point(fromLonLat(baseCenter as [number, number])),
      });
      marker.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: "rgba(14, 165, 233, 0.95)" }),
            stroke: new Stroke({ color: "#fff", width: 1.5 }),
          }),
        }),
      );
      footprintSource.addFeature(marker);
      footprintFeatureRef.current = marker;

      mapRef.current = map;

      cleanup = () => {
        map.setTarget(undefined);
        mapRef.current = null;
        parcelSourceRef.current = null;
        footprintSourceRef.current = null;
        previewLayerRef.current = null;
        translateRef.current = null;
        footprintFeatureRef.current = null;
      };

      setOlReady(true);
    }

    void initMap();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [address, baseCenter, hasAddress, setAddress]);

  useEffect(() => {
    if (!mapRef.current || !previewLayerRef.current) return;

    const updatePreview = async () => {
      const { default: ImageStatic } = await import("ol/source/ImageStatic");
      if (!previewImage) {
        previewLayerRef.current?.setSource(undefined as never);
        return;
      }

      previewLayerRef.current?.setSource(
        new ImageStatic({
          url: previewImage.dataUrl,
          imageExtent: previewImage.extent3857,
          projection: "EPSG:3857",
        }),
      );
    };

    void updatePreview();
  }, [previewImage]);

  useEffect(() => {
    if (!parcelSourceRef.current) return;

    const updateParcel = async () => {
      const { default: GeoJSON } = await import("ol/format/GeoJSON");
      parcelSourceRef.current?.clear();

      if (!parcelGeojson) return;

      const features = new GeoJSON().readFeatures(parcelGeojson, {
        dataProjection: "EPSG:25832",
        featureProjection: "EPSG:3857",
      });
      parcelSourceRef.current?.addFeatures(features);

      if (mapRef.current && features.length > 0) {
        const extent = features[0].getGeometry()?.getExtent() ?? [0, 0, 0, 0];
        mapRef.current
          .getView()
          .fit(extent, { padding: [28, 28, 28, 28], maxZoom: 20, duration: 300 });
      }
    };

    void updateParcel();
  }, [parcelGeojson]);

  useEffect(() => {
    if (!footprintSourceRef.current) return;

    let cancelled = false;

    const updateFootprint = async () => {
      const [{ default: Feature }, { default: Polygon }, { fromLonLat }] = await Promise.all([
        import("ol/Feature"),
        import("ol/geom/Polygon"),
        import("ol/proj"),
      ]);
      if (cancelled || !footprintSourceRef.current) return;

      footprintSourceRef.current.clear();

      const center =
        footprintCenterRef.current ??
        (geo ? [geo.lng, geo.lat] : [10, 56]);
      const center3857 = fromLonLat(center as [number, number]);
      const area = Math.max(28, buildingArea ?? 60);
      const side = Math.sqrt(area);
      const half = side / 2;
      const ring: [number, number][] = [
        [center3857[0] - half, center3857[1] - half],
        [center3857[0] + half, center3857[1] - half],
        [center3857[0] + half, center3857[1] + half],
        [center3857[0] - half, center3857[1] + half],
        [center3857[0] - half, center3857[1] - half],
      ];

      const polygon = new Polygon([ring]);
      polygon.rotate((rotationDeg * Math.PI) / 180, center3857);
      const feature = new Feature({ geometry: polygon });
      footprintSourceRef.current.addFeature(feature);
      footprintFeatureRef.current = feature;
    };

    void updateFootprint();

    return () => {
      cancelled = true;
    };
  }, [geo?.lat, geo?.lng, buildingArea, rotationDeg]);

  const updateRotation = (value: number) => {
    setRotationDeg(value);
    if (!address) return;
    const nextAddress = { ...address, rotationDeg: value };
    setAddress(nextAddress);
    void syncPatch({ address: nextAddress });
  };

  const resetPlacement = () => {
    if (!address) return;
    const nextAddress = {
      ...address,
      centroid:
        geo ??
        (initialCenterRef.current
          ? { lat: initialCenterRef.current[1], lng: initialCenterRef.current[0] }
          : null),
      rotationDeg: 0,
    };
    setRotationDeg(0);
    setAddress(nextAddress);
    void syncPatch({ address: nextAddress });
  };

  const hardStopLabel =
    activeBlockers[0]?.label ?? (address?.outsideParcelAreaM2 ? "Bygning overlapper skel" : null);

  return (
    <Card className="p-0 overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            MATRIKEL & PLACERING
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {address?.adresse ?? "Ingen adresse valgt"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {parcelStatus === "ready"
              ? "PARCEL LIVE"
              : parcelStatus === "loading"
                ? "HENTER..."
                : "FALLBACK"}
          </span>
          {hardStop && (
            <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-[10px] text-danger">
              <AlertTriangle size={10} />
              HARD STOP
            </span>
          )}
        </div>
      </div>

      <div className="relative min-h-[420px] flex-1">
        <div
          ref={hostRef}
          className={cn("absolute inset-0", hasAddress ? "bg-[#0b0b0b]" : "bg-[#101010]")}
        />

        {!hasAddress && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-md border border-border/60 bg-black/70 p-4 text-center backdrop-blur-sm">
              <MapPin size={16} className="mx-auto text-accent" />
              <div className="mt-2 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
                INGEN ADRESSE
              </div>
              <p className="mt-2 text-sm text-foreground/80">
                Kortet bliver aktivt, når du vælger en adresse.
              </p>
              <Link
                to="/projekt/adresse"
                className="mt-4 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-mono text-[11px] text-accent-foreground"
              >
                Vælg adresse
              </Link>
            </div>
          </div>
        )}

        {hasAddress && (
          <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2">
            <Badge
              label="Bebyggelsesprocent"
              value={currentPct != null ? `${currentPct.toFixed(0)}%` : "—"}
            />
            <Badge
              label="Skelafstand"
              value={minBoundaryDistance != null ? `${minBoundaryDistance.toFixed(1)} m` : "—"}
            />
            {naboer?.nearestDistanceM != null && (
              <Badge label="Nabo" value={`${naboer.nearestDistanceM.toFixed(1)} m`} />
            )}
          </div>
        )}

        {hardStop && (
          <div className="absolute inset-x-3 top-3 z-30 rounded-md border border-danger/40 bg-danger/15 p-3 text-sm text-danger backdrop-blur-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[10px] tracking-[0.15em]">HARD STOP</div>
                <div className="mt-1">
                  {hardStopLabel ?? "Der er et blokerende forhold på matriklen."}
                </div>
              </div>
            </div>
          </div>
        )}

        {hasAddress && (
          <div className="absolute bottom-3 left-3 right-3 z-20 grid gap-2 md:grid-cols-[1fr_auto]">
            <div className="rounded-md border border-border/60 bg-black/70 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Move3D size={14} className="text-accent" />
                <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                  PLACERING
                </div>
              </div>
              <p className="mt-1 text-xs text-foreground/80">{dragHint}</p>
            </div>

            <div className="rounded-md border border-border/60 bg-black/70 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                    ROTATION
                  </div>
                  <div className="mt-1 font-mono text-sm tabular-nums text-foreground">
                    {rotationDeg}°
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateRotation((rotationDeg - 5 + 360) % 360)}
                    className="rounded-md border border-border/60 bg-[#111] p-2 text-foreground hover:border-border"
                    aria-label="Roter mod venstre"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={resetPlacement}
                    className="rounded-md border border-border/60 bg-[#111] p-2 text-foreground hover:border-border"
                    aria-label="Nulstil placering"
                  >
                    <LocateFixed size={14} />
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={359}
                value={rotationDeg}
                onChange={(e) => updateRotation(Number(e.target.value))}
                className="mt-3 w-full accent-accent"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
        <span>OPENLAYERS</span>
        <span className="opacity-60">•</span>
        <span>PARCEL WFS</span>
        <span className="opacity-60">•</span>
        <span>WMS PREVIEW</span>
        <span className="opacity-60">•</span>
        <span>{olReady ? "KORT KLAR" : "INITIALISERER..."}</span>
      </div>
    </Card>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-black/70 px-3 py-2 backdrop-blur-sm">
      <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-foreground tabular-nums">{value}</div>
    </div>
  );
}
