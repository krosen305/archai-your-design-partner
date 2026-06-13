import { cn } from "@/lib/utils";

export type SidebarSection =
  | "verdict"
  | "opmærksomhed"
  | "grunden"
  | "byggeønsker"
  | "plan"
  | "økonomi"
  | "næste"
  | "datakilder";

export const SIDEBAR_ITEMS: Array<{ id: SidebarSection; label: string }> = [
  { id: "verdict", label: "Oversigt" },
  { id: "opmærksomhed", label: "Risikoregister" },
  { id: "grunden", label: "Grunden" },
  { id: "byggeønsker", label: "Screeninginput" },
  { id: "plan", label: "Plan & regulering" },
  { id: "økonomi", label: "Omkostninger" },
  { id: "næste", label: "Næste kontroller" },
  { id: "datakilder", label: "Kildebog" },
];

type CockpitSidebarProps = {
  active: SidebarSection;
  onNavigate: (s: SidebarSection) => void;
};

export function CockpitSidebar({ active, onNavigate }: CockpitSidebarProps) {
  return (
    <nav
      aria-label="Screeningnavigation"
      className="w-[140px] shrink-0 border-r border-border/40 py-6 flex flex-col gap-1"
    >
      <div className="px-4 mb-4 font-mono text-[11px] tracking-[0.15em] text-muted-foreground/60">
        SCREENING
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
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8ff00]/60 rounded-sm",
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
