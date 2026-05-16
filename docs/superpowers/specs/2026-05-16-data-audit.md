# Data Audit — Cockpit datapunkter

**Dato:** 2026-05-16  
**Scope:** `/projekt/$id/cockpit` (Analyse, Ejendom, Økonomi tabs)  
**Prioritering:** Brugerværdi for privat boligbygger (1 = lav, 5 = kritisk)

---

## 1. Inventory — alle datapunkter

Kolonner: **Fetched** = API-kald virker · **Supabase** = persisteret · **Store** = Zustand project-store · **UI** = synlig på cockpit · **BV** = brugerværdi 1–5 · **Gap** = ja/nej

### BBR — Live

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| Byggeår | ✅ | ✅ JSONB | ✅ bbrData | ✅ Ejendom tab | 3 | — |
| Samlet areal (m²) | ✅ | ✅ JSONB | ✅ bbrData | ✅ Ejendom tab | 4 | — |
| Bebygget areal (m²) | ✅ | ✅ JSONB | ✅ bbrData | ✅ Ejendom tab | 5 | — |
| Antal etager | ✅ | ✅ JSONB | ✅ bbrData | ✅ Ejendom tab | 4 | — |
| Anvendelse (kode + tekst) | ✅ | ✅ JSONB | ✅ bbrData | ✅ Ejendom tab | 3 | — |
| Grundareal (m²) | ✅ | ✅ typed col | ✅ bbrData | ⚠️ Viser "—" hvis complianceMetrics null | 5 | Ja — skrøbelig betingelse |
| Bebyggelsesprocent (nuværende) | ✅ | ✅ typed col | ✅ bbrData | ⚠️ Kun i Ejendom tab plangrænser | 5 | Ja — ikke vist i Analyse tab direkte |
| Fredet (byg070) | ✅ | ✅ typed col is_fredet | ✅ | ✅ flag + risiko | 5 | — |
| mat_strandbeskyttelse | ✅ | ✅ JSONB | ✅ bbrData | ✅ flag | 5 | — |
| mat_fredskov | ✅ | ✅ JSONB | ✅ bbrData | ✅ flag | 5 | — |
| mat_klitfredning | ✅ | ✅ JSONB | ✅ bbrData | ✅ flag | 5 | — |
| **Varmeinstallation** | ✅ | ✅ JSONB | ✅ bbrData | ❌ Ingen render | 3 | **Ja** |
| **Opvarmningsmiddel** | ✅ | ✅ JSONB | ✅ bbrData | ❌ Ingen render | 3 | **Ja** |
| **Ydervægs-materiale** | ✅ | ✅ JSONB | ✅ bbrData | ❌ Ingen render | 3 | **Ja** |
| **Tagdækning** | ✅ | ✅ JSONB | ✅ bbrData | ❌ Ingen render | 3 | **Ja** |

### FBB / Fredning — Live

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| fredet boolean | ✅ | ✅ typed col | ✅ is_fredet | ✅ flag + risiko | 5 | — |
| **SAVE-værdi 1–9** | ✅ | ✅ typed col | ✅ heritage_save_value | ⚠️ Kun som risikoitem hvis ≤4 | 5 | **Ja — mangler dedikeret display** |
| **FBB per-bygning bevaringsværdi** | ✅ | ✅ JSONB compliance_data | ❌ cockpit local only | ❌ Aldrig rendered | 4 | **Ja** |
| fbb_reference (link til FBB) | ✅ | ✅ JSONB | ✅ bbrData | ✅ Ejendom Datakilder | 2 | — |

### Plandata — Live

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| Lokalplaner (liste + PDF-links) | ✅ | ✅ JSONB | ✅ lokalplaner | ✅ Analyse accordion | 4 | — |
| Kommuneplanramme: bebygpct, maxetager, maxbygnhjd | ✅ | ✅ JSONB | ✅ kommuneplanramme | ✅ Ejendom Plangrænser | 5 | — |
| **Kommuneplanramme: anvgen / anvendelseGenerel** | ✅ | ✅ JSONB | ✅ kommuneplanramme | ❌ Ingen render | 3 | **Ja** |
| **Kommuneplanramme: fremtidigzonestatus** | ✅ | ✅ JSONB | ✅ kommuneplanramme | ❌ Ingen render | 4 | **Ja** |
| **Kommuneplanramme: sforhold (særlige forhold)** | ✅ | ✅ JSONB | ✅ kommuneplanramme | ❌ Ingen render | 3 | **Ja** |
| **Lokalplan PDF extract (AI-udtrækt)** | ✅ | ✅ address_analysis | ✅ lokalplanExtract | ❌ Kun input til Byggeanalyse AI | 4 | **Ja** |

