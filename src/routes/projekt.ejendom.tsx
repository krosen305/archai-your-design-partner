import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  MapPin,
  Ruler,
  Building2,
  Trees,
  AlertTriangle,
  FileWarning,
  CheckCircle2,
  HelpCircle,
  Zap,
} from "lucide-react";
import { useProject, type ComplianceFlag } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/ejendom")({
  component: EjendomStep,
});

// ---------------------------------------------------------------------------
// Afled indikatorer fra compliance-flags (dkjord + sdfi allerede i storen)
// ---------------------------------------------------------------------------

type IndicatorStatus = "ok" | "advarsel" | "blocker" | "ukendt";

type Indicator = {
  id: string;
  label: string;
  status: IndicatorStatus;
  detail: string;
};

function deriveIndicators(flags: ComplianceFlag[], complianceDone: boolean): Indicator[] {
  const harDkjordData = flags.some((f) => f.kilde === "dkjord");
  const harNaturData = flags.some((f) => f.kilde === "sdfi");

  // Olietank
  const olietankFlag = flags.find((f) => f.id === "dkjord-olietank");
  const olietank: Indicator = olietankFlag
    ? {
        id: "olietank",
        label: "Olietank",
        status: "advarsel",
        detail: olietankFlag.detalje ?? "Gammel olietank registreret",
      }
    : {
        id: "olietank",
        label: "Olietank",
        status: harDkjordData ? "ok" : "ukendt",
        detail: harDkjordData ? "Ingen registreret olietank" : "Afventer data",
      };

  // Jordforurening (V1 + V2 + områdeklassificering)
  const v2Flag = flags.find((f) => f.id === "dkjord-v2");
  const v1Flag = flags.find((f) => f.id === "dkjord-v1");
  const omraadeFlag = flags.find((f) => f.id === "dkjord-omraade");
  const forurening: Indicator = v2Flag
    ? {
        id: "forurening",
        label: "Jordforurening",
        status: "blocker",
        detail: v2Flag.detalje ?? "V2-kortlagt grund",
      }
    : v1Flag
      ? {
          id: "forurening",
          label: "Jordforurening",
          status: "advarsel",
          detail: v1Flag.detalje ?? "V1-kortlagt grund",
        }
      : omraadeFlag
        ? {
            id: "forurening",
            label: "Jordforurening",
            status: "advarsel",
            detail: omraadeFlag.detalje ?? "Områdeklassificering",
          }
        : {
            id: "forurening",
            label: "Jordforurening",
            status: harDkjordData ? "ok" : "ukendt",
            detail: harDkjordData ? "Ingen kortlagt forurening" : "Afventer data",
          };

  // Naturbeskyttelseslinjer (strandbeskyttelse, skovbyggelinje, mv.)
  const naturFlags = flags.filter((f) => f.kilde === "sdfi");
  const natur: Indicator =
    naturFlags.length > 0
      ? {
          id: "natur",
          label: "Naturbeskyttelse",
          status: "blocker",
          detail: naturFlags.map((f) => f.label).join(" · "),
        }
      : {
          id: "natur",
          label: "Naturbeskyttelse",
          status: harNaturData || complianceDone ? "ok" : "ukendt",
          detail: harNaturData || complianceDone ? "Ingen beskyttelseslinjer" : "Afventer analyse",
        };

  // Servitutter — Tinglysning ikke implementeret endnu
  const servitutter: Indicator = {
    id: "servitutter",
    label: "Servitutter",
    status: "ukendt",
    detail: "Afventer Tinglysning-integration",
  };

  return [olietank, forurening, natur, servitutter];
}

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

function EjendomStep() {
  const navigate = useNavigate();
  const { address, bbrData, complianceFlags, complianceDone } = useProject();

  const indicators = deriveIndicators(complianceFlags, complianceDone);

  const metrics = [
    {
      icon: Ruler,
      label: "Grundareal",
      value: bbrData?.grundareal != null ? `${bbrData.grundareal} m²` : "—",
      sub:
        bbrData?.bebyggelsesprocent != null
          ? `${bbrData.bebyggelsesprocent}% bebygget`
          : "Grundareal fra MAT",
    },
    {
      icon: Building2,
      label: "Bebyggelse",
      value: bbrData?.bebygget_areal != null ? `${bbrData.bebygget_areal} m²` : "—",
      sub: bbrData?.antal_etager != null ? `${bbrData.antal_etager} etage(r)` : "Bebygget areal",
    },
    {
      icon: MapPin,
      label: "Kommune",
      value: address?.kommune ?? "—",
      sub: address?.postnr ? `${address.postnr} ${address.postnrnavn}` : "—",
    },
    {
      icon: Trees,
      label: "Matrikel",
      value: address?.matrikel ?? "—",
      sub: "Matr. nr. fra DAR",
    },
  ];

  const warningCount = indicators.filter(
    (i) => i.status === "advarsel" || i.status === "blocker",
  ).length;

  return (
    <PageTransition>
      <div className="mx-auto max-w-[920px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/boligoenske" />
        </div>
        <StepHeader
          step={2}
          title="Din ejendom"
          subtitle="Her er hvad vi ved om grunden — tjek for advarsler før byggeanalysen."
        />

        {/* Adresse-header */}
        {address && (
          <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin size={13} />
            <span>{address.adresse}</span>
          </div>
        )}

        {/* 2×2 metrics */}
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
                  <div className="rounded-md border border-border bg-[#111] p-2 shrink-0">
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

        {/* Indikatorer */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
              INDIKATORER
            </div>
            {warningCount > 0 && (
              <span className="font-mono text-[10px] text-warning border border-warning/40 rounded px-2 py-0.5">
                {warningCount} advarsel{warningCount !== 1 ? "er" : ""}
              </span>
            )}
          </div>
          <Card>
            <div className="divide-y divide-border">
              {indicators.map((ind) => (
                <IndicatorRow key={ind.id} {...ind} />
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
              onClick={() => navigate({ to: "/projekt/byggeanalyse" })}
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

function IndicatorRow({ label, status, detail }: Indicator) {
  const cfg = {
    ok: {
      Icon: CheckCircle2,
      colors: "text-success border-success/40",
      text: "OK",
    },
    advarsel: {
      Icon: AlertTriangle,
      colors: "text-warning border-warning/40",
      text: "ADVARSEL",
    },
    blocker: {
      Icon: AlertTriangle,
      colors: "text-danger border-danger/40",
      text: "BLOCKER",
    },
    ukendt: {
      Icon: HelpCircle,
      colors: "text-muted-foreground border-border",
      text: "AFVENTER",
    },
  }[status];

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 shrink-0 ml-3 ${cfg.colors}`}
      >
        <cfg.Icon size={12} />
        <span className="font-mono text-[10px] tracking-[0.1em]">{cfg.text}</span>
      </div>
    </div>
  );
}
