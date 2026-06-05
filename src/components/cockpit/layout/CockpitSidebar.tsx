import { cn } from "@/lib/utils";

export type SidebarSection =
  | "verdict"
  | "opmærksomhed"
  | "grunden"
  | "plan"
  | "økonomi"
  | "datakilder";

export const SIDEBAR_ITEMS: Array<{ id: SidebarSection; label: string }> = [
  { id: "verdict", label: "Oversigt" },
  { id: "opmærksomhed", label: "Opmærksomhed" },
  { id: "grunden", label: "Grunden" },
  { id: "plan", label: "Plan & regulering" },
  { id: "økonomi", label: "Økonomi" },
  { id: "datakilder", label: "Datakilder" },
];

type CockpitSidebarProps = {
  active: SidebarSection;
  onNavigate: (s: SidebarSection) => void;
};

export function CockpitSidebar({ active, onNavigate }: CockpitSidebarProps) {
  return (
    <nav
      aria-label="Maskinrum navigation"
      className="w-[140px] shrink-0 border-r border-border/40 py-6 flex flex-col gap-1"
    >
      <div className="px-4 mb-4 font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60">
        MASKINRUMMET
      </div>
      {SIDEBAR_ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors w-full",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0",
                isActive ? "bg-[#c8ff00]" : "bg-muted-foreground/30",
              )}
            />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
