# Inspirationsbillede Upload - Projekt Bootstrap Review Task

> **For Claude review:** Denne opgave beskriver en fejl i upload-flowet for inspirationsbilleder, den sandsynlige rodarsag, og en foreslaaet loesning. Fokus er arkitekturgodkendelse af projekt-bootstrap og state-persistence, ikke implementering endnu.

**Goal:** Faa inspirationsbillede-upload til at virke stabilt for indloggede brugere i cockpit, og fjern fejlen `Projektet er ikke klar til upload endnu. Proev igen om et oejeblik.`

**Scope:** Upload af inspirationsbilleder i `AiDesignHero`, projekt-bootstrap mellem `/projekt/adresse` og `/projekt/$id/cockpit`, og hvordan `currentProjectId` bliver etableret og gendannet i Zustand.

**Problem type:** Stateful flow bug / bootstrap race / manglende klient-kendskab til server-oprettet projekt-id.

---

## Problemstilling

Brugeren kan komme til cockpit med en gyldig adresse og vaere logget ind, men stadig ikke kunne uploade inspirationsbilleder. Uploaden stopper foer selve storage-kaldet, fordi `AiDesignHero` kraever at `useProject.getState().currentProjectId` allerede findes.

Fejlbilledet viser sig som:

```text
Projektet er ikke klar til upload endnu. Proev igen om et oejeblik.
```

Det er ikke en Supabase Storage-fejl, auth-fejl eller MIME-type-fejl. Fejlen opstaer tidligere i UI-flowet.

---

## Symptomer og kodepunkter

### 1. Upload guard fejler direkte naar `currentProjectId` er `null`

Fil:

- `src/components/cockpit/AiDesignHero.tsx`

Relevant kode:

```typescript
const projectId = useProject.getState().currentProjectId;
if (!projectId) {
  setUploadError("Projektet er ikke klar til upload endnu. Proev igen om et oejeblik.");
  setAnalyseState("error");
  return;
}
```

Konsekvens: Brugeren faar en blocker, selv om projektet kan vaere persisted server-side.

### 2. Adresse-flowet persisterer state, men etablerer ikke klientens `currentProjectId`

Fil:

- `src/routes/projekt.adresse.tsx`

Relevant kode:

```typescript
syncPatch({ address: fullAddress, complianceDone: false, currentStep: "boligoenske" });
```

`syncPatch()` returnerer ikke et projekt-id til klienten. Hvis der endnu ikke findes et aktivt projekt i store, kan serveren godt oprette eller vaelge et projekt, men browseren faar ikke det resulterende id tilbage.

### 3. Server-persistence kan auto-oprette/finde projekt uden at klienten faar id'et

Fil:

- `src/integrations/supabase/project-persistence.ts`

Relevant kode:

```typescript
const id = projectId?.trim() ? projectId : await getOrCreateProject(userId);
```

Det betyder, at persistence-laget godt kan skrive til et projekt, selv om klienten stadig har `currentProjectId === null`.

### 4. Cockpit restore springer den kritiske path over

Fil:

- `src/routes/projekt.$id.cockpit.tsx`

Restore-effekten starter med:

```typescript
if (routeMatchesAddress(address, adresseId)) {
  setRestorePhase("checked");
  return;
}
```

Hvis adressen allerede er sat i store fra `/projekt/adresse`, bliver restore af projektet kortsluttet. Dermed kaldes `setCurrentProjectId(project.id)` ikke i den path, hvor brugeren lige er navigeret fra adressevalg til cockpit.

Konsekvens: Brugeren har korrekt adresse-state, men intet `currentProjectId`.

---

## Sandsynlig rodarsag

Projekt-id'et bliver behandlet som implicit server-knowledge i persistence-laget, men upload-flowet kraever eksplicit klient-knowledge i Zustand.

Med andre ord:

1. `syncPatch()` kan gemme til et projekt uden at klienten kender id'et.
2. `AiDesignHero` kan ikke arbejde uden at klienten kender id'et.
3. Cockpit-bootstrap antager, at hvis adressen matcher, er restore ikke noedvendig.
4. Den antagelse er falsk for upload-flowet, fordi adresse-match ikke er det samme som projekt-id-bootstrap.

---

## Foreslaaet loesning

### Primaer loesning: Goer projekt-bootstrap deterministisk i cockpit

