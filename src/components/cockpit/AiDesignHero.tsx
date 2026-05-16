// AI-design hero - oeverst i cockpit. Lader brugeren uploade inspiration,
// beskrive sit droemmehus med fritekst, analysere billeder og generere forslag.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Upload, X, Check, Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { Textarea } from "@/components/ui/textarea";
import { getSession } from "@/lib/auth";
import { useProject, type Byggeoenske } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import { generateDesignProposals } from "@/lib/ai-design.functions";
import { uploadBillede, analyserBillederFn } from "@/lib/billede-analyse.functions";
import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

type AnalyseState =
  | "idle"
  | "uploading"
  | "ready"
  | "analysing"
  | "conflict"
  | "validated"
  | "saved"
  | "error";

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

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase("da-DK");
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }

  return next;
}

function removeTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: current.kategorier[kategori].filter((t) => t !== tag),
    },
  };
}

function addTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  const nextTag = tag.trim();
  if (!nextTag) return current;

  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: uniqueTags([...current.kategorier[kategori], nextTag]),
    },
  };
}

function resolveKonflikt(
  kategori: keyof BilledeAnalyseKategorier,
  valgteTags: string[],
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: uniqueTags([...current.kategorier[kategori], ...valgteTags]),
    },
    konflikter: current.konflikter.filter((konflikt) => konflikt.kategori !== kategori),
  };
}

function removeExtraTag(tag: string, current: BilledeAnalyseResultat): BilledeAnalyseResultat {
  return {
    ...current,
    ekstraTags: current.ekstraTags.filter((t) => t !== tag),
  };
}

