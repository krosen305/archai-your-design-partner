import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, AlertTriangle, Menu, LogOut, FolderOpen, LogIn } from "lucide-react";
import { PHASES, usePhaseStates, usePhaseSubKeys, type PhaseStatus } from "@/lib/phases";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

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
            onClick={() => navigate({ to: p.route })}
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
    cls = "border border-[#2a2a2a] text-[#555] hover:border-[#444] hover:text-[#888]";
  }

  return (
    <button onClick={onClick} aria-label={`Fase ${id}: ${label}`} className={`${base} ${cls}`}>
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
  const { user } = useAuth();
  const logoTo = user ? "/projekt/start" : "/";
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <MobileMenu />
          <Link to={logoTo} className="font-mono text-sm tracking-[0.2em] text-accent">
            ARCHAI
          </Link>
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <PhaseBar />
          <MobilePhaseBar />
        </div>
        <div className="shrink-0 flex items-center justify-end min-w-[72px]">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function MobileMenu() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const states = usePhaseStates(pathname);
  const subKeys = usePhaseSubKeys();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Åbn menu"
          className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
        >
          <Menu size={16} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] bg-[#0c0c0c] border-r border-[#222]">
        <SheetHeader>
          <SheetTitle className="font-mono text-[11px] tracking-[0.2em] text-accent text-left">
            ARCHAI
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div>
            <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-3">
              FASEOVERSIGT
            </div>
            <nav className="space-y-3">
              {PHASES.map((p) => {
                const status = states[p.id];
                return (
                  <div key={p.id}>
                    <SheetClose asChild>
                      <button
                        onClick={() => navigate({ to: p.route })}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        {status === "complete" ? (
                          <Check size={12} className="text-accent" />
                        ) : status === "active" ? (
                          <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
                        ) : (
                          <span className="inline-flex h-2 w-2 rounded-full border border-[#444]" />
                        )}
                        <span
                          className={`font-mono text-[11px] tracking-[0.1em] ${
                            status === "locked" ? "text-[#555]" : "text-foreground"
                          }`}
                        >
                          FASE {p.id} · {p.label}
                        </span>
                      </button>
                    </SheetClose>
                    {(status === "complete" || status === "active") && subKeys[p.id].length > 0 && (
                      <ul className="mt-1.5 ml-[18px] space-y-0.5 border-l border-[#222] pl-2.5">
                        {subKeys[p.id].map((k) => (
                          <li key={k.label} className="text-[10px] text-muted-foreground">
                            {k.label}: <span className="text-foreground/80">{k.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-[#222] pt-4 space-y-1">
            {!loading && user && (
              <>
                <SheetClose asChild>
                  <Link
                    to="/projekt/start"
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-[#1a1a1a] transition-colors"
                  >
                    <FolderOpen size={14} />
                    Mine projekter
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-[#1a1a1a] transition-colors"
                  >
                    <LogOut size={14} />
                    Log ud
                  </button>
                </SheetClose>
              </>
            )}
            {!loading && !user && (
              <SheetClose asChild>
                <Link
                  to="/"
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-[#1a1a1a] transition-colors"
                >
                  <LogIn size={14} />
                  Log ind
                </Link>
              </SheetClose>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
