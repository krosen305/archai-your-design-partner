# Lovable: UI-implementering for ArchAI — Compliance Gate & Boligoensker

## Din rolle og det vigtigste princip

Du er **UI-ansvarlig** og udelukkende det. Du skriver React-komponenter, Tailwind-styling og brugerinteraktion. Du rører **intet backend** — ingen server-funktioner, ingen Supabase-kald, ingen API-integrationer, ingen ændringer i store-definitioner.

Al datahentning og forretningslogik er implementeret. Du læser fra Zustand-storen og kalder eksisterende server-funktioner som allerede er defineret. Du opretter ingen nye.

---

## ABSOLUT FORBUDT — disse filer rører du aldrig

| Fil / mappe | Årsag |
|-------------|-------|
| `src/lib/project-store.ts` | Store-shape er låst — kald kun eksisterende setters |
| `src/lib/analysis-orchestrator.ts` | Server-orchestrator |
| `src/lib/pre-check-adresse.ts` | Server function — kald den, rediger den ikke |
| `src/lib/reactive-compliance.ts` | Kritisk compliance-beregning |
| `src/lib/rule-engine/**` | Regelkerne — ingen UI-ansvar |
| `src/routeTree.gen.ts` | Auto-genereret — redigér ALDRIG |
| `vite.config.ts` | Auto-konfigureret |
| `src/server.ts` | Sentry-wrapper — slet ikke |
| `AGENTS.md` / `CLAUDE.md` | Arkitekturdokumentation |
| `package.json` / `wrangler.toml` | Deployment-config |
| `src/integrations/**` | API-klienter — ingen UI-ansvar |

**Ingen nye npm-pakker tilføjes uden godkendelse.**

---

## Backend-kontrakter du bruger

### Zustand Store — `useProject()` fra `@/lib/project-store`

```typescript
const {
  address,              // Address | null — grundareal, kommune, matrikel, koordinater
  bbrData,              // BbrKompliantData | null — byggeaar, bebygget_areal, samlet_areal, antal_etager
  adressePreCheck,      // AdressePreCheckResultat | null — tidlig compliance-data
  complianceFlags,      // ComplianceFlag[] — alle aktive compliance-flags
  complianceMetrics,    // ComplianceMetrics | null — beregnet fra plandata
  vurderingData,        // VurData | null — ejendomsvaerdi, grundvaerdi, vurderingsaar
  boligoenskeValidering,// BoligoenskeValidering | null — valideringsstatus mod plangrænser
  setBoligoenskeValidering, // setter for ovenstående
} = useProject();
```

### AdressePreCheckResultat — shape

```typescript
type AdressePreCheckResultat = {
  blockers: ComplianceFlag[];   // hårde blokere (strandbeskyttelse, fredskov, fredning)
  advarsler: ComplianceFlag[];  // bløde advarsler (SAVE 4, V1-forurening, skovbyggelinje)
  kontekst: {
    grundareal: number | null;
    bebyggetAreal: number | null;
    bebyggelsesprocent: number | null;
    antalEtager: number | null;
    maxBebyggelsesprocent: number | null;
    maxEtager: number | null;
    maxBygningshoejde: number | null;
    restBygningsareal: number | null;  // = dit byggepotentiale
    ejendomsvaerdi: number | null;
    grundvaerdi: number | null;
  };
  bbr: BbrKompliantData | null;
  vurderingData: VurData | null;
  complianceMetrics: ComplianceMetrics | null;
};
```

### ComplianceFlag — shape

```typescript
type ComplianceFlag = {
  id: string;                      // "save-bevaringsvaerdi", "bbr-fredet", "fjernvarme-tilslutningspligt" ...
  label: string;                   // brugervenlig titel
  status: "blocker" | "advarsel" | "ok";
  kilde: "bbr" | "plandata" | "sdfi" | "geus" | "dkjord" | "regelkerne";
  detalje?: string;
  dispensationMulig?: boolean;
  dispensationMyndighed?: string;  // "Kystdirektoratet", "Kommunens tekniske forvaltning"
};
```

### BoligoenskeValidering — shape

```typescript
type BoligoenskeValidering = {
  etagerStatus: "ok" | "dispensation" | "ingen_data";
  arealStatus:  "ok" | "dispensation" | "ingen_data";
  beregnetBebyggelsespct: number | null;
  etagerDispensationAcknowledged: boolean;
  arealDispensationAcknowledged: boolean;
};
```

---

## Designsystem

