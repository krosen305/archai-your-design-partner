import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Lock, AlertTriangle } from "lucide-react";
import { PHASES, usePhaseStates, type PhaseStatus } from "@/lib/phases";

export function PhaseBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const states = usePhaseStates(pathname);

  return (
    <div className="hidden md:flex items-center gap-1.5">
      {PHASES.map((p, i) => (
        <div key={p.id} className="flex items-center gap-1.5">
          <PhaseChip
            id={p.id}
            label={p.label}
            status={states[p.id]}
            onClick={() => {
              if (states[p.id] === "complete" || states[p.id] === "active") {
                navigate({ to: p.route });
              }
            }}
          />
          {i < PHASES.length - 1 && <span className="text-[10px] text-[#444]">→</span>}
        </div>
      ))}
    </div>
  );
}

function PhaseChip({
  id,
  label,
  status,
  onClick,
}: {
  id: number;
  label: string;
  status: PhaseStatus;
  onClick: () => void;
}) {
  const clickable = status === "complete" || status === "active";
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] transition-colors";

  let cls = "";
  let icon: React.ReactNode = null;

  if (status === "complete") {
    cls = "bg-accent text-accent-foreground hover:brightness-110";
    icon = <Check size={11} strokeWidth={2.5} />;
  } else if (status === "active") {
    cls = "border border-accent text-foreground";
    icon = (
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    );
  } else if (status === "error") {
    cls = "border border-danger text-danger";
    icon = <AlertTriangle size={11} />;
  } else {
    cls = "border border-[#333] text-[#555] cursor-not-allowed";
    icon = <Lock size={10} />;
  }

  return (
    <button
      disabled={!clickable}
      onClick={onClick}
      aria-label={`Fase ${id}: ${label}`}
      className={`${base} ${cls}`}
    >
      {icon}
      <span>
        FASE {id}: {label}
      </span>
    </button>
  );
}

/** Mobil-collapser: vises kun <md. */
export function MobilePhaseBar() {
  const { pathname } = useLocation();
  const states = usePhaseStates(pathname);
  const activePhase = PHASES.find((p) => states[p.id] === "active") ?? PHASES[0];
  const completedCount = PHASES.filter((p) => states[p.id] === "complete").length;
  const pct = ((completedCount + 0.5) / PHASES.length) * 100;

  return (
    <div className="md:hidden flex flex-col gap-1.5 flex-1 mx-3">
      <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground text-center">
        FASE {activePhase.id} AF {PHASES.length} · {activePhase.label}
      </div>
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-[#222]">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 gap-4">
        <Link to="/" className="font-mono text-sm tracking-[0.2em] text-accent shrink-0">
          ARCHAI
        </Link>
        <div className="flex-1 flex justify-center min-w-0">
          <PhaseBar />
          <MobilePhaseBar />
        </div>
        <div className="w-[72px] hidden md:block shrink-0" />
      </div>
    </header>
  );
}

export function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft size={14} />
      Tilbage
    </Link>
  );
}
