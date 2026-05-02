import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MapPin, Ruler, Building2, Trees, AlertTriangle, FileWarning, Zap } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/ejendom")({
  component: EjendomStep,
});

type IndicatorStatus = "ok" | "advarsel" | "ukendt";

function EjendomStep() {
  const navigate = useNavigate();
  const { address, bbrData } = useProject();

  // Mock-indikatorer (fyldes med rigtige data senere)
  const indicators: { id: string; label: string; status: IndicatorStatus; detail: string }[] = [
    { id: "olietank", label: "Olietank", status: "ok", detail: "Ingen registreret" },
    { id: "forurening", label: "Jordforurening", status: "ukendt", detail: "Ikke tjekket endnu" },
    { id: "servitutter", label: "Servitutter", status: "advarsel", detail: "3 tinglyste fundet" },
    { id: "fredning", label: "Fredning", status: "ok", detail: "Ingen fredninger" },
  ];

  const metrics = [
    {
      icon: Ruler,
      label: "Grundareal",
      value: bbrData?.bebyggelsesprocent != null ? `${bbrData.bebyggelsesprocent}%` : "—",
      sub: "Bebyggelsesprocent",
    },
    {
      icon: Building2,
      label: "Bygninger",
      value: bbrData?.antal_etager != null ? `${bbrData.antal_etager}` : "—",
      sub: "Etager",
    },
    {
      icon: MapPin,
      label: "Kommune",
      value: address?.kommune ?? "—",
      sub: "Postnr " + (address?.postnr ?? "—"),
    },
    {
      icon: Trees,
      label: "Zone",
      value: "Byzone",
      sub: "Mock — opdateres",
    },
  ];

  const devBypass = () => {
    navigate({ to: "/projekt/byggeanalyse" });
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[920px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/boligoenske" />
        </div>
        <StepHeader
          step={1}
          title="Din ejendom"
          subtitle="Her er hvad vi ved om grunden — tjek for advarsler før byggeanalysen."
        />

        {/* 2x2 metrics grid */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card>
                <div className="flex items-start gap-3">
                  <div className="rounded-md border border-border bg-[#111] p-2">
                    <m.icon size={16} className="text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                      {m.label.toUpperCase()}
                    </div>
                    <div className="mt-1 text-lg text-foreground truncate">{m.value}</div>
                    <div className="text-xs text-muted-foreground">{m.sub}</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Indicators */}
        <div className="mt-8">
          <div className="mb-3 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            INDIKATORER
          </div>
          <Card>
            <div className="divide-y divide-border">
              {indicators.map((ind) => (
                <Indicator key={ind.id} {...ind} />
              ))}
            </div>
          </Card>
        </div>

        <button
          onClick={() => navigate({ to: "/projekt/byggeanalyse" })}
          className="mt-8 w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
        >
          Start byggeanalyse →
        </button>

        {import.meta.env.DEV && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={devBypass}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
            >
              <Zap size={11} /> DEV: Spring til byggeanalyse
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function Indicator({
  label,
  status,
  detail,
}: {
  label: string;
  status: IndicatorStatus;
  detail: string;
}) {
  const Icon = status === "advarsel" ? AlertTriangle : status === "ukendt" ? FileWarning : MapPin;
  const colors =
    status === "advarsel"
      ? "text-warning border-warning/40"
      : status === "ukendt"
        ? "text-muted-foreground border-border"
        : "text-success border-success/40";
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${colors}`}>
        <Icon size={12} />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]">{status}</span>
      </div>
    </div>
  );
}
