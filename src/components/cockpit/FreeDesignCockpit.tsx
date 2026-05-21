import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { AiDesignHero } from "@/components/cockpit/AiDesignHero";
import { estimerTotalpris, STEPS, STEP_GROUPS } from "@/lib/byggeoenske-steps";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// FreeDesignCockpit — shown when no address is set
// ---------------------------------------------------------------------------

function FreeDesignCockpit() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>

        <div className="mb-6">
          <div className="font-mono text-[10px] tracking-[0.2em] text-accent mb-1">
            DESIGN UDEN GRUND
          </div>
          <h1 className="text-[24px] font-medium text-foreground">Drøm dit hjem</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uden adresse viser vi ikke compliance-data. Tilføj en adresse senere for at se
            byggeretten på en konkret matrikel.
          </p>
        </div>

        <AiDesignHero />

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(280px,360px)]">
          <FreeByggeoenskeAccordion />
          <FreeBudgetEstimat />
        </div>
      </div>
    </PageTransition>
  );
}

function FreeByggeoenskeAccordion() {
  const { byggeoenske, setByggeoenske } = useProject();
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
        BYGGEØNSKER
      </div>
      <Accordion type="multiple" defaultValue={["Grundlæggende"]} className="px-2">
        {STEP_GROUPS.map((group) => {
          const groupSteps = STEPS.filter((s) => s.group === group);
          if (groupSteps.length === 0) return null;
          return (
            <AccordionItem key={group} value={group} className="border-border/40">
              <AccordionTrigger className="px-2 hover:no-underline">
                <span className="text-sm font-medium">{group}</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-3">
                <div className="space-y-3">
                  {groupSteps.map((step) => {
                    const value = byggeoenske[step.key];
                    if (step.type === "choice") {
                      return (
                        <div key={step.key as string}>
                          <label className="block text-[11px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                            {step.title}
                          </label>
                          <select
                            value={value === undefined ? "" : String(value)}
                            onChange={(e) => {
                              const opt = step.options!.find(
                                (o) => String(o.value) === e.target.value,
                              );
                              if (opt) setByggeoenske({ [step.key]: opt.value } as never);
                            }}
                            className="w-full rounded-md border border-border/60 bg-[#111] px-3 py-2 font-mono text-xs text-foreground"
                          >
                            <option value="" disabled>
                              Vælg…
                            </option>
                            {step.options!.map((o) => (
                              <option key={String(o.value)} value={String(o.value)}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (step.type === "number") {
                      const v = (value as number) ?? step.min!;
                      return (
                        <div key={step.key as string}>
                          <div className="flex items-baseline justify-between mb-1">
                            <label className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                              {step.title}
                            </label>
                            <span className="font-mono text-sm text-accent">
                              {v}
                              {step.unit ? ` ${step.unit}` : ""}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={step.min}
                            max={step.max}
                            value={v}
                            onChange={(e) =>
                              setByggeoenske({
                                [step.key]: Number(e.target.value),
                              } as never)
                            }
                            className="w-full accent-accent"
                          />
                        </div>
                      );
                    }
                    if (step.type === "toggle") {
                      return (
                        <div key={step.key as string} className="flex items-center justify-between">
                          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                            {step.title}
                          </span>
                          <div className="flex gap-1">
                            {[true, false].map((b) => (
                              <button
                                key={String(b)}
                                onClick={() => setByggeoenske({ [step.key]: b } as never)}
                                className={cn(
                                  "rounded-md border px-3 py-1 font-mono text-xs",
                                  value === b
                                    ? "border-accent bg-accent/10 text-accent"
                                    : "border-border/60 text-foreground",
                                )}
                              >
                                {b ? "Ja" : "Nej"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
}

function FreeBudgetEstimat() {
  const { byggeoenske } = useProject();
  const totalpris = estimerTotalpris(byggeoenske);
  return (
    <Card className="p-0 overflow-hidden h-fit">
      <div className="px-4 py-3 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
        ESTIMERET TOTALPRIS
      </div>
      <div className="p-4">
        {totalpris === null ? (
          <div className="text-sm text-muted-foreground">Vælg areal for at estimere</div>
        ) : (
          <>
            <div className="font-mono text-[28px] leading-none font-bold text-accent tabular-nums">
              {totalpris >= 1_000_000
                ? `${(totalpris / 1_000_000).toFixed(2)} mio. kr`
                : `${totalpris.toLocaleString("da-DK")} kr`}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              ~{Math.round(totalpris / (byggeoenske.oensketAreal ?? 1)).toLocaleString("da-DK")}{" "}
              kr/m² · ekskl. grundkøb
            </div>
          </>
        )}
        <div className="mt-4 pt-4 border-t border-border/40 text-[11px] text-muted-foreground">
          Tilføj en adresse for at se compliance, lokalplan og ejendomsdata.
        </div>
      </div>
    </Card>
  );
}

export { FreeDesignCockpit, FreeByggeoenskeAccordion, FreeBudgetEstimat };
