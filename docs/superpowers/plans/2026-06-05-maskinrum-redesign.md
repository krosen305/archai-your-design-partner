# Maskinrum Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatte det tab-baserede Maskinrum med et sidebar-navigeret, section-baseret layout der sætter compliance-verdikten øverst og aldrig viser mock-labels til brugeren.

**Architecture:** Eksisterende data-fetching hooks (`useCockpitAnalysis`, `useCockpitRestore`) og domenekerne berøres ikke. Kun UI-laget ændres: den nuværende `AnalyseTab` + 3-tab-navigation erstattes af en `CockpitLayout` med en venstre sidebar og seks scrollbare sektioner. Mock-kilde-signaler (`kilde === "mock"`, `FEATURE_FLAGS.fjernvarmeMock`) fjernes fra visningslaget — data enten vises som live eller som "Kommer snart"-placeholder. En ny ren funktion `beregnProjektReadiness` afledt af `dataStatus` + `complianceFlags` driver progress-baren i Verdict-sektionen.

**Tech Stack:** React, TanStack Router, Zustand (`useProject`), Framer Motion, Tailwind CSS, `bun:test` for unit tests.

**Data Authority (ref: docs/dataarkitektur-artefakt.md):**
- Alle compliance-signaler kommer fra `ruleEngineResult` / `complianceFlags` — aldrig fra UI-beregning
- `hard_stop` og `hard_stop_reason` er typed SQL-kolonner — source of truth for Verdict
- `grundareal_m2` og `bebygget_areal_m2` er typed kolonner — bruges i GrundenSection
- `energimaerke` (EMOData Blokeret) og `servitutter` (Tinglysning Blokeret) vises som "Kommer snart"
- `northOrientation` er hardkodet til "S" i kodebasen — feltet vises ikke i nyt UI
- `fortidsminde`/`fortidsmindeBuffer` er eksplicit `null` — vises ikke eller som "Kommer snart"

---

## Filer der oprettes

| Fil | Ansvar |
|-----|--------|
| `src/lib/projekt-readiness.ts` | Ren funktion: `beregnProjektReadiness(dataStatus, complianceFlags) → number` |
| `src/lib/projekt-readiness.test.ts` | Unit tests for readiness-beregning |
| `src/components/cockpit/KommerSnart.tsx` | Delt placeholder-komponent — erstatter alle mock-labels |
| `src/components/cockpit/layout/CockpitLayout.tsx` | Shell: sidebar (140 px) + scrollbart main-panel |
| `src/components/cockpit/layout/CockpitSidebar.tsx` | Venstre nav med 6 sektioner + dot-indikator |
| `src/components/cockpit/layout/CockpitHeader.tsx` | Top-bar: adresse + Plantegning/Del/... |
| `src/components/cockpit/sections/VerdiktSection.tsx` | Hero-card: "Du kan bygge her." + metrics + readiness + CTA |
| `src/components/cockpit/sections/OpmærksomhedSection.tsx` | Top-3 complianceFlags + "Vis alle (N)" |
| `src/components/cockpit/sections/GrundenSection.tsx` | Kort + nøgletal fra MAT/BBR |
| `src/components/cockpit/sections/PlanReguleringSection.tsx` | Lokalplaner + kommuneplanramme + servitutter |
| `src/components/cockpit/sections/OkonomiSection.tsx` | VUR-vurdering + budget-estimat |
| `src/components/cockpit/sections/DatakilderSection.tsx` | Status-dots for alle DataSourceKind |

## Filer der modificeres

| Fil | Ændring |
|-----|---------|
| `src/routes/projekt.$id.cockpit.tsx` | Erstat 3-tab layout med `CockpitLayout` + sektioner |
| `src/components/cockpit/AnalyseTab.tsx` | Fjern MOCK-badges (kilde === "mock"), fjern `FEATURE_FLAGS.fjernvarmeMock`-check |
| `src/components/cockpit/RiskOverview.tsx` | Fjern `hasMockRiskSignals`-banner |

---

## Task 1: Ren funktion `beregnProjektReadiness` + tests

Denne funktion driver progress-baren i VerdiktSection. Den beregnes udelukkende fra data der allerede eksisterer i project-store — ingen nye API-kald.

**Logik:** Tæl kun de "handlingsbare" datakilder (ikke `billedanalyse`, `husDna`, `byggeanalyse` da disse er sekundære). En kilde tæller fuld score hvis `fresh`, halv score hvis `stale`, nul hvis `missing`/`error`. Compliance-komponenten: procent af flags der er `ok` vs total (ved 0 flags = 100%). Samlet = 0.6 × datakomplethed + 0.4 × complianceok, rundet til nærmeste heltal.

**Files:**
- Create: `src/lib/projekt-readiness.ts`
- Create: `src/lib/projekt-readiness.test.ts`

- [ ] **Step 1.1: Skriv unit tests**

