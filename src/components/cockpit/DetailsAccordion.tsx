import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ReactNode } from "react";

export type DetailsSection = {
  id: string;
  label: string;
  badge?: ReactNode;
  content: ReactNode;
};

/**
 * Folder for tunge sektioner i AnalyseTab (lokalplaner, save, geoteknik, terræn,
 * servitutter, fjernvarme, naboer, AI byggeanalyse, AI design).
 *
 * Workspace + ComplianceFeed forbliver synlige i toppen — alt det dybe
 * dokumentationsmateriale ligger her, default kollapset, så fokus er på
 * "design + instant feedback".
 */
export function DetailsAccordion({ sections }: { sections: DetailsSection[] }) {
  const visible = sections.filter((s) => s.content);
  if (visible.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border border-border/40 bg-[#0e0e0e]/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
        DYBDEDATA & DOKUMENTATION
      </div>
      <Accordion type="multiple" className="px-2">
        {visible.map((s) => (
          <AccordionItem key={s.id} value={s.id} className="border-border/30 last:border-b-0">
            <AccordionTrigger className="px-2 hover:no-underline">
              <span className="flex items-center gap-2 text-left">
                <span className="font-mono text-[11px] tracking-[0.12em] text-foreground">
                  {s.label}
                </span>
                {s.badge}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-3">{s.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
