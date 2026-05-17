import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Plus, ChevronRight, LogIn, Clock, LogOut, Trash2, Loader2 } from "lucide-react";
import { useProject, type Address } from "@/lib/project-store";
import { serverCreateProject } from "@/lib/project-sync";
import { Card } from "@/components/wizard-ui";
import type { Projekt } from "@/lib/byggeoenske";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

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
      {loggedIn && (
        <div className="flex justify-end mb-4 -mt-8">
          <button
            onClick={async () => {
              const { signOut } = await import("@/lib/auth");
              await signOut();
              window.location.href = "/";
            }}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={11} /> LOG UD
          </button>
        </div>
      )}
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

      {loggedIn ? (
        <LoggedInView projekter={projekter} setProjekter={setProjekter} />
      ) : (
        <GuestView />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Logget ind: projektliste
// ---------------------------------------------------------------------------

function LoggedInView({
  projekter,
  setProjekter,
}: {
  projekter: Projekt[];
  setProjekter: React.Dispatch<React.SetStateAction<Projekt[]>>;
}) {
  const navigate = useNavigate();
  const { reset, setCurrentProjectId } = useProject();

  const handleNytProjekt = async () => {
    let newId: string | null = null;
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (session?.access_token) {
        newId = await serverCreateProject({ data: { accessToken: session.access_token } });
      }
    } catch {
      // fail-open — første syncPatch opretter et nyt projekt via getOrCreateProject
    }
    reset();
    if (newId) setCurrentProjectId(newId);
    navigate({ to: "/projekt/adresse" });
  };

  return (
    <div className="space-y-4">
      {projekter.length > 0 && (
        <>
          {projekter.map((p, i) => (
            <ProjektKort
              key={p.id}
              projekt={p}
              index={i}
              onSlettet={(id) => setProjekter((prev) => prev.filter((x) => x.id !== id))}
            />
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
        <button
          onClick={handleNytProjekt}
          className="flex w-full items-center gap-4 rounded-md border border-dashed border-accent/40 bg-accent/5 p-5 hover:bg-accent/10 hover:border-accent/60 transition-all group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/10">
            <Plus size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="font-mono text-[13px] text-accent">Nyt projekt</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Søg på en adresse og start analysen
            </div>
          </div>
          <ChevronRight
            size={16}
            className="text-accent/60 group-hover:text-accent transition-colors"
          />
        </button>
      </motion.div>
    </div>
  );
}

function ProjektKort({
  projekt,
  index,
  onSlettet,
}: {
  projekt: Projekt;
  index: number;
  onSlettet: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { reset, setCurrentProjectId, setAddress, currentProjectId } = useProject();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sletter, setSletter] = useState(false);

  const harAdresse = !!projekt.adresse_dar_id;
  const dato = new Date(projekt.updated_at).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const handleFortsaet = () => {
    // Ryd analyse-state, men sæt så adressen + projektId med det samme så
    // cockpit-mount ikke render'er en restore-race der bouncer til /adresse.
    reset();
    setCurrentProjectId(projekt.id);
    if (projekt.adresse_dar_id && projekt.adresse) {
      const adresseid = projekt.adresse_dar_id;
      const adgang = projekt.address_bbr ?? adresseid;
      const addr: Address = {
        adresseid,
        adresse: projekt.adresse,
        postnr: projekt.address_postnr ?? "",
        postnrnavn: projekt.address_postnrnavn ?? "",
        kommune: projekt.address_kommune ?? "",
        kommunekode: "",
        matrikel: projekt.address_matrikel,
        adgangsadresseid: adgang,
        koordinater: projekt.address_koordinater ?? { lat: 0, lng: 0 },
        bbrId: null,
        ejerlavskode: projekt.address_ejerlavskode,
        matrikelnummer: projekt.address_matrikelnummer,
        grundareal: null,
      };
      setAddress(addr);
      const search = { projectId: projekt.id } as never;
      navigate({ to: `/projekt/${adresseid}/cockpit` as never, search });
    } else {
      const search = { projectId: projekt.id } as never;
      navigate({ to: "/projekt/adresse", search });
    }
  };

  const handleSlet = async () => {
    setSletter(true);
    try {
      const { sletProjekt } = await import("@/lib/projekt-service");
      await sletProjekt(projekt.id);
      if (currentProjectId === projekt.id) {
        reset();
      }
      onSlettet(projekt.id);
      toast.success("Projektet er slettet");
    } catch (e) {
      toast.error((e as Error).message || "Kunne ikke slette projektet");
    } finally {
      setSletter(false);
      setConfirmOpen(false);
    }
  };

  const fremskridt = projekt.compliance_done
    ? "Analyse gennemført"
    : harAdresse
      ? "Adresse valgt"
      : "Ikke startet";
  const fremskridtColor = projekt.compliance_done
    ? "text-success border-success/40"
    : harAdresse
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
            onClick={() => setConfirmOpen(true)}
            aria-label="Slet projekt"
            title="Slet projekt"
            className="shrink-0 inline-flex items-center justify-center rounded-md border border-border/60 p-2 text-muted-foreground hover:text-danger hover:border-danger/40 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={handleFortsaet}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-mono text-[12px] text-accent-foreground hover:brightness-110 transition-all"
          >
            Fortsæt <ChevronRight size={13} />
          </button>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              {projekt.adresse
                ? `Projektet på "${projekt.adresse}" og al tilknyttet data slettes permanent. Handlingen kan ikke fortrydes.`
                : "Projektet og al tilknyttet data slettes permanent. Handlingen kan ikke fortrydes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sletter}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSlet();
              }}
              disabled={sletter}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {sletter ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> Sletter…
                </>
              ) : (
                "Slet projekt"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
