import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, Lock, AlertTriangle } from "lucide-react";
import { PHASES, usePhaseStates, usePhaseSubKeys, usePhaseClickable } from "@/lib/phases";
import { useProject } from "@/lib/project-store";

export function PhaseSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const states = usePhaseStates(pathname);
  const subKeys = usePhaseSubKeys();
  const allClickable = usePhaseClickable();
  const { address } = useProject();

  const handlePhaseClick = (phaseId: number, route: string) => {
    if (phaseId === 2 && address?.adresseid) {
      navigate({ to: `/projekt/${address.adresseid}/cockpit` as never });
    } else {
      navigate({ to: route });
    }
  };

  return (
    <aside className="hidden xl:flex w-[240px] shrink-0 flex-col border-r border-[#222] bg-[#111111] sticky top-14 self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <nav className="p-5 space-y-5">
        {PHASES.map((p) => {
          const status = states[p.id];
          const clickable = allClickable || status === "active";
          return (
            <div key={p.id}>
              <button
                disabled={!clickable}
                onClick={() => clickable && handlePhaseClick(p.id, p.route)}
                className="flex w-full items-center gap-2.5 text-left disabled:cursor-not-allowed"
              >
                <StatusDot status={status} />
                <span
                  className={`font-mono text-[11px] tracking-[0.12em] ${
                    status === "active" || status === "complete" || status === "warning"
                      ? "text-foreground"
                      : "text-[#777]"
                  }`}
                >
                  FASE {p.id} · {p.label}
                </span>
              </button>
              {(status === "complete" || status === "active" || status === "warning") &&
                subKeys[p.id].length > 0 && (
                  <ul className="mt-2 ml-[14px] space-y-1 border-l border-[#222] pl-3">
                    {subKeys[p.id].map((k) => (
                      <li key={k.label} className="text-[11px] text-muted-foreground leading-tight">
                        <span className="text-[#555]">└ </span>
                        {k.label}: <span className="text-foreground/80">{k.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-black">
        <Check size={10} strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent/30 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-black">
        <AlertTriangle size={9} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#444] bg-[#1a1a1a]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#555]" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#333] text-[#555]">
      <Lock size={9} />
    </span>
  );
}
