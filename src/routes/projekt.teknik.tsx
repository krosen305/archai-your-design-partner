import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { exportBeliggenhedsplanFn } from "@/routes/api.drawing";
import type { ExportResult } from "@/services/drawing/export-drawing.service";
import type { DrawingReadinessStatus } from "@/domain/drawing/decision-engine";
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";
import { computeRygningsKote } from "@/domain/drawing/geometry-engine";

const READINESS_LABELS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "Udkast (mangler data)",
  AUTO_REVIEW: "Klar til myndighedsreview",
  SURVEY_REQUIRED: "Kræver landinspektør",
  BLOCKED_MISSING_CORE_DATA: "Blokeret — kerndata mangler",
};

const READINESS_COLORS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "border-amber-500/20 bg-amber-950/20 text-amber-300",
  AUTO_REVIEW: "border-emerald-500/20 bg-emerald-950/20 text-emerald-300",
  SURVEY_REQUIRED: "border-orange-500/20 bg-orange-950/20 text-orange-300",
  BLOCKED_MISSING_CORE_DATA: "border-red-500/20 bg-red-950/20 text-red-300",
};

function downloadSvg(svgContent: string, filename: string) {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TeknikPage() {
  const address = useProject((s) => s.address);
  const bbrData = useProject((s) => s.bbrData);
  const currentProjectId = useProject((s) => s.currentProjectId);
  const designPlacement = useProject((s) => s.designPlacement);
  const tagform = useProject((s) => s.tagform);
  const taghaldningGrad = useProject((s) => s.taghaldning_grad);
  const harJordvarme = useProject((s) => s.har_jordvarme);
  const harKaelder = useProject((s) => s.har_kaelder);
  const kaelderGulvKoteM = useProject((s) => s.kaelder_gulv_kote_m);
  const setTagform = useProject((s) => s.setTagform);
  const setTaghaldningGrad = useProject((s) => s.setTaghaldningGrad);
  const setHarJordvarme = useProject((s) => s.setHarJordvarme);
  const setHarKaelder = useProject((s) => s.setHarKaelder);
  const setKaelderGulvKoteM = useProject((s) => s.setKaelderGulvKoteM);

  const [result, setResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bygherre, setBygherre] = useState<string>("");
  const [sokkelKoteM, setSokkelKoteM] = useState<string>("");
  const [heightM, setHeightM] = useState<string>(() =>
    designPlacement?.heightM != null ? String(designPlacement.heightM) : "",
  );
  const [buildingWidthM, setBuildingWidthM] = useState<string>("");
  const [buildingDepthM, setBuildingDepthM] = useState<string>("");
  const [rotationDeg, setRotationDeg] = useState<string>("0");
  const [nedrivesBbrIds, setNedrivesBbrIds] = useState<string[]>([]);

  const backTo = address?.adresseid ? `/projekt/${address.adresseid}/cockpit` : "/projekt/start";

  const matrikelId = bbrData?.jordstykke_lokal_id ?? null;
  const canGenerate =
    !!currentProjectId && !!address?.adresseid && !!address?.kommunekode && !!matrikelId;

  const hasFootprint = !!designPlacement?.footprintGeojson;
  const centroid = address?.koordinater ?? null;
  const canGenerateWithDimensions =
    canGenerate &&
    !hasFootprint &&
    !!centroid &&
    buildingWidthM !== "" &&
    parseFloat(buildingWidthM) > 0;

  const footprintForMap: GeoJsonPolygon25832 | null = designPlacement?.footprintGeojson
    ? { ...designPlacement.footprintGeojson, crs: "EPSG:25832" as const }
    : null;

  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await exportBeliggenhedsplanFn({
        data: {
          projectId: currentProjectId!,
          matrikelId: matrikelId!,
          kommunekode: address!.kommunekode,
          addressId: address!.adresseid,
          addressText: address!.adresse ?? null,
          footprintGeojson: designPlacement?.footprintGeojson ?? null,
          bygherre: bygherre.trim() || null,
          sokkelKoteM: sokkelKoteM !== "" ? parseFloat(sokkelKoteM) : null,
          heightM: heightM !== "" ? parseFloat(heightM) : null,
          centroidLng: !hasFootprint && centroid ? centroid.lng : null,
          centroidLat: !hasFootprint && centroid ? centroid.lat : null,
          buildingWidthM:
            !hasFootprint && buildingWidthM !== "" ? parseFloat(buildingWidthM) : null,
          buildingDepthM:
            !hasFootprint && buildingDepthM !== "" ? parseFloat(buildingDepthM) : null,
          rotationDeg: rotationDeg !== "" ? parseFloat(rotationDeg) : null,
          tagform: tagform ?? null,
          taghaldningGrad: taghaldningGrad ?? null,
          harKaelder,
          kaelderGulvKoteM: kaelderGulvKoteM ?? null,
          harJordvarme,
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl ved generering");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={backTo}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Cockpit
          </Link>
          <span className="text-border/40">|</span>
          <span className="font-mono text-[11px] tracking-[0.1em] text-foreground">
            BELIGGENHEDSPLAN
          </span>
          <span className="text-xs text-muted-foreground hidden sm:block">
            — myndighedstegning til byggetilladelse
          </span>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        {/* Left: map fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <MatrikelMap
            bbr={bbrData}
            metrics={null}
            naboer={null}
            jordstykkeLokalId={matrikelId}
            footprintGeojson={footprintForMap}
          />
        </div>

        {/* Right: input panel */}
        <aside className="w-[360px] shrink-0 border-l border-border/40 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {!canGenerate && (
              <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-4 space-y-2">
                <p className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase mb-3">
                  Mangler data
                </p>

                {!currentProjectId && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                    <p className="text-sm text-amber-300">Projekt ikke gemt</p>
                    <Link
                      to="/projekt/start"
                      className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
                    >
                      Start projekt →
                    </Link>
                  </div>
                )}

                {!address?.adresseid && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                    <p className="text-sm text-amber-300">Adresse ikke valgt</p>
                    <Link
                      to="/projekt/adresse"
                      className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
                    >
                      Vælg adresse →
                    </Link>
                  </div>
                )}

                {!address?.kommunekode && !!address?.adresseid && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                    <p className="text-sm text-amber-300">Kommunekode mangler</p>
                    <Link
                      to={backTo}
                      className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
                    >
                      Åbn cockpit →
                    </Link>
                  </div>
                )}

                {!matrikelId && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                    <div>
                      <p className="text-sm text-amber-300">Matrikeldata ikke hentet</p>
                      <p className="text-xs text-amber-400/70 mt-0.5">
                        Kør adresseanalysen i cockpit
                      </p>
                    </div>
                    <Link
                      to={backTo}
                      className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
                    >
                      Åbn cockpit →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {canGenerate && !hasFootprint && (
              <div className="rounded-lg border border-border/40 bg-[#0d0d0d] p-4 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Ingen bygningsfodprint fra designværktøjet — angiv dimensioner for at generere en
                  centreret standardplacering
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Bredde (m) *
                    </label>
                    <input
                      type="number"
                      value={buildingWidthM}
                      onChange={(e) => setBuildingWidthM(e.target.value)}
                      placeholder="f.eks. 12"
                      min={1}
                      max={60}
                      step={0.5}
                      className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Dybde (m)
                    </label>
                    <input
                      type="number"
                      value={buildingDepthM}
                      onChange={(e) => setBuildingDepthM(e.target.value)}
                      placeholder="= bredde hvis tom"
                      min={1}
                      max={60}
                      step={0.5}
                      className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Rotation (°)
                    </label>
                    <input
                      type="number"
                      value={rotationDeg}
                      onChange={(e) => setRotationDeg(e.target.value)}
                      placeholder="0"
                      min={0}
                      max={360}
                      step={5}
                      className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                    />
                  </div>
                </div>
              </div>
            )}

            {canGenerate && hasFootprint && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                <p className="text-sm text-emerald-300">
                  Fodprint fra designværktøjet anvendes (
                  {(designPlacement!.footprintAreaM2 ?? 0).toFixed(0)} m²)
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-5 space-y-4">
              <h2 className="text-sm font-medium text-foreground">Tegningsdata</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Bygherre
                  </label>
                  <input
                    type="text"
                    value={bygherre}
                    onChange={(e) => setBygherre(e.target.value)}
                    placeholder="Navn på bygherre"
                    maxLength={200}
                    className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Sokkelkote DVR90 (m)
                  </label>
                  <input
                    type="number"
                    value={sokkelKoteM}
                    onChange={(e) => setSokkelKoteM(e.target.value)}
                    placeholder="f.eks. 18.50"
                    step="0.01"
                    className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Bygningshøjde (m)
                  </label>
                  <input
                    type="number"
                    value={heightM}
                    onChange={(e) => setHeightM(e.target.value)}
                    placeholder="f.eks. 8.50"
                    step="0.01"
                    className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>

                {/* Tagform */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Tagform
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {(["sadeltag", "fladt", "mansard", "pulttag"] as const).map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => {
                          setTagform(tf === tagform ? null : tf);
                          if (tf === "fladt") setTaghaldningGrad(0);
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                          tagform === tf
                            ? "bg-foreground text-background border-foreground"
                            : "bg-surface text-muted-foreground border-border/40 hover:border-border"
                        }`}
                      >
                        {tf.charAt(0).toUpperCase() + tf.slice(1)}
                      </button>
                    ))}
                  </div>

                  {tagform && tagform !== "fladt" && (
                    <div className="flex items-center gap-3 mt-2">
                      <label className="text-xs text-muted-foreground min-w-24">Taghaldning</label>
                      <div className="flex gap-1">
                        {[25, 35, 45].map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            onClick={() => setTaghaldningGrad(deg)}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                              taghaldningGrad === deg
                                ? "bg-foreground/10 border-border text-foreground"
                                : "border-border/40 text-muted-foreground"
                            }`}
                          >
                            {deg}°
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={taghaldningGrad ?? ""}
                        onChange={(e) =>
                          setTaghaldningGrad(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-16 rounded border border-border/40 bg-surface px-2 py-1 text-xs text-foreground"
                        placeholder="°"
                      />
                    </div>
                  )}

                  {tagform &&
                    taghaldningGrad !== null &&
                    sokkelKoteM !== "" &&
                    buildingWidthM !== "" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Beregnet rygningskote: DVR90 +
                        {computeRygningsKote({
                          sokkelKoteM: parseFloat(sokkelKoteM),
                          loftshøjdeM: 2.4,
                          fodprintBreddeM: parseFloat(buildingWidthM),
                          tagform,
                          taghaldningGrad,
                        }).toFixed(2)}{" "}
                        m
                      </p>
                    )}
                </div>

                {/* Kælder */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-muted-foreground">
                      Kælder inkluderet
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={harKaelder}
                      onClick={() => setHarKaelder(!harKaelder)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        harKaelder ? "bg-foreground/80" : "bg-border/40"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-background rounded-full shadow transition-transform ${
                          harKaelder ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {harKaelder && (
                    <div className="ml-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-muted-foreground">
                          Gulvkote DVR90 (m)
                        </label>
                        <input
                          type="number"
                          step={0.05}
                          value={kaelderGulvKoteM ?? ""}
                          onChange={(e) =>
                            setKaelderGulvKoteM(e.target.value ? Number(e.target.value) : null)
                          }
                          className="w-20 rounded border border-border/40 bg-surface px-2 py-1 text-xs text-foreground"
                          placeholder="f.eks. 15.20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Jordvarme */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Jordvarme planlagt
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={harJordvarme}
                    onClick={() => setHarJordvarme(!harJordvarme)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      harJordvarme ? "bg-foreground/80" : "bg-border/40"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-background rounded-full shadow transition-transform ${
                        harJordvarme ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  {harJordvarme && (
                    <p className="text-xs text-blue-400">
                      Kræver §19-tilladelse fra kommunen
                    </p>
                  )}
                </div>

                {/* Nedrivning */}
                {bbrData?.alle_bygning_lokal_ids && bbrData.alle_bygning_lokal_ids.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Eksisterende bygninger
                    </label>
                    <p className="text-xs text-muted-foreground/70">
                      Markér bygninger der nedrives som del af projektet
                    </p>
                    {bbrData.alle_bygning_lokal_ids.map((bbrId) => (
                      <label
                        key={bbrId}
                        className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={nedrivesBbrIds.includes(bbrId)}
                          onChange={(e) => {
                            setNedrivesBbrIds(
                              e.target.checked
                                ? [...nedrivesBbrIds, bbrId]
                                : nedrivesBbrIds.filter((id) => id !== bbrId),
                            );
                          }}
                        />
                        BBR {bbrId.slice(0, 8)}…
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-4">
                <p className="text-sm font-medium text-red-300">Fejl ved generering</p>
                <p className="text-sm text-red-400/80 mt-1 font-mono">{error}</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Readiness status */}
                <div
                  className={`rounded-lg border p-3 ${READINESS_COLORS[result.readinessStatus]}`}
                >
                  <p className="text-sm font-semibold">
                    Status: {READINESS_LABELS[result.readinessStatus]}
                  </p>
                </div>

                {/* Downloads */}
                <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-4 space-y-3">
                  <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                    Download
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() =>
                        downloadSvg(
                          result.svgContent,
                          `beliggenhedsplan-${result.exportId.slice(0, 8)}.svg`,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-md border border-border/60
                                 bg-[#111] px-3 py-2 font-mono text-[11px] text-foreground
                                 hover:bg-[#1a1a1a] transition-colors"
                    >
                      <Download size={12} />
                      SVG
                      <span className="text-muted-foreground text-[10px]">vektorgrafik</span>
                    </button>

                    {result.pdfUrl !== null && (
                      <a
                        href={result.pdfUrl}
                        download={`beliggenhedsplan-${result.exportId.slice(0, 8)}.pdf`}
                        className="inline-flex items-center gap-2 rounded-md border border-border/60
                                   bg-[#111] px-3 py-2 font-mono text-[11px] text-foreground
                                   hover:bg-[#1a1a1a] transition-colors"
                      >
                        <Download size={12} />
                        PDF
                        <span className="text-muted-foreground text-[10px]">til print</span>
                      </a>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground border-t border-border/20 pt-3">
                    Upload filen til kommunens byggesagsportal (Byg og Miljø) som bilag til
                    byggeansøgningen.
                  </p>
                </div>

                {/* SVG preview */}
                <div className="rounded-xl border border-border/40 bg-[#0d0d0d] overflow-auto shadow-sm">
                  <div className="p-3 border-b border-border/20">
                    <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                      Preview — beliggenhedsplan
                    </span>
                  </div>
                  <div className="p-4" dangerouslySetInnerHTML={{ __html: result.svgContent }} />
                </div>
              </div>
            )}
          </div>

          {/* Sticky generate button */}
          <div className="shrink-0 border-t border-border/40 p-4">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || loading || (!hasFootprint && !canGenerateWithDimensions)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border
                         border-border/60 bg-[#111] px-4 py-2.5 font-mono text-[11px]
                         tracking-[0.1em] text-foreground hover:bg-[#1a1a1a]
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Genererer…" : "Generer beliggenhedsplan"}
            </button>
            {result && !loading && (
              <p className="mt-2 text-center font-mono text-[10px] text-emerald-400">
                Tegning genereret
              </p>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/projekt/teknik")({
  component: TeknikPage,
});
