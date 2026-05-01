import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/brief")({
  component: BriefStep,
});

const TYPING_TEXT =
  "Analyserer projektdata... læser inspiration... krydser med lokalplan... genererer brief...";

function BriefStep() {
  const { setBriefDone, reset } = useProject();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 2;
      setTyped(TYPING_TEXT.slice(0, i));
      if (i >= TYPING_TEXT.length) clearInterval(interval);
    }, 30);
    const t = setTimeout(() => {
      setDone(true);
      setBriefDone(true);
    }, 2000);
    return () => {
      clearInterval(interval);
      clearTimeout(t);
    };
  }, [setBriefDone]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/beskrivelse" />
        </div>

        {!done ? (
          <div>
            <h1 className="font-mono text-[28px] mb-6">AI genererer dit design brief...</h1>
            <Card>
              <div className="font-mono text-sm text-muted-foreground typing-caret leading-relaxed">
                {typed}
              </div>
            </Card>
          </div>
        ) : (
          <Result
            onRestart={() => {
              reset();
              navigate({ to: "/" });
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}

function Result({ onRestart }: { onRestart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-2">
        <span className="inline-block font-mono text-[11px] tracking-[0.15em] text-accent">
          DESIGN BRIEF GENERERET
        </span>
      </div>
      <h1 className="font-mono text-[28px] mb-6">Dit arkitektoniske udgangspunkt</h1>

      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <BriefCard title="ARKITEKTONISK STIL" value="Nordisk Brutalisme">
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Beton", "Træ", "Store åbninger", "Fladt tag"].map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-[#222] px-2.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </BriefCard>
        <BriefCard
          title="LYSINDFALD"
          value="Syd/vest prioritet"
          sub="Stue og køkken mod syd. Soveværelser øst."
        />
        <BriefCard
          title="KONSTRUKTION"
          value="2-etagers betonramme"
          sub="Egnet til kombination med udnyttet tagetage"
        />
      </div>

      <Card className="mb-4">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
          AI ANALYSE
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          Baseret på din beskrivelse og inspirationsbilleder anbefaler vi en nordisk brutalistisk
          tilgang med klare geometriske former og en stærk forbindelse til haven. De store
          glaspartier du efterspørger kombineres bedst med en massiv betonkerne der sikrer termisk
          masse og lydkomfort.
        </p>
        <p className="text-sm leading-relaxed text-foreground mt-3">
          Til en fodklinik-funktion anbefales en separat indgang mod nord med direkte adgang fra
          indkørslen. Dette løser også zonering-kravene i lokalplanen uden at kompromittere boligens
          private karakter.
        </p>
      </Card>

      <Card className="mb-6">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
          ANBEFALEDE NÆSTE SKRIDT
        </div>
        <ol className="space-y-3">
          <NextStep n={1} text="Download rapport og del med en lokal ingeniør" />
          <NextStep n={2} text="Book et verificeringsmøde med en ArchAI-partner" soon />
          <NextStep n={3} text="Indhent 3 tilbud via ArchAI Procurement" soon />
        </ol>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110">
          <Download size={16} /> Download PDF rapport
        </button>
        <button
          onClick={onRestart}
          className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-6 py-3 font-mono text-sm text-foreground transition-all hover:bg-[#1A1A1A]"
        >
          Start forfra
        </button>
      </div>
    </motion.div>
  );
}

function BriefCard({
  title,
  value,
  sub,
  children,
}: {
  title: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground mb-2">
        {title}
      </div>
      <div className="font-mono text-lg text-foreground leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-2">{sub}</div>}
      {children}
    </Card>
  );
}

function NextStep({ n, text, soon }: { n: number; text: string; soon?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 font-mono text-xs text-accent w-5">{n}.</span>
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className="text-sm text-foreground">{text}</span>
        {soon && (
          <span className="shrink-0 rounded-full border border-border bg-[#222] px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
            KOMMER SNART
          </span>
        )}
      </div>
    </li>
  );
}
