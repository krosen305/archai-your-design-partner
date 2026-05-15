import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { useProject, type ComplianceFlag, type Address } from "@/lib/project-store";
import { useCockpitMode } from "@/lib/use-cockpit-mode";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import { syncPatch } from "@/lib/project-sync";
import { MOCK_ADRESSE } from "@/lib/mock-data";
import { preCheckAdresse } from "@/lib/pre-check-adresse";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function flagIcon(id: string): string {
  if (id.includes("fredet")) return "🏛️";
  if (id.includes("strandbeskyttelse")) return "🌊";
  if (id.includes("fredskov")) return "🌲";
  if (id.includes("skovbyggelinje")) return "🌳";
  if (id.includes("soebeskyttelse")) return "💧";
  return "⚠️";
}

// ---------------------------------------------------------------------------
// Server functions — begge kræver credentials der kun er tilgængelige server-side.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ q: z.string().min(2).max(200).trim() }).parse(data))
  .handler(async ({ data }) => {
    const { GsearchService } = await import("@/integrations/gsearch/client");
    return GsearchService.getSuggestions(data.q);
  });

const fetchAddressDetails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ adresseid: z.string().regex(UUID_RE, "Ugyldigt adresse-ID").max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { DarService } = await import("@/integrations/dar/client");
    return DarService.getAddressDetails(data.adresseid);
  });

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

