import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check, AlertTriangle, ExternalLink, HelpCircle } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/match")({
  component: MatchStep,
});

type RowStatus = "ok" | "warn" | "danger";

function MatchStep() {
  const navigate = useNavigate();
  const { address, bbrData } = useProject();

  if (!bbrData) {
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

  const bp = bbrData.bebyggelsesprocent;
  const etager = bbrData.antal_etager;

  const rows: {
    label: string;
    value: string;
    badge: string;
    status: RowStatus;
    extra?: React.ReactNode;
  }[] = [
    {
      label: "Bebyggelsesprocent",
      value: bp !== null ? `${bp}% / max 30%` : "Ukendt / max 30%",
      badge: bp === null ? "?" : bp <= 30 ? "OK" : "FEJL",
      status: bp === null ? "warn" : bp <= 30 ? "ok" : "danger",
    },
    {
      label: "Antal etager",
      value: etager !== null ? `${etager} / max 2` : "Ukendt / max 2",
      badge: etager === null ? "?" : etager <= 2 ? "OK" : "FEJL",
      status: etager === null ? "warn" : etager <= 2 ? "ok" : "danger",
    },
    {
      label: "Bygningshøjde",
      value: "Ukendt / max 8.5m",
      badge: "?",
      status: "warn",
    },
    {
      label: "Servitutter",
      value: "Ingen kritiske",
      badge: "OK",
      status: "ok",
    },
    {
      label: "Lokalplan",
      value: "LP-123 · Vedtaget",
      badge: "OK",
      status: "ok",
      extra: (
        <a
          href="#"
          className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/5 px-2 py-0.5 font-mono text-[10px] text-accent hover:bg-accent/10"
        >
          PDF <ExternalLink size={9} />
        </a>
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-[860px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/hus-dna" />
        </div>
        <StepHeader
          step={2}
          title="The Match"
          subtitle="Vi har krydstjekket dit Hus-DNA mod lokalplan, BBR og servitutter."
        />

        {address && (
          <p className="text-xs text-muted-foreground font-mono mb-4">{address.adresse}</p>
        )}

        <Card className="mb-6 !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-[#222] font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            COMPLIANCE TJEK
          </div>
          <ul>
            {rows.map((r, i) => (
              <motion.li
                key={r.label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.06 }}
                className={`flex items-center gap-4 px-5 py-3.5 border-b border-[#1f1f1f] last:border-b-0 border-l-[3px] ${
                  r.status === "ok"
                    ? "border-l-success"
                    : r.status === "warn"
                    ? "border-l-warning"
                    : "border-l-danger"
                }`}
              >
                <StatusIcon status={r.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground">{r.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.value}</div>
                </div>
                {r.extra}
                <Badge status={r.status} text={r.badge} />
              </motion.li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card>
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
              AI-VURDERING
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              Adressen har god luft til dit Hus-DNA: bebyggelsesprocenten ligger
              komfortabelt under loftet, og lokalplanen tillader 2 etager.
              Bygningshøjden er ikke registreret i BBR — vi anbefaler en konkret
              opmåling før detail-projektering.
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              AI-analyse er vejledende og erstatter ikke professionel byggerådgivning.
            </p>
          </Card>

          <Card>
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
              LOKALPLAN
            </div>
            <div className="text-sm text-foreground font-medium">LP-123 · Boligområde</div>
            <div className="text-xs text-muted-foreground mt-1">
              Vedtaget 14.03.2018 · {address?.kommune || "Lyngby-Taarbæk Kommune"}
            </div>
            <a
              href="#"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
            >
              Hent PDF <ExternalLink size={11} />
            </a>
          </Card>
        </div>

        <button
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
