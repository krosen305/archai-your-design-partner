# Maskinrummet UX 10/10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Løft Maskinrummet fra et informationsdashboard til et rigtigt cockpit — wire brudte CTAs, tilføj brugerintention (byggeønsker), styrk den visuelle hierarki og afslut journeyen med en klar næste-skridt.

**Architecture:** Alle ændringer er rene UI/adapter-lag. Ingen compliance-logik eller domain-core ændres. `ByggeønskerSection` læser og skriver direkte via `useProject().setByggeoenske` — det er allerede i store. `ReadinessDetail` er en ren beregningskomponent baseret på eksisterende `dataStatus` og `complianceFlags`.

**Tech Stack:** React, TanStack Router (`Link`), Framer Motion, Zustand (`useProject`), Tailwind CSS, Lucide icons, `bun test`

**Bruger-note:** `KommerSnartCard`-labels bevares intentionelt under udvikling for overblikkets skyld.

---

## Filstruktur

**Nye filer:**

- `src/components/cockpit/ReadinessDetail.tsx` — viser konkret hvad der mangler (max 3 chips)
- `src/components/cockpit/sections/ByggeønskerSection.tsx` — brugerintent-input med byggeønsker fra store
- `src/components/cockpit/sections/NaesteStepSection.tsx` — journey-afslutning med næste-skridt guidance

**Ændrede filer:**

- `src/components/cockpit/layout/CockpitSidebar.tsx` — omdøb "Verdict"→"Oversigt", tilføj nye sektioner
- `src/components/cockpit/layout/CockpitLayout.tsx` — fix IntersectionObserver threshold, pass dataStatus til header
- `src/components/cockpit/layout/CockpitHeader.tsx` — tilføj data-freshness statusbadge
- `src/components/cockpit/sections/VerdiktSection.tsx` — wire CTA, hero-behandling, ReadinessDetail
- `src/components/cockpit/sections/OpmærksomhedSection.tsx` — inline flag-detaljer expand
- `src/components/cockpit/sections/GrundenSection.tsx` — full-width map, metrics-grid nedenunder
- `src/routes/projekt.$id.cockpit.tsx` — pass adresseId/projectId til VerdiktSection, tilføj nye sektioner

---

## Task 1: Omdøb "Verdict" → "Oversigt" og fix IntersectionObserver

**Files:**

- Modify: `src/components/cockpit/layout/CockpitSidebar.tsx`
- Modify: `src/components/cockpit/layout/CockpitLayout.tsx`

Ingen tests nødvendige for disse to renaming/config-ændringer — det er ren UI og browser API.

- [ ] **Step 1: Omdøb sidebar-label**

I `src/components/cockpit/layout/CockpitSidebar.tsx`, erstat linjen:

```ts
{ id: "verdict", label: "Verdict" },
```

med:

```ts
{ id: "verdict", label: "Oversigt" },
```

- [ ] **Step 2: Fix IntersectionObserver threshold**

I `src/components/cockpit/layout/CockpitLayout.tsx`, erstat:

```ts
{ threshold: 0.3 },
```

med:

```ts
{ threshold: [0.1, 0.3], rootMargin: "-10% 0px -60% 0px" },
```

