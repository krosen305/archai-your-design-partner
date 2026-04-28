import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Check } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { DawaService, type DawaSuggestion } from "@/integrations/dawa/client";
import { BbrService } from "@/integrations/bbr/client";

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

function AddressStep() {
  const navigate = useNavigate();
  const { address, setAddress } = useProject();
  const [query, setQuery] = useState(address?.adresse ?? "");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(address);
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestedQueryRef = useRef<string>("");

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

    const controller = new AbortController();
    const q = queryTrimmed;
    lastRequestedQueryRef.current = q;
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        // Note: DawaService does not currently accept AbortSignal; debounce reduces load.
        const res = await DawaService.getSuggestions(q);

        // Only apply if this is still the latest query (avoid races)
        if (lastRequestedQueryRef.current !== q) return;
        setSuggestions(res);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setSuggestions([]);
        setError("Kunne ikke hente adresser lige nu.");
      } finally {
        if (lastRequestedQueryRef.current === q) setLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [open, queryTrimmed, selected]);

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
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Søg adresse, f.eks. Hasselvej 48, Lyngby..."
              className="w-full rounded-sm border border-[#333333] bg-[#111111] pl-10 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            />

            <div
              data-testid="address-suggestions"
              className={`absolute z-20 mt-2 w-full rounded-md border border-border bg-[#1A1A1A] shadow-xl overflow-hidden ${
                showDropdown ? "" : "hidden"
              }`}
            >
              {loading && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  Søger...
                </div>
              )}

              {!loading && error && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  {error}
                </div>
              )}

              {!loading && !error && suggestions.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  Ingen forslag.
                </div>
              )}

              {!loading &&
                !error &&
                suggestions.map((s: DawaSuggestion) => (
                  <button
                    data-testid="address-suggestion"
                    key={s.id}
                    onMouseDown={async (e: any) => {
                      e.preventDefault();

                      const fallbackFull = s.forslagstekst ?? s.tekst;

                      try {
                        const details = await DawaService.getAddressDetails(s.id);
                        const selectedAddr = {
                          adresse: details.adresse || fallbackFull,
                          postnr: details.postnr,
                          kommune: details.kommune,
                          matrikel: details.matrikel,
                          bbrId: details.bbrId,
                          byggeaar: "Ikke hentet endnu",
                        };

                        // If we already have a BBR building id (kvhx), try fetching byggeår.
                        // NOTE: Datafordeler credentials should be server-side; this may fail in client-only env.
                        if (details.bbrId) {
                          try {
                            const bbr = await BbrService.getBygningById(details.bbrId);
                            if (bbr.byggeaar) selectedAddr.byggeaar = bbr.byggeaar;
                          } catch {
                            // Keep placeholder if BBR lookup fails.
                          }
                        }

                        setSelected(selectedAddr);
                        setAddress(selectedAddr);
                        setQuery(selectedAddr.adresse);
                        setOpen(false);
                      } catch {
                        // If lookup fails, keep the suggestion text as selected so flow can continue.
                        const selectedAddr = {
                          adresse: fallbackFull,
                          postnr: "",
                          kommune: "Ukendt",
                          matrikel: null,
                          bbrId: null,
                          byggeaar: "Ikke hentet endnu",
                        };
                        setSelected(selectedAddr);
                        setAddress(selectedAddr);
                        setQuery(fallbackFull);
                        setOpen(false);
                      }
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-[#222222] transition-colors border-b border-border last:border-b-0"
                  >
                    <div className="text-sm text-foreground font-medium">
                      {s.forslagstekst ?? s.tekst}
                    </div>
                    {s.tekst !== (s.forslagstekst ?? s.tekst) && (
                      <div className="text-xs text-muted-foreground italic mt-0.5">
                        {s.tekst}
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </div>

          {selected && (
            <div className="mt-5 flex flex-wrap gap-2">
              <DataChip label="Matrikel" value={selected.matrikel ?? "—"} testId="chip-matrikel" />
              <DataChip label="Byggeår" value={selected.byggeaar ?? "—"} testId="chip-byggeaar" />
              <DataChip label="Postnr" value={selected.postnr || "—"} />
              <DataChip label="Kommune" value={selected.kommune} />
              <DataChip
                label="BBR-id"
                value={selected.bbrId ?? "—"}
              />
            </div>
          )}

          <button
            disabled={!selected}
            onClick={() => navigate({ to: "/projekt/compliance" })}
            className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Analysér adresse →
          </button>
        </Card>
      </div>
    </PageTransition>
  );
}

function DataChip({
  label,
  value,
  icon,
  testId,
}: {
  label: string;
  value: string;
  icon?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 font-mono text-[12px] text-foreground"
    >
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      {icon && <Check size={12} className="text-success" />}
    </div>
  );
}
