import { useNavigate } from "@tanstack/react-router";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export function PhaseComingSoon({
  step,
  title,
  subtitle,
  bullets,
  backTo,
}: {
  step: number;
  title: string;
  subtitle: string;
  bullets: string[];
  backTo: string;
}) {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to={backTo} />
        </div>
        <StepHeader step={step} total={5} title={title} subtitle={subtitle} />

        <Card className="text-center">
          <span className="inline-block font-mono text-[10px] tracking-[0.2em] border border-accent/40 text-accent rounded px-2 py-1 mb-5">
            KOMMER SNART
          </span>
          <p className="text-sm text-muted-foreground mb-4">Denne fase automatiserer:</p>
          <ul className="space-y-2 text-left max-w-[420px] mx-auto">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-foreground">
                <span className="text-accent">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate({ to: backTo })}
            className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-6 py-3 font-mono text-sm text-foreground hover:bg-[#1A1A1A] transition-colors"
          >
            Gå tilbage
          </button>
          <button
            disabled
            className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground opacity-30 cursor-not-allowed"
          >
            Fortsæt →
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
