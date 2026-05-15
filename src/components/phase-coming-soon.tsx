import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

type Props = {
  step: number;
  title: string;
  subtitle: string;
  bullets: string[];
  backTo: string;
};

export function PhaseComingSoon({ step, title, subtitle, bullets, backTo }: Props) {
  return (
    <PageTransition>
      <div className="mx-auto max-w-[860px] px-6 py-10">
        <div className="mb-6">
          <BackLink to={backTo} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            <span className="text-accent">FASE 0{step}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-amber-400/80">
              <Lock size={10} /> KOMMER SNART
            </span>
          </div>
          <h1 className="font-mono text-3xl text-foreground leading-tight mb-3">{title}</h1>
          <p className="text-sm text-muted-foreground max-w-[60ch] leading-relaxed mb-8">
            {subtitle}
          </p>

          <Card className="mb-6">
            <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-4">
              I DENNE FASE
            </div>
            <ul className="space-y-2.5">
              {bullets.map((b, i) => (
                <motion.li
                  key={b}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, duration: 0.25 }}
                  className="flex items-start gap-2.5 text-sm text-foreground"
                >
                  <CheckCircle2
                    size={14}
                    className="mt-0.5 shrink-0 text-accent/70"
                    strokeWidth={2}
                  />
                  {b}
                </motion.li>
              ))}
            </ul>
          </Card>

          <Link
            to={backTo}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-[#1a1a1a] px-4 py-2.5 font-mono text-[11px] tracking-[0.12em] text-foreground transition-colors hover:border-accent/40 hover:bg-[#222]"
          >
            Tilbage til cockpit
            <ArrowRight size={12} />
          </Link>
        </motion.div>
      </div>
    </PageTransition>
  );
}
