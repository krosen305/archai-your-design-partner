# UX-review: ArchAI — Builder's Cockpit

Bemærkning om "hent nyeste fra GitHub": Lovable og GitHub er bidirektionelt synkroniseret i realtid. Workspacet **er** allerede på nyeste commit. Hvis du har offline commits jeg ikke kan se, så skub dem først.

---

## Diagnose — kritiske fund

### A. Dobbeltkald og spildte requests

1. **`restoreProject` kaldes to gange** ved entry til cockpit. `__root.tsx` (linje 117) restorer på app-mount. `projekt.$id.cockpit.tsx` (linje 484) restorer igen i en `useEffect`. Begge hits Supabase + skriver i project-store. Symptom: kort "flicker" mellem restored state #1 og #2.
2. **Adressesøgning debounces kun 150 ms** (`projekt.adresse.tsx` linje 143). Netværksloggen viser separate `searchAddresses`-kald for `Has`, `Hass`, `Hasselv`, `Hasselvej`, `Hasselvej 40`, `Hasselvej 40,`, `Hasselvej 40, v` — 6 server fns på 5 sekunders typing. Bør være 300 ms + abort af tidligere request.
3. **`<Outlet key={location.pathname}>`** i `__root.tsx` (linje 176) tvinger fuld remount af *hver* route ved navigation. Det river al lokal state, scroll-position og effekter ned — og refetcher data der allerede er i store. Det er hovedårsagen til at overgange føles "hårde".
4. **Cockpit kører `fetchCompliance` → `runByggeanalyse`** i kæde (linje 567 + 599) uden at tjekke om `complianceDone` allerede er `true` fra restore. Ved fortsæt-fra-projektliste fyrer begge igen.
5. **`projekt.start.tsx`** dynamic-importerer `auth` og `projekt-service` i `useEffect` på hver mount (linje 19) — to vandfald-roundtrips før liste vises. Viser "ARCHAI"-loader 200–600 ms uden grund.

### B. Brudte / forkerte referencer

6. **`PhaseSidebar` er dead code.** Komponenten findes (`src/components/phase-sidebar.tsx`), `phases.ts` har sub-keys og statuser — men `__root.tsx` rendrer **ikke** sidebar'en. Fase-navigationen (Grundlaget → Cockpit → Teknik → Udbud) er det centrale paradigme i AGENTS.md, men brugeren ser den aldrig.
7. **Adresse → Cockpit URL bruger `s.adresseid` (DAR-ID)**, men cockpit-route hedder `$id` og bruges af `phaseForRoute` som `adresseid`. På `/projekt/start` bruges `projekt.adresse_dar_id`. Det er konsistent, men `address.adresseid` i store kan være `bbr` ved restore (`__root.tsx` linje 122 fallback) — så cockpit-URL'en kan diverge fra hvad sidebar-navigation laver.
8. **`projekt.teknik.tsx` og `projekt.udbud.tsx`** er 18-line `PhaseComingSoon`-stubs med `backTo="/projekt/adresse"` — ikke til cockpit. Bryder navigationsflow, brugeren kastes ud af projektkontekst.
9. **`/`-routen redirect-er via `useEffect`** efter mount (linje 30-34), så indloggede brugere ser auth-formen i ~50ms før redirect. Bør være `beforeLoad`.
10. **`ProjektDnaPanel` bruger 22 byggeønsker i ét accordion** i venstre kolonne (360px). Med Compliance-panel højre + matrikel-canvas midt giver det informationsoverload på 1160px viewport.

### C. Informationsarkitektur — strukturelle problemer

11. **Faser er ikke synlige i UI.** AGENTS.md beskriver 4 faser som hovedparadigme; brugeren ser kun TopBar med adresse-text. Ingen wayfinding.
12. **Cockpit-fil er 1614 linjer i én route.** Tre "tabs" (Analyse/Ejendom/Økonomi) mountes alle samtidigt → unødigt rendering-arbejde.
13. **Compliance-data spredes over for mange overflader**: HardStopBanner, CompliancePanel højre, Adresse-blocker dialog, EjendomPanel flags. Samme info, forskellig framing.
14. **Pre-purchase vs design-mode** lever i `sessionStorage` (`projekt.adresse.tsx` linje 10-17) — global UX-tilstand uden visuel indikator efter adressevalg.

---

## Implementeringsplan

Opdelt i 4 faser. Hver fase er selvstændig — du kan stoppe mellem dem.

### Fase 1 — Quick wins (dobbeltkald + brudte refs) — ~1 time

1. **Fjern dobbelt restore**: i `cockpit/index.tsx` linje 484-area, tjek `useProject().address && complianceDone` før `restoreProject()`. Hvis state er fyldt fra `__root`, skip.
2. **Adresse-debounce → 300 ms** + AbortController på `searchAddresses` så in-flight kald cancelles ved nyt tastetryk. (`projekt.adresse.tsx` linje 131-148)
3. **Skip cockpit `fetchCompliance` hvis `complianceDone`** og resultat allerede i store. Tilføj `if (complianceDone && bbrData) return;` øverst i den useEffect.
4. **Auth-redirect via `beforeLoad`** i `/` routen — fjern flicker:
   ```
   beforeLoad: async () => {
     const session = await getSession();
     if (session) throw redirect({ to: '/projekt/start' });
   }
   ```
5. **Stub-routes peger på cockpit** når der er en address i store; ellers `/projekt/start`.

