## Diagnose

Det er ikke et preview-cache problem. Ruten bliver faktisk sendt til cockpittet først, men cockpit-komponenten redirecter straks tilbage til `/projekt/adresse`, fordi den lokale Zustand-state stadig ikke har nået at gendanne projektets adresse efter `reset()`.

Nuværende kæde:

```text
Klik “Fortsæt”
→ reset() rydder address
→ navigate('/projekt/{adresseId}/cockpit?projectId=...')
→ CockpitContent mountes
→ useEffect ser: address?.adresseid mangler
→ redirect til /projekt/adresse
→ root-restore når ofte først bagefter
```

Derfor ser du også nogle gange analyse/loading-skærmen lynhurtigt: cockpittet mountes kort, men mangler state eller starter analyse-flowet før restore er stabilt.

## Plan

1. **Gør projektkort-navigationen state-klar før navigation**
   - Når brugeren klikker på et eksisterende projekt, skal vi ikke kun sætte `currentProjectId`.
   - Vi skal også lægge projektets kendte adresse ind i `useProject()` med det samme, så cockpit ikke starter med tom `address`.
   - Behold fallback: projekter uden adresse går stadig til `/projekt/adresse`.

2. **Fjern den tidlige cockpit-redirect-race**
   - I `CockpitContent` skal `/projekt/$id/cockpit` ikke straks redirecte til adressefeltet, hvis `address` mangler, men der findes `projectId` i URL’en.
   - I stedet skal den vente kort på restore, eller selv hente projektet via `restoreProject(projectId)` og sætte adressen.
   - Først hvis projektet reelt ikke har en adresse efter restore, skal brugeren sendes til adressefeltet.

3. **Sørg for at cockpit bruger URL-adressen som fallback**
   - Hvis route-parametret `$id` findes, og store-adressen mangler eller er fra et andet projekt, skal cockpit kunne bruge `$id` som den autoritative adresse-id under restore.
   - Det forhindrer, at gammel state eller sen restore fra et andet projekt sender brugeren forkert.

4. **Bevar eksisterende analyse-cache adfærd**
   - Hvis projektet allerede har `compliance_done` og `compliance_data`, skal cockpit vise eksisterende data fremfor at virke som om den henter alt igen.
   - Hvis data mangler, må den køre analysen — men først efter korrekt projekt/adresse-state er på plads.

5. **Verification**
   - Kontrollér TypeScript for de ændrede filer.
   - Test flowet manuelt i preview:
     - Logget ind på `/projekt/start`
     - Klik eksisterende projekt med adresse
     - Forventet: direkte til `/projekt/{adresseId}/cockpit?projectId={projectId}` uden tilbagefald til adressefeltet
     - Ved analyse-cache: ingen unødvendig “henter data igen”-oplevelse, hvis data allerede findes.