function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function getUploadMimeType(file: File): "image/jpeg" | "image/png" | null {
  if (file.type === "image/jpeg" || file.type === "image/png") return file.type;
  return null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AiDesignHero() {
  const { byggeoenske, setByggeoenske, complianceFlags, billedanalyse, setBilledanalyse } =
    useProject();
  // ARCH-172: Rule 1 gate - ingen AI-design ved aktive compliance-stop.
  const hasHardStop = complianceFlags.some((f) => f.status === "blocker");
  const analyseableImageCount = (byggeoenske.inspirationsbilleder ?? []).filter(
    isRemoteImageUrl,
  ).length;

  const [droem, setDroem] = useState(byggeoenske.designDroem ?? "");
  const [forslag, setForslag] = useState<string[]>(byggeoenske.genererededDesignforslag ?? []);
  const [valgt, setValgt] = useState<string | null>(byggeoenske.valgteDesignforslag ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>(
    byggeoenske.inspirationsbilleder ?? [],
  );
  const [analyseState, setAnalyseState] = useState<AnalyseState>(
    billedanalyse ? "saved" : analyseableImageCount > 0 ? "ready" : "idle",
  );
  const [analyse, setAnalyse] = useState<BilledeAnalyseResultat | null>(billedanalyse);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!billedanalyse) return;
    setAnalyse(billedanalyse);
    setAnalyseState("saved");
  }, [billedanalyse]);

  const commitByggeoenskePatch = (patch: Partial<Byggeoenske>) => {
    const next = { ...useProject.getState().byggeoenske, ...patch };
    setByggeoenske(patch);
    void syncPatch({ byggeoenske: next });
    return next;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const availableSlots = Math.max(0, 4 - uploadedImages.length);
    if (availableSlots === 0) return;

    const projectId = useProject.getState().currentProjectId;
    if (!projectId) {
      setUploadError("Projektet er ikke klar til upload endnu. Prøv igen om et øjeblik.");
      setAnalyseState("error");
      return;
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots);
    const unsupportedFile = selectedFiles.find((file) => !getUploadMimeType(file));
    if (unsupportedFile) {
      setUploadError("Upload kun JPG- eller PNG-billeder.");
      setAnalyseState("error");
      return;
    }

    const session = await getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setUploadError("Du skal være logget ind for at uploade inspirationsbilleder.");
      setAnalyseState("error");
      return;
    }

    setAnalyse(null);
    setError(null);
    setUploadError(null);
    setAnalyseState("uploading");

    const startCount = uploadedImages.length;
    const newSignedUrls: string[] = [];
    const newPaths: string[] = [];

    try {
      for (const file of selectedFiles) {
        const mimeType = getUploadMimeType(file);
        if (!mimeType) continue;

        const dataUrl = await fileToDataUrl(file);
        setUploadedImages((prev) => [...prev, dataUrl]);

        const { signedUrl, path } = await uploadBillede({
          data: {
            base64: dataUrl.split(",")[1] ?? "",
            mimeType,
            projektId: projectId,
            accessToken,
          },
        });

        newSignedUrls.push(signedUrl);
        newPaths.push(path);
      }
    } catch (e) {
      logger.warn("[AiDesignHero] upload failed:", e);
      setUploadedImages((prev) => prev.slice(0, startCount + newSignedUrls.length));

      if (newSignedUrls.length > 0) {
        const current = useProject.getState().byggeoenske;
        commitByggeoenskePatch({
          inspirationsbilleder: [...(current.inspirationsbilleder ?? []), ...newSignedUrls],
          inspirationsbilledePaths: [...(current.inspirationsbilledePaths ?? []), ...newPaths],
        });
      }

      setUploadError("Upload fejlede. Prøv igen.");
      setAnalyseState("error");
      return;
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }

    if (newSignedUrls.length === 0) {
      setAnalyseState(analyseableImageCount > 0 ? "ready" : "idle");
      return;
    }

    const current = useProject.getState().byggeoenske;
    commitByggeoenskePatch({
      inspirationsbilleder: [...(current.inspirationsbilleder ?? []), ...newSignedUrls],
      inspirationsbilledePaths: [...(current.inspirationsbilledePaths ?? []), ...newPaths],
    });
    setAnalyseState("ready");
  };

  const removeUpload = (index: number) => {
    const nextImages = uploadedImages.filter((_, idx) => idx !== index);
    const current = useProject.getState().byggeoenske;
    const nextUrls = (current.inspirationsbilleder ?? []).filter((_, idx) => idx !== index);
    const nextPaths = (current.inspirationsbilledePaths ?? []).filter((_, idx) => idx !== index);

    setUploadedImages(nextImages);
    setAnalyse(null);
    setUploadError(null);
    commitByggeoenskePatch({
      inspirationsbilleder: nextUrls,
      inspirationsbilledePaths: nextPaths,
    });
    setAnalyseState(nextUrls.filter(isRemoteImageUrl).length > 0 ? "ready" : "idle");
  };

  const handleAnalyser = async () => {
    const signedUrls = (useProject.getState().byggeoenske.inspirationsbilleder ?? [])
      .filter(isRemoteImageUrl)
      .slice(0, 4);
    if (signedUrls.length === 0) return;

    setAnalyseState("analysing");
    setUploadError(null);

    try {
      const result = await analyserBillederFn({ data: { billedUrls: signedUrls } });
      setAnalyse(result);
      setAnalyseState(result.konflikter.length > 0 ? "conflict" : "validated");
    } catch (e) {
      logger.warn("[AiDesignHero] billedanalyse failed:", e);
      setUploadError("Analyse fejlede. Prøv igen.");
      setAnalyseState("error");
    }
  };

  const handleGem = () => {
    if (!analyse || analyse.konflikter.length > 0) return;
    setBilledanalyse(analyse);
    void syncPatch({ billedanalyse: analyse });
    setAnalyseState("saved");
  };

  const handleGenerate = async () => {
    if (!droem.trim() && uploadedImages.length === 0) {
      setError("Beskriv dit drømmehus eller upload mindst ét inspirationsbillede.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const remoteImages = (useProject.getState().byggeoenske.inspirationsbilleder ?? []).filter(
        isRemoteImageUrl,
      );
      const result = await generateDesignProposals({
        data: {
          prompt: droem.trim() || "Moderne dansk enfamiliehus",
          inspirationsUrls: (remoteImages.length > 0 ? remoteImages : uploadedImages).slice(0, 4),
          stil: byggeoenske.arkitektoniskStil,
          facademateriale: byggeoenske.facademateriale,
          hasHardStop,
        },
      });
      setForslag(result.images);
      commitByggeoenskePatch({
        designDroem: droem,
        genererededDesignforslag: result.images,
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
    commitByggeoenskePatch({ valgteDesignforslag: url });
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
                      onClick={() => {
                        const updated = resolveKonflikt(konflikt.kategori, tags, analyse);
                        setAnalyse(updated);
                        setAnalyseState(updated.konflikter.length > 0 ? "conflict" : "validated");
                      }}
                      disabled={analyseState === "saved"}
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

            {ANALYSE_KATEGORIER.filter((kategori) => analyse.kategorier[kategori].length > 0).map(
              (kategori) => (
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
                        {analyseState !== "saved" && (
                          <button
                            type="button"
                            onClick={() => setAnalyse(removeTag(kategori, tag, analyse))}
                            className="opacity-60 hover:opacity-100 ml-0.5"
                            aria-label={`Fjern ${tag}`}
                          >
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    ))}
                    {analyseState !== "saved" && (
                      <input
                        type="text"
                        placeholder="+ tilføj"
                        className="w-24 bg-transparent font-mono text-[11px] text-muted-foreground border-b border-border/40 focus:outline-none focus:border-accent/60 pb-0.5"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const value = e.currentTarget.value.trim();
                          if (!value) return;
                          setAnalyse(addTag(kategori, value, analyse));
                          e.currentTarget.value = "";
                        }}
                      />
                    )}
                  </div>
                </div>
              ),
            )}

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
                      {analyseState !== "saved" && (
                        <button
                          type="button"
                          onClick={() => setAnalyse(removeExtraTag(tag, analyse))}
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

            {analyseState !== "saved" ? (
              <button
                type="button"
                onClick={handleGem}
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
