import { motion } from "framer-motion";
import { type ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function StepHeader({
  step,
  total = 4,
  title,
  subtitle,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        TRIN {step} AF {total}
      </div>
      <h1 className="text-[28px] leading-tight font-mono text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-border bg-[#1A1A1A] p-6",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
