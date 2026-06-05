import { Link } from "@tanstack/react-router";
import { LayoutTemplate, Share2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type CockpitHeaderProps = {
  adresse: string;
  adresseId: string;
  projectId: string | undefined;
};

export function CockpitHeader({ adresse, adresseId, projectId }: CockpitHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
      <span className="text-sm text-foreground truncate max-w-[50%]">{adresse}</span>
      <div className="flex items-center gap-2">
        <Link
          to="/projekt/$id/plantegning"
          params={{ id: adresseId }}
          search={{ projectId }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5",
            "font-mono text-[11px] tracking-[0.1em] text-foreground hover:bg-[#1a1a1a] transition-colors",
          )}
        >
          <LayoutTemplate size={12} />
          Plantegning
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Del projekt"
        >
          <Share2 size={12} />
          Del
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center size-8 rounded-md border border-border/60 bg-[#111] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Flere handlinger"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </header>
  );
}