```typescript
// src/lib/projekt-readiness.test.ts
import { describe, expect, test } from "bun:test";
import { beregnProjektReadiness } from "./projekt-readiness";
import type { DataSourceKind, DataSourceStatus } from "@/types/project-state";
import type { ComplianceFlag } from "@/types/project-state";

function makeStatus(overrides: Partial<Record<DataSourceKind, DataSourceStatus>>): Record<DataSourceKind, DataSourceStatus> {
  const base: Record<DataSourceKind, DataSourceStatus> = {
    bbr: "fresh", lokalplaner: "fresh", kommuneplanramme: "fresh",
    fbb: "fresh", naturbeskyttelse: "fresh", arealdata: "fresh",
    dkjord: "fresh", geusRisk: "fresh", servitutter: "fresh",
    terrain: "fresh", fjernvarme: "fresh", naboer: "fresh",
    matGeometri: "fresh", vurdering: "fresh", byggeanalyse: "fresh",
    billedanalyse: "fresh", husDna: "fresh", tjekditnet: "fresh",
    energimaerke: "fresh",
  };
  return { ...base, ...overrides };
}

describe("beregnProjektReadiness", () => {
  test("alle handlingsbare kilder fresh + ingen flags → 100", () => {
    expect(beregnProjektReadiness(makeStatus({}), [])).toBe(100);
  });

  test("alle handlingsbare missing + ingen flags → 40 (compliance 100%, data 0%)", () => {
    const all: Partial<Record<DataSourceKind, DataSourceStatus>> = {
      bbr: "missing", lokalplaner: "missing", kommuneplanramme: "missing",
      fbb: "missing", naturbeskyttelse: "missing", arealdata: "missing",
      dkjord: "missing", geusRisk: "missing", servitutter: "missing",
      terrain: "missing", fjernvarme: "missing", naboer: "missing",
      matGeometri: "missing", vurdering: "missing", tjekditnet: "missing",
      energimaerke: "missing",
    };
    expect(beregnProjektReadiness(makeStatus(all), [])).toBe(40);
  });

  test("alle handlingsbare stale → 70", () => {
    const all: Partial<Record<DataSourceKind, DataSourceStatus>> = {
      bbr: "stale", lokalplaner: "stale", kommuneplanramme: "stale",
      fbb: "stale", naturbeskyttelse: "stale", arealdata: "stale",
      dkjord: "stale", geusRisk: "stale", servitutter: "stale",
      terrain: "stale", fjernvarme: "stale", naboer: "stale",
      matGeometri: "stale", vurdering: "stale", tjekditnet: "stale",
      energimaerke: "stale",
    };
    // 0.5 datakomplethed * 0.6 + 1.0 compliance * 0.4 = 0.3 + 0.4 = 0.7 → 70
    expect(beregnProjektReadiness(makeStatus(all), [])).toBe(70);
  });

  test("halvt ok flags → compliance = 0.5", () => {
    const flags: ComplianceFlag[] = [
      { id: "1", status: "ok", title: "OK", kilde: "bbr", beskrivelse: null },
      { id: "2", status: "advarsel", title: "Advarsel", kilde: "plandata", beskrivelse: null },
    ];
    // data = 100%, compliance = 0.5
    // 0.6 * 1.0 + 0.4 * 0.5 = 0.6 + 0.2 = 0.8 → 80
    expect(beregnProjektReadiness(makeStatus({}), flags)).toBe(80);
  });

  test("blocker-flag giver 0 i compliance-komponent", () => {
    const flags: ComplianceFlag[] = [
      { id: "1", status: "blocker", title: "Hard Stop", kilde: "bbr", beskrivelse: null },
    ];
    // 0.6 * 1.0 + 0.4 * 0.0 = 60
    expect(beregnProjektReadiness(makeStatus({}), flags)).toBe(60);
  });
});
```

- [ ] **Step 1.2: Kør tests — forvent FAIL**

```bash
bun test src/lib/projekt-readiness.test.ts
```

Forventet output: `error: Cannot find module './projekt-readiness'`

- [ ] **Step 1.3: Implementér funktionen**

```typescript
// src/lib/projekt-readiness.ts
import type { DataSourceKind, DataSourceStatus } from "@/types/project-state";
import type { ComplianceFlag } from "@/types/project-state";

// Handlingsbare kilder — sekundære AI-pipeline-kilder tæller ikke med
const HANDLINGSBARE_KILDER: readonly DataSourceKind[] = [
  "bbr", "lokalplaner", "kommuneplanramme", "fbb", "naturbeskyttelse",
  "arealdata", "dkjord", "geusRisk", "servitutter", "terrain",
  "fjernvarme", "naboer", "matGeometri", "vurdering", "tjekditnet",
  "energimaerke",
];

const DATA_SCORE: Record<DataSourceStatus, number> = {
  fresh: 1,
  stale: 0.5,
  missing: 0,
  loading: 0,
  error: 0,
};

export function beregnProjektReadiness(
  dataStatus: Record<DataSourceKind, DataSourceStatus>,
  flags: ComplianceFlag[],
): number {
  const total = HANDLINGSBARE_KILDER.length;
  const dataSum = HANDLINGSBARE_KILDER.reduce(
    (acc, k) => acc + (DATA_SCORE[dataStatus[k]] ?? 0),
    0,
  );
  const dataPct = total > 0 ? dataSum / total : 1;

  const okCount = flags.filter((f) => f.status === "ok").length;
  const compliancePct = flags.length === 0 ? 1 : okCount / flags.length;

  return Math.round(dataPct * 0.6 * 100 + compliancePct * 0.4 * 100);
}
```

- [ ] **Step 1.4: Kør tests — forvent PASS**

```bash
bun test src/lib/projekt-readiness.test.ts
```

Forventet output: alle 5 tests grønne.

- [ ] **Step 1.5: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/projekt-readiness.ts src/lib/projekt-readiness.test.ts
git commit -m "feat(readiness): add beregnProjektReadiness pure function with tests"
```

---

## Task 2: KommerSnart-komponent + fjern mock-labels

Alle steder hvor UI i dag viser "MOCK"-badge (baseret på `kilde === "mock"` eller `FEATURE_FLAGS.fjernvarmeMock`) erstattes med ingenting eller med `<KommerSnart />`. Domænelogikken bag mock-data røres ikke.

**Files:**
- Create: `src/components/cockpit/KommerSnart.tsx`
- Modify: `src/components/cockpit/AnalyseTab.tsx`
- Modify: `src/components/cockpit/RiskOverview.tsx`

- [ ] **Step 2.1: Opret `KommerSnart.tsx`**

```tsx
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
```

- [ ] **Step 2.2: Fjern MOCK-badge i `AnalyseTab.tsx` — AI byggeanalyse (linje ~218-223)**

Find blokken:
```tsx
badge:
  byggeanalyse?.kilde === "mock" ? (
    <span className="text-[9px] border border-warning/40 text-warning rounded px-1 font-mono">
      MOCK
    </span>
  ) : null,
