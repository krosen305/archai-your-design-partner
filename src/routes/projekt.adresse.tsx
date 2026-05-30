import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { getSession } from "@/lib/auth";
import { useProject } from "@/lib/project-store";
import { PageTransition } from "@/components/wizard-ui";
import { searchAddresses } from "@/lib/adresse.functions";
import { saveProjectPatch, serverCreateProject } from "@/lib/project-sync";
import { runProjectSaveWorkflow } from "@/lib/project-save-workflow";
import { kommunenavnFraKode } from "@/lib/kommuner";
import { logger } from "@/lib/logger";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import type { Address } from "@/types/project-state";

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

function AddressStep() {
  const navigate = useNavigate();
  const { setAddress, setBbrData, setComplianceDone, setCurrentProjectId, currentProjectId } =
    useProject();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GsearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await searchAddresses({ data: { q: query } });
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setError("Søgning fejlede – prøv igen.");
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(s: GsearchSuggestion) {
    const addr: Address = {
      adresseid: s.adresseid,
      adresse: s.tekst,
      postnr: s.postnr,
      postnrnavn: s.postnrnavn,
      kommune: kommunenavnFraKode(s.kommunekode),
      kommunekode: s.kommunekode,
      matrikel: null,
      adgangsadresseid: s.adgangsadresseid,
      koordinater: s.koordinater,
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
      grundareal: null,
    };
    setSelected(addr);
    setQuery(s.tekst);
    setOpen(false);
    setSuggestions([]);
  }

  async function handleContinue() {
    if (!selected || continuing) return;
    setContinuing(true);
    setBbrData(null);
    setComplianceDone(false);

    // Sørg for at vi har et projectId før vi navigerer til cockpit. Uden et
    // projekt fyrer cockpit'et en orphan-analyse med project_id=null (eller
    // redirecter via stale-tab guard). Ved at oprette projektet eksplicit her
    // sikrer vi at den legitime "ny adresse"-sti altid har projektkontekst.
    let projectId = currentProjectId;
    if (!projectId) {
      try {
        const session = await getSession();
        if (session?.access_token) {
          projectId = await serverCreateProject({
            data: { accessToken: session.access_token },
          });
          setCurrentProjectId(projectId);
        }
      } catch (e) {
        logger.warn("[Adresse] kunne ikke oprette projekt:", (e as Error).message);
        // Fail-open: lad cockpit's stale-tab guard tage over hvis vi ikke
        // har et projekt — så ryger brugeren bare tilbage hertil.
      }
    }

    setAddress(selected);
    void runProjectSaveWorkflow(
      {
        patch: { address: selected, complianceDone: false, currentStep: "boligoenske" },
        projectId,
      },
      {
        getSession,
        saveProjectPatch,
      },
    );
    navigate({ to: `/projekt/${selected.adresseid}/cockpit` as never });
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[560px] px-6 py-16 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-accent mb-2">01 / GRUNDLAGET</p>
          <h1 className="text-2xl text-foreground">Hvilken adresse drejer det sig om?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Indtast adressen for den ejendom du vil analysere.
          </p>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:border-accent/60 transition-colors">
            <MapPin size={14} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected && e.target.value !== selected.adresse) setSelected(null);
              }}
              placeholder="Søg adresse..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              data-testid="address-search-input"
              autoComplete="off"
            />
            {loading && (
              <span className="font-mono text-[10px] text-muted-foreground animate-pulse">
                søger...
              </span>
            )}
          </div>

          {open && suggestions.length > 0 && (
            <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-[#0e0e0e] shadow-lg">
              {suggestions.map((s) => (
                <li key={s.adresseid}>
                  <button
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-[#1a1a1a] transition-colors"
                    data-testid="address-suggestion"
                  >
                    {s.tekst}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>

        {selected && (
          <div className="flex flex-wrap gap-2" data-testid="address-chips">
            <DataChip label="Adresse" value={selected.adresse.split(",")[0]} />
            <DataChip label="Postnr" value={selected.postnr} />
            <DataChip label="Kommune" value={selected.kommune || selected.kommunekode} />
          </div>
        )}

        <button
          type="button"
          disabled={!selected || continuing}
          onClick={() => {
            void handleContinue();
          }}
          data-testid="continue-btn"
          className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {continuing ? "Opretter projekt…" : "Fortsæt →"}
        </button>
      </div>
    </PageTransition>
  );
}

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex flex-col rounded border border-border/60 bg-[#111] px-3 py-1.5">
      <span className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}
