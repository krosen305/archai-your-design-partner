import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DetailsAccordion, type DetailsSection } from "@/components/cockpit/DetailsAccordion";

/**
 * Side-drawer der huser alle dybdedata (lokalplaner, geoteknik, terræn, servitutter,
 * fjernvarme, naboer, AI byggeanalyse, AI design, ejendomsvurdering).
 * Default lukket — udløses af "Detaljer →" i StatusStripe og "Åbn dybdedata →" i RisikoFeed.
 */
export function DetailsDrawer({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sections: DetailsSection[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto bg-background p-0"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur px-6 py-4">
          <SheetTitle className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Dybdedata & dokumentation
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 py-4">
          <DetailsAccordion sections={sections} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
