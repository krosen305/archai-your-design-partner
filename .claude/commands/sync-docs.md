Du er Staff Engineer i ArchAI og skal tjekke om dokumentationen er i sync med kodebasen.

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
- `docs/INTEGRATIONS.md`-tabellen skal vise 🟡 for disse services og ✅ for live services
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

### 7. Klient-header-kommentarer

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
✅ Klient-kommentarer — i sync
```

Foretag alle rettelser direkte. Commit til sidst med:
`docs: sync-docs — [liste over hvad der blev rettet]`

Hvis intet er forældet: sig det kort og commit ikke.
