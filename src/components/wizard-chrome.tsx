import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/lib/project-store";
import { ArrowLeft } from "lucide-react";

const STEPS = [
  { path: "/", index: 0 },
  { path: "/projekt/adresse", index: 1 },
  { path: "/projekt/compliance", index: 2 },
  { path: "/projekt/beskrivelse", index: 3 },
  { path: "/projekt/brief", index: 4 },
];

function currentIndex(pathname: string) {
  const match = STEPS.slice().reverse().find((s) => pathname === s.path);
  return match?.index ?? 0;
}

export function StepDots() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { address, complianceDone, project, briefDone } = useProject();

  const completed = [
    true, // welcome always done
    !!address,
    complianceDone,
    !!project.description || !!project.area,
    briefDone,
  ];

  const active = currentIndex(pathname);

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const isActive = i === active;
        const isCompleted = completed[i] && !isActive;
        const clickable = completed[i];
        return (
          <button
            key={s.path}
            disabled={!clickable}
            onClick={() => clickable && navigate({ to: s.path })}
            aria-label={`Trin ${i + 1}`}
            className={[
              "rounded-full transition-all duration-300",
              isActive
                ? "w-2.5 h-2.5 bg-accent"
                : isCompleted
                ? "w-2 h-2 bg-foreground hover:scale-125 cursor-pointer"
                : "w-2 h-2 bg-[#333333] cursor-not-allowed",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
        <Link
          to="/"
          className="font-mono text-sm tracking-[0.2em] text-accent"
        >
          ARCHAI
        </Link>
        <StepDots />
        <div className="w-[72px]" />
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
