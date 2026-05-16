# Billedanalyse — Design Spec

**Dato:** 2026-05-16  
**Feature:** Arkitektonisk billedanalyse med brugervalidering  
**Status:** Godkendt, klar til implementering

---

## Kontekst

Brugeren uploader op til 4 inspirationsbilleder i `AiDesignHero`-komponenten (i dag en placeholder). Vi analyserer billederne for arkitektoniske kendetegn med Claude Haiku, præsenterer resultatet som redigerbare tags, tvinger brugeren til at løse konflikter på tværs af billeder, og gemmer et koherent output der kan bruges til design-generering.

Output kombineres med brugerens Byggeoenske til at generere bud på drømmehuset. Derfor skal output altid være koherent — billeder der trækker i modstridende retninger skal afklares af brugeren inden gemning.

**Byggeoenske røres aldrig automatisk.** Enhver opdatering af Byggeoenske-felter kræver eksplicit brugerhandling, adskilt fra dette flow.

---

## Dataflow

```
Upload (≤4 billeder)
  → Supabase Storage: inspirationsbilleder/{user_id}/{projekt_id}/{uuid}.jpg
  → [Bruger trykker "Analyser billeder"]
  → createServerFn: analyserBilleder({ billedUrls })
      → billede-analyse.ts (Haiku 4.5, 1 API-kald)
          → system-prompt med vocab (cache_control: ephemeral)
          → alle billeder som { type: "url", url: signedUrl }
          → returnerer BilledeAnalyseResultat
  → UI: viser enige tags + konflikter
      → bruger fjerner/tilføjer tags
      → bruger løser konflikter (A/B-valg)
      → [Gem-knap låst til alle konflikter løst]
  → syncPatch: billedanalyse → Supabase projects.billedanalyse (JSONB)
```

---

## Datatyper

```typescript
type BilledeAnalyseKategorier = {
  facade:        string[];
  tagform:       string[];
  vinduer:       string[];
  materialer:    string[];
  saerligeTraek: string[];
  farver:        string[];
  stil:          string[];
};

type BilledeAnalyseKonflikt = {
  kategori:   keyof BilledeAnalyseKategorier;
  muligheder: string[][];  // én array per retning, f.eks. [["minimalistisk"], ["rustikt", "varmt"]]
  billedAntal: number[];   // antal billeder per retning
};

type BilledeAnalyseResultat = {
  kategorier:  BilledeAnalyseKategorier;  // kun enige/løste tags
  konflikter:  BilledeAnalyseKonflikt[];  // uløste konflikter (tomt array når klar til gem)
  ekstraTags:  string[];                  // detaljer Claude ser som ikke findes i vocab
  confidence:  number;                    // 0–100
  kilde:       "haiku" | "mock";
};
```

`ekstraTags` er first-class output — ikke overflow der kan ignoreres. De repræsenterer arkitektoniske detaljer vi ikke har vocab for endnu og må ikke gå tabt.

---

## AI-prompt strategi

### Model
`claude-haiku-4-5-20251001` — fuldt tilstrækkeligt til struktureret udtræk med predefineret ordforråd.

### Token-budget (per analyse)
| Post | Tokens |
|------|--------|
| System-prompt med vocab (cache hit) | 0 (cachet) |
| System-prompt med vocab (cache miss) | ~800 |
| Brugerbesked + billedblokke (4 billeder) | ~1.200 |
| Output JSON | ~250 |
| **Total ved cache hit** | **~1.450** |
| **Total ved cache miss** | **~2.250** |

System-prompten caches med `cache_control: { type: "ephemeral" }` — gyldigt i 5 min. Ved sekventielle uploads i samme session er cache hit sandsynligt.

`max_tokens: 400` — tilstrækkeligt til JSON-output, forhindrer løbsk output.

### Billedformat
Billeder sendes som URL-referencer (ikke base64):
```json
{ "type": "image", "source": { "type": "url", "url": "<signedUrl>" } }
```
Supabase signed URLs er offentligt tilgængelige (token i query string) — ingen server-side fetch eller base64-konvertering nødvendig.

### System-prompt skabelon
```
Du er arkitektonisk billedanalysatør for et dansk byggesagsystem.

Analyser de vedlagte billeder af boliger og returner præcis dette JSON-format — intet andet:
{
  "kategorier": {
    "facade":        [...],
    "tagform":       [...],
    "vinduer":       [...],
    "materialer":    [...],
    "saerligeTraek": [...],
    "farver":        [...],
    "stil":          [...]
  },
  "konflikter": [
    {
      "kategori": "<navn>",
      "muligheder": [[...], [...]],
      "billedAntal": [n, m]
    }
  ],
  "ekstraTags": [...],
  "confidence": 0-100
}

REGLER:
- Vælg KUN fra nedenstående vocab per kategori
- Tilføj tags til ekstraTags hvis du ser noget der ikke er i vocab
- Angiv konflikt hvis ≥2 billeder klart peger i modstridende retninger inden for en kategori
- Returner kun JSON — ingen forklaringstekst

VOCAB:
facade:        [pudset, tegl, træbeklædning, beton, zink, fiber-cement, natursten, cortenstål, bindingsværk, glas-facade]
tagform:       [fladt tag, sadeltag, ensidig hældning, mansardtag, valmet tag, tøndetag, sedum-tag, taghave]
vinduer:       [store formater, vinduesbånd, taglys, kviste, franske døre, hjørnevinduer, facadeglas, smalt format, ovenlys]
materialer:    [beton, glas, træ, stål, mursten, zink, kobber, keramik, komposit, natursten]
saerligeTraek: [integreret carport, fritstående carport, overdækket terrasse, altan, taghave, pool, solceller, udestue, anneks, udvendig trappe, dobbelthøjt rum, gennemgående plan]
farver:        [hvid, sort, antracit, mørkegrå, lysegrå, beige, sandfarvet, terracotta, mørk træ, lys træ, rød tegl, grøn patina]
stil:          [minimalistisk, moderne, skandinavisk, klassisk, industriel, organisk, rustikt, bæredygtigt, nordisk]
```

