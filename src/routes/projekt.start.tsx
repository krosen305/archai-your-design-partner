import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Plus, ChevronRight, LogIn, Clock } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { Card } from "@/components/wizard-ui";
import type { Projekt } from "@/lib/byggeoenske";

export const Route = createFileRoute("/projekt/start")({
  component: StartPage,
});

function StartPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [projekter, setProjekter] = useState<Projekt[]>([]);

  useEffect(() => {
    (async () => {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      setLoggedIn(!!session);
      if (session) {
        const { listProjekter } = await import("@/lib/projekt-service");
        const liste = await listProjekter().catch(() => []);
        setProjekter(liste);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="font-mono text-xs text-muted-foreground tracking-widest animate-pulse">
          ARCHAI
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10"
      >
        <div className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground mb-2">
          ARCHAI
        </div>
        <h1 className="text-[28px] font-medium text-foreground">
          {loggedIn ? "Dine projekter" : "Fra idé til byggetilladelse"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loggedIn
            ? "Fortsæt et eksisterende projekt eller start et nyt."
            : "Analysér din grund, forstå lokalplanen og visualisér dit drømmehus."}
        </p>
      </motion.div>

      {loggedIn ? <LoggedInView projekter={projekter} /> : <GuestView />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Logget ind: projektliste
// ---------------------------------------------------------------------------

function LoggedInView({ projekter }: { projekter: Projekt[] }) {
  return (
    <div className="space-y-4">
      {projekter.length > 0 && (
        <>
          {projekter.map((p, i) => (
            <ProjektKort key={p.id} projekt={p} index={i} />
          ))}
          <div className="pt-2">
            <Divider />
          </div>
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: projekter.length * 0.06 + 0.1 }}
      >
        <Link
          to="/projekt/adresse"
          className="flex items-center gap-4 rounded-md border border-dashed border-accent/40 bg-accent/5 p-5 hover:bg-accent/10 hover:border-accent/60 transition-all group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/10">
            <Plus size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[13px] text-accent">Nyt projekt</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Søg på en adresse og start analysen
            </div>
          </div>
          <ChevronRight
            size={16}
            className="text-accent/60 group-hover:text-accent transition-colors"
          />
        </Link>
      </motion.div>
    </div>
  );
}

function ProjektKort({ projekt, index }: { projekt: Projekt; index: number }) {
  const navigate = useNavigate();
  const { setByggeoenske, resetByggeoenske } = useProject();

  const harByggeoenske = !!projekt.byggeoenske && Object.keys(projekt.byggeoenske).length > 0;
  const harAdresse = !!projekt.adresse_dar_id;
  const dato = new Date(projekt.updated_at).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const handleFortsaet = () => {
    resetByggeoenske();
    if (harByggeoenske && projekt.byggeoenske) {
      setByggeoenske(projekt.byggeoenske as Parameters<typeof setByggeoenske>[0]);
    }
    // Naviger til det bedste startpunkt
    if (harAdresse && harByggeoenske) {
      navigate({ to: "/projekt/byggeanalyse" });
    } else if (harByggeoenske) {
      navigate({ to: "/projekt/boligoenske" });
    } else {
      navigate({ to: "/projekt/adresse" });
    }
  };

  const fremskridt =
    harAdresse && harByggeoenske
      ? "Klar til analyse"
      : harByggeoenske
        ? "Byggeønsker udfyldt"
        : "Adresse mangler";
  const fremskridtColor =
    harAdresse && harByggeoenske
      ? "text-success border-success/40"
      : harByggeoenske
        ? "text-accent border-accent/40"
        : "text-muted-foreground border-border";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <Card className="hover:border-border/80 transition-colors">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-[#111]">
            <MapPin size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground truncate">
              {projekt.adresse ?? "Adresse ikke valgt"}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span
                className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] rounded border px-1.5 py-0.5 ${fremskridtColor}`}
              >
                {fremskridt}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock size={10} /> {dato}
              </span>
            </div>
          </div>
          <button
            onClick={handleFortsaet}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-mono text-[12px] text-accent-foreground hover:brightness-110 transition-all"
          >
            Fortsæt <ChevronRight size={13} />
          </button>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Gæst: upsell + fortsæt-mulighed
// ---------------------------------------------------------------------------

function GuestView() {
  return (
    <div className="space-y-4">
      {/* Upsell-kort */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="rounded-md border border-accent/20 bg-accent/5 p-5">
          <div className="font-mono text-[11px] tracking-[0.15em] text-accent mb-3">
            GEM DIT PROJEKT
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Med en gratis konto gemmes din adresse, dine byggeønsker og din analyse automatisk — så
            du kan vende tilbage, dele med din arkitekt og sammenligne grunde.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 font-mono text-sm text-accent-foreground hover:brightness-110 transition-all"
          >
            <LogIn size={14} /> Opret gratis konto →
          </Link>
        </div>
      </motion.div>

      <Divider label="ELLER FORTSÆT SOM GÆST" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Link
          to="/projekt/adresse"
          className="flex items-center gap-4 rounded-md border border-border bg-[#111] p-5 hover:border-border/80 hover:bg-[#161616] transition-all group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-[#1a1a1a]">
            <MapPin size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[13px] text-foreground">Start med en adresse</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Dine data gemmes kun lokalt i browseren
            </div>
          </div>
          <ChevronRight
            size={16}
            className="text-muted-foreground group-hover:text-foreground transition-colors"
          />
        </Link>
      </motion.div>
    </div>
  );
}

function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-[#222]" />
      {label && (
        <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex-1 h-px bg-[#222]" />
    </div>
  );
}
