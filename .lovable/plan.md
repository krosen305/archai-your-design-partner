## Problem 1 — "Slet projekt" mangler

På `/projekt/start` viser `ProjektKort` kun en "Fortsæt"-knap. Der er ingen måde at slette et projekt på, og `projekt-service.ts` har ingen `deleteProjekt`/`serverDeleteProject` funktion. Relateret data ligger flere steder og skal ryddes samtidig:

- `projects` (hovedrækken)
- `design_iterations` (FK `project_id` — ingen DB-cascade)
- `building_tasks` (FK `project_id` — ingen DB-cascade)
- Storage: `inspirationsbilleder/{userId}/{projectId}/*` (kun den ene mappe)
- `address_analysis` / `site_constraints` røres **ikke** — de er delt cache på tværs af brugere

## Problem 2 — Fortsæt sender mig til `/projekt/adresse`

Reproduktion (sample: `/projekt/0a3f50a6-34d8-32b8-e044-0003ba298018/cockpit`):

1. `ProjektKort.handleFortsaet` kalder `reset()` → adresse ryddes
2. `setCurrentProjectId(projekt.id)` + `navigate('/projekt/{adresse_dar_id}/cockpit?projectId=...')`
3. Cockpit mounter, `restorePhase="pending"`, første `useEffect` kalder `restoreProject(pid, adresseId)`
4. `restoreProject` lykkes og returnerer rækken, men i `CockpitContent` (lines 526–586) er adresse-population **gated** af:
   ```ts
   if (project?.address_full && project?.address_bbr) { … setAddress(…) }
   ```
   Hvis `address_bbr` er `null` i DB (nyere projekter persisterer kun `address_adresseid`), springes hele `setAddress`-blokken over.
5. `restorePhase` sættes til `"checked"`, anden `useEffect` ser `currentAddress` = null og kalder `navigate({ to: "/projekt/adresse" })` (line 645–648).

Det er dén race brugeren oplever: URL'en skifter kort til cockpit-GUID'en og dumper så til adressefeltet, selvom projektet har en adresse.

Sekundær årsag: hvis `restoreProject` returnerer en række hvor `address_adresseid` er sat men `address_bbr` er `null`, vil `routeMatchesAddress` desuden aldrig matche, fordi adressen aldrig blev sat i store.

## Plan

### 1. Tilføj sletning af projekt

- `src/integrations/supabase/project-persistence.ts`: ny `deleteProject(accessToken, projectId)` som (i rækkefølge):
  1. tjekker at projektet tilhører `auth.uid()` (via `supabaseAdmin` + `getUserId(accessToken)`)
  2. lister og fjerner alle filer under `inspirationsbilleder/{userId}/{projectId}/`
  3. sletter `design_iterations.project_id = id`
  4. sletter `building_tasks.project_id = id`
  5. sletter `projects` rækken
- `src/lib/project-sync.ts`: tynd `serverDeleteProject = createServerFn({ method: "POST" })`-wrapper
- `src/lib/projekt-service.ts`: client-side `sletProjekt(projectId)` der henter access token og kalder server fn (samme mønster som `serverCreateProject`)
- `src/routes/projekt.start.tsx` (`ProjektKort`):
  - tilføj papirkurv-ikon (Lucide `Trash2`) som diskret knap i højre øverste hjørne af kortet, til venstre for "Fortsæt"
  - åbn AlertDialog (shadcn `alert-dialog`) med tekst "Slet projekt på {adresse}? Dette kan ikke fortrydes."
  - ved bekræft: kald `sletProjekt`, opdater lokal `projekter`-state (filter id ud), vis kort toast på fejl
  - hvis `currentProjectId === projekt.id` i store → `reset()` + `setCurrentProjectId(null)`

### 2. Fix Fortsæt-redirect

To koordinerede ændringer:

**a) `ProjektKort.handleFortsaet`** (`src/routes/projekt.start.tsx`):
Sæt adressen i store **inden** navigationen — så cockpit har state med det samme og ikke afhænger af restore-racen:
- erstat `reset()` med en målrettet `clearAnalysisState()` (eller eksplicit nulstilling af kun analyse-felter — bevar `currentProjectId` og `address`)
- byg en minimal `Address` ud fra `projekt`-rækken (`adresse`, `adresse_dar_id`, eventuelt andre felter `listProjekter` returnerer) og kald `setAddress(...)`
- hvis `listProjekter` ikke returnerer nok felter til at bygge `Address`, udvid SELECT'en + mapping så vi får `address_postnr`, `address_postnrnavn`, `address_kommune`, `address_koordinater`, `address_matrikel`, `address_ejerlavskode`, `address_matrikelnummer` med

**b) `CockpitContent` restore-blok** (`src/routes/projekt.$id.cockpit.tsx` ~line 526):
- løsn guarden: kør `setAddress(...)` hvis `project.address_full` findes OG (`project.address_adresseid` ELLER `project.address_bbr`) findes
- brug `adresseid: project.address_adresseid ?? project.address_bbr ?? adresseId` (URL'en er sidste fallback)
- sæt `adgangsadresseid` til samme fallback-kæde så `routeMatchesAddress` virker selv hvis kun ét id er gemt
- bevar al øvrig population (compliance, hus_dna osv.)

**c) Anden useEffect** (~line 645): inden redirect til `/projekt/adresse`, log warning med `adresseId` + `pid` så vi kan opdage fremtidige restore-huller, og brug `replace: true` på navigate (så browser-back ikke bouncer ind igen) — kun hvis vi reelt skal redirecte.

### 3. Verification

- Manuel test: log ind, vælg eksisterende projekt med `compliance_done=true` → lander direkte i cockpit-fanen ANALYSE uden tur over `/adresse`
- Manuel test: klik papirkurv på et projekt → bekræft → projektet forsvinder fra listen, refresh viser samme; klik kort = nyt projekt-kort
- DB-check via supabase read_query: `design_iterations` og `building_tasks` for det slettede `project_id` er væk
- `bunx tsc --noEmit`, `bunx eslint .`, `bun test`

### Tekniske detaljer

- `project-store.ts` har allerede en `setAddress` action; tjek om der findes en partial reset eller om vi tilføjer `clearAnalysisState` (kun `bbrData`, `complianceFlags`, `lokalplaner`, `byggeanalyseResultat` etc.) ved siden af `reset()`. **`project-store.ts` er beskyttet fil** → marker PR med 🔒.
- Bemærk: `restoreProject` har 5s in-flight cache, så __root.tsx og cockpit deler resultat — ingen dobbeltkald.
- `inspirationsbilleder`-sti er `{userId}/{projectId}/...` (per `projekt-service.ts` line ~95), så vi kan liste mappen og fjerne alle filer i ét `.remove()`-kald.
- Ingen DB-migration kræves; sletning sker via service-role klienten der bypasser RLS.
