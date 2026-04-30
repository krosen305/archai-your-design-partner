import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, GitMerge, Wallet, Hammer, FileSignature } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Welcome,
});

const PHASES = [
  { icon: Search, label: "Discovery", desc: "Hus-DNA & lokalplan" },
  { icon: GitMerge, label: "Match", desc: "Tjek lokalplan" },
  { icon: Wallet, label: "Finans", desc: "Bank & forsikring" },
  { icon: Hammer, label: "Engineering", desc: "BR18 & statik" },
  { icon: FileSignature, label: "Udbud", desc: "Udbud & kontrakt" },
];

function Welcome() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16 overflow-hidden">
      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(232,255,77,0.08) 0%, rgba(232,255,77,0.03) 35%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-mono text-[32px] tracking-[0.2em] text-accent"
        >
          ARCHAI
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 space-y-2"
        >
          <p className="text-foreground text-lg">Fra tom grund til byggetilladelse.</p>
          <p className="text-sm text-muted-foreground">
            AI-drevet byggerådgivning for private bygherrer.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 w-full flex flex-col items-center"
        >
          <Link
            to="/projekt/adresse"
            className="w-full md:w-[360px] inline-flex items-center justify-center rounded-md bg-accent px-6 py-3.5 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(232,255,77,0.25)]"
          >
            Start dit projekt →
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            Gratis at prøve. Ingen kreditkort.
          </p>
        </motion.div>

        {/* Fase-oversigt */}
        <div className="mt-16 w-full">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {PHASES.map((p, i) => (
              <motion.div
                key={p.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
                className="rounded-md border border-border bg-[#1A1A1A] p-4 text-left"
              >
                <p.icon size={16} className="text-accent mb-2" />
                <div className="font-mono text-[10px] tracking-[0.15em] text-foreground uppercase">
                  {p.label}
                </div>
                <div className="mt-1 text-xs text-muted-foreground leading-tight">
                  {p.desc}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