### Fase 2 — Elegante overgange — ~2 timer

6. **Fjern `key={location.pathname}` fra `<Outlet>`**. Erstat med `AnimatePresence mode="popLayout"` per route component (PageTransition-wrapperen findes allerede i `wizard-ui.tsx`).
7. **Layout-route for cockpit**: ny `src/routes/projekt.$id.tsx` (parent layout med `<Outlet />`) der holder TopBar + nyt PhaseRail (se Fase 3) konstant. Cockpit-tabs bliver child-routes (`/projekt/$id/cockpit/analyse`, `/cockpit/ejendom`, `/cockpit/oekonomi`) → bruger får ægte URL pr. tab + browser-back virker + kun aktiv tab mountes.
8. **View Transitions API** for matrikel-canvas → ejendomspanel (samme rektangel "morpher" mellem skærme). Faldback til opacity for browsers uden support.
9. **Persistent skeleton-shapes**: når der navigeres mellem tabs, hold KPI-kortenes skeleton-pladser i samme position (ingen layout-shift mellem skeleton og data).

### Fase 3 — Ny informationsarkitektur — ~4 timer

10. **PhaseRail erstatter PhaseSidebar**: top-horisontal stripe i TopBar (under logo) med 4 status-prikker + label. Sticky, altid synlig efter adressevalg. Klikbar når `address` er valgt. Sidebar-kode genbruges (`usePhaseStates`).
11. **Cockpit som 2-kolonne i stedet for 3**: Venstre `ProjektDnaPanel` (byggeønsker) bliver til collapsible drawer med trigger-knap "Justér ønsker". Frigør plads til at matrikel-canvas + compliance kan være side-om-side på 1160 px.
12. **Unified Compliance-overflade**: ét `<ComplianceFeed>` komponent der konsoliderer HardStopBanner + flags + warnings i én kronologisk liste. Vises både på Adresse (gate) og Cockpit (top af analyse-tab) med samme visuelle sprog. Genbrug i EjendomPanel som "expandable" sektion.
13. **Mode-indikator** ("Due-diligence" vs "Design-mode") som lille pill i TopBar nær adresse-tekst. Klikbar → toggle. Påvirker copy i ComplianceFeed og CTA-knapper.
14. **Flyt cockpit-side i mindre filer**: `cockpit/AnalyseTab.tsx`, `cockpit/EjendomPanel.tsx`, `cockpit/OekonomiPanel.tsx`. Route-fil bliver ~200 linjer (kun data fetching + tab-switching). Allerede delvist gjort.

### Fase 4 — Polering og data-præsentation — ~2 timer

15. **Compliance-flags som "risiko-kort"** i stedet for liste: kategoriseret efter risikotype (Geoteknik / Forsyning / Naboer / Fredning / Beskyttelseslinjer) jvf. domæne-risikomatrix i AGENTS.md. Hver type får egen ikon + farve + estimeret kr.-impact når kendt.
16. **KPI-talkort med animeret tæller** når data lander (framer-motion `animate` på number).
17. **Empty states** for cockpit-tabs uden data: konkret CTA i stedet for tom skeleton (fx "Tilføj byggeønsker for at se compliance-impact").
18. **Stub-routes (Teknik/Udbud)**: opgrader fra `PhaseComingSoon` til "preview"-skærm med fase-roadmap + tilbage til cockpit.

---

## Tekniske detaljer

**Filer der ændres pr. fase:**

| Fase | Filer |
|------|-------|
| 1 | `routes/projekt.adresse.tsx`, `routes/projekt.$id.cockpit.tsx`, `routes/index.tsx`, `routes/projekt.teknik.tsx`, `routes/projekt.udbud.tsx` |
| 2 | `routes/__root.tsx`, ny `routes/projekt.$id.tsx` (layout), splitting af cockpit-tabs til child-routes |
| 3 | `components/wizard-chrome.tsx` (PhaseRail), ny `components/compliance-feed.tsx`, `components/cockpit/index.tsx` (2-kol) |
| 4 | `components/cockpit/EjendomPanel.tsx`, ny `components/risk-card.tsx`, stubs |

**Beskyttede filer (kræver `🔒` markering ved review):** Ingen ændringer planlagt i `project-store.ts`, `analysis-orchestrator.ts`, `pre-check-adresse.ts`, `project-persistence.ts`, `reactive-compliance.ts`. Fase 1 punkt 1 og 3 berører `routes/projekt.$id.cockpit.tsx` som kalder `restoreProject` — det er route-fil, ikke beskyttet, men ændringen er adfærdsmæssig så jeg flagger den i PR.

**Ingen ændringer i:** server functions, Supabase-skema, Zustand state-shape, env vars.

**Verificering pr. fase:**
- `bunx tsc --noEmit` 0 errors
- `bun build` ingen fejl
- Netværksfanen: tæl serverFn-kald før/efter på "Adresse → Cockpit"-flow. Mål: fra ~12 kald til ~6.
- Visuel: navigation Adresse → Cockpit → Analyse → Ejendom uden hvide flash.

---

## Hvad jeg IKKE rører

- Server functions (`createServerFn`)
- Project-store shape eller Supabase-migrations
- Compliance-pipeline (`analysis-orchestrator`, `pre-check-adresse`, `reactive-compliance`)
- AI-prompts eller Hus-DNA-generator
- Auth-flow logik (kun redirect-timing)

Når du klikker "Implement plan" starter jeg i Fase 1.