```

Erstat med:
```tsx
badge: null,
```

- [ ] **Step 2.3: Fjern `FEATURE_FLAGS.fjernvarmeMock`-check i `AnalyseTab.tsx` (linje ~482-486)**

Find blokken:
```tsx
{FEATURE_FLAGS.fjernvarmeMock && (
  <span className="text-[9px] border border-warning/40 text-warning rounded px-1">
    MOCK
  </span>
)}
```

Slet disse 5 linjer komplet.

- [ ] **Step 2.4: Fjern `kilde === "mock"`-badges i `AnalyseTab.tsx` — terrain (~633-637), servitutter (~688-692), geusRisk (~761-765), byggeanalyse kort (~578-582)**

For hvert af disse mønstre:
```tsx
{data.kilde === "mock" && (
  <span className="ml-2 text-[9px] border border-warning/40 text-warning rounded px-1">
    MOCK
  </span>
)}
```

Slet blokken (behold omgivende struktur).

- [ ] **Step 2.5: Fjern `hasMockRiskSignals`-banner i `RiskOverview.tsx` (linje ~89-93)**

Find:
```tsx
{hasMockRiskSignals && (
  <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
    Geoteknik- og miljøsignaler er foreløbige mock-data, ikke live-verificeret compliance.
  </div>
)}
```

Slet blokken. Variablen `hasMockRiskSignals` kan også fjernes fra komponentens scope.

- [ ] **Step 2.6: Typecheck + build**

```bash
bunx tsc --noEmit && bun run build
```

- [ ] **Step 2.7: Commit**

```bash
git add src/components/cockpit/KommerSnart.tsx src/components/cockpit/AnalyseTab.tsx src/components/cockpit/RiskOverview.tsx
git commit -m "feat(ui): add KommerSnart component, remove all MOCK badges from cockpit"
```

---

## Task 3: CockpitLayout + CockpitSidebar + CockpitHeader

Shell-komponenter der styrer det nye layout. Datahentning sker stadig i `projekt.$id.cockpit.tsx` — layout-komponenterne modtager alt via props.

**Files:**
- Create: `src/components/cockpit/layout/CockpitHeader.tsx`
- Create: `src/components/cockpit/layout/CockpitSidebar.tsx`
- Create: `src/components/cockpit/layout/CockpitLayout.tsx`

- [ ] **Step 3.1: Opret `CockpitHeader.tsx`**

```tsx
// src/components/cockpit/layout/CockpitHeader.tsx
import { Link } from "@tanstack/react-router";
import { LayoutTemplate, Share2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type CockpitHeaderProps = {
  adresse: string;
  adresseId: string;
  projectId: string | undefined;
};

export function CockpitHeader({ adresse, adresseId, projectId }: CockpitHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
      <span className="text-sm text-foreground truncate max-w-[50%]">{adresse}</span>
      <div className="flex items-center gap-2">
        <Link
          to="/projekt/$id/plantegning"
          params={{ id: adresseId }}
          search={{ projectId }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5",
            "font-mono text-[11px] tracking-[0.1em] text-foreground hover:bg-[#1a1a1a] transition-colors",
          )}
        >
          <LayoutTemplate size={12} />
          Plantegning
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Del projekt"
        >
          <Share2 size={12} />
          Del
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center size-8 rounded-md border border-border/60 bg-[#111] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Flere handlinger"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3.2: Opret `CockpitSidebar.tsx`**

```tsx
// src/components/cockpit/layout/CockpitSidebar.tsx
import { cn } from "@/lib/utils";

export type SidebarSection =
  | "verdict"
  | "opmærksomhed"
  | "grunden"
  | "plan"
  | "økonomi"
  | "datakilder";

export const SIDEBAR_ITEMS: Array<{ id: SidebarSection; label: string }> = [
  { id: "verdict", label: "Verdict" },
  { id: "opmærksomhed", label: "Opmærksomhed" },
  { id: "grunden", label: "Grunden" },
  { id: "plan", label: "Plan & regulering" },
  { id: "økonomi", label: "Økonomi" },
  { id: "datakilder", label: "Datakilder" },
];

type CockpitSidebarProps = {
  active: SidebarSection;
  onNavigate: (s: SidebarSection) => void;
};

export function CockpitSidebar({ active, onNavigate }: CockpitSidebarProps) {
  return (
    <nav
      aria-label="Maskinrum navigation"
      className="w-[140px] shrink-0 border-r border-border/40 py-6 flex flex-col gap-1"
    >
      <div className="px-4 mb-4 font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60">
        MASKINRUMMET
      </div>
      {SIDEBAR_ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors w-full",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0",
                isActive ? "bg-[#c8ff00]" : "bg-muted-foreground/30",
              )}
            />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3.3: Opret `CockpitLayout.tsx`**

```tsx
// src/components/cockpit/layout/CockpitLayout.tsx
import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { CockpitHeader, type CockpitHeaderProps } from "./CockpitHeader";
import { CockpitSidebar, type SidebarSection, SIDEBAR_ITEMS } from "./CockpitSidebar";

type CockpitLayoutProps = CockpitHeaderProps & {
  children: (scrollTo: (id: SidebarSection) => void) => ReactNode;
};

export function CockpitLayout({ adresse, adresseId, projectId, children }: CockpitLayoutProps) {
  const [active, setActive] = useState<SidebarSection>("verdict");
  const sectionRefs = useRef<Map<SidebarSection, HTMLElement>>(new Map());

  const registerRef = useCallback((id: SidebarSection, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  const scrollTo = useCallback((id: SidebarSection) => {
    const el = sectionRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  }, []);

  // Opdater aktiv sektion ved scroll via IntersectionObserver
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-section") as SidebarSection | null;
            if (id) setActive(id);
          }
        }
      },
      { threshold: 0.3 },
    );
    for (const [, el] of sectionRefs.current) obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <CockpitHeader adresse={adresse} adresseId={adresseId} projectId={projectId} />
      <div className="flex flex-1 overflow-hidden">
        <CockpitSidebar active={active} onNavigate={scrollTo} />
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
          {children(scrollTo)}
        </main>
      </div>
    </div>
  );
}

