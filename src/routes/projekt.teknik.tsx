import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useProject } from "@/lib/project-store";
import { exportBeliggenhedsplanFn } from "@/routes/api.drawing";
import type { ExportResult } from "@/services/drawing/export-drawing.service";
import type { DrawingReadinessStatus } from "@/domain/drawing/decision-engine";

const READINESS_LABELS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "Udkast (mangler data)",
  AUTO_REVIEW: "Klar til myndighedsreview",
  SURVEY_REQUIRED: "Kræver landinspektør",
  BLOCKED_MISSING_CORE_DATA: "Blokeret — kerndata mangler",
};

const READINESS_COLORS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "bg-yellow-50 border-yellow-200 text-yellow-800",
  AUTO_REVIEW: "bg-green-50 border-green-200 text-green-800",
  SURVEY_REQUIRED: "bg-orange-50 border-orange-200 text-orange-800",
  BLOCKED_MISSING_CORE_DATA: "bg-red-50 border-red-200 text-red-800",
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

  const [result, setResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bygherre, setBygherre] = useState<string>("");
  const [sokkelKoteM, setSokkelKoteM] = useState<string>("");
  const [heightM, setHeightM] = useState<string>("");

  const backTo = address?.adresseid ? `/projekt/${address.adresseid}/cockpit` : "/projekt/start";

  const matrikelId = bbrData?.jordstykke_lokal_id ?? null;
  const canGenerate =
    !!currentProjectId && !!address?.adresseid && !!address?.kommunekode && !!matrikelId;

  const missingFields: string[] = [];
  if (!currentProjectId) missingFields.push("Projekt ikke gemt");
  if (!address?.adresseid) missingFields.push("Adresse ikke valgt");
  if (!address?.kommunekode) missingFields.push("Kommunekode mangler");
  if (!matrikelId) missingFields.push("Matrikeldata ikke hentet (kør adresseanalyse)");

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
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to={backTo} className="text-sm text-stone-500 hover:text-stone-700 mb-1 block">
              ← Tilbage til cockpit
            </Link>
            <h1 className="text-2xl font-semibold text-stone-900">Beliggenhedsplan</h1>
            <p className="text-stone-500 text-sm mt-1">
              Myndighedstegning til byggetilladelse — genereret fra matrikeldata og bygningsfodprint
            </p>
          </div>
        </div>

        {!canGenerate && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800 mb-2">Mangler data for at generere:</p>
            <ul className="list-disc list-inside space-y-1">
              {missingFields.map((f) => (
                <li key={f} className="text-sm text-amber-700">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">Tegningsdata</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Bygherre
              </label>
              <input
                type="text"
                value={bygherre}
                onChange={(e) => setBygherre(e.target.value)}
                placeholder="Navn på bygherre"
                maxLength={200}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Sokkelkote DVR90 (m)
              </label>
              <input
                type="number"
                value={sokkelKoteM}
                onChange={(e) => setSokkelKoteM(e.target.value)}
                placeholder="f.eks. 18.50"
                step="0.01"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Bygningshøjde (m)
              </label>
              <input
                type="number"
                value={heightM}
                onChange={(e) => setHeightM(e.target.value)}
                placeholder="f.eks. 8.50"
                step="0.01"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="px-5 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium
                       hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? "Genererer…" : "Generer beliggenhedsplan"}
          </button>

          {result && !loading && (
            <span className="text-sm text-green-700 font-medium">Tegning genereret</span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Fejl ved generering</p>
            <p className="text-sm text-red-700 mt-1 font-mono">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className={`rounded-lg border p-4 ${READINESS_COLORS[result.readinessStatus]}`}>
              <p className="text-sm font-semibold">
                Status: {READINESS_LABELS[result.readinessStatus]}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() =>
                  downloadSvg(
                    result.svgContent,
                    `beliggenhedsplan-${result.exportId.slice(0, 8)}.svg`,
                  )
                }
                className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-sm
                           font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                Download SVG
              </button>

              {result.pdfUrl !== null && (
                <a
                  href={result.pdfUrl}
                  download={`beliggenhedsplan-${result.exportId.slice(0, 8)}.pdf`}
                  className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-sm
                             font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Download PDF
                </a>
              )}
            </div>

            <div className="rounded-xl border border-stone-200 bg-white overflow-auto shadow-sm">
              <div className="p-3 border-b border-stone-100">
                <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Preview — beliggenhedsplan
                </span>
              </div>
              <div className="p-4" dangerouslySetInnerHTML={{ __html: result.svgContent }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projekt/teknik")({
  component: TeknikPage,
});
