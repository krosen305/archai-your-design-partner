## Mål

Opgradér UI'en fra et 4-trins wizard til et 5-fase flow (Discovery → Match → Finans → Engineering → Udbud) med tydeligere navigation, fase-gating og status-feedback. Backend (`src/integrations/`) og `projekt.compliance.tsx` rør vi ikke ved.

---

## Ny faseopdeling

| Fase | Rute(r) | Beskrivelse |
|---|---|---|
| 1 — Discovery | `/projekt/adresse` + `/projekt/hus-dna` | Adresse + AI-genereret Hus-DNA (erstatter `beskrivelse` + `brief`) |
| 2 — Match | `/projekt/match` | Konflikt-matrix (genbruger `bbrData` fra compliance) |
| 3 — Finans | `/projekt/finans` | Placeholder |
| 4 — Engineering | `/projekt/engineering` | Placeholder |
| 5 — Udbud | `/projekt/udbud` | Placeholder |

`projekt.compliance.tsx` bevares som intern "datahentnings"-rute (kaldes som mellemtrin før Match), men ændres ikke i adfærd. `projekt.beskrivelse.tsx` og `projekt.brief.tsx` bliver liggende uden links fra navigation.

---

## Filer der oprettes

- `src/lib/phases.ts` — central definition af de 5 faser (id, label, route, status-selector). Brugt af PhaseBar, sidebar og phase-gate.
- `src/components/phase-sidebar.tsx` — venstre sticky sidebar (kun ≥1280px).
- `src/routes/projekt.hus-dna.tsx` — 2-kolonne layout, upload + Hus-DNA output card.
- `src/routes/projekt.match.tsx` — konflikt-matrix (læser `bbrData` + `address` fra store).
- `src/routes/projekt.finans.tsx` — placeholder.
- `src/routes/projekt.engineering.tsx` — placeholder.
- `src/routes/projekt.udbud.tsx` — placeholder.

## Filer der opdateres

- `src/components/wizard-chrome.tsx` — erstat `StepDots` med ny `PhaseBar` (TopBar bevares).
- `src/routes/__root.tsx` — wrap routes (alle ud over `/`) i layout med `PhaseSidebar` + main content.
- `src/routes/index.tsx` — tilføj 5-kolonners fase-oversigt under CTA med stagger fade-in.
- `src/lib/project-store.ts` — tilføj `husDna` (mock genereret data) til store.
- `src/routes/projekt.adresse.tsx` — uændret destination (stadig `/projekt/compliance`), men compliance redirecter videre til `/projekt/match`. **Alle `data-testid` attributter bevares.**
- `src/routes/projekt.compliance.tsx` — **kun** ændring: `onContinue` peger på `/projekt/match` i stedet for `/projekt/beskrivelse`. Ingen UI-ændring.

---

## Komponentdetaljer

### PhaseBar (`wizard-chrome.tsx`)

- 5 chips i en horisontal stack, centreret i TopBar.
- Status pr. chip afledt af store via `phases.ts`: `complete | active | locked | error`.
- Styling pr. status (matcher spec):
  - complete → `bg-accent text-accent-foreground` + Check-ikon
  - active → `border border-accent text-foreground` + lille pulserende dot (`animate-pulse bg-accent`)
  - locked → `border border-[#333] text-[#555]` + Lock-ikon
  - error → `border border-danger text-danger` + AlertTriangle-ikon
- Klikbar kun på `complete`-faser (navigerer til faseroden).
- Mobil (<768px): collapser til "FASE N AF 5 · NAVN" + tynd progress-bar (accent fill, % = completed/5).
- Sticky i toppen via eksisterende `TopBar` wrapper.

### PhaseSidebar

- 240px bred, `bg-[#111111]`, `border-r border-[#222]`, sticky `top-14`.
- Kun synlig ≥1280px (`hidden xl:flex`).
- Vertikal liste over 5 faser:
  - Status-ikon (filled circle complete / pulserende ring active / outline circle locked).
  - Mono-label "FASE N · NAVN".
  - Sub-keys (adresse, Hus-DNA, BBR, lokalplan…) trukket fra store, prefixed med `└` og `text-muted-foreground`.

### Hus-DNA side (`/projekt/hus-dna`)

- Venstre kolonne (input):
  - StepHeader "Hvad drømmer du om?" + undertitel.
  - Drag-and-drop upload-zone (genbruger mønster fra `beskrivelse.tsx`, max 8 billeder, mock `picsum.photos`).
  - Tekstfelt 4 rækker.
  - CTA "Generér Hus-DNA →".