### Naturbeskyttelse — Live

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| Strandbeskyttelse | ✅ | ✅ JSONB | ❌ cockpit local | ✅ compliance flag | 5 | — |
| Klitfredning | ✅ | ✅ JSONB | ❌ cockpit local | ✅ compliance flag | 5 | — |
| **Skovbyggelinje** | ✅ | ✅ JSONB | ❌ cockpit local | ⚠️ Mulig flag, ingen dedikeret sektion | 4 | **Ja** |
| **Søbeskyttelse** | ✅ | ✅ JSONB | ❌ cockpit local | ⚠️ Mulig flag, ingen dedikeret sektion | 3 | **Ja** |
| **Åbeskyttelse** | ✅ | ✅ JSONB | ❌ cockpit local | ⚠️ Mulig flag, ingen dedikeret sektion | 3 | **Ja** |
| **Kirkebyggelinje** | ✅ | ✅ JSONB | ❌ cockpit local | ⚠️ Mulig flag, ingen dedikeret sektion | 2 | **Ja** |

### VUR / Økonomi — Live

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| Ejendomsværdi | ✅ | ✅ JSONB | ✅ vurderingData | ✅ Ejendom + Økonomi + CompliancePanel | 5 | — |
| Grundværdi | ✅ | ✅ JSONB | ✅ vurderingData | ✅ Ejendom + Økonomi + CompliancePanel | 5 | — |
| Vurderet areal (m²) | ✅ | ✅ JSONB | ✅ vurderingData | ✅ Økonomi tab | 3 | — |
| Vurderingsår | ✅ | ✅ JSONB | ✅ vurderingData | ✅ Økonomi tab + Ejendom Datakilder | 3 | — |
| Grundværdi pr. m² (beregnet) | afledt | — | — | ✅ Økonomi tab | 3 | — |

### AI-analyse — Live (Anthropic)

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| Byggeanalyse (tilladt/dispensation/konflikt) | ✅ | ✅ JSONB | ✅ byggeanalyseResultat | ✅ Analyse accordion | 5 | — |
| **HusDna** | ✅ | ❌ IKKE i ProjectPatch | ✅ husDna | ❌ Ikke vist, mistes ved reload | 4 | **Ja — mangler persistence + display** |
| **BilledeAnalyse** | ✅ | ✅ billedanalyse col | ✅ billedanalyse | ⚠️ Bag `FEATURE_FLAGS.billedanalyseMock` | 3 | **Ja — feature flag blokerer** |

### Mock-gated (fetched men falske data)

| Datapunkt | Live/Mock | Supabase | Store | UI | BV reel | Gap |
|---|---|---|---|---|---|---|
| GEUS: radon + grundvand | **MOCK** | ✅ JSONB | ❌ cockpit local | ✅ med MOCK-badge | 5 | Ja — vises men er fiktivt |
| DK-Jord: forurening, olietank | **MOCK** | ✅ JSONB | ❌ cockpit local | ⚠️ Kun compliance flags | 4 | Ja — mock + mangler sektion |
| Tinglysning: servitutter | **MOCK** | ✅ JSONB | ❌ cockpit local | ✅ med MOCK-badge | 4 | Ja — vises men er fiktivt |
| Terrain/DHM: hældning, koter | **MOCK** | ✅ JSONB | ❌ cockpit local | ✅ med MOCK-badge | 2 | Lavere prioritet |

### Live geodata — korrekt wired

| Datapunkt | Fetched | Supabase | Store | UI | BV | Gap |
|---|---|---|---|---|---|---|
| Fjernvarme | ✅ | ✅ JSONB | ❌ cockpit local | ✅ Analyse accordion | 3 | — |
| Naboer (antal, nærmeste m) | ✅ | ✅ JSONB | ❌ cockpit local | ✅ Analyse accordion | 3 | — |

---

## 2. Gap-analyse — kun de reelle huller

