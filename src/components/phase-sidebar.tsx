import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";
import { PHASES, usePhaseStates, usePhaseSubKeys } from "@/lib/phases";

export function PhaseSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const states = usePhaseStates(pathname);
  const subKeys = usePhaseSubKeys();

  return (
    <aside className="hidden xl:flex w-[240px] shrink-0 flex-col border-r border-[#222] bg-[#111111] sticky top-14 self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <nav className="p-5 space-y-5">
        {PHASES.map((p) => {
          const status = states[p.id];
          const clickable = status === "complete" || status === "active";
          return (
            <div key={p.id}>
              <button
                disabled={!clickable}
                onClick={() => clickable && navigate({ to: p.route })}
                className="flex w-full items-center gap-2.5 text-left disabled:cursor-not-allowed"
              >
                <StatusDot status={status} />
                <span
                  className={`font-mono text-[11px] tracking-[0.12em] ${
                    status === "active"
                      ? "text-foreground"
                      : status === "complete"
                      ? "text-foreground"
                      : "text-[#555]"
                  }`}
                >
                  FASE {p.id} · {p.label}
                </span>
              </button>
              {(status === "complete" || status === "active") &&
                subKeys[p.id].length > 0 && (
                  <ul className="mt-2 ml-[14px] space-y-1 border-l border-[#222] pl-3">
                    {subKeys[p.id].map((k) => (
                      <li
                        key={k.label}
                        className="text-[11px] text-muted-foreground leading-tight"
                      >
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
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
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
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#333] text-[#555]">
      <Lock size={9} />
    </span>
  );
}
