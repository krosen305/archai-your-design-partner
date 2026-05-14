// AI-design hero — øverst i cockpit. Lader brugeren uploade inspiration,
// beskrive sit drømmehus med fritekst, og generere 3 visuelle forslag.

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Upload, X, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import { generateDesignProposals } from "@/lib/ai-design.functions";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

export function AiDesignHero() {
  const { byggeoenske, setByggeoenske } = useProject();
  const [drøm, setDrøm] = useState(byggeoenske.designDroem ?? "");
  const [forslag, setForslag] = useState<string[]>(
    byggeoenske.genererededDesignforslag ?? [],
  );
  const [valgt, setValgt] = useState<string | null>(byggeoenske.valgteDesignforslag ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>(
    byggeoenske.inspirationsbilleder ?? [],
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const dataUrls: string[] = [];
    for (const file of Array.from(files).slice(0, 4 - uploadedImages.length)) {
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      dataUrls.push(b64);
    }
    const next = [...uploadedImages, ...dataUrls];
    setUploadedImages(next);
    setByggeoenske({ inspirationsbilleder: next });
  };

  const removeUpload = (i: number) => {
    const next = uploadedImages.filter((_, idx) => idx !== i);
    setUploadedImages(next);
    setByggeoenske({ inspirationsbilleder: next });
  };

  const handleGenerate = async () => {
    if (!drøm.trim() && uploadedImages.length === 0) {
      setError("Beskriv dit drømmehus eller upload mindst ét inspirationsbillede.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await generateDesignProposals({
        data: {
          prompt: drøm.trim() || "Moderne dansk enfamiliehus",
          inspirationsUrls: uploadedImages.slice(0, 4),
          stil: byggeoenske.arkitektoniskStil,
          facademateriale: byggeoenske.facademateriale,
        },
      });
      setForslag(result.images);
      setByggeoenske({ designDroem: drøm, genererededDesignforslag: result.images });
      syncPatch({
        byggeoenske: {
          ...useProject.getState().byggeoenske,
          designDroem: drøm,
          genererededDesignforslag: result.images,
        },
      });
    } catch (e) {
      logger.warn("[AiDesignHero] generation failed:", e);
      setError("Kunne ikke generere forslag. Prøv igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (url: string) => {
    setValgt(url);
    setByggeoenske({ valgteDesignforslag: url });
    syncPatch({
      byggeoenske: { ...useProject.getState().byggeoenske, valgteDesignforslag: url },
    });
  };

  return (
    <Card className="p-0 overflow-hidden mb-6 border-accent/30 bg-gradient-to-br from-[#0c0c0c] to-[#141414]">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <div className="font-mono text-[11px] tracking-[0.2em] text-accent">DRØM DIT HJEM</div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] items-start">
        <div className="space-y-3 min-w-0">
          <Textarea
            value={drøm}
            onChange={(e) => setDrøm(e.target.value)}
            placeholder="Beskriv dit drømmehus — fx 'lyst skandinavisk minimalistisk hus med store glaspartier mod haven, sortmalet træfacade og fladt tag…'"
            className="min-h-[88px] bg-[#0a0a0a] border-border/60 text-sm"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadedImages.length >= 4}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent/50 transition-colors disabled:opacity-50"
            >
              <Upload size={12} /> Inspiration ({uploadedImages.length}/4)
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {uploadedImages.map((src, i) => (
              <div
                key={i}
                className="relative group h-9 w-9 rounded overflow-hidden border border-border/60"
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => removeUpload(i)}
                  className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-foreground"
                  aria-label="Fjern"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          {error && <div className="text-xs text-danger">{error}</div>}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex h-[88px] min-w-[160px] items-center justify-center gap-2 rounded-md bg-accent px-5 font-mono text-sm text-accent-foreground hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Genererer…
            </>
          ) : (
            <>
              <Sparkles size={14} /> Generér 3 forslag
            </>
          )}
        </button>
      </div>

      {forslag.length > 0 && (
        <div className="px-5 pb-5">
          <div className="grid gap-3 md:grid-cols-3">
            {forslag.map((url, i) => {
              const erValgt = valgt === url;
              return (
                <motion.button
                  key={url + i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => handleSelect(url)}
                  className={cn(
                    "relative overflow-hidden rounded-md border-2 transition-all aspect-[4/3] bg-[#111]",
                    erValgt
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border/60 hover:border-accent/60",
                  )}
                >
                  <img src={url} alt={`Forslag ${i + 1}`} className="h-full w-full object-cover" />
                  <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-foreground">
                    FORSLAG {i + 1}
                  </div>
                  {erValgt && (
                    <div className="absolute top-2 right-2 rounded-full bg-accent p-1 text-accent-foreground">
                      <Check size={10} strokeWidth={3} />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