// Helper til at registrere sektionselementer
export function useSectionRef(id: SidebarSection) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) el.setAttribute("data-section", id);
    },
    [id],
  );
}
```

- [ ] **Step 3.4: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 3.5: Commit**

```bash
git add src/components/cockpit/layout/
git commit -m "feat(layout): add CockpitLayout, CockpitSidebar, CockpitHeader shell components"
```

---

## Task 4: VerdiktSection

Anvender `hard_stop` (typed kolonne), `hard_stop_reason`, `complianceMetrics.maxEtager`, `maxBygningsareal` (beregnet) og `beregnProjektReadiness`.

**Data mapping (ref: dataarkitektur-artefakt.md):**
- `hard_stop` → `projects.hard_stop` typed kolonne (source of truth)
- `maxBygningsareal` = `grundareal_m2 × (maxBebyggelsesprocent / 100)` — afledt i `complianceMetrics`
- `maxEtager` → `complianceMetrics.maxEtager` fra regelmotor

**Files:**
- Create: `src/components/cockpit/sections/VerdiktSection.tsx`

- [ ] **Step 4.1: Opret `VerdiktSection.tsx`**

```tsx
// src/components/cockpit/sections/VerdiktSection.tsx
import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import type { ComplianceMetrics } from "@/lib/compliance-engine";

type VerdiktSectionProps = {
  metrics: ComplianceMetrics | null;
};

export function VerdiktSection({ metrics }: VerdiktSectionProps) {
  const { hard_stop, hard_stop_reason, complianceFlags, dataStatus } = useProject();

  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);

  const maxAreal = metrics?.maxBygningsareal ?? null;
  const maxEtager = metrics?.maxEtager ?? null;

  const kanBygge = !hard_stop;

  const metrikLinje = [
    maxAreal != null ? `Op til ${maxAreal} m²` : null,
    maxEtager != null ? `${maxEtager} etage${maxEtager !== 1 ? "r" : ""}` : null,
    kanBygge ? "ingen hard stops" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="Verdict">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-8">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`text-[2.5rem] font-bold leading-tight tracking-tight ${
            kanBygge ? "text-foreground" : "text-danger"
          }`}
        >
          {kanBygge ? "Du kan bygge her." : "Du kan ikke bygge her."}
        </motion.h1>

        {/* Accent-understregning */}
        <div
          className={`mt-2 h-[3px] w-16 rounded-full ${kanBygge ? "bg-[#c8ff00]" : "bg-danger"}`}
        />

        {metrikLinje && (
          <p className="mt-4 text-base text-muted-foreground">{metrikLinje}</p>
        )}

        {!kanBygge && hard_stop_reason && (
          <p className="mt-3 text-sm text-danger/90 leading-relaxed">{hard_stop_reason}</p>
        )}

        {/* Projekt-readiness */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-muted-foreground">Projekt-readiness {readiness}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${readiness}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-[#c8ff00]"
            />
          </div>
        </div>

        {kanBygge && (
          <div className="mt-6">
            <a
              href="#plantegning"
              className="inline-flex items-center gap-2 rounded-lg bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
              onClick={(e) => {
                e.preventDefault();
                // Navigering til plantegning håndteres af CockpitHeader-knap
              }}
            >
              Åbn plantegning →
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4.2: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4.3: Commit**

```bash
git add src/components/cockpit/sections/VerdiktSection.tsx
git commit -m "feat(cockpit): add VerdiktSection with readiness bar and hard-stop verdict"
```

---

## Task 5: OpmærksomhedSection

Viser de tre vigtigste `complianceFlags` sorteret efter alvorlighed (blocker → advarsel → ok). Brugeren kan ekspandere til alle flags.

**Data mapping (ref: dataarkitektur-artefakt.md):**
- `complianceFlags` = afledt af `ruleEngineResult` + registerdata — source of truth for hvad brugeren skal handle på

**Files:**
- Create: `src/components/cockpit/sections/OpmærksomhedSection.tsx`

- [ ] **Step 5.1: Opret `OpmærksomhedSection.tsx`**

```tsx
// src/components/cockpit/sections/OpmærksomhedSection.tsx
import { useState } from "react";
import { useProject } from "@/lib/project-store";
import type { ComplianceFlag } from "@/types/project-state";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER: Record<ComplianceFlag["status"], number> = {
  blocker: 0,
  advarsel: 1,
  ok: 2,
};

const DOT_COLOR: Record<ComplianceFlag["status"], string> = {
  blocker: "bg-danger",
  advarsel: "bg-amber-400",
  ok: "bg-emerald-400",
};

type OpmærksomhedSectionProps = {
  onOpenDetails: (flagId: string) => void;
};

