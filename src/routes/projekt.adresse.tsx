import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Check } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

const SUGGESTIONS = [
  { full: "Hasselvej 48, 2800 Kongens Lyngby", kommune: "Lyngby-Taarbæk" },
  { full: "Hasselvej 48B, 2800 Kongens Lyngby", kommune: "Lyngby-Taarbæk" },
  { full: "Hasselvej 49, 2800 Kongens Lyngby", kommune: "Lyngby-Taarbæk" },
  { full: "Hasselvej 50, 2800 Kongens Lyngby", kommune: "Lyngby-Taarbæk" },
];

function AddressStep() {
  const navigate = useNavigate();
  const { address, setAddress } = useProject();
  const [query, setQuery] = useState(address?.full ?? "");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(address);

  const showDropdown = open && query.length > 0 && !selected;

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
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Søg adresse, f.eks. Hasselvej 48, Lyngby..."
              className="w-full rounded-sm border border-[#333333] bg-[#111111] pl-10 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            />

            {showDropdown && (
              <div className="absolute z-20 mt-2 w-full rounded-md border border-border bg-[#1A1A1A] shadow-xl overflow-hidden">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.full}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const addr = {
                        full: s.full,
                        kommune: s.kommune,
                        matrikel: "14a Lyngby",
                        bbr: "Fundet",
                      };
                      setSelected(addr);
                      setAddress(addr);
                      setQuery(s.full);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-[#222222] transition-colors border-b border-border last:border-b-0"
                  >
                    <div className="text-sm text-foreground font-medium">
                      {s.full}
                    </div>
                    <div className="text-xs text-muted-foreground italic mt-0.5">
                      {s.kommune}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-5 flex flex-wrap gap-2">
              <DataChip label="Matrikel" value={selected.matrikel} />
              <DataChip label="Kommune" value={selected.kommune} />
              <DataChip label="BBR" value="Fundet" icon />
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
}: {
  label: string;
  value: string;
  icon?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 font-mono text-[12px] text-foreground">
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      {icon && <Check size={12} className="text-success" />}
    </div>
  );
}
