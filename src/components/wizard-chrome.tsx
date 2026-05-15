import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Menu, LogOut, FolderOpen, LogIn, Check, Lock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import { useProject } from "@/lib/project-store";
import { PHASES, usePhaseStates, type PhaseStatus, type PhaseId } from "@/lib/phases";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

export function TopBar() {
  const { user } = useAuth();
  const { address } = useProject();
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

        {/* Projekt-kontekst (adresse) */}
        <div className="flex-1 flex justify-center min-w-0">
          {address?.adresse && (
            <div className="hidden md:flex items-center gap-2 truncate">
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                PROJEKT
              </span>
              <span className="text-sm text-foreground truncate max-w-[420px]">
                {address.adresse.split(",")[0]}
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end min-w-[72px]">
          <UserMenu />
        </div>
      </div>

      {/* PhaseRail — vises kun når adresse er valgt */}
      {address?.adresseid && <PhaseRail />}
    </header>
  );
}

function PhaseRail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const states = usePhaseStates(pathname);
  const { address } = useProject();

  const handleClick = (phaseId: PhaseId, route: string) => {
    if (phaseId === 2 && address?.adresseid) {
      navigate({ to: `/projekt/${address.adresseid}/cockpit` as never });
    } else {
      navigate({ to: route });
    }
  };

  return (
    <div className="border-t border-border/40 bg-[#0c0c0c]/60">
      <div className="mx-auto max-w-[1400px] px-6">
        <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-thin">
          {PHASES.map((p, idx) => {
            const status = states[p.id];
            const isActive = status === "active";
            return (
              <div key={p.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleClick(p.id, p.route)}
                  className={`group flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
                    isActive ? "bg-accent/10" : "hover:bg-[#1a1a1a]"
                  }`}
                >
                  <PhaseDot status={status} />
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-[10px] tracking-[0.15em] ${
                        isActive ? "text-accent" : "text-muted-foreground"
                      }`}
                    >
                      0{p.id}
                    </span>
                    <span
                      className={`text-[12px] ${
                        isActive
                          ? "text-foreground"
                          : status === "complete" || status === "warning"
                            ? "text-foreground/80"
                            : "text-muted-foreground"
                      }`}
                    >
                      {p.shortLabel}
                    </span>
                  </div>
                </button>
                {idx < PHASES.length - 1 && (
                  <span className="text-[#333] text-xs select-none" aria-hidden>
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function PhaseDot({ status }: { status: PhaseStatus }) {
  if (status === "complete") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-black">
        <Check size={8} strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent/30 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-500 text-black">
        <AlertTriangle size={8} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#444] bg-[#1a1a1a]">
        <span className="h-1 w-1 rounded-full bg-[#555]" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#333] text-[#555]">
      <Lock size={7} />
    </span>
  );
}

function MobileMenu() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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

        <div className="mt-6 space-y-1">
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