`rootMargin: "-10% 0px -60% 0px"` betyder at sektionen markeres aktiv når dens top er 10% fra toppen af viewport — præcis hvad man forventer af en sticky nav.

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/layout/CockpitSidebar.tsx src/components/cockpit/layout/CockpitLayout.tsx
git commit -m "ux(cockpit): rename Verdict→Oversigt, fix IntersectionObserver rootMargin"
```

---

## Task 2: Wire VerdiktSection "Åbn plantegning" CTA

**Files:**

- Modify: `src/components/cockpit/sections/VerdiktSection.tsx`
- Modify: `src/routes/projekt.$id.cockpit.tsx`

- [ ] **Step 1: Udvid VerdiktSection props**

I `src/components/cockpit/sections/VerdiktSection.tsx`, tilføj `adresseId` og `projectId` til type og import `Link`:

```tsx
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type VerdiktSectionProps = {
  metrics: ComplianceMetrics | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
  adresseId: string;
  projectId: string | undefined;
};
```

- [ ] **Step 2: Erstat button med Link**

Find blokken:

```tsx
{
  kanBygge && (
    <div className="mt-6">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
        onClick={() => {
          // Navigation håndteres af CockpitHeader-knappen
          // Denne knap er et visuelt anker — routenavigation kobles på i Task 10
        }}
      >
        Åbn plantegning →
      </button>
    </div>
  );
}
```

Erstat med:

```tsx
{
  kanBygge && (
    <div className="mt-6">
      <Link
        to="/projekt/$id/plantegning"
        params={{ id: adresseId }}
        search={{ projectId }}
        className="inline-flex items-center gap-2 rounded-md bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
      >
        Åbn plantegning →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Pass props fra route**

I `src/routes/projekt.$id.cockpit.tsx`, erstat:

```tsx
<VerdiktSection metrics={complianceMetrics} registerSection={registerSection} />
```

med:

```tsx
<VerdiktSection
  metrics={complianceMetrics}
  registerSection={registerSection}
  adresseId={adresseId}
  projectId={currentProjectId ?? searchProjectId}
/>
```

- [ ] **Step 4: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/sections/VerdiktSection.tsx src/routes/projekt.$id.cockpit.tsx
git commit -m "fix(cockpit): wire Åbn plantegning CTA til plantegning-route"
```

---

## Task 3: VerdiktSection hero-behandling + ReadinessDetail

**Files:**

- Create: `src/components/cockpit/ReadinessDetail.tsx`
- Modify: `src/components/cockpit/sections/VerdiktSection.tsx`

ReadinessDetail viser konkret hvad der holder readiness nede — max 3 chips, prioriteret: blockers → missing data.

- [ ] **Step 1: Opret ReadinessDetail.tsx**

Opret `src/components/cockpit/ReadinessDetail.tsx`:

```tsx
import {
  DATA_SOURCE_LABELS,
  type DataSourceKind,
  type DataSourceStatus,
} from "@/types/project-state";
import type { ComplianceFlag } from "@/types/project-state";

const HANDLINGSBARE_KILDER: readonly DataSourceKind[] = [
  "bbr",
  "lokalplaner",
  "kommuneplanramme",
  "fbb",
  "naturbeskyttelse",
  "arealdata",
  "dkjord",
  "geusRisk",
  "servitutter",
  "terrain",
  "fjernvarme",
  "naboer",
  "matGeometri",
  "vurdering",
  "tjekditnet",
  "energimaerke",
];

type ReadinessDetailProps = {
  dataStatus: Record<DataSourceKind, DataSourceStatus>;
  complianceFlags: ComplianceFlag[];
};

export function ReadinessDetail({ dataStatus, complianceFlags }: ReadinessDetailProps) {
  const flagBlockers = complianceFlags
    .filter((f) => f.status === "blocker" || f.status === "advarsel")
    .slice(0, 2)
    .map((f) => ({ label: f.label, type: f.status as "blocker" | "advarsel" }));

  const missingData = HANDLINGSBARE_KILDER.filter(
    (k) => dataStatus[k] === "missing" || dataStatus[k] === "error",
  )
    .slice(0, 3 - flagBlockers.length)
    .map((k) => ({ label: `${DATA_SOURCE_LABELS[k]} mangler`, type: "data" as const }));

  const items = [...flagBlockers, ...missingData].slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            item.type === "blocker"
              ? "border-danger/40 text-danger/90"
              : item.type === "advarsel"
                ? "border-amber-500/40 text-amber-400/90"
                : "border-border/50 text-muted-foreground"
          }`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Opgrader VerdiktSection til hero-behandling**

Erstat hele indholdet af `src/components/cockpit/sections/VerdiktSection.tsx` med:

```tsx
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import { ReadinessDetail } from "@/components/cockpit/ReadinessDetail";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type VerdiktSectionProps = {
  metrics: ComplianceMetrics | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
  adresseId: string;
  projectId: string | undefined;
};

export function VerdiktSection({
  metrics,
  registerSection,
  adresseId,
  projectId,
}: VerdiktSectionProps) {
  const { hard_stop, hard_stop_reason, complianceFlags, dataStatus } = useProject();

  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);
  const kanBygge = !hard_stop;
  const maxAreal = metrics?.maxBygningsareal ?? null;
  const maxEtager = metrics?.maxEtager ?? null;

  const metrikLinje = [
    maxAreal != null ? `Op til ${maxAreal} m²` : null,
    maxEtager != null ? `${maxEtager} etage${maxEtager !== 1 ? "r" : ""}` : null,
    kanBygge ? "ingen hard stops" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section ref={(el) => registerSection("verdict", el)} aria-label="Oversigt">
      {/* Hero-behandling: ingen card-border, fuld bredde, gradient-baggrund */}
      <div
        className="relative overflow-hidden rounded-xl p-10"
        style={{
          background:
            "radial-gradient(ellipse at 15% 50%, rgba(200,255,0,0.05) 0%, transparent 65%), #0d0d0d",
        }}
      >
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

        <div
          className={`mt-2 h-[3px] w-16 rounded-full ${kanBygge ? "bg-[#c8ff00]" : "bg-danger"}`}
        />

        {metrikLinje && <p className="mt-4 text-base text-muted-foreground">{metrikLinje}</p>}

        {!kanBygge && hard_stop_reason && (
          <p className="mt-3 text-sm text-danger/90 leading-relaxed">{hard_stop_reason}</p>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Projekt-readiness <span className="text-foreground font-medium">{readiness}%</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${readiness}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-[#c8ff00]"
            />
          </div>
          <ReadinessDetail dataStatus={dataStatus} complianceFlags={complianceFlags} />
        </div>

        {kanBygge && (
          <div className="mt-8">
            <Link
              to="/projekt/$id/plantegning"
              params={{ id: adresseId }}
              search={{ projectId }}
              className="inline-flex items-center gap-2 rounded-md bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
            >
              Åbn plantegning →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/ReadinessDetail.tsx src/components/cockpit/sections/VerdiktSection.tsx
git commit -m "ux(cockpit): hero-behandling af VerdiktSection + ReadinessDetail chips"
```

---

## Task 4: OpmærksomhedSection — inline flag-detaljer

**Files:**

- Modify: `src/components/cockpit/sections/OpmærksomhedSection.tsx`

`ComplianceFlag` har allerede felterne `detalje`, `aktuelVærdi`, `tilladt`, `dispensationMulig` og `dispensationMyndighed`. Vi viser dem inline ved klik — ingen modal, ingen prop-callbacks.

- [ ] **Step 1: Erstat hele OpmærksomhedSection.tsx**

```tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProject } from "@/lib/project-store";
import type { ComplianceFlag } from "@/types/project-state";
import { cn } from "@/lib/utils";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

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

const STATUS_LABEL: Record<ComplianceFlag["status"], string> = {
  blocker: "Blokerer",
  advarsel: "Advarsel",
  ok: "OK",
};

type OpmærksomhedSectionProps = {
  onOpenDetails: (flagId: string) => void;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

function FlagRow({ flag }: { flag: ComplianceFlag }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetalje = !!(flag.detalje || flag.aktuelVærdi || flag.tilladt || flag.dispensationMulig);

  return (
    <li className="py-3 border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={() => hasDetalje && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left",
          hasDetalje ? "cursor-pointer" : "cursor-default",
        )}
        aria-expanded={hasDetalje ? expanded : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn("size-2 shrink-0 rounded-full", DOT_COLOR[flag.status])}
            aria-label={STATUS_LABEL[flag.status]}
          />
          <span className="text-sm text-foreground truncate">{flag.label}</span>
        </div>
        {hasDetalje && (
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>

      {expanded && hasDetalje && (
        <div className="mt-3 ml-5 space-y-2 text-sm">
          {flag.detalje && <p className="text-muted-foreground leading-relaxed">{flag.detalje}</p>}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {flag.aktuelVærdi != null && (
              <>
                <dt className="text-muted-foreground">Aktuel værdi</dt>
                <dd className="text-foreground">{flag.aktuelVærdi}</dd>
              </>
            )}
            {flag.tilladt != null && (
              <>
                <dt className="text-muted-foreground">Tilladt</dt>
                <dd className="text-foreground">{flag.tilladt}</dd>
              </>
            )}
          </dl>
          {flag.dispensationMulig && (
            <p className="text-xs text-amber-400/80">
              Dispensation mulig
              {flag.dispensationMyndighed ? ` via ${flag.dispensationMyndighed}` : ""}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function OpmærksomhedSection({
  onOpenDetails: _onOpenDetails,
  registerSection,
}: OpmærksomhedSectionProps) {
  const { complianceFlags } = useProject();
  const [visAlle, setVisAlle] = useState(false);

  const sorted = [...complianceFlags].sort(
    (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status],
  );

  const visibleFlags = visAlle ? sorted : sorted.slice(0, 3);
  const skjulteAntal = sorted.length - 3;
  const harSkjulte = !visAlle && skjulteAntal > 0;

  if (complianceFlags.length === 0) return null;

  const aktiveFejl = sorted.filter((f) => f.status !== "ok").length;

  return (
    <section ref={(el) => registerSection("opmærksomhed", el)} aria-label="Opmærksomhed">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">
          {aktiveFejl > 0
            ? `${aktiveFejl} ting kræver din opmærksomhed`
            : "Ingen opmærksomhedspunkter"}
        </h2>

        <ul>
          {visibleFlags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} />
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

- [ ] **Step 2: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/sections/OpmærksomhedSection.tsx
git commit -m "ux(cockpit): inline flag-detaljer i OpmærksomhedSection — detalje, aktuelVærdi, tilladt"
```

---

## Task 5: GrundenSection — full-width MatrikelMap

**Files:**

- Modify: `src/components/cockpit/sections/GrundenSection.tsx`

MatrikelMap er allerede en komplet komponent med lag-toggle, parcel-outline, HARD STOP overlay og rotation. Den fortjener fuld bredde. Nøgletallene flyttes til en 4-kolonne grid under kortet.

- [ ] **Step 1: Erstat layout i GrundenSection.tsx**

Find layout-blokken (linje 59–105 i original):

```tsx
<div className="grid grid-cols-[1fr_auto] gap-6 items-start">
  <div className="rounded-lg overflow-hidden" style={{ minHeight: 180 }}>
    <MatrikelMap ... />
  </div>
  <div className="space-y-5 min-w-[140px]">
    {grundareal != null && <Måletal ... />}
    ...
  </div>
</div>
```

Erstat med:

```tsx
{
  /* Kort i fuld bredde */
}
<div className="rounded-lg overflow-hidden" style={{ minHeight: 340 }}>
  <MatrikelMap bbr={bbr} metrics={metrics} naboer={naboer} jordstykkeLokalId={jordstykkeId} />
</div>;

{
  /* Nøgletal i grid under kortet */
}
<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
  {grundareal != null && <Måletal label="Grundareal" value={`${grundareal} m²`} />}
  {zone && <Måletal label="Zone" value={zone} />}
  {bebygget != null && <Måletal label="Bebygget i dag" value={`${bebygget} m²`} />}
  {maksAreal != null && <Måletal label="Maks tilladt" value={`${maksAreal} m²`} />}
</div>;
```

- [ ] **Step 2: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/sections/GrundenSection.tsx
git commit -m "ux(cockpit): full-width MatrikelMap i GrundenSection, metrics-grid under kort"
```

---

## Task 6: ByggeønskerSection

**Files:**

- Create: `src/components/cockpit/sections/ByggeønskerSection.tsx`
- Modify: `src/components/cockpit/layout/CockpitSidebar.tsx`
- Modify: `src/routes/projekt.$id.cockpit.tsx`

`Byggeoenske` og `setByggeoenske` lever allerede i `useProject()`. Sektionen vises mellem Grunden og Plan & regulering.

- [ ] **Step 1: Opret ByggeønskerSection.tsx**

Opret `src/components/cockpit/sections/ByggeønskerSection.tsx`:

```tsx
import { useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";
import type { Byggeoenske } from "@/types/project-state";

type ByggeønskerSectionProps = {
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

type OptionButtonProps<T extends string | number> = {
  value: T;
  current: T | undefined;
  label: string;
  onSelect: (v: T) => void;
};

function OptionButton<T extends string | number>({
  value,
  current,
  label,
  onSelect,
}: OptionButtonProps<T>) {
  const isActive = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-md border px-4 py-2 text-sm transition-colors",
        isActive
          ? "border-[#c8ff00]/60 bg-[#c8ff00]/10 text-foreground"
          : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

const BYGGETYPE_OPTIONS: Array<{ value: Byggeoenske["byggetype"]; label: string }> = [
  { value: "nybyg", label: "Nybyg" },
  { value: "tilbyg", label: "Tilbygning" },
  { value: "ombyg", label: "Ombygning" },
];

const ETAGER_OPTIONS: Array<{ value: Byggeoenske["antalEtager"]; label: string }> = [
  { value: 1, label: "1 etage" },
  { value: 1.5, label: "1½ etage" },
  { value: 2, label: "2 etager" },
];

export function ByggeønskerSection({ registerSection }: ByggeønskerSectionProps) {
  const { byggeoenske, setByggeoenske } = useProject();

  return (
    <section ref={(el) => registerSection("byggeønsker", el)} aria-label="Byggeønsker">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Byggeønsker</h2>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground mb-3">Hvad vil du bygge?</p>
          <div className="flex flex-wrap gap-2">
            {BYGGETYPE_OPTIONS.map(({ value, label }) => (
              <OptionButton
                key={String(value)}
                value={value as string}
                current={byggeoenske.byggetype}
                label={label}
                onSelect={(v) => setByggeoenske({ byggetype: v as Byggeoenske["byggetype"] })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground" htmlFor="oensket-areal">
            Ønsket areal (m²)
          </label>
          <input
            id="oensket-areal"
            type="number"
            min={10}
            max={2000}
            step={5}
            value={byggeoenske.oensketAreal ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setByggeoenske({ oensketAreal: Number.isNaN(n) ? undefined : n });
            }}
            placeholder="f.eks. 120"
            className="w-40 rounded-md border border-border/40 bg-[#111] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#c8ff00]/60 focus:outline-none transition-colors"
          />
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground mb-3">Antal etager</p>
          <div className="flex flex-wrap gap-2">
            {ETAGER_OPTIONS.map(({ value, label }) => (
              <OptionButton
                key={String(value)}
                value={value as number}
                current={byggeoenske.antalEtager}
                label={label}
                onSelect={(v) => setByggeoenske({ antalEtager: v as Byggeoenske["antalEtager"] })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground mb-3">Budget</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "under-3", label: "Under 3 mio." },
                { value: "3-5", label: "3–5 mio." },
                { value: "5-8", label: "5–8 mio." },
                { value: "8-12", label: "8–12 mio." },
                { value: "over-12", label: "Over 12 mio." },
              ] as Array<{ value: Byggeoenske["budget"]; label: string }>
            ).map(({ value, label }) => (
              <OptionButton
                key={String(value)}
                value={value as string}
                current={byggeoenske.budget}
                label={label}
                onSelect={(v) => setByggeoenske({ budget: v as Byggeoenske["budget"] })}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Tilføj "byggeønsker" til SidebarSection type og SIDEBAR_ITEMS**

I `src/components/cockpit/layout/CockpitSidebar.tsx`:

Erstat:

```ts
export type SidebarSection =
  | "verdict"
  | "opmærksomhed"
  | "grunden"
  | "plan"
  | "økonomi"
  | "datakilder";

export const SIDEBAR_ITEMS: Array<{ id: SidebarSection; label: string }> = [
  { id: "verdict", label: "Oversigt" },
  { id: "opmærksomhed", label: "Opmærksomhed" },
  { id: "grunden", label: "Grunden" },
  { id: "plan", label: "Plan & regulering" },
  { id: "økonomi", label: "Økonomi" },
  { id: "datakilder", label: "Datakilder" },
];
```

med:

```ts
export type SidebarSection =
  | "verdict"
  | "opmærksomhed"
  | "grunden"
  | "byggeønsker"
  | "plan"
  | "økonomi"
  | "datakilder";

export const SIDEBAR_ITEMS: Array<{ id: SidebarSection; label: string }> = [
  { id: "verdict", label: "Oversigt" },
  { id: "opmærksomhed", label: "Opmærksomhed" },
  { id: "grunden", label: "Grunden" },
  { id: "byggeønsker", label: "Byggeønsker" },
  { id: "plan", label: "Plan & regulering" },
  { id: "økonomi", label: "Økonomi" },
  { id: "datakilder", label: "Datakilder" },
];
```

- [ ] **Step 3: Tilføj ByggeønskerSection i route**

I `src/routes/projekt.$id.cockpit.tsx`, tilføj import:

```tsx
import { ByggeønskerSection } from "@/components/cockpit/sections/ByggeønskerSection";
```

Tilføj sektionen i `CockpitContent` JSX, efter `<GrundenSection ...>` og før `<PlanReguleringSection ...>`:

```tsx
<ByggeønskerSection registerSection={registerSection} />
```

- [ ] **Step 4: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/sections/ByggeønskerSection.tsx src/components/cockpit/layout/CockpitSidebar.tsx src/routes/projekt.$id.cockpit.tsx
git commit -m "feat(cockpit): tilføj ByggeønskerSection med byggetype, areal, etager og budget"
```

---

## Task 7: DatakilderSection — tilføj status-badge i CockpitHeader

**Files:**

- Modify: `src/components/cockpit/layout/CockpitHeader.tsx`
- Modify: `src/components/cockpit/layout/CockpitLayout.tsx`
- Modify: `src/routes/projekt.$id.cockpit.tsx`

Tilføj et minimalt status-badge i headeren der viser samlet data-sundhed (fresh/stale/fejl) — så brugere ikke behøver scrolle til bunden for at se om data er opdateret.

- [ ] **Step 1: Definer dataHealthSummary-hjælpefunktion**

I `src/components/cockpit/layout/CockpitHeader.tsx`, tilføj øverst (efter imports):

```tsx
import type { DataSourceKind, DataSourceStatus } from "@/types/project-state";

const HANDLINGSBARE_HEADER_KILDER: readonly DataSourceKind[] = [
  "bbr",
  "lokalplaner",
  "kommuneplanramme",
  "fbb",
  "naturbeskyttelse",
  "arealdata",
  "dkjord",
  "geusRisk",
  "terrain",
  "naboer",
  "matGeometri",
  "vurdering",
];

type DataHealth = "fresh" | "stale" | "error";

function dataHealthSummary(
  dataStatus: Record<DataSourceKind, DataSourceStatus> | undefined,
): DataHealth {
  if (!dataStatus) return "stale";
  const hasError = HANDLINGSBARE_HEADER_KILDER.some((k) => dataStatus[k] === "error");
  if (hasError) return "error";
  const hasFresh = HANDLINGSBARE_HEADER_KILDER.some((k) => dataStatus[k] === "fresh");
  return hasFresh ? "fresh" : "stale";
}

const HEALTH_DOT: Record<DataHealth, string> = {
  fresh: "bg-emerald-400",
  stale: "bg-amber-400",
  error: "bg-danger",
};

const HEALTH_LABEL: Record<DataHealth, string> = {
  fresh: "Data opdateret",
  stale: "Data mangler",
  error: "Datafejl",
};
```

- [ ] **Step 2: Udvid CockpitHeaderProps og render badge**

Erstat hele `CockpitHeader.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { LayoutTemplate, Share2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataSourceKind, DataSourceStatus } from "@/types/project-state";

const HANDLINGSBARE_HEADER_KILDER: readonly DataSourceKind[] = [
  "bbr",
  "lokalplaner",
  "kommuneplanramme",
  "fbb",
  "naturbeskyttelse",
  "arealdata",
  "dkjord",
  "geusRisk",
  "terrain",
  "naboer",
  "matGeometri",
  "vurdering",
];

type DataHealth = "fresh" | "stale" | "error";

function dataHealthSummary(
  dataStatus: Record<DataSourceKind, DataSourceStatus> | undefined,
): DataHealth {
  if (!dataStatus) return "stale";
  const hasError = HANDLINGSBARE_HEADER_KILDER.some((k) => dataStatus[k] === "error");
  if (hasError) return "error";
  const hasFresh = HANDLINGSBARE_HEADER_KILDER.some((k) => dataStatus[k] === "fresh");
  return hasFresh ? "fresh" : "stale";
}

const HEALTH_DOT: Record<DataHealth, string> = {
  fresh: "bg-emerald-400",
  stale: "bg-amber-400",
  error: "bg-danger",
};

const HEALTH_LABEL: Record<DataHealth, string> = {
  fresh: "Data opdateret",
  stale: "Data mangler",
  error: "Datafejl",
};

type CockpitHeaderProps = {
  adresse: string;
  adresseId: string;
  projectId: string | undefined;
  dataStatus?: Record<DataSourceKind, DataSourceStatus>;
};

export function CockpitHeader({ adresse, adresseId, projectId, dataStatus }: CockpitHeaderProps) {
  const health = dataHealthSummary(dataStatus);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-foreground truncate max-w-[40%]">{adresse}</span>
        <span
          title={HEALTH_LABEL[health]}
          aria-label={HEALTH_LABEL[health]}
          className={cn("size-2 shrink-0 rounded-full", HEALTH_DOT[health])}
        />
      </div>
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

- [ ] **Step 3: Pass dataStatus fra CockpitLayout til CockpitHeader**

I `src/components/cockpit/layout/CockpitLayout.tsx`, udvid `CockpitLayoutProps`:

```tsx
import { useProject } from "@/lib/project-store";
```

Hent dataStatus i CockpitLayout:

```tsx
export function CockpitLayout({ adresse, adresseId, projectId, children }: CockpitLayoutProps) {
  const dataStatus = useProject((s) => s.dataStatus);
  // ... eksisterende kode ...

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <CockpitHeader
        adresse={adresse}
        adresseId={adresseId}
        projectId={projectId}
        dataStatus={dataStatus}
      />
      {/* ... resten uændret */}
    </div>
  );
}
```

- [ ] **Step 4: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/layout/CockpitHeader.tsx src/components/cockpit/layout/CockpitLayout.tsx
git commit -m "ux(cockpit): data-sundhed statusbadge i CockpitHeader"
```

---

## Task 8: NaesteStepSection — journey-afslutning

**Files:**

- Create: `src/components/cockpit/sections/NaesteStepSection.tsx`
- Modify: `src/components/cockpit/layout/CockpitSidebar.tsx`
- Modify: `src/routes/projekt.$id.cockpit.tsx`

Myndighed-route eksisterer endnu ikke. Sektionen viser næste skridt og sætter forventning — den er ikke en broken link.

- [ ] **Step 1: Opret NaesteStepSection.tsx**

Opret `src/components/cockpit/sections/NaesteStepSection.tsx`:

```tsx
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type NaesteStepSectionProps = {
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

const NAESTE_TRIN = [
  {
    nummer: "01",
    titel: "Byg på plantegning",
    beskrivelse: "Åbn plantegningsværktøjet og definer din bygnings præcise placering og form.",
  },
  {
    nummer: "02",
    titel: "Indhent tilbud",
    beskrivelse: "Brug budgetestimatet som udgangspunkt for at indhente tilbud fra entreprenører.",
  },
  {
    nummer: "03",
    titel: "Ansøg om byggetilladelse",
    beskrivelse:
      "Forbered ansøgningsmaterialet til kommunen. Vi hjælper dig med at samle dokumentation.",
    kommerSnart: true,
  },
];

export function NaesteStepSection({ registerSection }: NaesteStepSectionProps) {
  const { dataStatus, complianceFlags, hard_stop } = useProject();
  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);

  if (readiness < 20) return null;

  return (
    <section ref={(el) => registerSection("næste", el)} aria-label="Næste skridt">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-6">Næste skridt</h2>

        <ol className="space-y-5">
          {NAESTE_TRIN.map((trin) => (
            <li key={trin.nummer} className="flex gap-4">
              <span className="font-mono text-[11px] tracking-[0.15em] text-[#c8ff00]/70 shrink-0 mt-0.5">
                {trin.nummer}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{trin.titel}</p>
                  {trin.kommerSnart && (
                    <span className="font-mono text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1">
                      KOMMER SNART
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {trin.beskrivelse}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {!hard_stop && (
          <div className="mt-6 rounded-lg border border-border/30 bg-[#111] px-4 py-3 text-sm text-muted-foreground">
            Analyse-readiness: <span className="text-foreground font-medium">{readiness}%</span> —
            du er godt på vej.
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Tilføj "næste" til SidebarSection og SIDEBAR_ITEMS**

I `src/components/cockpit/layout/CockpitSidebar.tsx`, udvid type:

```ts
export type SidebarSection =
  | "verdict"
  | "opmærksomhed"
  | "grunden"
  | "byggeønsker"
  | "plan"
  | "økonomi"
  | "næste"
  | "datakilder";
```

Tilføj item (efter økonomi, før datakilder):

```ts
{ id: "næste", label: "Næste skridt" },
```

Den fulde SIDEBAR_ITEMS er nu:

```ts
export const SIDEBAR_ITEMS: Array<{ id: SidebarSection; label: string }> = [
  { id: "verdict", label: "Oversigt" },
  { id: "opmærksomhed", label: "Opmærksomhed" },
  { id: "grunden", label: "Grunden" },
  { id: "byggeønsker", label: "Byggeønsker" },
  { id: "plan", label: "Plan & regulering" },
  { id: "økonomi", label: "Økonomi" },
  { id: "næste", label: "Næste skridt" },
  { id: "datakilder", label: "Datakilder" },
];
```

- [ ] **Step 3: Tilføj NaesteStepSection i route**

I `src/routes/projekt.$id.cockpit.tsx`, tilføj import:

```tsx
import { NaesteStepSection } from "@/components/cockpit/sections/NaesteStepSection";
```

Tilføj sektionen efter `<OkonomiSection ...>` og før `<DatakilderSection ...>`:

```tsx
<NaesteStepSection registerSection={registerSection} />
```

- [ ] **Step 4: Verificér TypeScript**

```bash
bunx tsc --noEmit
```

Forventet output: ingen fejl.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/sections/NaesteStepSection.tsx src/components/cockpit/layout/CockpitSidebar.tsx src/routes/projekt.$id.cockpit.tsx
git commit -m "feat(cockpit): tilføj NaesteStepSection med journey-afslutning"
```

---

## Task 9: Polish — tilgængelighed og konsistens

**Files:**

- Modify: `src/components/cockpit/layout/CockpitSidebar.tsx`
- Modify: `src/components/cockpit/sections/ByggeønskerSection.tsx`

Minimale justeringer der giver stor tilgængelighed-gevinst.

- [ ] **Step 1: Focus-visible på sidebar-knapper**

I `src/components/cockpit/layout/CockpitSidebar.tsx`, find `className` på sidebar-knapperne og tilføj focus-visible:

Find:

```ts
"flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors w-full",
isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
```

Erstat med:

```ts
"flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors w-full",
"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8ff00]/60 rounded-sm",
isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
```

- [ ] **Step 2: Bump MASKINRUMMET label fra 9px til 11px**

I `src/components/cockpit/layout/CockpitSidebar.tsx`, erstat:

```tsx
<div className="px-4 mb-4 font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60">
```

med:

```tsx
<div className="px-4 mb-4 font-mono text-[11px] tracking-[0.15em] text-muted-foreground/60">
```

- [ ] **Step 3: Focus-visible på ByggeønskerSection input**

`ByggeønskerSection.tsx` input har allerede `focus:border-[#c8ff00]/60 focus:outline-none`. Tilføj `focus-visible:ring-1 focus-visible:ring-[#c8ff00]/40`:

Find:

```tsx
className =
  "w-40 rounded-md border border-border/40 bg-[#111] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#c8ff00]/60 focus:outline-none transition-colors";
```

Erstat med:

```tsx
className =
  "w-40 rounded-md border border-border/40 bg-[#111] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#c8ff00]/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c8ff00]/40 transition-colors";
```

- [ ] **Step 4: Verificér alt**

```bash
bunx tsc --noEmit && bun test src && bunx eslint . --max-warnings 0
```

Forventet output: alt grønt. Husk at lint kan have pre-existing warnings — brug `--max-warnings` baseret på nuværende baseline hvis 0 fejler.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/layout/CockpitSidebar.tsx src/components/cockpit/sections/ByggeønskerSection.tsx
git commit -m "a11y(cockpit): focus-visible styles og font-size bump på sidebar"
```

---

## Definition of Done

Alle tasks er færdige når:

- [ ] `bunx tsc --noEmit` — ingen fejl
- [ ] `bun test src` — ingen regressions
- [ ] `bunx eslint .` — ingen nye fejl
- [ ] `bun run build` — bygger rent
- [ ] "Åbn plantegning →" navigerer faktisk til plantegning-route
- [ ] Klikker man på et compliance-flag med `detalje` vises detaljer inline
- [ ] ByggeønskerSection viser og gemmer valg via `useProject().byggeoenske`
- [ ] Sidebar viser "Oversigt" (ikke "Verdict")
- [ ] Header viser grønt/gult/rødt status-dot baseret på data-sundhed
- [ ] NaesteStepSection vises når readiness > 20%
- [ ] MatrikelMap fylder fuld bredde i GrundenSection

---

## Scope der IKKE er i denne plan

Følgende er bevidst udeladt og kræver separate issues:

- **Persistering af byggeønsker** til Supabase `projects`-tabellen — kræver migration + repository-ændring
- **Myndighed-route** — næste fase i journeyen
- **Tinglyste servitutter** fra Tinglysning.dk
- **Energimærke og finansiering** i ØkonomiSection
- **Mobile layout** for sidebar og content
