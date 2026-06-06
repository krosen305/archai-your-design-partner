import { Download, FileCheck2, FileDown, RefreshCw } from "lucide-react";
import type {
  VerificationFinding,
  VerificationSeverity,
} from "@/domain/floor-plan/verification-engine";
import type { LiveFinding } from "@/domain/floor-plan/apply-command";
import type { ExportFloorPlanResult } from "@/services/floor-plan/export-floor-plan.service";
import type { FloorPlanVerificationResult } from "@/services/floor-plan/verify-floor-plan.service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VerificationPanelProps = {
  busy: boolean;
  localFindings: VerificationFinding[];
  liveFindings: LiveFinding[];
  formalVerification: FloorPlanVerificationResult | null;
  exportResult: ExportFloorPlanResult | null;
  onVerify: () => Promise<void>;
  onExport: () => Promise<void>;
};

const STATUS_LABELS = {
  CONCEPT_DRAFT: "Koncept",
  TECHNICAL_REVIEW: "Teknisk review",
  AUTHORITY_REVIEW: "Myndighedsreview",
  DOCUMENTATION_REQUIRED: "Dokumentation mangler",
  BLOCKED: "Blokeret",
} as const;

export function VerificationPanel({
  busy,
  localFindings,
  liveFindings,
  formalVerification,
  exportResult,
  onVerify,
  onExport,
}: VerificationPanelProps) {
  const findings = formalVerification?.findings ?? localFindings;
  const status = formalVerification?.status ?? deriveLocalStatus(localFindings);

  return (
    <section className="border-t border-border/40 bg-surface p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Verifikation</h2>
          <p className="text-xs text-muted-foreground">
            {formalVerification ? "Serververificeret" : "Live lokalt"}
          </p>
        </div>
        <span className={cn("rounded px-2 py-1 text-xs font-medium", statusTone(status))}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {formalVerification && (
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <Metric label="Netto" value={formatMaybeArea(formalVerification.metrics.netAreaM2)} />
          <Metric label="Brutto" value={formatMaybeArea(formalVerification.metrics.grossAreaM2)} />
          <Metric label="Rum" value={String(formalVerification.metrics.roomsCount)} />
          <Metric label="Åbninger" value={String(formalVerification.metrics.openingsCount)} />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="flex-1"
          onClick={() => void onVerify()}
        >
          {busy ? <RefreshCw className="animate-spin" /> : <FileCheck2 />}
          Verificer
        </Button>
        <Button type="button" disabled={busy} className="flex-1" onClick={() => void onExport()}>
          <FileDown />
          Eksporter
        </Button>
      </div>

      {liveFindings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-900">Seneste feedback</p>
          <p className="text-sm text-amber-900">{liveFindings[0]!.message}</p>
        </div>
      )}

      <div className="mt-4 max-h-[260px] space-y-2 overflow-auto pr-1">
        {findings.length === 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Ingen deterministiske findings på den aktuelle model.
          </div>
        )}
        {sortedFindings(findings).map((finding) => (
          <div
            key={finding.id}
            data-finding-severity={finding.severity}
            className={cn("rounded-md border p-3 text-sm", findingTone(finding.severity))}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">{finding.category}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase",
                  severityBadgeTone(finding.severity),
                )}
              >
                {finding.severity}
              </span>
            </div>
            <p>{finding.message}</p>
            {finding.nextAction && <p className="mt-1 text-xs opacity-80">{finding.nextAction}</p>}
          </div>
        ))}
      </div>

      {exportResult && (
        <div className="mt-4 rounded-md border border-border/40 bg-surface-elevated p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Eksport klar: {STATUS_LABELS[exportResult.readinessStatus]}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadSvg(
                  exportResult.svgContent,
                  `plantegning-${exportResult.exportId.slice(0, 8)}.svg`,
                )
              }
            >
              <Download />
              SVG
            </Button>
            {exportResult.pdfUrl && (
              <Button type="button" variant="outline" size="sm" asChild>
                <a
                  href={exportResult.pdfUrl}
                  download={`plantegning-${exportResult.exportId.slice(0, 8)}.pdf`}
                >
                  <Download />
                  PDF
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-surface-elevated px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function deriveLocalStatus(findings: VerificationFinding[]): FloorPlanVerificationResult["status"] {
  if (findings.some((finding) => finding.severity === "blocking")) return "BLOCKED";
  if (findings.some((finding) => finding.severity === "review_required")) {
    return "DOCUMENTATION_REQUIRED";
  }
  return "TECHNICAL_REVIEW";
}

function statusTone(status: FloorPlanVerificationResult["status"]): string {
  if (status === "BLOCKED") return "bg-red-50 text-red-800 border border-red-200";
  if (status === "DOCUMENTATION_REQUIRED")
    return "bg-amber-50 text-amber-800 border border-amber-200";
  return "bg-emerald-50 text-emerald-800 border border-emerald-200";
}

const SEVERITY_ORDER: VerificationSeverity[] = ["blocking", "review_required", "warning", "info"];

function sortedFindings(findings: VerificationFinding[]): VerificationFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

function findingTone(severity: VerificationFinding["severity"]): string {
  switch (severity) {
    case "blocking":
      return "border-red-200 bg-red-50 text-red-900";
    case "review_required":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "warning":
      return "border-yellow-200 bg-yellow-50 text-yellow-900";
    case "info":
      return "border-stone-200 bg-stone-50 text-stone-700";
  }
}

function severityBadgeTone(severity: VerificationSeverity): string {
  switch (severity) {
    case "blocking":
      return "bg-red-200 text-red-900";
    case "review_required":
      return "bg-amber-200 text-amber-900";
    case "warning":
      return "bg-yellow-200 text-yellow-900";
    case "info":
      return "bg-stone-200 text-stone-700";
  }
}

function formatMaybeArea(value: number | null): string {
  return value === null ? "Mangler" : `${value.toFixed(1)} m²`;
}

function downloadSvg(svgContent: string, filename: string) {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
