import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { DawaService, type DawaSuggestion } from "@/integrations/dawa/client";
import { DarService } from "@/integrations/dar/client";
import { syncPatch } from "@/lib/project-sync";

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

function AddressStep() {
  const navigate = useNavigate();
  const { address, setAddress, setBbrData } = useProject();

  const [query, setQuery] = useState(address?.adresse ?? "");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(address);
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef<string>("");

  const queryTrimmed = useMemo(() => query.trim(), [query]);
  const showDropdown = open && queryTrimmed.length > 0 && !selected;

  useEffect(() => {
    if (!open || selected) return;
    if (queryTrimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const q = queryTrimmed;
    lastQueryRef.current = q;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await DawaService.getSuggestions(q, controller.signal);
        if (lastQueryRef.current !== q) return;
        setSuggestions(res);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setSuggestions([]);
        setError("Kunne ikke hente adresser. Prøv igen.");
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, queryTrimmed, selected]);

  async function handleSelectSuggestion(s: DawaSuggestion) {
    // TRIN 1: Sæt straks adresse fra autocomplete-data (ingen ventetid)
    // adgangsadresseid, koordinater, postnr er alle tilgængeligt nu.
    const immediateAddress = {
      adresseid: s.adresseid,
      adresse: s.tekst,
      postnr: s.postnr,
      postnrnavn: s.postnrnavn,
      kommune: s.kommunekode, // midlertidigt – erstattes med navn nedenfor
      kommunekode: s.kommunekode,
      matrikel: null,
      adgangsadresseid: s.adgangsadresseid,
      koordinater: s.koordinater,
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
    };

    setBbrData(null);
    setSelected(immediateAddress);
    setAddress(immediateAddress);
    setQuery(s.tekst);
    setOpen(false);

    // TRIN 2: Hent kommunenavn + matrikel i baggrunden (blokerer ikke flowet)
    try {
      const details = await DarService.getAddressDetails(s.adresseid);
      const fullAddress = {
        ...immediateAddress,
        adresse: details.adresse || s.tekst,
        postnr: details.postnr || s.postnr,
        postnrnavn: details.postnrnavn || s.postnrnavn,
        kommune: details.kommunenavn,
        kommunekode: details.kommunekode || s.kommunekode,
        matrikel: details.matrikel,
        adgangsadresseid: details.adgangsadresseid || s.adgangsadresseid,
        koordinater: details.koordinater || s.koordinater,
        ejerlavskode: details.ejerlavskode,
        matrikelnummer: details.matrikelnummer,
        // adresseid stays as s.adresseid from immediateAddress (DAR ID = DAWA ID)
      };
      setSelected(fullAddress);
      setAddress(fullAddress);
      syncPatch({ address: fullAddress, currentStep: "boligoenske" });
    } catch (err) {
      console.error("[Adresse] getAddressDetails fejlede (ikke kritisk):", err);
      // Behold immediateAddress – vi har stadig adgangsadresseid til BBR
      syncPatch({ address: immediateAddress, currentStep: "boligoenske" });
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/" />
        </div>
        <StepHeader
          step={1}
          title="Hvad er adressen?"
          subtitle="Vi henter automatisk bygningsdata og lokalplan."
        />

        <Card>
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              data-testid="address-input"
              value={query}
              onChange={(e: any) => {
                setQuery(e.target.value);
                setSelected(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              placeholder="Søg adresse, f.eks. Hasselvej 48, 2830 Virum..."
              className="w-full rounded-sm border border-[#333333] bg-[#111111] pl-10 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            />

            {/* Dropdown – max 5 forslag */}
            <div
              data-testid="address-suggestions"
              className={`absolute z-20 mt-2 w-full rounded-md border border-border bg-[#1A1A1A] shadow-xl overflow-hidden ${
                showDropdown ? "" : "hidden"
              }`}
            >
              {loading && <div className="px-4 py-3 text-xs text-muted-foreground">Søger...</div>}
              {!loading && error && (
                <div className="px-4 py-3 text-xs text-muted-foreground">{error}</div>
              )}
              {!loading && !error && suggestions.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  Ingen forslag – prøv at tilføje postnummer.
                </div>
              )}
              {!loading &&
                !error &&
                suggestions.map((s, i) => (
                  <button
                    data-testid="address-suggestion"
                    key={s.adgangsadresseid || i}
                    onMouseDown={(e: any) => {
                      e.preventDefault();
                      handleSelectSuggestion(s);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-[#222222] transition-colors border-b border-border last:border-b-0"
                  >
                    <div className="text-sm text-foreground font-medium">{s.tekst}</div>
                    {s.postnrnavn && (
                      <div className="text-xs text-muted-foreground italic mt-0.5">
                        {s.postnrnavn} · {s.kommunekode}
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </div>

          {/* Chips efter valg */}
          {selected && (
            <div className="mt-5 flex flex-wrap gap-2">
              <DataChip label="Matrikel" value={selected.matrikel ?? "—"} testId="chip-matrikel" />
              <DataChip
                label="Kommune"
                value={selected.kommune || selected.kommunekode || "—"}
                testId="chip-kommune"
              />
              <DataChip label="Postnr" value={selected.postnr || "—"} testId="chip-postnr" />
              <DataChip
                label="BBR"
                value={selected.adgangsadresseid ? "Klar ✓" : "Ikke fundet"}
                testId="chip-bbr"
              />
            </div>
          )}

          <button
            disabled={!selected}
            onClick={() => navigate({ to: "/projekt/boligoenske" })}
            className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Fortsæt →
          </button>

          {/* Spring over: fortsæt uden adresse */}
          <button
            type="button"
            onClick={() => {
              setAddress(null as never); // ryd evt. tidligere valgt
              navigate({ to: "/projekt/boligoenske" });
            }}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Fortsæt uden adresse →
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground text-center">
            Vi henter automatisk data om grunden fra offentlige registre.
          </p>
        </Card>
      </div>
    </PageTransition>
  );
}

function DataChip({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 font-mono text-[12px] text-foreground"
    >
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