### Fejlhåndtering i service
- Ingen `ANTHROPIC_API_KEY` → returnér mock-data (`kilde: "mock"`)
- HTTP 429 → exponential backoff: 10s, 20s, 40s (max 3 forsøg), som `pdf-extractor.ts`
- Ugyldig JSON i svar → log warning, returnér mock-data
- Alle andre API-fejl → kast fejl op til `createServerFn`, UI viser fejlbesked

---

## Lagring

### Supabase: ny kolonne
```sql
ALTER TABLE projects ADD COLUMN billedanalyse JSONB;
```

Kolonnen er JSONB fordi:
- Indholdet er AI-output der arkiveres (som `inspection_payload` — ikke compliance-data)
- Kategorierne er faste, men værdierne er dynamiske og kan udvides
- Ingen regel-engine læser fra denne kolonne direkte

### project-store.ts
```typescript
// Tilføjes til ProjectState
billedanalyse?: BilledeAnalyseResultat;
setBilledanalyse: (result: BilledeAnalyseResultat) => void;
```

### project-persistence.ts
Læs `billedanalyse` fra Supabase ved `restoreProject`, skriv ved `syncPatch`.

---

## UI — AiDesignHero.tsx

### States
```
idle         → upload-knap synlig, "Analyser billeder" disabled
uploading    → spinner per billede
ready        → "Analyser billeder" aktiv (≥1 billede uploadet)
analysing    → spinner, knap disabled
conflict     → valideringsvisning med uløste konflikter (gem låst)
validated    → valideringsvisning uden konflikter (gem aktiv)
saved        → bekræftelsesbesked, analyse gemt
error        → fejlbesked med mulighed for retry
```

### Valideringsvisning
**Enige tags** (grøn sektion per kategori):
- Tags som chips med ✕-knap (fjern)
- Fritekstinput med autocomplete fra vocab (tilføj)
- Kategorier uden tags vises ikke

**Konflikter** (orange sektion, én per kategori med konflikt):
- Overskrift: "Dine billeder trækker i to retninger for [kategori]"
- To kort side om side (Retning A / Retning B) med tags og billedantal
- Klik vælger retning — vinderens tags flettes ind i kategorier
- Løst konflikt forsvinder fra orange sektion

**ekstraTags** (neutral sektion):
- Vises som chips under "Yderligere detaljer"
- Kan fjernes af bruger
- Kan ikke redigeres (er fritekst fra AI)

**Gem-knap:**
- Disabled så længe `konflikter.length > 0`
- Label: "Gem analyse" (ikke "Gem og anvend på Byggeoenske")
- Ved gem: `syncPatch({ billedanalyse: validatedResult })`

---

## Nye og ændrede filer

| Fil | Handling | Note |
|-----|----------|------|
| `src/integrations/ai/billede-analyse.ts` | Ny | Haiku-service, mock-fallback |
| `src/lib/billede-analyse-vocabulary.ts` | Ny | Vocab-katalog + konfliktdetekterings-prompt |
| `src/components/cockpit/AiDesignHero.tsx` | Udvid | Analyse-UI, states, validering |
| `src/routes/projekt.$id.cockpit.tsx` | Udvid | `analyserBilleder` createServerFn |
| `src/lib/project-store.ts` | Udvid | `billedanalyse` felt + setter |
| `src/integrations/supabase/project-persistence.ts` | Udvid | Læs/skriv `billedanalyse` |
| `supabase/migrations/20260516_add_billedanalyse.sql` | Ny | ALTER TABLE projects |

**Beskyttede filer der ikke røres:** `analysis-orchestrator.ts`, `pre-check-adresse.ts`, `reactive-compliance.ts`

---

## Afgrænsninger (ikke i scope)

- Automatisk opdatering af Byggeoenske-felter fra analyseresultat — kræver eksplicit brugerhandling, separat feature
- Client-side resize af billeder før upload — kan tilføjes som optimering, ikke blocker
- Historik over tidligere analyser — kun seneste analyse gemmes
- Multi-analyse (sammenlign to sæt billeder) — fremtidig feature
- Udvidelse af vocab via UI — fremtidig feature

---

## Definition of done

- [ ] `bun dev` — upload → analyser → validér → gem fungerer end-to-end
- [ ] Konflikt-UI vises og løses korrekt
- [ ] Gem-knap er låst ved uløste konflikter
- [ ] `billedanalyse` gemmes i Supabase og gendannes ved reload
- [ ] Mock-fallback virker uden `ANTHROPIC_API_KEY`
- [ ] `bun build` — ingen type-fejl
- [ ] `bun test` — ingen failing tests
- [ ] Ingen `console.log` i PR
