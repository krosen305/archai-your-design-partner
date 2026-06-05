// src/components/cockpit/KommerSnart.tsx

export function KommerSnart({ label }: { label?: string }) {
  return (
    <span className="inline-block font-mono text-[10px] tracking-[0.15em] border border-border/60 text-muted-foreground rounded px-2 py-0.5">
      {label ?? "KOMMER SNART"}
    </span>
  );
}

export function KommerSnartCard({ title, beskrivelse }: { title: string; beskrivelse?: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-[#0c0c0c] p-4">
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {beskrivelse && (
        <p className="text-xs text-muted-foreground mb-3">{beskrivelse}</p>
      )}
      <KommerSnart />
    </div>
  );
}
