import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, ScrollText, Cpu, Check, AlertTriangle, Info, ExternalLink, Map } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan } from "@/integrations/plandata/client";

// ---------------------------------------------------------------------------
// Server functions – kører kun på serveren (Cloudflare Workers).
// ---------------------------------------------------------------------------

const fetchBbrData = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adgangsadresseid: string;
      ejerlavskode: number | null;
      matrikelnummer: string | null;
    }) => data
  )
  .handler(async ({ data }): Promise<BbrKompliantData> => {
    const { adgangsadresseid, ejerlavskode, matrikelnummer } = data;

    let grundareal: number | null = null;
    if (ejerlavskode && matrikelnummer) {
      try {
        const { MatService } = await import("@/integrations/mat/client");
        const mat = await MatService.getGrundareal(ejerlavskode, matrikelnummer);
        grundareal = mat.registreretAreal;
      } catch (e) {
        console.warn("[BBR] MAT grundareal-kald fejlede:", (e as Error).message);
      }
    }

    const { BbrService } = await import("@/integrations/bbr/client");
    return BbrService.getKompliantData(adgangsadresseid, grundareal);
  });

const fetchPlandataLokalplaner = createServerFn({ method: "POST" })
  .inputValidator((data: { lng: number; lat: number }) => data)
  .handler(
    async ({ data }): Promise<{ lokalplaner: Lokalplan[]; fejl: string | null }> => {
      const { lng, lat } = data;
      const { PlandataService } = await import("@/integrations/plandata/client");
      const result = await PlandataService.getLokalplanerForKoordinat(lng, lat, true);
      return { lokalplaner: result.lokalplaner, fejl: result.fejl };
    }
  );

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/projekt/compliance")({
  component: ComplianceStep,
});

const ROWS = [
  { icon: FileText, label: "Henter BBR-data", durationMs: 800 },
  { icon: ScrollText, label: "Læser bygningsregister", durationMs: 1600 },
  { icon: Map, label: "Henter lokalplandata", durationMs: 2000 },
  { icon: Cpu, label: "Beregner compliance", durationMs: 2600 },
];

type Status = "loading" | "done" | "error";