- Filer: `src/components/ui/` indeholder **alle** shadcn/ui-komponenter der er installeret
- Tilgængelige: `Dialog`, `AlertDialog`, `Badge`, `Alert`, `Progress`, `Collapsible`, `Card`, `Button`, `Separator`
- Farvekonvention: `destructive` = rød, amber = `bg-amber-50 border-amber-200 text-amber-800`, grøn = `bg-green-50 border-green-200`
- Eksisterende wizard-primitiver: `PageTransition`, `StepHeader`, `Card` fra `src/components/wizard-ui.tsx`
- Brug Tailwind-klasser fra det eksisterende design — mørk baggrund `#1A1A1A`, monospace overskrifter, border-baserede kort

---

## Opgave 1 (ARCH-125): Adresse compliance gate — visuel polish

**Fil:** `src/routes/projekt.adresse.tsx`

Logikken eksisterer allerede. `isCheckingCompliance` (lokal state), `hardBlockers`, `softBlockers`, `advarsler` og `allChecksDone` er allerede beregnet i komponenten. Din opgave er at sikre at alle 4 tilstande har korrekt og komplet visuel implementering.

### Tilstand 1: Checker (`isCheckingCompliance === true`)
- Under adressekortet: blå loading-bar (`Progress` med `indeterminate`-animation eller pulserende skeleton) + tekst "Vi checker byggevilkår for adressen..."
- Næste-knap: `disabled`, spinner-ikon i stedet for pil

### Tilstand 2: Hård blocker — RØD (`hardBlockers.length > 0`)
- Rød `Alert`-banner under adressekortet: ikon + `hardBlockers[0].label`
- Næste-knap **erstattes** af rød "Se årsag"-knap der åbner `<Dialog>`
- Dialog-indhold:
  - Rød overskrift: "Byggeri kan ikke anbefales her"
  - For hver blocker: ikon + `b.label` + `b.detalje`
  - Hvis `b.dispensationMulig`: "Kontakt [b.dispensationMyndighed]"
  - Primær knap: "Gå tilbage og vælg anden adresse" (lukker dialog, rydder `selected`)
  - Sekundær knap, kun ved `anyDispensationPossible`: "Fortsæt alligevel — jeg kender risikoen"

### Tilstand 3: Advarsel — AMBER (`softBlockers.length > 0 || advarsler.length > 0`, ingen hård blocker)
- Amber `Collapsible`-banner: "X forhold kræver opmærksomhed" som trigger
- Fold-ud indhold: liste over `[...softBlockers, ...advarsler]` med `b.label` + `b.detalje`
- Næste-knap: aktiv men amber-farvet, tekst "Fortsæt med forbehold →"

### Tilstand 4: Rent (`allChecksDone && hardBlockers.length === 0 && softBlockers.length === 0 && advarsler.length === 0`)
- Grønt `Badge` på adressekortet: "✓ Ingen kendte byggehindringer"
- Næste-knap: normal aktiv

---

## Opgave 2 (ARCH-126): EjendomPanel — redesign med fuld dataoverblik

**Fil:** `src/components/cockpit/EjendomPanel.tsx`

Komponenten eksisterer og henter allerede data fra store. Nu er dataene tilgængelige (udfyldt af `preCheckAdresse` ved adressevalg). Redesign så alle sektioner er implementerede og viser meningsfuldt indhold.

```typescript
const { complianceMetrics, bbrData, vurderingData, complianceFlags, address, adressePreCheck } = useProject();
const k = adressePreCheck?.kontekst;
```

Brug `complianceMetrics` til beregningsdata (det er den autoritative kilde — allerede i store). Brug `k` som fallback hvis `complianceMetrics` er null.

### Sektion 1: "Din grund" — 3 metric cards
```
┌──────────────────┬──────────────────────┬──────────────────────┐
│ GRUNDAREAL       │ BYGGEPOTENTIALE      │ EJENDOMSVÆRDI        │
│ {grundareal} m²  │ ~{restBygningsareal} │ {ejendomsvaerdi} mio │
│ Bebygget: X%     │ m² tilbage af max    │ Vurderet {aar}       │
└──────────────────┴──────────────────────┴──────────────────────┘
```
- `grundareal`: `complianceMetrics?.grundareal ?? k?.grundareal`
- `restBygningsareal`: `complianceMetrics?.remainingBygningsareal ?? k?.restBygningsareal`
- `ejendomsvaerdi`: `vurderingData?.ejendomsvaerdi` — formater som "X,X mio. kr."
- Null-værdier vises som "—"

