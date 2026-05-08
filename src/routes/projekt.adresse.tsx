import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import { syncPatch } from "@/lib/project-sync";
import { MOCK_ADRESSE } from "@/lib/mock-data";
import { preCheckAdresse } from "@/lib/pre-check-adresse";

// ---------------------------------------------------------------------------
// Server functions — begge kræver credentials der kun er tilgængelige server-side.
// ---------------------------------------------------------------------------

const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: { q: string }) => data)
  .handler(async ({ data }) => {
    const { GsearchService } = await import("@/integrations/gsearch/client");
    return GsearchService.getSuggestions(data.q);
  });

const fetchAddressDetails = createServerFn({ method: "POST" })
  .inputValidator((data: { adresseid: string }) => data)
  .handler(async ({ data }) => {
    const { DarService } = await import("@/integrations/dar/client");
    return DarService.getAddressDetails(data.adresseid);
  });

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

function AddressStep() {
  const navigate = useNavigate();
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

  const [query, setQuery] = useState(address?.adresse ?? "");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(address);
  const [suggestions, setSuggestions] = useState<GsearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const lastQueryRef = useRef<string>("");

  const queryTrimmed = useMemo(() => query.trim(), [query]);
  const showDropdown = open && queryTrimmed.length > 0 && !selected;

  // Gate-logik: hard blockers = blockers uden dispensationsmulighed
  const hardBlockers = adressePreCheck?.blockers.filter((f) => !f.dispensationMulig) ?? [];
  const softBlockers = adressePreCheck?.blockers.filter((f) => f.dispensationMulig) ?? [];
  const advarsler = adressePreCheck?.advarsler ?? [];

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
      } catch {
        if (lastQueryRef.current !== q) return;
        setSuggestions([]);
        setError("Kunne ikke hente adresser. Prøv igen.");
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [open, queryTrimmed, selected]);

  async function handleSelectSuggestion(s: GsearchSuggestion) {
    // Ryd tidligere pre-check ved nyt adressevalg
    setAdressePreCheck(null);
    setBbrData(null);

    // TRIN 1: Sæt straks adresse fra autocomplete-data (ingen ventetid)
    const immediateAddress = {
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
      console.error("[Adresse] getAddressDetails fejlede (ikke kritisk):", err);
      syncPatch({ address: immediateAddress, currentStep: "boligoenske" });
    }

    // TRIN 3: Kør pre-check compliance
    try {
      const preCheck = await preCheckAdresse({
        data: {
          adgangsadresseid: fullAddress.adgangsadresseid,
          adresseid: s.adresseid,
          ejerlavskode: fullAddress.ejerlavskode,
          matrikelnummer: fullAddress.matrikelnummer,
          koordinater: fullAddress.koordinater,
          grundareal: fullAddress.grundareal,
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
      console.error("[Adresse] preCheckAdresse fejlede:", err);
    } finally {
      setIsCheckingCompliance(false);
    }
  }

  const canContinue = !!selected && !isCheckingCompliance && hardBlockers.length === 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/start" />
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

          {/* Compliance-feedback */}
          {selected && !isCheckingCompliance && (
            <>
              {/* Hard blockers: ingen dispensation mulig */}
              {hardBlockers.length > 0 && (
                <div className="mt-5 rounded-md border border-danger/40 bg-danger/5 px-4 py-3">
                  <div className="flex items-center gap-2 text-danger text-sm font-medium mb-1">
                    <AlertTriangle size={15} />
                    Byggeri ikke muligt på denne adresse
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {hardBlockers.map((f) => (
                      <li key={f.id} className="text-xs text-danger/80">
                        {f.label}
                        {f.detalje ? ` — ${f.detalje}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Soft blockers: dispensation mulig → amber */}
              {softBlockers.length > 0 && (
                <div className="mt-5 rounded-md border border-yellow-500/40 bg-yellow-500/5 px-4 py-3">
                  <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium mb-1">
                    <AlertTriangle size={15} />
                    Kræver dispensation
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {softBlockers.map((f) => (
                      <li key={f.id} className="text-xs text-yellow-400/80">
                        {f.label}
                        {f.dispensationMyndighed
                          ? ` — dispensation fra ${f.dispensationMyndighed}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-yellow-400/60">
                    Du kan fortsætte, men projektet kræver dispensation.
                  </p>
                </div>
              )}

              {/* Advarsler */}
              {advarsler.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {advarsler.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-2.5 py-1 text-[11px] font-mono text-yellow-400"
                    >
                      ⚠ {f.label}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            disabled={!canContinue}
            onClick={() => navigate({ to: "/projekt/boligoenske" })}
            className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isCheckingCompliance ? "Tjekker adresse..." : "Fortsæt →"}
          </button>

          {/* Spring over: fortsæt uden adresse */}
          <button
            type="button"
            onClick={() => {
              setAddress(null as never);
              navigate({ to: "/projekt/boligoenske" });
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
                  navigate({ to: "/projekt/boligoenske" });
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
