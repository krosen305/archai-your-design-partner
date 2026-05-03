import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MapPin, Home } from "lucide-react";
import { TopBar } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/start")({
  component: StartPage,
});

function StartPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[960px] px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <h1 className="font-mono text-[28px] text-foreground">Hvor vil du starte?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vælg din indgang til projektet — du kan altid skifte senere.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-2">
          <ChoiceCard
            to="/projekt/adresse"
            icon={<MapPin size={22} />}
            title="Jeg har en adresse"
            body="Søg på din grund og få automatisk bygningsdata og lokalplan."
            cta="Vælg adresse →"
            delay={0.1}
          />
          <ChoiceCard
            disabled
            icon={<Home size={22} />}
            title="Jeg vil designe mit drømmehus"
            body="Start med hvad du vil bygge — vi hjælper med at finde egnede grunde bagefter."
            cta="Kommer snart"
            delay={0.2}
          />
        </div>
      </main>
    </>
  );
}

function ChoiceCard({
  to,
  disabled,
  icon,
  title,
  body,
  cta,
  delay,
}: {
  to?: string;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  delay: number;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-accent/40 bg-accent/5 text-accent">
          {icon}
        </span>
        <h2 className="font-mono text-[15px] tracking-[0.05em] text-foreground">{title}</h2>
        {disabled && (
          <span className="ml-auto rounded border border-warning/40 bg-warning/10 text-warning px-2 py-0.5 font-mono text-[10px] tracking-[0.1em]">
            KOMMER SNART
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{body}</p>
      <div
        className={`mt-6 inline-flex items-center font-mono text-[12px] tracking-[0.1em] ${
          disabled ? "text-[#555]" : "text-accent"
        }`}
      >
        {cta}
      </div>
    </>
  );

  const cls = `block rounded-md border p-6 transition-all ${
    disabled
      ? "border-[#222] bg-[#111] cursor-not-allowed opacity-60"
      : "border-border bg-[#111] hover:border-accent/60 hover:shadow-[0_0_24px_rgba(232,255,77,0.08)]"
  }`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      {disabled || !to ? <div className={cls}>{inner}</div> : <Link to={to} className={cls}>{inner}</Link>}
    </motion.div>
  );
}