### Sektion 2: "Eksisterende bygning"
Fra `bbrData` (eller `adressePreCheck?.bbr` som fallback):
- Byggeår, bebygget areal, samlet areal, antal etager, anvendelse
- Vis som to-kolonne faktarække

### Sektion 3: "Plangrænser"
Tabel:

| Grænse | Tilladt | Nuværende |
|--------|---------|-----------|
| Bebyggelsesprocent | `maxBebyggelsesprocent`% | `currentPct`% + chip ✅/❌ |
| Antal etager | `maxEtager` | `currentEtager` + chip ✅/❌ |
| Bygningshøjde | `maxHoejde ?? "Ikke defineret"` | — |

Grøn checkmark-chip hvis under grænse, rød kryds-chip hvis over.  
Vis hele sektionen uanset om data mangler — vis "—" i tomme celler.

### Sektion 4: "Kendte begrænsninger"
Kun synlig hvis `complianceFlags.length > 0`:
- For hvert flag: farvet status-badge + label + fold-ud detalje
- `status === "blocker"` → rød, `"advarsel"` → amber, `"ok"` → grøn
- Ingen flags → vis ikke sektionen

### Sektion 5: "Ejendomsoplysninger" (footer)
- Matrikel: `address?.matrikel`
- Kommune: `address?.kommune`
- Grundværdi: `vurderingData?.grundvaerdi` — formater som kr.
- Vurderingsår: `vurderingData?.vurderingsaar`

---

## Opgave 3 (ARCH-127): Boligoensker — kontekst-chips per spørgsmål

**Fil:** `src/components/cockpit/index.tsx` — find boligoensker-wizard-steppene inde i komponenten

```typescript
const { adressePreCheck, complianceFlags, boligoenskeValidering } = useProject();
const k = adressePreCheck?.kontekst;
```

Tilføj kontekst-chips direkte under svarmuligheder. Alle chips er konditionelle — vis kun hvis data eksisterer.

### Step: Antal etager
Under etage-valgknapperne — kun hvis `k?.maxEtager != null`:
```tsx
<Badge variant={valgtEtager <= (k?.maxEtager ?? Infinity) ? "outline" : "destructive"}>
  Kommuneplanen tillader: maks {k.maxEtager} etager
</Badge>
```

### Step: Ønsket areal (m²)
Under areal-slider — kun hvis `k?.restBygningsareal != null`:
```tsx
<div>
  <p className="text-sm text-muted-foreground">
    Dit byggepotentiale: {k.restBygningsareal} m²
  </p>
  <Progress value={Math.min((valgtAreal / k.restBygningsareal) * 100, 100)}
            className={valgtAreal > k.restBygningsareal ? "bg-red-200" : ""} />
  <p className="text-xs text-muted-foreground">
    {valgtAreal} / {k.restBygningsareal} m² — samlet bebyggelsesprocent:{" "}
    {boligoenskeValidering?.beregnetBebyggelsespct?.toFixed(0) ?? "—"}%
    af maks {k.maxBebyggelsesprocent ?? "—"}%
  </p>
</div>
```

### Step: Tagform
Soft amber hint — kun vis hvis lokalplanen specificerer tagform. Kig i `complianceFlags` efter flag med `kilde === "plandata"` der omhandler tagform, eller tjek `adressePreCheck?.bbr` for et lokalplan-hint. Vis:
```tsx
<Badge className="bg-amber-50 border-amber-200 text-amber-800">
  📋 Lokalplanen specificerer: {tagformHint}
</Badge>
```

### Step: Facademateriale
Tilsvarende amber hint-chip fra lokalplan.

### Step: Varmekilde (fjernvarme)
Vis fjernvarme-status baseret på `complianceFlags`:
```typescript
const fjernvarmeTilslutning = complianceFlags.find(f => f.id === "fjernvarme-tilslutningspligt");
const fjernvarmeMismatch    = complianceFlags.find(f => f.id === "fjernvarme-mismatch-ingen-daekning");
```
- `fjernvarmeTilslutning` eksisterer → grøn chip: "🔥 Fjernvarme tilgængeligt (mulig tilslutningspligt)"
- `fjernvarmeMismatch` eksisterer → amber chip: "🔥 Fjernvarme: Ikke bekræftet på adressen"
- Ingen af dem → grå chip: "🔥 Fjernvarme: Status ukendt"
- Kun synlig på varmekilde-stepet

---

## Opgave 4 (ARCH-128): Boligoensker — inline blocker og dispensationsmodal

