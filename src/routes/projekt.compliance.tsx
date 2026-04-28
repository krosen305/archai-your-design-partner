import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, ScrollText, Cpu, Check, AlertTriangle } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/compliance")({
  component: ComplianceStep,
});

const ROWS = [
  { icon: FileText, label: "Henter BBR-data", end: 800 },
  { icon: ScrollText, label: "Læser lokalplan", end: 1600 },
  { icon: Cpu, label: "AI-analyse", end: 2500 },
];

function ComplianceStep() {
  const { address, setComplianceDone } = useProject();
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      setDone(true);
      setComplianceDone(true);
    }, 2600);
    return () => clearTimeout(t);
  }, [setComplianceDone]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>

        {!done ? (
          <Loading />
        ) : (
          <Result
            onContinue={() => navigate({ to: "/projekt/beskrivelse" })}
            address={address?.adresse ?? ""}
          />
        )}
      </div>
    </PageTransition>
  );
}

function Loading() {
  return (
    <div>
      <h1 className="font-mono text-[28px] mb-8">Analyserer lokalplan...</h1>
      <Card className="space-y-5">
        {ROWS.map((r) => (
          <ProgressRow key={r.label} {...r} />
        ))}
      </Card>
    </div>
  );
}

function ProgressRow({
  icon: Icon,
  label,
  end,
}: {
  icon: typeof FileText;
  label: string;
  end: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Icon size={16} className="text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#222222]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: end / 1000, ease: "easeOut" }}
          className="h-full bg-accent"
        />
      </div>
    </div>
  );
}

function Result({ address, onContinue }: { address: string; onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="text-xs text-muted-foreground mb-3 font-mono">{address}</p>

      <div className="flex justify-center my-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-5 py-2 font-mono text-sm text-success">
          <Check size={16} />
          BYGBART
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <MetricCard title="Bebyggelsesprocent" value="22%" sub="30% tilladt" bar={22 / 30} />
        <MetricCard title="Max højde" value="8.5m" sub="Tilladt på grunden" />
        <MetricCard
          title="Anvendelse"
          value="Bolig"
          sub="+ Liberalt erhverv ✓"
          subClass="text-success"
        />
      </div>

      <Card className="mb-4">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
          AI VURDERING
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          Grunden er velegnet til opførelse af et arkitekttegnet enfamiliehus.
          Bebyggelsesprocenten giver dig plads til ca. 165 m² bebygget areal.
          Lokalplanen tillader liberalt erhverv, hvilket muliggør en kombineret
          bolig/klinik-løsning. Der er ingen umiddelbare hindringer for et
          projekt i to etager.
        </p>
      </Card>

      <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 mb-6">
        <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
        <p className="text-sm text-foreground">
          Vejudlæg mod nord kan reducere byggefelt med 2-3 meter. Kræver
          afklaring med kommunen.
        </p>
      </div>

      <button
        onClick={onContinue}
        className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
      >
        Beskriv dit projekt →
      </button>
      <p className="mt-3 text-[10px] text-muted-foreground text-center">
        AI-analyse er vejledende og erstatter ikke professionel byggerådgivning.
      </p>
    </motion.div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  subClass = "text-muted-foreground",
  bar,
}: {
  title: string;
  value: string;
  sub: string;
  subClass?: string;
  bar?: number;
}) {
  return (
    <Card>
      <div className="text-[11px] font-mono tracking-[0.1em] text-muted-foreground mb-2">
        {title.toUpperCase()}
      </div>
      <div className="font-mono text-2xl text-foreground">{value}</div>
      <div className={`text-xs mt-1 ${subClass}`}>{sub}</div>
      {bar !== undefined && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#222]">
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.min(100, bar * 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}
