Du er Staff Engineer i ArchAI og skal tjekke om dokumentationen er i sync med kodebasen.

Dette er en dokumentations-sync, ikke en arkitekturændring. Respekter protected files:

- `AGENTS.md` og `CLAUDE.md` må kun ændres, hvis brugeren eksplicit beder om det, eller hvis kommandoen køres som en dedikeret docs-sync opgave.
- Hvis protected files ændres, skal outputtet tydeligt sige: `🔒 Rører beskyttet fil — kræver review`.
- Gamle task-planer/specs må ikke gøres normative igen. Aktuel dokumentation bor i `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/INTEGRATIONS.md`, `docs/data-ingestion-contract.md` og relevante domænedocs.

## Din opgave

Gennemgå følgende tjekliste systematisk. For hvert punkt: læs den aktuelle kodefil, sammenlign med dokumentationen, og rapportér konkret hvad der er forældet. Foretag derefter de nødvendige rettelser.

---

### 1. Wizard-routes (`CLAUDE.md`)

Læs faktiske routes:

```
src/routes/projekt.*.tsx
```

Sammenlign med route-tabellen i `CLAUDE.md`. Ret hvis der mangler routes, eller navne ikke stemmer.

---

### 2. IS_MOCK-status (`CLAUDE.md` + `docs/INTEGRATIONS.md`)

Søg efter `const IS_MOCK` i `src/integrations/`:

- Hver service der har `IS_MOCK = true` skal stå i IS_MOCK-listen i `CLAUDE.md`
- Services med feature-flag-baseret mock skal beskrives som feature-flagged, ikke som entydigt live/mock
- `docs/INTEGRATIONS.md`-tabellen skal vise 🟡 for disse services og ✅ for live services
- Disabled services, fx `NaboService`, skal markeres som `⏸️ Disabled`, ikke ✅ live
- Ret uoverensstemmelser

---

### 3. `BbrKompliantData`-felter (`docs/INTEGRATIONS.md`)

Læs `src/integrations/bbr/client.ts` — typen `BbrKompliantData`.
Sammenlign feltlisten med tabellen i `docs/INTEGRATIONS.md` under "BbrKompliantData — felter".
Tilføj manglende felter, fjern felter der ikke længere eksisterer.

---

### 4. Servicetabel (`docs/INTEGRATIONS.md`)

Læs `src/integrations/` — alle `client.ts`-filer.
Sammenlign med servicetabellen i `docs/INTEGRATIONS.md`.
Tilføj services der mangler, opdater statuskolonnen, ret noter.

---

### 5. Nøglefiler-tabel (`CLAUDE.md`)

Læs `src/lib/` — alle `.ts`-filer.
Sammenlign med nøglefiler-tabellen i `CLAUDE.md`.
Tilføj filer der mangler (særligt nye integrations- og lib-filer), ret beskrivelser.

---

### 6. Env-variabler (`CLAUDE.md`)

Læs `src/lib/env.ts` (Zod-skema).
Sammenlign med env-sektionen i `CLAUDE.md`.
Tilføj manglende variabler, markér valgfri/påkrævet korrekt.

---

### 7. Supabase-tabeller og migrationer

Læs migrations i `supabase/migrations/` og persistence-kode i `src/integrations/supabase/`.

- Dokumentationen må ikke nævne `projekter` som aktiv tabel. Den blev droppet i migration `20260515100000`.
- Aktive tabeller skal inkludere `projects`, `address_analysis`, `site_constraints`, `address_source_results`, `design_iterations`, `building_tasks`, `agent_sessions` og `agent_tasks`.
- Compliance-kritiske værdier skal dokumenteres som typede kolonner, ikke kun JSONB.

---

### 8. DAWA/Dataforsyningen-regler

Søg i aktive `.md`-filer efter `DAWA`, `Dataforsyningen`, `api.dataforsyningen.dk`, `BBR Public` og `dawa.aws.dk`.

- DAWA/Dataforsyningen REST må ikke beskrives som compliance- eller registerkilde.
- GSearch v2 er kun tilladt som adresse-autocomplete.
- WMTS/kort-tiles er kun baggrundskort, ikke SSOT.
- `NaboService` er disabled, indtil en Datafordeler/GeoDanmark-kilde findes.

---

### 9. Klient-header-kommentarer

For hver ændret integrations-klient, tjek at header-kommentaren øverst i filen matcher de faktiske GraphQL-felter der hentes.
Særligt: `src/integrations/bbr/client.ts`, `src/integrations/mat/client.ts`, `src/integrations/dar/client.ts`.

---

## Output-format

Rapportér resultatet i dette format:

```
✅ Routes — ingen ændringer nødvendige
⚠️  IS_MOCK — FooService manglede i listen (rettet)
✅ BbrKompliantData — i sync
⚠️  Servicetabel — BarService tilføjet (rettet)
✅ Nøglefiler — i sync
✅ Env-variabler — i sync
✅ Supabase-tabeller — i sync
✅ DAWA-regler — i sync
✅ Klient-kommentarer — i sync
```

Foretag rettelser direkte, men commit kun hvis brugeren bad om commit. Foreslå commit message:
`docs: sync architecture documentation`

Hvis intet er forældet: sig det kort og commit ikke.