### Kategori A: Data er hentet og i store — mangler kun render

| # | Datapunkt | Kilde i store | Mangler |
|---|---|---|---|
| A1 | Varmeinstallation, opvarmningsmiddel | `bbrData.varmeinstallation` / `.opvarmningsmiddel` | Felt i EjendomPanel "Eksisterende bygning" |
| A2 | Ydervægs-materiale, tagdækning | `bbrData.ydervaegs_materiale` / `.tagdaekning` | Felt i EjendomPanel "Eksisterende bygning" |
| A3 | SAVE-værdi med forklaring | `heritage_save_value` (typed store-felt) | Dedikeret display med SAVE 1–9 skala og implikation |
| A4 | Kommuneplanramme: fremtidigzonestatus | `kommuneplanramme.fremtidigzonestatus` | Felt i EjendomPanel "Plangrænser" |
| A5 | Kommuneplanramme: anvgen + sforhold | `kommuneplanramme.anvgen` / `.sforhold` | Felt i EjendomPanel |

### Kategori B: Data er hentet men ikke i Zustand-store

| # | Datapunkt | Nuværende state | Konsekvens |
|---|---|---|---|
| B1 | Naturbeskyttelse (6 typer) | Cockpit `useState` lokalt | Kan ikke bruges af andre komponenter / ruter |
| B2 | FBB raw data | Cockpit `useState` lokalt | bevaringsvaerdi per bygning aldrig vist |
| B3 | GEUS, Tinglysning, Terrain, DK-Jord, Fjernvarme, Naboer | Cockpit `useState` lokalt | Mangler i store — ok for nu, men begrænsende |

### Kategori C: Data er hentet men aldrig vist direkte

| # | Datapunkt | Kommentar |
|---|---|---|
| C1 | Lokalplan PDF extract | Bruges som AI-input, men brugeren kan aldrig se hvad AI'en udtrakte |
| C2 | FBB per-bygning bevaringsværdi | Hentes, bruges til flags, men rådata aldrig eksponeret |

### Kategori D: Persistence-gap

| # | Problem | Konsekvens |
|---|---|---|
| D1 | `husDna` ikke i `ProjectPatch` | HusDna forsvinder ved page reload — bruger mister sit AI-genererede design-DNA |

### Kategori E: Mock-data vises uden klar advarsel

| # | Service | Problem |
|---|---|---|
| E1 | GEUS | Geoteknik er den STØRSTE brugerrisiko (0–500k kr) — vises som realistiske tal uden brugerklar disclaimer |
| E2 | Tinglysning | Servitutter kan blokere byggeri — mock-badge er lille og teknisk |

### Kategori F: Grundareal/bebyggelsesprocent viser "—"

To mulige årsager:

1. **Code-gap:** `complianceMetrics?.grundareal` er primær kilde. Hvis `complianceMetrics` er null (race condition eller manglende kommuneplanramme), viser kortet "—" uanset at `bbrData.grundareal` er tilgængeligt. Fix: Udvid fallback-kæden: `complianceMetrics?.grundareal ?? bbrData?.grundareal ?? k?.grundareal`.

2. **Reelt data-gap:** For visse ejendomme returnerer DAWA ikke grundareal (f.eks. ejerlejligheder, ubebyggede grunde uden registreret areal). I det tilfælde er "—" korrekt — men UI bør forklare det, ikke bare vise "—".

---

## 3. Sprint-backlog — prioriteret efter brugerværdi

### Tier 1 — BV 5 (kritisk brugerdata mangler)

| Issue | Titel | Beskrivelse | Scope |
|---|---|---|---|
| **ARCH-NYT-1** | Fix grundareal/bebyggelsesprocent viser "—" | Udvid fallback-kæde i EjendomPanel: `complianceMetrics?.grundareal ?? bbrData?.grundareal ?? k?.grundareal`. Samme for currentPct. | EjendomPanel.tsx — 2 linjer |
| **ARCH-NYT-2** | SAVE-værdi: dedikeret display med implikation | Vis `heritage_save_value` som et navngivet felt i EjendomPanel med SAVE-skala (1–4 = høj, 5–6 = middel, 7–9 = lav) og implikation (nedrivning/dispensation). | EjendomPanel.tsx — nyt felt |
| **ARCH-NYT-3** | Grundareal + bebyggelsesprocent i Analyse tab | I CompliancePanel (højre kolonne) mangler et "NUVÆRENDE BYGNING" mini-kort med grundareal og nuværende bebyggelsesprocent — uafhængigt af at bruger har valgt ønsket areal. | cockpit/index.tsx — CompliancePanel |

