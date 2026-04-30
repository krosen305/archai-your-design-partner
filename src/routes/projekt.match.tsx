import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check, AlertTriangle, HelpCircle, ExternalLink } from "lucide-react";
import { useProject, type ComplianceFlag } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/match")({
  component: MatchStep,
});

type RowStatus = "ok" | "warn" | "danger";

function flagToRowStatus(status: ComplianceFlag["status"]): RowStatus {
  if (status === "ok") return "ok";
  if (status === "advarsel") return "warn";
  return "danger";
}

function flagToBadge(status: ComplianceFlag["status"]): string {
  if (status === "ok") return "OK";
  if (status === "advarsel") return "ADV";
  return "FEJL";
}

function flagToValueString(flag: ComplianceFlag): string {
  if (flag.aktuelVærdi && flag.tilladt) return `${flag.aktuelVærdi} / max ${flag.tilladt}`;
  if (flag.aktuelVærdi) return flag.aktuelVærdi;
  if (flag.tilladt) return `max ${flag.tilladt}`;
  return flag.detalje ?? "Ukendt";
}

function MatchStep() {
  const navigate = useNavigate();
  const { address, bbrData, complianceFlags, lokalplaner } = useProject();

  if (!bbrData || complianceFlags.length === 0) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <StepHeader
            step={2}
            title="The Match"
            subtitle="Vi mangler bygningsdata før vi kan lave matchet."
          />
          <Card className="text-center">
            <p className="text-sm text-muted-foreground mb-5">
              BBR-data er endnu ikke hentet for adressen.
            </p>
            <button
              onClick={() => navigate({ to: "/projekt/compliance" })}
              className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground hover:brightness-110"
            >
              Hent BBR-data →
            </button>
          </Card>
        </div>
      </PageTransition>
    );
  }

  const blockers = complianceFlags.filter((f) => f.status === "blocker").length;
  const warnings = complianceFlags.filter((f) => f.status === "advarsel").length;
  const vedtagneLokalplaner = lokalplaner.filter((lp) => lp.status === "V");
  const primaryLokalplan = vedtagneLokalplaner[0] ?? null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-[860px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/hus-dna" />
        </div>
        <StepHeader
          step={2}
          title="The Match"
          subtitle="Vi har krydstjekket dit projekt mod lokalplan, BBR og kommuneplanramme."
        />

        {address && (
          <p className="text-xs text-muted-foreground font-mono mb-4">{address.adresse}</p>
        )}

        {(blockers > 0 || warnings > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 flex items-center gap-3 rounded-md px-4 py-3 text-sm ${
              blockers > 0
                ? "border border-danger/40 bg-danger/10 text-danger"
                : "border border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            <AlertTriangle size={16} className="shrink-0" />
            {blockers > 0
              ? `${blockers} blocker${blockers > 1 ? "e" : ""} kræver afklaring`
              : `${warnings} advarsel${warnings > 1 ? "er" : ""} — se detaljer nedenfor`}
          </motion.div>
        )}

        <Card className="mb-6 !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-[#222] font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            COMPLIANCE TJEK
          </div>
          <ul data-testid="compliance-matrix">
            {complianceFlags.map((flag, i) => {
              const rowStatus = flagToRowStatus(flag.status);
              return (
                <motion.li
                  key={flag.id}
                  data-testid={`compliance-row-${flag.id}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.06 }}
                  className={`flex items-center gap-4 px-5 py-3.5 border-b border-[#1f1f1f] last:border-b-0 border-l-[3px] ${
                    rowStatus === "ok"
                      ? "border-l-success"
                      : rowStatus === "warn"
                      ? "border-l-warning"
                      : "border-l-danger"
                  }`}
                >
                  <StatusIcon status={rowStatus} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground">{flag.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {flagToValueString(flag)}
                    </div>
                    {flag.detalje && flag.status !== "ok" && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 italic">
                        {flag.detalje}
                      </div>
                    )}
                  </div>
                  <Badge status={rowStatus} text={flagToBadge(flag.status)} />
                </motion.li>
              );
            })}
          </ul>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card>
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
              AI-VURDERING
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {blockers > 0
                ? "Projektet har kritiske konflikter med gældende plangrundlag. Vi anbefaler dialog med kommunen inden videre projektering."
                : warnings > 0
                ? "Projektet er tæt på plangrænser. Overvej justeringer inden detailprojektering — særligt de markerede punkter."
                : "Adressen har god luft til de gældende planrammer. Ingen umiddelbare konflikter registreret."}
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              AI-analyse er vejledende og erstatter ikke professionel byggerådgivning.
            </p>
          </Card>

          <Card>
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
              LOKALPLAN
            </div>
            {primaryLokalplan ? (
              <>
                <div className="text-sm text-foreground font-medium">
                  {primaryLokalplan.plannr ? `${primaryLokalplan.plannr} · ` : ""}
                  {primaryLokalplan.plannavn || "Lokalplan"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {primaryLokalplan.datoVedtaget
                    ? `Vedtaget ${String(primaryLokalplan.datoVedtaget).slice(0, 4)}`
                    : "Vedtaget"}
                  {primaryLokalplan.kommunenavn ? ` · ${primaryLokalplan.kommunenavn}` : ""}
                </div>
                {primaryLokalplan.plandokumentLink && (
                  <a
                    href={primaryLokalplan.plandokumentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="lokalplan-pdf-link"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
                  >
                    Hent PDF <ExternalLink size={11} />
                  </a>
                )}
                {vedtagneLokalplaner.length > 1 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    + {vedtagneLokalplaner.length - 1} anden lokalplan
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ingen vedtagen lokalplan fundet for denne adresse.
              </p>
            )}
          </Card>
        </div>

        <button
          data-testid="match-continue"
          onClick={() => navigate({ to: "/projekt/finans" })}
          className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
        >
          Fortsæt til Finans →
        </button>
      </div>
    </PageTransition>
  );
}

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === "ok") return <Check size={16} className="text-success shrink-0" />;
  if (status === "warn") return <HelpCircle size={16} className="text-warning shrink-0" />;
  return <AlertTriangle size={16} className="text-danger shrink-0" />;
}

function Badge({ status, text }: { status: RowStatus; text: string }) {
  const cls =
    status === "ok"
      ? "border-success/40 text-success bg-success/5"
      : status === "warn"
      ? "border-warning/40 text-warning bg-warning/5"
      : "border-danger/40 text-danger bg-danger/5";
  return (
    <span className={`shrink-0 font-mono text-[10px] tracking-wider rounded border px-1.5 py-0.5 ${cls}`}>
      {text}
    </span>
  );
}