export function OpmærksomhedSection({ onOpenDetails }: OpmærksomhedSectionProps) {
  const { complianceFlags } = useProject();
  const [visAlle, setVisAlle] = useState(false);

  const sorted = [...complianceFlags].sort(
    (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status],
  );

  const visibleFlags = visAlle ? sorted : sorted.slice(0, 3);
  const skjulteAntal = sorted.length - 3;
  const harSkjulte = !visAlle && skjulteAntal > 0;

  if (complianceFlags.length === 0) return null;

  return (
    <section aria-label="Opmærksomhed">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">
          {sorted.filter((f) => f.status !== "ok").length} ting kræver din opmærksomhed
        </h2>

        <ul className="divide-y divide-border/30">
          {visibleFlags.map((flag) => (
            <li key={flag.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn("size-2 shrink-0 rounded-full", DOT_COLOR[flag.status])}
                  aria-label={flag.status}
                />
                <span className="text-sm text-foreground truncate">{flag.title}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenDetails(flag.id)}
                className="shrink-0 ml-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Åbn →
              </button>
            </li>
          ))}
        </ul>

        {harSkjulte && (
          <button
            type="button"
            onClick={() => setVisAlle(true)}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Vis alle ({sorted.length}) →
          </button>
        )}
        {visAlle && sorted.length > 3 && (
          <button
            type="button"
            onClick={() => setVisAlle(false)}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Vis færre
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5.2: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5.3: Commit**

```bash
git add src/components/cockpit/sections/OpmærksomhedSection.tsx
git commit -m "feat(cockpit): add OpmærksomhedSection with top-3 compliance flags"
```

---

## Task 6: GrundenSection

Genbruger `MatrikelMap`. Viser `grundareal_m2`, `bebygget_areal_m2`, `maxBygningsareal`, `zoneType`. `northOrientation` (hardkodet til "S" i kodebasen — se dataarkitektur-artefakt governance) vises IKKE.

**Data mapping (ref: dataarkitektur-artefakt.md):**
- `grundareal_m2` → `projects.grundareal_m2` typed kolonne (MAT SSOT)
- `bebygget_areal_m2` → `projects.bebygget_areal_m2` typed kolonne (BBR SSOT)
- `maxBygningsareal` → `complianceMetrics.maxBygningsareal` (beregnet: `grundareal × maxPct / 100`)
- `zoneType` → `compliance_data.plandataContext.zoneType` (Plandata SSOT)

**Files:**
- Create: `src/components/cockpit/sections/GrundenSection.tsx`

- [ ] **Step 6.1: Opret `GrundenSection.tsx`**

```tsx
// src/components/cockpit/sections/GrundenSection.tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { RuleEngineBbrData } from "@/domain/contracts/rule-engine.types";
import type { NeighborBuildingData } from "@/domain/contracts/analysis.types";

type GrundenSectionProps = {
  bbr: RuleEngineBbrData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
};

function Måletal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function GrundenSection({ bbr, metrics, naboer }: GrundenSectionProps) {
  const { grundareal_m2, bebygget_areal_m2, plandataContext } = useProject();
  const [visAlle, setVisAlle] = useState(false);

  const grundareal = grundareal_m2 ?? bbr?.grundareal ?? null;
  const bebygget = bebygget_areal_m2 ?? bbr?.bebygget_areal ?? null;
  const maksAreal = metrics?.maxBygningsareal ?? null;
  const zone = plandataContext?.zoneType ?? null;
  const jordstykkeId = bbr?.jordstykke_lokal_id ?? null;

  return (
    <section aria-label="Grunden">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Grunden</h2>

        <div className="grid grid-cols-[1fr_auto] gap-6 items-start">
          {/* Kort */}
          <div className="rounded-lg overflow-hidden aspect-video max-h-[240px]">
            <MatrikelMap
              bbr={bbr}
              naboer={naboer}
              jordstykkeLokalId={jordstykkeId}
            />
          </div>

          {/* Nøgletal */}
          <div className="space-y-5 min-w-[140px]">
            {grundareal != null && (
              <Måletal label="Grundareal" value={`${grundareal} m²`} />
            )}
            {zone && (
              <Måletal label="" value={zone} />
            )}
            {bebygget != null && (
              <Måletal label="Bebygget i dag" value={`${bebygget} m²`} />
            )}
            {maksAreal != null && (
              <Måletal label="Maks tilladt" value={`${maksAreal} m²`} />
            )}
          </div>
        </div>

        {/* Progressiv disclosure */}
        {bbr && (
          <div>
            <button
              type="button"
              onClick={() => setVisAlle((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Vis alle felter
              <ChevronDown
                size={14}
                className={`transition-transform ${visAlle ? "rotate-180" : ""}`}
              />
            </button>

            {visAlle && (
              <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {[
                  { label: "Byggeår", value: bbr.byggeaar?.toString() },
                  { label: "Ombygningsår", value: bbr.ombygningsaar?.toString() },
                  { label: "Samlet areal", value: bbr.samlet_areal != null ? `${bbr.samlet_areal} m²` : undefined },
                  { label: "Antal etager", value: bbr.antal_etager?.toString() },
                  { label: "Anvendelse", value: bbr.anvendelse_tekst },
                  { label: "Varmeinstallation", value: bbr.varmeinstallation },
                  { label: "Ydervæg", value: bbr.ydervaegs_materiale },
                  { label: "Tag", value: bbr.tagdaekning },
                  { label: "Vandforsyning", value: bbr.vandforsyning },
                  { label: "Afløb", value: bbr.afloebsforhold },
                ]
                  .filter((r) => r.value != null)
                  .map(({ label, value }) => (
                    <div key={label} className="flex justify-between border-b border-border/20 py-1.5">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-foreground">{value}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 6.2: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6.3: Commit**

```bash
git add src/components/cockpit/sections/GrundenSection.tsx
git commit -m "feat(cockpit): add GrundenSection with map and progressive BBR disclosure"
```

---

## Task 7: PlanReguleringSection

Viser lokalplaner, kommuneplanramme og servitutter. Servitutter er Tinglysning (Blokeret i dataarkitektur) — vis `KommerSnart` hvis `kilde === "mock"` eller data er null.

**Data mapping (ref: dataarkitektur-artefakt.md):**
- `lokalplaner[]` → `compliance_data.lokalplaner` (Plandata SSOT, Live)
- `kommuneplanramme` → `compliance_data.kommuneplanramme` (Plandata SSOT, Live)
- `plandokumentLink` → bruges til PDF-link (ikke compliance-sandhed)
- `servitutter[]` → Tinglysning (Blokeret) — mock i nuværende miljø → `KommerSnart`

**Files:**
- Create: `src/components/cockpit/sections/PlanReguleringSection.tsx`

- [ ] **Step 7.1: Opret `PlanReguleringSection.tsx`**

```tsx
// src/components/cockpit/sections/PlanReguleringSection.tsx
import { ExternalLink } from "lucide-react";
import { KommerSnartCard } from "@/components/cockpit/KommerSnart";
import type { RuleEngineLokalplan, RuleEngineTinglysningResult } from "@/domain/contracts/rule-engine.types";

type PlanRegularingSectionProps = {
  lokalplaner: RuleEngineLokalplan[];
  servitutter: RuleEngineTinglysningResult | null;
};

export function PlanReguleringSection({ lokalplaner, servitutter }: PlanRegularingSectionProps) {
  const harServitutter =
    servitutter &&
    servitutter.kilde !== "mock" &&
    servitutter.servitutter.length > 0;

  return (
    <section aria-label="Plan og regulering">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Plan & regulering</h2>

        {/* Lokalplaner */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Lokalplaner ({lokalplaner.length})
          </h3>
          {lokalplaner.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen lokalplan — ejendommen reguleres af kommuneplanen.
            </p>
          ) : (
            <ul className="space-y-3">
              {lokalplaner.map((lp) => (
                <li
                  key={lp.planid}
                  className="flex items-start justify-between gap-4 border-b border-border/20 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">
                      {lp.plannr ? `${lp.plannr} – ` : ""}
                      {lp.plannavn || "Ukendt lokalplan"}
                      {lp.status === "forslag" && (
                        <span className="ml-2 text-[10px] font-mono text-amber-400 border border-amber-500/40 rounded px-1">
                          FORSLAG
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lp.datoVedtaget ? `Vedtaget ${lp.datoVedtaget.slice(0, 10)}` : "Vedtaget"}
                      {lp.kommunenavn ? ` · ${lp.kommunenavn}` : ""}
                    </p>
                  </div>
                  {lp.plandokumentLink && (
                    <a
                      href={lp.plandokumentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      PDF <ExternalLink size={10} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Servitutter */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Tinglyste servitutter
          </h3>
          {harServitutter ? (
            <ul className="space-y-2">
              {servitutter.servitutter.map((s, i) => (
                <li key={i} className="text-sm text-foreground border-b border-border/20 pb-2 last:border-0">
                  {s.tekst ?? s.type ?? "Ukendt servitut"}
                </li>
              ))}
            </ul>
          ) : (
            <KommerSnartCard
              title="Servitutter fra Tinglysningsregisteret"
              beskrivelse="Vi arbejder på at hente tinglyste servitutter direkte fra Tinglysning.dk."
            />
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 7.2: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 7.3: Commit**

```bash
git add src/components/cockpit/sections/PlanReguleringSection.tsx
git commit -m "feat(cockpit): add PlanReguleringSection with lokalplaner and KommerSnart for servitutter"
```

---

## Task 8: OkonomiSection

Refaktorér indholdet fra `OekonomiPanel` til `OkonomiSection` med det nye designsprog. Energimærke (EMOData Blokeret) vises som `KommerSnart`.

**Data mapping (ref: dataarkitektur-artefakt.md):**
- `ejendomsvaerdi`, `grundvaerdi` → VUR (Live)
- `vurderingsaar`, `vurderetAreal` → VUR (Live)
- `budget_estimate` → `projects.budget_estimate` typed kolonne
- `energimaerke_klasse` → EMOData (Blokeret) → `KommerSnart`

**Files:**
- Create: `src/components/cockpit/sections/OkonomiSection.tsx`

- [ ] **Step 8.1: Opret `OkonomiSection.tsx`**

```tsx
// src/components/cockpit/sections/OkonomiSection.tsx
import { useProject } from "@/lib/project-store";
import { KommerSnartCard } from "@/components/cockpit/KommerSnart";

function formatKr(n: number | null): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMio(n: number | null): string {
  if (n == null) return "–";
  return `${(n / 1_000_000).toFixed(1)} mio. kr.`;
}

export function OkonomiSection() {
  const { vurderingData, grundareal_m2, bbrData } = useProject();

  const grundareal = grundareal_m2 ?? bbrData?.grundareal ?? null;
  const e = vurderingData?.ejendomsvaerdi ?? null;
  const g = vurderingData?.grundvaerdi ?? null;
  const samlet = e != null || g != null ? (e ?? 0) + (g ?? 0) : null;

  return (
    <section aria-label="Økonomi">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Økonomi</h2>

        {/* Ejendomsvurdering */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Ejendomsvurdering (SKAT / VUR)
          </h3>
          {vurderingData && !vurderingData.fejl ? (
            <div className="space-y-3">
              {samlet != null && (
                <div className="rounded-lg border border-border/40 bg-[#111] p-4">
                  <p className="text-xs text-muted-foreground mb-1">Samlet vurdering</p>
                  <p className="text-2xl font-semibold text-foreground tabular-nums">
                    {formatMio(samlet)}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Ejendomsværdi: {formatKr(e)}</span>
                    <span>Grundværdi: {formatKr(g)}</span>
                  </div>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {vurderingData.vurderetAreal != null && (
                  <div className="flex justify-between border-b border-border/20 py-1.5">
                    <dt className="text-muted-foreground">Vurderet areal</dt>
                    <dd className="text-foreground">{vurderingData.vurderetAreal} m²</dd>
                  </div>
                )}
                {vurderingData.vurderingsaar != null && (
                  <div className="flex justify-between border-b border-border/20 py-1.5">
                    <dt className="text-muted-foreground">Vurderingsår</dt>
                    <dd className="text-foreground">{vurderingData.vurderingsaar}</dd>
                  </div>
                )}
                {grundareal != null && g != null && (
                  <div className="flex justify-between border-b border-border/20 py-1.5">
                    <dt className="text-muted-foreground">Grundværdi pr. m²</dt>
                    <dd className="text-foreground">{formatKr(Math.round(g / grundareal))}/m²</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : vurderingData?.fejl ? (
            <p className="text-sm text-warning">{vurderingData.fejl}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Hentes automatisk under analysen.</p>
          )}
        </div>

        {/* Energimærke — EMOData Blokeret */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Energimærke
          </h3>
          <KommerSnartCard
            title="Energimærke fra EMOData"
            beskrivelse="Energimærkeklasse, gyldighedsdato og rapportlink vil vises her."
          />
        </div>

        {/* Finansiering */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Finansiering & lånedokumentation
          </h3>
          <KommerSnartCard
            title="Bank-klar lånedokumentation"
            beskrivelse="Omkostningsestimering, lånedokumentation og entrepriseforsikring baseret på dit byggeønske."
          />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 8.2: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 8.3: Commit**

```bash
git add src/components/cockpit/sections/OkonomiSection.tsx
git commit -m "feat(cockpit): add OkonomiSection with VUR data and KommerSnart for EMOData/financing"
```

---

## Task 9: DatakilderSection

Erstatter `CockpitStatusBar`. Viser en enkelt statuslinje per `DataSourceKind` med farvet dot. Blokerede kilder (energimaerke, servitutter) vises med grå dot og "Ikke tilgængeligt endnu".

**Data mapping:** `dataStatus` og `dataLastFetchedAt` fra project-store.

**Files:**
- Create: `src/components/cockpit/sections/DatakilderSection.tsx`

- [ ] **Step 9.1: Opret `DatakilderSection.tsx`**

```tsx
// src/components/cockpit/sections/DatakilderSection.tsx
import { RefreshCw } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { DATA_SOURCE_LABELS, type DataSourceKind, type DataSourceStatus } from "@/types/project-state";
import { cn } from "@/lib/utils";

// Blokerede kilder i nuværende miljø — vises med grå dot
const BLOKEREDE: readonly DataSourceKind[] = ["energimaerke", "servitutter"];

const DOT: Record<DataSourceStatus, string> = {
  fresh: "bg-emerald-400",
  stale: "bg-amber-400",
  missing: "bg-amber-400",
  loading: "bg-sky-400 animate-pulse",
  error: "bg-danger",
};

const LABEL: Record<DataSourceStatus, string> = {
  fresh: "Live",
  stale: "Forældet",
  missing: "Mangler",
  loading: "Henter…",
  error: "Fejl",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "–";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.round(h / 24)} dage siden`;
}

type DatakilderSectionProps = {
  onRefreshAll: () => void;
  isRefreshing: boolean;
};

export function DatakilderSection({ onRefreshAll, isRefreshing }: DatakilderSectionProps) {
  const dataStatus = useProject((s) => s.dataStatus);
  const lastFetchedAt = useProject((s) => s.dataLastFetchedAt);

  const kinds = Object.keys(dataStatus) as DataSourceKind[];

  return (
    <section aria-label="Datakilder">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-foreground">Datakilder</h2>
          <div className="flex items-center gap-3">
            {lastFetchedAt && (
              <span className="text-xs text-muted-foreground">
                Opdateret {formatRelative(lastFetchedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={isRefreshing}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors",
                isRefreshing
                  ? "border-border/40 text-muted-foreground cursor-wait"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <RefreshCw size={11} className={cn(isRefreshing && "animate-spin")} />
              {isRefreshing ? "Henter…" : "Genindlæs"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {kinds.map((kind) => {
            const isBlokeret = BLOKEREDE.includes(kind);
            const status = dataStatus[kind];
            return (
              <div key={kind} className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    isBlokeret ? "bg-muted-foreground/30" : DOT[status],
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {DATA_SOURCE_LABELS[kind]}
                </span>
                {isBlokeret && (
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    KOMMER SNART
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 9.2: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 9.3: Commit**

```bash
git add src/components/cockpit/sections/DatakilderSection.tsx
git commit -m "feat(cockpit): add DatakilderSection replacing CockpitStatusBar"
```

---

## Task 10: Sammensæt alt i `projekt.$id.cockpit.tsx`

Erstat 3-tab-layout + `AnalyseTab` med `CockpitLayout` + de seks sektioner. Al data-fetching via `useCockpitAnalysis` + `useCockpitRestore` bibeholdes uændret. `CockpitStatusBar` og `StatusStripe` fjernes (erstattet af hhv. `DatakilderSection` og `VerdiktSection`).

**Files:**
- Modify: `src/routes/projekt.$id.cockpit.tsx` — **beskyttet fil, kræver review**

- [ ] **Step 10.1: Erstat `CockpitContent` med ny implementation**

Den komplette nye `CockpitContent`-funktion erstatter den eksisterende (linje 142-291). Behold `HardStopBanner`, `CockpitPage` og route-definition uændret.

```tsx
// Tilføj imports øverst i filen (behold eksisterende imports fra hooks/lib)
import { CockpitLayout } from "@/components/cockpit/layout/CockpitLayout";
import { VerdiktSection } from "@/components/cockpit/sections/VerdiktSection";
import { OpmærksomhedSection } from "@/components/cockpit/sections/OpmærksomhedSection";
import { GrundenSection } from "@/components/cockpit/sections/GrundenSection";
import { PlanReguleringSection } from "@/components/cockpit/sections/PlanReguleringSection";
import { OkonomiSection } from "@/components/cockpit/sections/OkonomiSection";
import { DatakilderSection } from "@/components/cockpit/sections/DatakilderSection";

// Erstat CockpitContent-funktionen:
function CockpitContent({ adresseId }: { adresseId: string }) {
  const { tab: _tab, projectId: searchProjectId } = Route.useSearch();

  const { address, bbrData, complianceMetrics, currentProjectId } = useProject();

  const setSnapshotPatchRef = useRef<((p: Partial<AnalysisSnapshot>) => void) | null>(null);

  const { restorePhase } = useCockpitRestore({
    adresseId,
    searchProjectId,
    onSnapshotRestored: (patch) => setSnapshotPatchRef.current?.(patch),
  });

  const {
    status,
    fetchError,
    analysisSnapshot,
    isRecomputing,
    setSnapshotPatch,
    triggerRefresh,
  } = useCockpitAnalysis({ adresseId, restorePhase });

  setSnapshotPatchRef.current = setSnapshotPatch;

  if (status === "loading") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <LoadingView />
        </div>
      </PageTransition>
    );
  }

  if (status === "error") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <ErrorView message={fetchError ?? "Ukendt fejl."} onRetry={triggerRefresh} />
        </div>
      </PageTransition>
    );
  }

  if (!bbrData) return null;

  return (
    <CockpitLayout
      adresse={address?.adresse ?? adresseId}
      adresseId={adresseId}
      projectId={currentProjectId ?? searchProjectId}
    >
      {() => (
        <>
          <VerdiktSection metrics={complianceMetrics} />
          <OpmærksomhedSection onOpenDetails={() => {}} />
          <GrundenSection
            bbr={bbrData}
            metrics={complianceMetrics}
            naboer={analysisSnapshot.naboer}
          />
          <PlanReguleringSection
            lokalplaner={analysisSnapshot.lokalplaner}
            servitutter={analysisSnapshot.servitutter}
          />
          <OkonomiSection />
          <DatakilderSection onRefreshAll={triggerRefresh} isRefreshing={isRecomputing} />
        </>
      )}
    </CockpitLayout>
  );
}
```

- [ ] **Step 10.2: Fjern ubrugte imports fra `projekt.$id.cockpit.tsx`**

Fjern disse imports da de ikke længere bruges:
- `CockpitStatusBar`
- `AnalyseTab`, `type AnalyseTabData`, `type AnalyseTabCallbacks`
- `EjendomPanel`
- `OekonomiPanel`
- `cn` (hvis ikke brugt andetsteds)
- `motion` fra framer-motion (hvis ikke brugt)

- [ ] **Step 10.3: Kør typecheck + tests + build**

```bash
bunx tsc --noEmit
bun test src
bun run build
```

Forventet: ingen nye TypeScript-fejl. Eksisterende tests må ikke brydes.

- [ ] **Step 10.4: Commit — markér beskyttet fil**

```bash
git add src/routes/projekt.$id.cockpit.tsx src/components/cockpit/
git commit -m "feat(cockpit): replace tab layout with sidebar sections — rører beskyttet fil"
```

---

## Selvreview mod spec

### Spec-dækning
| Krav | Dækket | Task |
|------|--------|------|
| Sidebar-navigation med 6 sektioner | ✅ | Task 3 |
| "Du kan bygge her." verdict hero | ✅ | Task 4 |
| Projekt-readiness progress bar | ✅ | Task 1 + 4 |
| Åbn plantegning CTA i header | ✅ | Task 3 |
| Top-3 opmærksomhed med "Vis alle (N)" | ✅ | Task 5 |
| Grunden: kort + grundareal/bebygget/maks | ✅ | Task 6 |
| "Vis alle felter" progressive disclosure | ✅ | Task 6 |
| Datakilder med status-dots | ✅ | Task 9 |
| Ingen mock-labels til brugeren | ✅ | Task 2 |
| KommerSnart for EMOData (Blokeret) | ✅ | Task 8 |
| KommerSnart for Tinglysning (Blokeret) | ✅ | Task 7 |
| `northOrientation` vises ikke | ✅ | Task 6 (udeladt fra feltliste) |
| `fortidsminde` vises ikke | ✅ | Ikke inkluderet i nogen sektion |

### Governance-observationer fra dataarkitektur-artefakt
- `adgangsadresseid` mangler stadig ofte i første UI-state — ingen ny risiko introduceret
- `hard_stop` bruges kun fra typed kolonne — Rule 4 overholdt
- Ingen nye direkte Supabase-kald i UI-komponenter — Rule 2 overholdt
- Compliance-signaler læses kun fra `complianceFlags` via `useProject()` — Rule 5 overholdt
