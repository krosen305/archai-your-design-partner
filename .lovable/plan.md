## Problem

I `src/routes/projekt.start.tsx` (linje 161-176) bruger `ProjektKort.handleFortsaet()` en for streng gate inden den navigerer til cockpittet:

```ts
if (harAdresse && projekt.adresse_dar_id &&
    (COCKPIT_STEPS.has(projekt.current_step ?? "") || projekt.compliance_done)) {
  navigate({ to: `/projekt/${adresse_dar_id}/cockpit` })
} else if (harAdresse) {
  navigate({ to: "/projekt/adresse" })   // ← bug: sender bruger tilbage til adressesøgning
}
```

`current_step` defaulter til `"adresse"` (se `projects.current_step DEFAULT 'adresse'`), og opdateres først til en COCKPIT_STEPS-værdi (`boligoenske/ejendom/byggeanalyse/oekonomi`) hvis brugeren faktisk når dertil. `compliance_done` sættes først når analyse-pipeline er færdig. 

Resultat: Et projekt hvor brugeren har valgt adresse men endnu ikke kørt analyse → klik på "Fortsæt" → ledes til `/projekt/adresse` i stedet for cockpittet. Det er forkert: cockpittet er selv ansvarlig for at køre analysen (orchestrator triggeres på mount), og brugeren har ingen grund til at gentage adresseindtastning.

Det strider også mod AGENTS.md-reglen om at `current_step`-streng-enum ikke skal bruges til at drive navigation.

## Løsning

Forenkl gaten i `ProjektKort.handleFortsaet()`:

```ts
if (projekt.adresse_dar_id) {
  navigate({ to: `/projekt/${projekt.adresse_dar_id}/cockpit`, search });
} else {
  navigate({ to: "/projekt/adresse", search });
}
```

- Har projektet en `adresse_dar_id` → altid direkte til cockpit (uanset compliance-status / current_step). Cockpittet håndterer selv loading + auto-run af analyse.
- Ingen adresse endnu → adressesøgning som hidtil.

Fjern også den nu ubrugte `COCKPIT_STEPS`-konstant (linje 148) for at fjerne tech debt jf. AGENTS.md.

## Filer

- `src/routes/projekt.start.tsx` — forenkl `handleFortsaet`, slet `COCKPIT_STEPS`.

## Verifikation

- `bunx tsc --noEmit` 0 fejl
- Manuel: log ind, åbn et projekt med adresse men uden gennemført analyse → lander på `/projekt/{adresseid}/cockpit`.
- Manuel: åbn et projekt uden adresse → lander stadig på `/projekt/adresse`.

## Out of scope

Cockpit-routen `/projekt/$id/cockpit` (path-param er `adresseid`, ikke project-UUID) fungerer som i dag og rapporteres ikke ramt af brugeren. Hvis vi senere vil rydde op i den dobbelte identitet (projekt-UUID vs. adresseid i URL'en), kræver det en separat arkitekturopgave.