function ComplianceStep() {
  const navigate = useNavigate();
  const { address, bbrData, setBbrData, setComplianceDone } = useProject();

  const [status, setStatus] = useState<Status>(bbrData ? "done" : "loading");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lokalplaner, setLokalplaner] = useState<Lokalplan[]>([]);

  useEffect(() => {
    if (bbrData) {
      setStatus("done");
      return;
    }

    if (!address?.adgangsadresseid) {
      setFetchError("Ingen adresse valgt – gå tilbage og vælg en adresse.");
      setStatus("error");
      return;
    }

    const MIN_LOADING_MS = 2800;
    const startTime = Date.now();

    // Kør BBR og Plandata parallelt
    const bbrPromise = fetchBbrData({
      data: {
        adgangsadresseid: address.adgangsadresseid,
        ejerlavskode: address.ejerlavskode ?? null,
        matrikelnummer: address.matrikelnummer ?? null,
      },
    });

    const plandataPromise = address.koordinater?.lng && address.koordinater?.lat
      ? fetchPlandataLokalplaner({
          data: { lng: address.koordinater.lng, lat: address.koordinater.lat },
        }).catch((e) => {
          console.warn("[Compliance] Plandata fejlede (ikke kritisk):", e);
          return { lokalplaner: [], fejl: null };
        })
      : Promise.resolve({ lokalplaner: [], fejl: null });

    Promise.all([bbrPromise, plandataPromise])
      .then(([bbrResult, plandataResult]) => {
        setBbrData(bbrResult);
        setLokalplaner(plandataResult.lokalplaner);
        setComplianceDone(true);
        const remaining = Math.max(0, MIN_LOADING_MS - (Date.now() - startTime));
        setTimeout(() => setStatus("done"), remaining);
      })
      .catch((e) => {
        console.error("[Compliance] BBR fejlede:", e);
        const remaining = Math.max(0, MIN_LOADING_MS - (Date.now() - startTime));
        setTimeout(() => {
          setFetchError("BBR-data kunne ikke hentes. Prøv igen.");
          setStatus("error");
        }, remaining);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>
        {status === "loading" && <LoadingView />}
        {status === "error" && (
          <ErrorView
            message={fetchError ?? "Ukendt fejl."}
            onRetry={() => {
              setFetchError(null);
              setBbrData(null);
              setComplianceDone(false);
              setStatus("loading");
            }}
          />
        )}
        {status === "done" && bbrData && (
          <ResultView
            adresse={address?.adresse ?? ""}
            data={bbrData}
            lokalplaner={lokalplaner}
            onContinue={() => navigate({ to: "/projekt/beskrivelse" })}
          />
        )}
      </div>
    </PageTransition>
  );
}

function LoadingView() {
  return (
    <div>
      <h1 className="font-mono text-[28px] mb-8">Analyserer adresse...</h1>
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
  durationMs,
}: {
  icon: typeof FileText;
  label: string;
  durationMs: number;
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
          transition={{ duration: durationMs / 1000, ease: "easeOut" }}
          className="h-full bg-accent"
        />
      </div>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex gap-3 rounded-md border border-danger/40 bg-danger/10 p-4">
        <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
        <p className="text-sm text-foreground">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
      >
        Prøv igen
      </button>
    </motion.div>
  );
}

function ResultView({
  adresse,
  data,
  lokalplaner,
  onContinue,
}: {
  adresse: string;
  data: BbrKompliantData;
  lokalplaner: Lokalplan[];
  onContinue: () => void;
}) {
  const harData = data.beregning_mulig;
  const erBolig = data.anvendelseskode
    ? ["110","120","121","122","130","131","140","190"].includes(data.anvendelseskode)
    : false;
  const harErhverv = data.anvendelseskode
    ? ["321","322"].includes(data.anvendelseskode)
    : false;

  // Adskil vedtagne lokalplaner fra forslag
  const vedtagne = lokalplaner.filter(p =>
    !p.status || p.status.toLowerCase().includes("vedtaget") || !p.status.toLowerCase().includes("forslag")
  );
  const forslag = lokalplaner.filter(p =>
    p.status?.toLowerCase().includes("forslag")
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="text-xs text-muted-foreground mb-3 font-mono">{adresse}</p>

      <div className="flex justify-center my-6">
        {harData ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-5 py-2 font-mono text-sm text-success">
            <Check size={16} /> BYGNING FUNDET
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-5 py-2 font-mono text-sm text-warning">
            <AlertTriangle size={16} /> DATA UFULDSTÆNDIG
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <MetricCard
          title="Bebyggelsesprocent"
          value={data.bebyggelsesprocent !== null ? `${data.bebyggelsesprocent}%` : "—"}
          sub={data.bebygget_areal !== null ? `${data.bebygget_areal} m² bebygget` : "Ikke tilgængeligt"}
          bar={data.bebyggelsesprocent !== null ? data.bebyggelsesprocent / 30 : undefined}
        />
        <MetricCard
          title="Antal etager"
          value={data.antal_etager !== null ? `${data.antal_etager}` : "—"}
          sub={data.byggeaar ? `Opført ${data.byggeaar}` : "Byggeår ukendt"}
        />
        <MetricCard
          title="Anvendelse"
          value={erBolig ? "Bolig" : (data.anvendelse_tekst?.split(" ")[0] ?? "—")}
          sub={harErhverv ? "+ Liberalt erhverv ✓" : (data.anvendelse_tekst ?? "Ukendt")}
          subClass={harErhverv ? "text-success" : "text-muted-foreground"}
        />
      </div>

      <Card className="mb-4">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
          AI VURDERING
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          {genererVurdering(data, adresse)}
        </p>
      </Card>

      {/* Lokalplan-sektion */}
      {lokalplaner.length > 0 ? (
        <Card className="mb-4">
          <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
            LOKALPLANER
          </div>
          <div className="space-y-3">
            {vedtagne.map((lp) => (
              <div key={lp.planid} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-foreground font-medium truncate">
                    {lp.plannr ? `${lp.plannr} – ` : ""}{lp.plannavn || "Ukendt lokalplan"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {lp.datoVedtaget ? `Vedtaget ${lp.datoVedtaget.slice(0, 10)}` : "Vedtaget"}
                    {lp.kommunenavn ? ` · ${lp.kommunenavn}` : ""}
                  </div>
                </div>
                {lp.plandokumentLink && (
                  <a
                    href={lp.plandokumentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
                  >
                    PDF <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))}
            {forslag.map((lp) => (
              <div key={lp.planid} className="flex items-start justify-between gap-3 opacity-70">
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {lp.plannr ? `${lp.plannr} – ` : ""}{lp.plannavn || "Lokalplanforslag"}
                    <span className="ml-2 text-[10px] font-mono text-warning border border-warning/40 rounded px-1">FORSLAG</span>
                  </div>
                </div>
                {lp.plandokumentLink && (
                  <a
                    href={lp.plandokumentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    PDF <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="flex gap-3 rounded-md border border-[#333]/60 bg-[#1A1A1A] p-4 mb-4">
          <Info size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Ingen lokalplan fundet for adressen – ejendommen er reguleret af kommuneplanen.
            Kontakt din kommune for præcise byggeretlige grænser.
          </p>
        </div>
      )}

      {data.fejl && (
        <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 mb-6">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{data.fejl}</p>
        </div>
      )}

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
  title, value, sub, subClass = "text-muted-foreground", bar,
}: {
  title: string; value: string; sub: string; subClass?: string; bar?: number;
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
            style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }}
          />
        </div>
      )}
    </Card>
  );
}

function genererVurdering(data: BbrKompliantData, adresse: string): string {
  if (!data.beregning_mulig) {
    return `Vi fandt en registrering på ${adresse}, men kunne ikke beregne alle compliance-parametre. ${data.fejl ?? ""} Vi anbefaler at kontakte din kommune for en præcis byggesagsvurdering.`;
  }

  const parts: string[] = [];
  if (data.bebyggelsesprocent !== null && data.grundareal !== null) {
    parts.push(`Nuværende bebyggelsesprocent er ${data.bebyggelsesprocent}% på en grund af ${data.grundareal} m².`);
  }
  if (data.bebygget_areal !== null) {
    parts.push(`Det bebyggede areal udgør ${data.bebygget_areal} m².`);
  }
  if (data.antal_etager !== null) {
    parts.push(data.antal_etager <= 1 ? "Eksisterende bebyggelse er i ét plan." : `Bygningen har ${data.antal_etager} etager.`);
  }
  if (data.anvendelseskode && ["321","322"].includes(data.anvendelseskode)) {
    parts.push("Ejendommen er registreret til liberalt erhverv, hvilket muliggør en kombineret bolig/klinik-løsning.");
  }

  return parts.length > 0
    ? parts.join(" ")
    : `Bygningsdata hentet for ${adresse}. Kontakt din kommune for fuld byggesagsvurdering.`;
}
