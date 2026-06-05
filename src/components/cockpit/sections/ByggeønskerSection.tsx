import { useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";
import type { Byggeoenske } from "@/types/project-state";

type ByggeønskerSectionProps = {
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

type OptionButtonProps<T extends string | number> = {
  value: T;
  current: T | undefined;
  label: string;
  onSelect: (v: T) => void;
};

function OptionButton<T extends string | number>({
  value,
  current,
  label,
  onSelect,
}: OptionButtonProps<T>) {
  const isActive = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-md border px-4 py-2 text-sm transition-colors",
        isActive
          ? "border-[#c8ff00]/60 bg-[#c8ff00]/10 text-foreground"
          : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

const BYGGETYPE_OPTIONS: Array<{ value: NonNullable<Byggeoenske["byggetype"]>; label: string }> = [
  { value: "nybyg", label: "Nybyg" },
  { value: "tilbyg", label: "Tilbygning" },
  { value: "ombyg", label: "Ombygning" },
];

const ETAGER_OPTIONS: Array<{ value: NonNullable<Byggeoenske["antalEtager"]>; label: string }> = [
  { value: 1, label: "1 etage" },
  { value: 1.5, label: "1½ etage" },
  { value: 2, label: "2 etager" },
];

const BUDGET_OPTIONS: Array<{ value: NonNullable<Byggeoenske["budget"]>; label: string }> = [
  { value: "under-3", label: "Under 3 mio." },
  { value: "3-5", label: "3–5 mio." },
  { value: "5-8", label: "5–8 mio." },
  { value: "8-12", label: "8–12 mio." },
  { value: "over-12", label: "Over 12 mio." },
];

export function ByggeønskerSection({ registerSection }: ByggeønskerSectionProps) {
  const { byggeoenske, setByggeoenske } = useProject();

  return (
    <section ref={(el) => registerSection("byggeønsker", el)} aria-label="Byggeønsker">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Byggeønsker</h2>

        <div>
          <p className="text-sm text-muted-foreground mb-3">Hvad vil du bygge?</p>
          <div className="flex flex-wrap gap-2">
            {BYGGETYPE_OPTIONS.map(({ value, label }) => (
              <OptionButton
                key={value}
                value={value}
                current={byggeoenske.byggetype}
                label={label}
                onSelect={(v) => setByggeoenske({ byggetype: v })}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-2 block" htmlFor="oensket-areal">
            Ønsket areal (m²)
          </label>
          <input
            id="oensket-areal"
            type="number"
            min={10}
            max={2000}
            step={5}
            value={byggeoenske.oensketAreal ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setByggeoenske({ oensketAreal: Number.isNaN(n) ? undefined : n });
            }}
            placeholder="f.eks. 120"
            className="w-40 rounded-md border border-border/40 bg-[#111] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#c8ff00]/60 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-3">Antal etager</p>
          <div className="flex flex-wrap gap-2">
            {ETAGER_OPTIONS.map(({ value, label }) => (
              <OptionButton
                key={value}
                value={value}
                current={byggeoenske.antalEtager}
                label={label}
                onSelect={(v) => setByggeoenske({ antalEtager: v })}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-3">Budget</p>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map(({ value, label }) => (
              <OptionButton
                key={value}
                value={value}
                current={byggeoenske.budget}
                label={label}
                onSelect={(v) => setByggeoenske({ budget: v })}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