### Tier 2 — BV 4 (vigtig brugerdata mangler)

| Issue | Titel | Beskrivelse | Scope |
|---|---|---|---|
| **ARCH-NYT-4** | HusDna persistence | Tilføj `husDna` til `ProjectPatch` i project-sync.ts og tilsvarende kolonne eller JSONB-felt i `projects`. | project-sync.ts, Supabase migration |
| **ARCH-NYT-5** | Lokalplan PDF extract — vis direkte | I Analyse accordion, tilføj en sektion "LOKALPLAN AI-UDTRÆK" der viser `lokalplanExtract.restrictionSummary` + `designGuidelines[]`. Bruger ser nu hvad AI'en fandt. | cockpit.tsx — ny DetailsSection |
| **ARCH-NYT-6** | Kommuneplanramme: fremtidigzonestatus | I EjendomPanel "Plangrænser" kort: tilføj `fremtidigzonestatus` som et felt. Vigtig pre-purchase info (kan ændre byggeretten). | EjendomPanel.tsx |
| **ARCH-NYT-7** | FBB bevaringsværdi per bygning | I en dedikeret sektion (f.eks. "BEVARINGSVÆRDI") vis alle bygninger på matriklen med deres SAVE-tal. | EjendomPanel.tsx eller ny komponent |
| **ARCH-NYT-8** | GEUS / Tinglysning: tydelig mock-disclaimer | Erstat MOCK-badge med en forklarende linje: "Disse data er eksempeldata — rigtige data kræver [abonnement/API-adgang]." Brugeren skal forstå de ikke er reelle. | GeusRisikoSektion, ServitutterSektion |

### Tier 3 — BV 3 (nyttige men ikke kritiske)

| Issue | Titel | Beskrivelse | Scope |
|---|---|---|---|
| **ARCH-NYT-9** | BBR bygningsdetaljer: varme, tag, facade | I EjendomPanel "Eksisterende bygning" tilføj: Varmeinstallation, Opvarmningsmiddel, Ydervægs-materiale, Tagdækning. | EjendomPanel.tsx — 4 nye Field-komponenter |
| **ARCH-NYT-10** | BilledeAnalyse feature flag → live | Slå `FEATURE_FLAGS.billedanalyseMock` fra og sørg for at BilledeAnalyse-resultatet vises i AiDesignHero. | feature-flags.ts + AiDesignHero |
| **ARCH-NYT-11** | Naturbeskyttelse: dedikeret accordion-sektion | Vis alle 6 naturbeskyttelsestyper (strandbeskyttelse, skovbyggelinje, søbeskyttelse, åbeskyttelse, klitfredning, kirkebyggelinje) i en samlet sektion. | cockpit.tsx — ny DetailsSection |
| **ARCH-NYT-12** | Kommuneplanramme: sforhold + anvgen | Vis "Særlige planforhold" og "Generel anvendelse" i EjendomPanel som informationsfelter. | EjendomPanel.tsx |

---

## 4. Strukturelle observationer

**Cockpit local state vs. Zustand store:**  
GEUS, Tinglysning, Terrain, DK-Jord, Fjernvarme, Naboer, FBB og Naturbeskyttelse lever kun i cockpit `useState`. De synkroniseres til Supabase via `syncPatch`, men er ikke i `project-store.ts`. Det er acceptabelt nu, men begrænser fremtidige komponenter der skal læse disse data udenfor cockpit-ruten.

**compliance_data JSONB:**  
De ovennævnte dataset læses fra `compliance_data JSONB` ved restore (ikke fra typede kolonner). Det er acceptabelt per nuværende arkitektur, men bør migreres til typede kolonner efterhånden som de stabiliseres (jf. CLAUDE.md "Prune pattern").

**projekter vs. projects:**  
`projekter`-tabellen indeholder bl.a. `byggeanalyse_resultat` JSONB. Nye features skal ikke skrive hertil — brug `projects`-tabellen (CLAUDE.md).