Opdater restore-logikken i `src/routes/projekt.$id.cockpit.tsx`, saa den ikke stopper tidligt kun fordi adressen matcher route-parametret.

Ny regel:

- Hvis `address` matcher route-parametret **og** `currentProjectId` findes, maa restore springes over.
- Hvis `address` matcher route-parametret **men** `currentProjectId` er `null`, skal vi stadig kalde `restoreProject(...)` og derefter `setCurrentProjectId(project.id)`.

Hvorfor denne loesning:

- Den er mindst invasiv.
- Den passer ind i nuvaerende arkitektur med `restoreProject`.
- Den retter den konkrete bug i den path brugeren faktisk rammer.
- Den aendrer ikke server boundary eller ownership-regler.

### Sekundaer loesning: Returner projekt-id fra foerste persist efter adressevalg

Overvej at udvide klient/server-kontrakten, saa foerste persist efter adressevalg returnerer det projekt-id, som blev brugt eller oprettet server-side, og satter `currentProjectId` straks i klienten.

Mulige retninger:

- Lad `serverSaveProject` returnere `projectId`.
- Eller indfoer en dedikeret bootstrap-funktion til "get or create current project id".

Hvorfor dette er sekundart:

- Det er mere invasivt i kontrakten mellem klient og persistence.
- Det kan vaere den rigtige langsigtede model, men kraever arkitektur-review.
- Den konkrete fejl kan loeses hurtigere i cockpit-bootstrap.

### Defensiv fallback: Upload maa gerne proeve at bootstrappe projektet

I `AiDesignHero` kan vi overveje en fallback:

- Hvis `currentProjectId` mangler, proev `restoreProject(null, currentAddressId)` eller tilsvarende bootstrap, foer vi viser blocker-fejlen.

Dette boer ses som defense-in-depth, ikke primaer loesning.

Hvorfor ikke kun denne:

- Upload-komponenten boer ikke alene eje projekt-bootstrap.
- Det skjuler et bredere stateproblem i stedet for at rette det ved kilden.

---

## Anbefalet implementeringsraekkefolge

1. Ret cockpit-bootstrap:
   Goer restore-condition afhængig af baade adresse-match og `currentProjectId`.

2. Tilfoej regressionstest eller reproducerbar komponent/integrationstest:
   Flow: `/projekt/adresse` -> vaelg adresse -> naviger til cockpit -> upload billede.

3. Overvej derefter om `syncPatch` / `serverSaveProject` skal returnere projekt-id:
   Dette er en mulig arkitekturforbedring, men ikke noedvendig for det hurtige fix.

4. Tilfoej optional fallback i `AiDesignHero` hvis Claude vurderer, at UI'en skal vaere ekstra resilient.

---

## Acceptkriterier

- En indlogget bruger kan vaelge adresse, gaa til cockpit og uploade inspirationsbillede uden at ramme "Projektet er ikke klar til upload endnu".
- `currentProjectId` er sat i Zustand, inden upload-flowet kraever det.
- Direkte aabning af eksisterende cockpit-URL virker stadig.
- Eksisterende restore-flow for `projectId` i querystring virker stadig.
- Ingen regression i `syncPatch`-flowet for adressevalg og compliance-persistens.

---

## Reviewspoergsmaal til Claude

1. Er cockpit-route den rigtige ejer af projekt-bootstrap, eller boer vi loefte ansvaret op i root/store-init?
2. Skal `syncPatch` fortsat vaere fire-and-forget, eller er det nu et tegn paa at kontrakten boer returnere `projectId`?
3. Er det acceptabelt at restore paa adresse-match men manglende `currentProjectId`, eller boer vi modellere projekt-bootstrap som en separat invariant?
4. Oensker vi en defensiv fallback i `AiDesignHero`, eller boer komponenten forblive "strict" og stole paa global bootstrap?

---

## Min anbefaling

Jeg anbefaler at Claude godkender en to-trins loesning:

1. **Nu:** Ret cockpit-bootstrap, saa `currentProjectId` altid etableres i adresse -> cockpit-flowet.
2. **Senere hvis oensket:** Overvej at lade persistence-kontrakten returnere `projectId`, saa klienten ikke skal gaette eller restore bagefter.

Det giver den mindste risiko, den tydeligste ansvarslinje, og retter den observerede produktionsfejl uden at lave en stor kontraktaendring med det samme.
