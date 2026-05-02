import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, X, Sparkles, Pencil } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { useProject, type HusDna } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import type { HusDnaInput, HusDnaResult } from "@/integrations/ai/hus-dna-generator";
import { syncPatch } from "@/lib/project-sync";

export const Route = createFileRoute("/projekt/boligoenske")({
  component: HusDnaStep,
});

// ---------------------------------------------------------------------------
// Server function — IS_MOCK=true i HusDnaGeneratorService (ARCH-47)
// ---------------------------------------------------------------------------

const generateHusDna = createServerFn({ method: "POST" })
  .inputValidator((data: HusDnaInput) => data)
  .handler(async ({ data }): Promise<HusDnaResult> => {
    const { HusDnaGeneratorService } = await import("@/integrations/ai/hus-dna-generator");
    return HusDnaGeneratorService.generate(data);
  });

function HusDnaStep() {
  const navigate = useNavigate();
  const { husDna, setHusDna } = useProject();
  const [images, setImages] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setHusDna(null);
    try {
      const result = await generateHusDna({
        data: { fritekst: text, billedUrls: images },
      });
      setHusDna(result);
      syncPatch({ husDna: result, currentStep: "compliance" });
    } catch (e) {
      setGenerateError("Generering fejlede – prøv igen.");
      console.error("[HusDna] generering fejlede:", e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>
        <StepHeader
          step={1}
          title="Hvad drømmer du om?"
          subtitle="Upload billeder og beskriv dit projekt — AI genererer dit Hus-DNA."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Venstre: input */}
          <div className="space-y-5">
            <Card>
              <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
                INSPIRATION
              </div>
              <button
                type="button"
                onClick={() => {
                  if (images.length >= 8) return;
                  setImages([
                    ...images,
                    `https://picsum.photos/seed/dna${Math.floor(Math.random() * 1000)}/300/200`,
                  ]);
                }}
                className="w-full rounded-md border border-dashed border-accent/40 bg-[#111] py-10 text-center hover:border-accent/70 hover:bg-[#161616] transition-colors"
              >
                <Upload size={28} className="mx-auto text-accent" />
                <div className="mt-3 text-sm text-foreground">Træk billeder hertil eller klik</div>
                <div className="mt-1 text-xs text-muted-foreground">PNG/JPG · max 8 billeder</div>
              </button>
              {images.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {images.map((src, i) => (
                    <div
                      key={i}
                      className="relative group aspect-[3/2] rounded-md overflow-hidden border border-border"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setImages(images.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger"
                        aria-label="Fjern"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
                BESKRIV MED EGNE ORD
              </div>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="F.eks. åben planløsning, stor have-forbindelse, hjemmekontor..."
                className="w-full rounded-sm border border-[#333] bg-[#111] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all resize-none leading-relaxed"
              />
            </Card>

            {generateError && <p className="text-xs text-danger font-mono mb-2">{generateError}</p>}
            <button
              onClick={generate}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles size={16} />
              {generating ? "Genererer..." : husDna ? "Generér igen" : "Generér Hus-DNA →"}
            </button>
          </div>

          {/* Højre: output */}
          <div>
            {!husDna && !generating && <EmptyOutput />}
            {generating && <GeneratingOutput />}
            {husDna && !generating && (
              <ResultOutput
                dna={husDna}
                onContinue={() => navigate({ to: "/projekt/compliance" })}
              />
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function EmptyOutput() {
  return (
    <Card className="h-full min-h-[360px] flex items-center justify-center">
      <div className="text-center max-w-[260px]">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#333] mb-3">
          <Sparkles size={20} className="text-[#555]" />
        </div>
        <div className="text-sm text-muted-foreground">Dit Hus-DNA vises her efter generering.</div>
      </div>
    </Card>
  );
}

function GeneratingOutput() {
  return (
    <Card className="min-h-[360px]">
      <div className="flex items-center justify-between mb-4">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">HUS-DNA</div>
        <span className="font-mono text-[10px] tracking-[0.1em] border border-accent/40 text-accent rounded px-1.5 py-0.5">
          AI
        </span>
      </div>
      <div className="font-mono text-sm text-muted-foreground typing-caret leading-relaxed">
        Analyserer billeder og krydser med beskrivelse...
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-3 w-1/3 skeleton rounded" />
        <div className="h-5 w-2/3 skeleton rounded" />
        <div className="h-3 w-1/4 skeleton rounded mt-5" />
        <div className="h-4 w-full skeleton rounded" />
        <div className="h-4 w-5/6 skeleton rounded" />
      </div>
    </Card>
  );
}

function ResultOutput({ dna, onContinue }: { dna: HusDna; onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            HUS-DNA
          </div>
          <span className="font-mono text-[10px] tracking-[0.1em] border border-accent/40 text-accent rounded px-1.5 py-0.5">
            AI
          </span>
        </div>

        <Section label="ARKITEKTONISK STIL">
          <div className="font-mono text-lg text-foreground">{dna.stil}</div>
        </Section>

        <Section label="NØGLETAL">
          <dl className="space-y-1.5 text-sm">
            <KV k="Bruttoareal" v={dna.bruttoareal} />
            <KV k="Etager" v={dna.etager} />
            <KV k="Tagform" v={dna.tagform} />
            <KV k="Energiklasse" v={dna.energiklasse} />
          </dl>
        </Section>

        <Section label="SÆRLIGE KRAV">
          <div className="flex flex-wrap gap-1.5">
            {dna.saerligeKrav.map((t) => (
              <span
                key={t}
                className="rounded-full border border-accent/40 bg-accent/5 text-accent px-2.5 py-0.5 text-[11px]"
              >
                {t}
              </span>
            ))}
          </div>
        </Section>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
              CONFIDENCE
            </span>
            <span className="font-mono text-xs text-foreground">{dna.confidence}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${dna.confidence}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-[#222] transition-colors">
            <Pencil size={11} /> Rediger
          </button>
        </div>
      </Card>

      <button
        onClick={onContinue}
        className="mt-4 w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
      >
        Analysér adresse →
      </button>
    </motion.div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-[#1f1f1f] last:border-b-0 pb-1.5 last:pb-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono text-foreground">{v}</dd>
    </div>
  );
}