**Fil:** `src/components/cockpit/index.tsx`

```typescript
const { boligoenskeValidering, setBoligoenskeValidering } = useProject();
```

### Step: Antal etager — ved `etagerStatus === "dispensation"`

Rød `Alert`-banner under etage-knapperne:
```
🚫 {valgtEtager} etager er ikke tilladt her
   Kommuneplanen tillader maks {k.maxEtager} etager.
   Du kan søge dispensation hos kommunen.

   [ Vælg andet ]   [ Fortsæt med dispensation ]
```
- Næste-knap: **skjul** mens denne tilstand er aktiv og `!etagerDispensationAcknowledged`
- "Vælg andet" → rydder etage-valget i `byggeoenske`
- "Fortsæt med dispensation" → åbner dispensationsmodal

### Step: Ønsket areal — ved `arealStatus === "dispensation"`

Tilsvarende rød `Alert`-banner:
```
🚫 {valgtAreal} m² overstiger dit byggepotentiale
   Samlet: {beregnetPct}% (maks {maxPct}%)
   Max tilladt tilbygning: {k.restBygningsareal} m²

   [ Juster areal ]   [ Fortsæt med dispensation ]
```
- Slider låses IKKE — brugeren kan justere frit
- "Juster areal" → scroll til slider + highlight
- "Fortsæt med dispensation" → åbner dispensationsmodal

### Dispensationsmodal — delt `<AlertDialog>` komponent

```tsx
<AlertDialog open={dispensationModalOpen} onOpenChange={setDispensationModalOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>⚠️ Dette kræver dispensation</AlertDialogTitle>
      <AlertDialogDescription>
        Du har valgt {kontekstTekst} som overstiger kommuneplanens grænse på {grænse}.
        <br /><br />
        En dispensation kræver:
        <ul>
          <li>Ansøgning til kommunen</li>
          <li>Typisk 4–12 ugers behandlingstid</li>
          <li>Ingen garanti for godkendelse</li>
        </ul>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Annuller — vælg anderledes</AlertDialogCancel>
      <AlertDialogAction onClick={handleAcknowledge}>
        Jeg forstår risikoen — fortsæt
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Når "Jeg forstår risikoen — fortsæt" klikkes:
```typescript
const handleAcknowledge = () => {
  setBoligoenskeValidering({
    ...boligoenskeValidering!,
    etagerDispensationAcknowledged: activeDispensationType === "etager" ? true : boligoenskeValidering!.etagerDispensationAcknowledged,
    arealDispensationAcknowledged:  activeDispensationType === "areal"  ? true : boligoenskeValidering!.arealDispensationAcknowledged,
  });
  setDispensationModalOpen(false);
};
```

### Næste-knap tilstande

| Tilstand | Næste-knap |
|----------|-----------|
| `etagerStatus: "ok"` + `arealStatus: "ok"` | Normal "Næste →" |
| `"dispensation"` og IKKE acknowledged | Knap **skjult** (erstattet af Alert-knapper) |
| Acknowledged (`etagerDispensationAcknowledged \|\| arealDispensationAcknowledged`) | Amber "Næste (kræver dispensation) →" + amber badge "⚠️ Dispensation nødvendig" |
| Hard stop (`complianceFlags.some(f => f.status === "blocker")`) | Knap fjernet — vis blocker-besked |

---

## Definition of done

- [ ] Alle 4 compliance-gate-tilstande i `projekt.adresse.tsx` er visuelt korrekte og fuldt implementerede
- [ ] `EjendomPanel.tsx` viser alle 5 sektioner uden "undefined", "NaN" eller tomme kort
- [ ] Kontekst-chips i boligoensker-wizard opdateres live ved slider/valg-ændringer
- [ ] Dispensationsmodal åbner og lukker korrekt og skriver til store via `setBoligoenskeValidering`
- [ ] Amber næste-knap vises korrekt efter acknowledged dispensation
- [ ] `bun build` — ingen type-fejl
- [ ] `bunx eslint .` — ingen nye fejl
- [ ] Ingen `console.log` i produceret kode

---

## Hvad du IKKE gør

- Opretter ikke `createServerFn`
- Importerer ikke fra `@/integrations/**` direkte
- Ændrer ikke shape på typer i `project-store.ts`
- Opretter ikke nye Supabase-queries
- Rydder ikke op i eksisterende logik du ikke forstår
- Kommenterer ikke ud — slet aldrig kode, bare tilføj UI oven på det der er der
