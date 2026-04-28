# ArchAI – Projektplan & TODO
> AI-drevet byggerådgivning for private bygherrer  
> Stack (nu): TanStack Start (React) · Vite · TypeScript · Supabase · Playwright

---

## Status-forklaring
- `[ ]` Ikke startet
- `[~]` I gang
- `[x]` Færdig
- `[!]` Blokeret / kræver beslutning

---

## Projektstruktur (anbefalet + matcher repo)
```
src/
  routes/                 # TanStack Router routes (wizard steps)
  components/             # UI + wizard chrome
  integrations/
    dawa/                 # Adressesøgning, mapping, fejl-håndtering
    supabase/             # DB/Auth clients, types, middleware
  lib/                    # App state, helpers (fx zustand store)
tests/                    # Playwright e2e
supabase/                 # migrations + config
playwright.config.ts
```

---

## FASE 0 – Fundament
- [x] Repo med TanStack Start/Vite/React kører lokalt
- [x] Supabase integration findes (`src/integrations/supabase/*`)
- [x] Supabase migrations findes (`supabase/migrations/*`)

---

## FASE 1 – Første rigtige integration: adresseflow (DAWA)

### 1A. DAWA client/service
- [x] Opret DAWA integration mappe (`src/integrations/dawa/`)
- [x] DAWA fetch client med typed responses og fejl-håndtering  
  - Ref: `src/integrations/dawa/dawa-client.ts`
- [x] `DawaService` klasse med statiske metoder + “clean” output  
  - Ref: `src/integrations/dawa/client.ts`

### 1B. Adresse-step i wizard
- [x] Step route for adresse findes (`src/routes/projekt.adresse.tsx`)
- [x] Autocomplete er koblet til DAWA (ingen hardcoded suggestions)
- [~] Når bruger vælger adresse: gem “clean” data i projekt-store  
  - Mål: `{ adresse, postnr, kommune, matrikel, bbrId }`  
  - Nu: gemmer placeholders for matrikel/byggeår/BBR (skal gøres rigtigt)
- [x] Normalisér “kommune” (brug kommunenavn konsekvent)

### 1C. BBR data på skærmen (det brugeren skal se)
- [~] UI viser “Matrikel” og “Byggeår” chips  
  - Nu: værdier er placeholders
- [~] Implementér rigtigt BBR-opslag (Option A valgt: Datafordeler/BBR REST)
  - Kræver Datafordeler credentials (username/password eller cert/OAuth)
  - Bemærk: Datafordeler REST udfases ultimo 2026 → plan for GraphQL senere
  - Option B: Edge/server function der cacher + normaliserer
- [ ] Når BBR-data er hentet: vis matrikel + byggeår som rigtige værdier

---

## FASE 2 – Compliance step (MVP)
- [x] Compliance route findes (`src/routes/projekt.compliance.tsx`) (pt. UI/animation)
- [ ] Erstat “fake loading” med rigtig pipeline:
  - adresse → BBR → plandata → (AI analyse) → resultat
- [ ] Definér datastruktur for “ComplianceResult” i TypeScript
- [ ] Persistér resultater i Supabase (tabel/kolonner + writes)

---

## FASE 3 – Test og kvalitet
- [x] Installer Playwright (`@playwright/test`)
- [x] Playwright config (`playwright.config.ts`)
- [x] E2E test for adresseflow findes (`tests/address-flow.spec.ts`)
- [~] Gør E2E-testen meningsfuld:
  - Assert rigtige værdier for matrikel/byggeår (kræver rigtig BBR integration)
- [ ] Tilføj enhedstest for DAWA mapping (hurtige tests uden browser)

---

## FASE 4 – Produktisering (senere)
- [ ] Auth (Supabase)
- [ ] Persist “projekt” state til DB
- [ ] Rapport (PDF / download)
- [ ] Deployment plan (én hosting-strategi)

---

*Sidst opdateret: 2026-04-29*  
*Nuværende fase: FASE 1*  