- Højre kolonne (output):
  - Før klik: tom illustration / hint.
  - Under generering (~2s setTimeout): skeleton + `.typing-caret` på "Analyserer billeder...".
  - Efter generering: HUS-DNA card med "AI" badge, sektioner ARKITEKTONISK STIL / NØGLETAL (key-value rows) / SÆRLIGE KRAV (chips med `border-accent/40 bg-accent/5 text-accent`) / CONFIDENCE bar (`bg-accent` fill).
- Mock-data hardcodet i komponenten (samme stil som nuværende `brief.tsx`).
- Ved klik på "Fortsæt" → `/projekt/compliance` (som så redirecter til `/projekt/match`).
- Mobil: kolonner stackes; output vises under input.

### Match side (`/projekt/match`)

- StepHeader "The Match" + undertitel.
- Compliance matrix card med 5 rækker; hver række har `border-l-[3px]` farvet (success/warning/danger):
  - Bebyggelsesprocent (success hvis ≤30, warning hvis ukendt, danger hvis >30) — værdier fra `bbrData.bebyggelsesprocent`.
  - Antal etager (success ≤2) — `bbrData.antal_etager`.
  - Bygningshøjde (warning, "Ukendt / max 8.5m" — ikke i BBR-data).
  - Servitutter (success, "Ingen kritiske" — mock).
  - Lokalplan (success, hardcoded LP-mock indtil videre + PDF-knap).
- Under matrix: 2-kolonne grid med "AI-VURDERING" card (kort fritekst + disclaimer) og "LOKALPLAN" card (navn, dato, kommune, PDF-knap med accent-border).
- Hvis `bbrData` mangler i store → vis tom-tilstand med knap "Hent BBR-data" der navigerer til `/projekt/compliance`.
- Bund-CTA: "Fortsæt til Finans →".

### Placeholder-sider (Finans / Engineering / Udbud)

- Ens layout via en lille intern komponent i hver fil (eller fælles `phase-coming-soon.tsx`):
  - StepHeader med fase-nummer + titel + undertitel.
  - Centreret card med `[KOMMER SNART]` badge (font-mono, border-accent/40, text-accent).
  - 2-3 sætningers beskrivelse + bullet-liste med konkrete features.
  - "Gå tilbage" knap + disabled "Fortsæt →" knap.

### Landing page (`/`)

- Bevar eksisterende hero + CTA.
- Tilføj under CTA: 5-kolonners grid (`grid-cols-2 md:grid-cols-5`):
  - Lille lucide-ikon (Search / GitMerge / Wallet / Hammer / FileSignature).
  - Mono-label.
  - `text-xs text-muted-foreground` beskrivelse.
  - Stagger fade-in via framer-motion (`delay: 0.1 * i`).

---

## Tekniske detaljer

- **Phase-gating logik** i `phases.ts`:
  - Fase 1 complete når `address && husDna` er sat i store.
  - Fase 2 complete når `complianceDone && bbrData`.
  - Fase 3-5 altid `locked` indtil videre.
  - Active = current route's fase.
- **Routing**: `__root.tsx` bruger ny layout-funktion der wrapper `Outlet` i `<div className="flex">` med `PhaseSidebar` + `<main className="flex-1">`. Welcome (`/`) bruger ingen sidebar — beholder fullscreen-struktur.
- **Compliance som mellemtrin**: når bruger klikker "Fortsæt" på Hus-DNA → naviger til `/projekt/compliance`, som ved success-state redirecter til `/projekt/match` i stedet for `/projekt/beskrivelse`. Ingen anden UI-ændring i compliance-siden.
- **Eksisterende `beskrivelse`/`brief` ruter**: efterlades urørt for at undgå brudte direkte links, men fjernes fra al synlig navigation. `StepDots` komponenten slettes (erstattes af PhaseBar).
- **Tests**: `tests/address-flow.spec.ts` forventer redirect til `/projekt/compliance` efter "Analysér adresse" — det bevares. Alle `data-testid`-attributter på adresse- og compliance-siden bevares uændret.
- **Design tokens**: alt holdes inden for eksisterende Tailwind-klasser og CSS-variabler (`bg-accent`, `text-accent`, `border-success/warning/danger`, `bg-[#1A1A1A]`, `border-[#222]`). Ingen nye CSS-filer.

## Out of scope

- Reelle AI-kald (alt er mock med setTimeout).
- Backend-ændringer i `src/integrations/`.
- Persistering af Hus-DNA i Supabase (kun in-memory i Zustand).
- Implementering af reel funktionalitet i fase 3-5.
