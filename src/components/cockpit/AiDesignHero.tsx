import { useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, Upload, X, Check, Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { Textarea } from "@/components/ui/textarea";
import { useAiDesignWorkflow } from "@/hooks/useAiDesignWorkflow";
import { cn } from "@/lib/utils";
import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";

const ANALYSE_KATEGORIER = [
  "facade",
  "tagform",
  "vinduer",
  "materialer",
  "saerligeTraek",
  "farver",
  "stil",
] as const satisfies readonly (keyof BilledeAnalyseKategorier)[];

const KATEGORI_LABELS: Record<keyof BilledeAnalyseKategorier, string> = {
  facade: "Facade",
  tagform: "Tagform",
  vinduer: "Vinduer",
  materialer: "Materialer",
  saerligeTraek: "Særlige træk",
  farver: "Farver",
  stil: "Stil",
};

export function AiDesignHero() {
  const {
    droem,
    uploadedImages,
    analyseState,
    analyse,
    forslag,
    valgt,
    uploadError,
    error,
    loading,
    hasHardStop,
    analyseableImageCount,
    setDroem,
    handleFiles,
    removeUpload,
    handleAnalyser,
    handleGem,
    handleGenerate,
    handleSelect,
    resolveKonfliktAction,
    addTagAction,
    removeTagAction,
    removeExtraTagAction,
  } = useAiDesignWorkflow();

  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="p-0 overflow-hidden mb-6 border-accent/30 bg-gradient-to-br from-[#0c0c0c] to-[#141414]">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <div className="font-mono text-[11px] tracking-[0.2em] text-accent">DRØM DIT HJEM</div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] items-start">
        <div className="space-y-3 min-w-0">
          <Textarea
            value={droem}
            onChange={(e) => setDroem(e.target.value)}
            placeholder="Beskriv dit drømmehus - fx 'lyst skandinavisk minimalistisk hus med store glaspartier mod haven, sortmalet træfacade og fladt tag...'"
            className="min-h-[88px] bg-[#0a0a0a] border-border/60 text-sm"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadedImages.length >= 4 || analyseState === "uploading"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent/50 transition-colors disabled:opacity-50"
            >
              {analyseState === "uploading" ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Uploader...
                </>
              ) : (
                <>
                  <Upload size={12} /> Inspiration ({uploadedImages.length}/4)
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleAnalyser}
              disabled={analyseState !== "ready" || analyseableImageCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent/50 transition-colors disabled:opacity-50"
            >
              {analyseState === "analysing" ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Analyserer...
                </>
              ) : (
                <>
                  <Sparkles size={12} /> Analyser billeder
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {uploadedImages.map((src, i) => (
              <div
                key={src + i}
                className="relative group h-9 w-9 rounded overflow-hidden border border-border/60"
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeUpload(i)}
                  className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-foreground"
                  aria-label="Fjern billede"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          {uploadError && <div className="text-xs text-danger">{uploadError}</div>}
          {error && <div className="text-xs text-danger">{error}</div>}
        </div>

        {hasHardStop ? (
          <div className="inline-flex h-[88px] min-w-[160px] items-center justify-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 font-mono text-xs text-danger text-center leading-snug">
            <ShieldAlert size={14} className="shrink-0" />
            <span>
              Design blokeret
              <br />
              af compliance-stop
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex h-[88px] min-w-[160px] items-center justify-center gap-2 rounded-md bg-accent px-5 font-mono text-sm text-accent-foreground hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Genererer...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generér 3 forslag
              </>
            )}
          </button>
        )}
      </div>

      {analyse &&
        (analyseState === "conflict" ||
          analyseState === "validated" ||
          analyseState === "saved") && (
          <AnalysePanel
            analyse={analyse}
            analyseState={analyseState}
            onResolveKonflikt={resolveKonfliktAction}
            onAddTag={addTagAction}
            onRemoveTag={removeTagAction}
            onRemoveExtraTag={removeExtraTagAction}
            onGem={handleGem}
          />
        )}

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

function AnalysePanel({
  analyse,
  analyseState,
  onResolveKonflikt,
  onAddTag,
  onRemoveTag,
  onRemoveExtraTag,
  onGem,
}: {
  analyse: BilledeAnalyseResultat;
  analyseState: string;
  onResolveKonflikt: (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => void;
  onAddTag: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  onRemoveTag: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  onRemoveExtraTag: (tag: string) => void;
  onGem: () => void;
}) {
  const isSaved = analyseState === "saved";

  return (
    <div className="px-5 pb-5 space-y-4">
      {analyse.konflikter.map((konflikt) => (
        <div
          key={konflikt.kategori}
          className="rounded-md border border-warning/40 bg-warning/5 p-4"
        >
          <div className="font-mono text-[10px] text-warning uppercase tracking-wider mb-2">
            Dine billeder trækker i to retninger for{" "}
            <span className="text-foreground">{KATEGORI_LABELS[konflikt.kategori]}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {konflikt.muligheder.map((tags, i) => (
              <button
                key={`${konflikt.kategori}-${i}`}
                type="button"
                onClick={() => onResolveKonflikt(konflikt.kategori, tags)}
                disabled={isSaved}
                className="rounded-md border border-border/60 bg-[#111] p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-60"
              >
                <div className="font-mono text-[11px] text-foreground mb-1">
                  Retning {String.fromCharCode(65 + i)}
                </div>
                <div className="text-xs text-muted-foreground">{tags.join(" · ")}</div>
                <div className="font-mono text-[10px] text-muted-foreground/60 mt-1">
                  {konflikt.billedAntal[i] ?? 0} billede
                  {(konflikt.billedAntal[i] ?? 0) !== 1 ? "r" : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {ANALYSE_KATEGORIER.filter((k) => analyse.kategorier[k].length > 0).map((kategori) => (
        <div key={kategori}>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            {KATEGORI_LABELS[kategori]}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {analyse.kategorier[kategori].map((tag) => (
              <span
                key={`${kategori}-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent"
              >
                {tag}
                {!isSaved && (
                  <button
                    type="button"
                    onClick={() => onRemoveTag(kategori, tag)}
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Fjern ${tag}`}
                  >
                    <X size={9} />
                  </button>
                )}
              </span>
            ))}
            {!isSaved && (
              <input
                type="text"
                placeholder="+ tilføj"
                className="w-24 bg-transparent font-mono text-[11px] text-muted-foreground border-b border-border/40 focus:outline-none focus:border-accent/60 pb-0.5"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const value = e.currentTarget.value.trim();
                  if (!value) return;
                  onAddTag(kategori, value);
                  e.currentTarget.value = "";
                }}
              />
            )}
          </div>
        </div>
      ))}

      {analyse.ekstraTags.length > 0 && (
        <div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Yderligere detaljer
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analyse.ekstraTags.map((tag) => (
              <span
                key={`extra-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-[#111] px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {tag}
                {!isSaved && (
                  <button
                    type="button"
                    onClick={() => onRemoveExtraTag(tag)}
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Fjern ${tag}`}
                  >
                    <X size={9} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isSaved ? (
        <button
          type="button"
          onClick={onGem}
          disabled={analyse.konflikter.length > 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-mono text-[11px] text-accent-foreground hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={12} /> Gem analyse
        </button>
      ) : (
        <div className="font-mono text-[11px] text-accent flex items-center gap-1.5">
          <Check size={12} /> Analyse gemt
        </div>
      )}
    </div>
  );
}