function AddressStep() {
  const navigate = useNavigate();
  const [mode, setMode] = useCockpitMode();

  const {
    address,
    setAddress,
    setBbrData,
    setKommuneplanramme,
    setLokalplaner,
    setComplianceFlags,
    setVurderingData,
    setComplianceMetrics,
    setAdressePreCheck,
    adressePreCheck,
  } = useProject();

  // Compliance gate UI state (ARCH-125)
  const [overrideContinue, setOverrideContinue] = useState(false);
  const [showBlockerDialog, setShowBlockerDialog] = useState(false);
  const [softOpen, setSoftOpen] = useState(false);

  const [query, setQuery] = useState(address?.adresse ?? "");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(address);
  const [suggestions, setSuggestions] = useState<GsearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const lastQueryRef = useRef<string>("");

  const queryTrimmed = useMemo(() => query.trim(), [query]);
  const showDropdown = open && queryTrimmed.length > 0 && !selected;

  // Gate-logik: hard blockers = blockers uden dispensationsmulighed
  const hardBlockers = adressePreCheck?.blockers.filter((f) => !f.dispensationMulig) ?? [];
  const softBlockers = adressePreCheck?.blockers.filter((f) => f.dispensationMulig) ?? [];
  const advarsler = adressePreCheck?.advarsler ?? [];
  const hasHard = hardBlockers.length > 0;
  const hasSoft = softBlockers.length > 0 || advarsler.length > 0;
  const allChecksDone = adressePreCheck !== null && !isCheckingCompliance;
  const isClean = allChecksDone && !hasHard && !hasSoft;
  const anyDispensationPossible = softBlockers.length > 0;

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

    const timer = setTimeout(async () => {
      try {
        const res = await searchAddresses({ data: { q } });
        if (lastQueryRef.current !== q) return;
        setSuggestions(res);
        setHighlightIdx(0);
      } catch {
        if (lastQueryRef.current !== q) return;
        setSuggestions([]);
        setError("Kunne ikke hente adresser. Prøv igen.");
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [open, queryTrimmed, selected]);

  async function handleSelectSuggestion(s: GsearchSuggestion) {
    // Ryd tidligere pre-check ved nyt adressevalg
    setAdressePreCheck(null);
    setBbrData(null);

    // TRIN 1: Sæt straks adresse fra autocomplete-data (ingen ventetid)
    const immediateAddress: Address = {
      adresseid: s.adresseid,
      adresse: s.tekst,
      postnr: s.postnr,
      postnrnavn: s.postnrnavn,
      kommune: s.kommunekode,
      kommunekode: s.kommunekode,
      matrikel: null,
      adgangsadresseid: s.adgangsadresseid,
      koordinater: s.koordinater,
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
      grundareal: null,
    };

    setSelected(immediateAddress);
    setAddress(immediateAddress);
    setQuery(s.tekst);
    setOpen(false);
    setIsCheckingCompliance(true);

    // TRIN 2: Hent kommunenavn + matrikel server-side
    let fullAddress = immediateAddress;
    try {
      const details = await fetchAddressDetails({ data: { adresseid: s.adresseid } });
      fullAddress = {
        ...immediateAddress,
        adresse: details.adresse || s.tekst,
        postnr: details.postnr || s.postnr,
        postnrnavn: details.postnrnavn || s.postnrnavn,
        kommunekode: details.kommunekode || s.kommunekode,
        kommune:
          details.kommunenavn ||
          (await import("@/lib/kommuner")).kommunenavnFraKode(details.kommunekode || s.kommunekode),
        matrikel: details.matrikel,
        adgangsadresseid: details.adgangsadresseid || s.adgangsadresseid,
        koordinater: details.koordinater || s.koordinater,
        ejerlavskode: details.ejerlavskode,
        matrikelnummer: details.matrikelnummer,
        grundareal: details.grundareal ?? null,
      };
      setSelected(fullAddress);
      setAddress(fullAddress);
      syncPatch({ address: fullAddress, currentStep: "boligoenske" });
    } catch (err) {
      logger.error("[Adresse] getAddressDetails fejlede (ikke kritisk):", err);
      syncPatch({ address: immediateAddress, currentStep: "boligoenske" });
    }

    // TRIN 3: Kør pre-check compliance
    try {
      // vejnavn = vejnavn+husnr til FBB adresse-fallback (del af adressetekst før første komma)
      const vejnavn = fullAddress.adresse?.split(",")[0]?.trim() ?? null;
      const preCheck = await preCheckAdresse({
        data: {
          adgangsadresseid: fullAddress.adgangsadresseid,
          adresseid: s.adresseid,
          ejerlavskode: fullAddress.ejerlavskode,
          matrikelnummer: fullAddress.matrikelnummer,
          koordinater: fullAddress.koordinater,
          grundareal: fullAddress.grundareal,
          vejnavn,
          kommunenavn: fullAddress.kommune ?? null,
        },
      });
      setAdressePreCheck(preCheck);
      if (preCheck.bbr) setBbrData(preCheck.bbr);
      setKommuneplanramme(preCheck.kommuneplanramme);
      setLokalplaner(preCheck.lokalplaner);
      setComplianceFlags([...preCheck.blockers, ...preCheck.advarsler]);
      if (preCheck.vurderingData) setVurderingData(preCheck.vurderingData);
      if (preCheck.complianceMetrics) setComplianceMetrics(preCheck.complianceMetrics);
    } catch (err) {
      logger.error("[Adresse] preCheckAdresse fejlede:", err);
    } finally {
      setIsCheckingCompliance(false);
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/start" />
        </div>
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
                setHighlightIdx(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              onKeyDown={(e) => {
                if (!showDropdown || suggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlightIdx((i) => (i + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                } else if (e.key === "Enter") {
                  const s = suggestions[highlightIdx];
                  if (s) {
                    e.preventDefault();
                    handleSelectSuggestion(s);
                  }
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Søg adresse, f.eks. Hasselvej 48, 2830 Virum..."
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-activedescendant={
                showDropdown && suggestions[highlightIdx]
                  ? `addr-sugg-${highlightIdx}`
                  : undefined
              }
              className="w-full rounded-sm border border-[#333333] bg-[#111111] pl-10 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            />

            {/* Dropdown – max 5 forslag */}
            <div
              data-testid="address-suggestions"
              role="listbox"
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
                suggestions.map((s, i) => {
                  const isHi = i === highlightIdx;
                  return (
                    <button
                      data-testid="address-suggestion"
                      id={`addr-sugg-${i}`}
                      role="option"
                      aria-selected={isHi}
                      key={s.adgangsadresseid || i}
                      onMouseEnter={() => setHighlightIdx(i)}
                      onMouseDown={(e: any) => {
                        e.preventDefault();
                        handleSelectSuggestion(s);
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors border-b border-border last:border-b-0 ${
                        isHi ? "bg-[#222222]" : "hover:bg-[#1f1f1f]"
                      }`}
                    >
                      <div className="text-sm text-foreground font-medium">{s.tekst}</div>
                      {s.postnrnavn && (
                        <div className="text-xs text-muted-foreground italic mt-0.5">
                          {s.postnrnavn} · {s.kommunekode}
                        </div>
                      )}
                    </button>
                  );
                })}
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
                value={
                  isCheckingCompliance
                    ? "Tjekker..."
                    : selected.adgangsadresseid
                      ? "Klar ✓"
                      : "Ikke fundet"
                }
                testId="chip-bbr"
              />
            </div>
          )}

          {/* Compliance gate UI (ARCH-125) */}
          {selected && isCheckingCompliance && (
            <div className="mt-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Loader2 size={12} className="animate-spin text-accent" />
                Vi checker byggevilkår for adressen...
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
                <div className="h-full w-1/3 bg-accent animate-pulse" />
              </div>
            </div>
          )}

          {selected && hasHard && (
            <div className="mt-5 flex items-start gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-3">
              <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
              <div className="text-sm text-danger">
                {mode === "due-diligence"
                  ? "Væsentlige risikofaktorer ved køb af denne ejendom"
                  : "Byggeri kan ikke anbefales her"}
              </div>
            </div>
          )}

          {selected && !hasHard && hasSoft && (
            <div className="mt-5 rounded-md border border-yellow-500/40 bg-yellow-500/5">
              <button
                type="button"
                onClick={() => setSoftOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-yellow-400"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {softBlockers.length + advarsler.length} forhold kræver opmærksomhed
                </span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${softOpen ? "rotate-180" : ""}`}
                />
              </button>
              {softOpen && (
                <ul className="border-t border-yellow-500/20 divide-y divide-yellow-500/10">
                  {[...softBlockers, ...advarsler].map((f) => (
                    <li key={f.id} className="flex items-start gap-2 px-4 py-2.5 text-xs">
                      <span>{flagIcon(f.id)}</span>
                      <div>
                        <div className="text-foreground">{f.label}</div>
                        {f.detalje && <div className="text-muted-foreground">{f.detalje}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selected && isClean && (
            <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-1.5 font-mono text-[12px] text-emerald-400">
              <CheckCircle2 size={13} /> Ingen kendte byggehindringer ✓
            </div>
          )}

          {/* Fortsæt-knap — varianter */}
          {(hasHard || softBlockers.length > 0) && !overrideContinue ? (
            <button
              onClick={() => setShowBlockerDialog(true)}
              className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-danger px-6 py-3 font-mono text-sm text-white transition-all hover:brightness-110"
            >
              Se årsag →
            </button>
          ) : (
            <button
              disabled={!selected || isCheckingCompliance}
              onClick={() => navigate({ to: `/projekt/${selected?.adresseid}/cockpit` as never })}
              className={`mt-6 w-full inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 font-mono text-sm transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed ${
                hasSoft && !overrideContinue
                  ? "bg-yellow-500 text-black"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {isCheckingCompliance && <Loader2 size={14} className="animate-spin" />}
              {hasSoft && !overrideContinue ? "Fortsæt med forbehold →" : "Fortsæt →"}
            </button>
          )}

          {/* Blocker dialog */}
          <Dialog open={showBlockerDialog} onOpenChange={setShowBlockerDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {mode === "due-diligence"
                    ? "Risikofaktorer ved køb"
                    : hasHard
                      ? "Byggeri kan ikke anbefales her"
                      : "Dispensation er muligvis nødvendig"}
                </DialogTitle>
              </DialogHeader>
              <ul className="space-y-3 max-h-[50vh] overflow-y-auto">
                {[...hardBlockers, ...softBlockers].map((b: ComplianceFlag) => (
                  <li
                    key={b.id}
                    className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <span>{flagIcon(b.id)}</span>
                      <div className="flex-1">
                        <div className="text-sm text-foreground font-medium">{b.label}</div>
                        {b.detalje && (
                          <div className="text-xs text-muted-foreground mt-0.5">{b.detalje}</div>
                        )}
                        {b.dispensationMulig && (
                          <div className="mt-1.5 text-[11px] font-mono text-yellow-400">
                            Dispensation mulig — kontakt {b.dispensationMyndighed ?? "kommunen"}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <button
                  onClick={() => setShowBlockerDialog(false)}
                  className="w-full rounded-md bg-accent px-4 py-2.5 font-mono text-sm text-accent-foreground hover:brightness-110"
                >
                  {hasHard
                    ? mode === "due-diligence"
                      ? "Gå tilbage og vælg anden ejendom"
                      : "Gå tilbage og vælg anden adresse"
                    : "Gå tilbage"}
                </button>
                {anyDispensationPossible && (
                  <button
                    onClick={() => {
                      setOverrideContinue(true);
                      setShowBlockerDialog(false);
                    }}
                    className="w-full rounded-md border border-danger/40 bg-transparent px-4 py-2.5 font-mono text-xs text-danger hover:bg-danger/5"
                  >
                    Fortsæt alligevel — jeg kender risikoen
                  </button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Spring over: fortsæt uden adresse */}
          <button
            type="button"
            onClick={() => {
              setAddress(null);
              navigate({ to: "/projekt/adresse" });
            }}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Fortsæt uden adresse →
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground text-center">
            Vi henter automatisk data om grunden fra offentlige registre.
          </p>

          {import.meta.env.DEV && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setAddress(MOCK_ADRESSE);
                  navigate({ to: `/projekt/${MOCK_ADRESSE.adresseid}/cockpit` as never });
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
              >
                ⚡ DEV: Brug mock-adresse (Hasselvej 48, Virum)
              </button>
            </div>
          )}
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
