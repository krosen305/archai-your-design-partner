# DAWA → Datafordeler migrationsplan

**Deadline:** 17. august 2026 (DAWA API lukker)  
**Dato for plan:** April 2026  
**Berørte filer:** `src/integrations/dawa/client.ts`, `src/integrations/bbr/client.ts`, `src/routes/projekt.adresse.tsx`

---

## 1. Status: Hvad bruger vi fra DAWA i dag?

| #   | DAWA-kald                                 | Formål                                      | Fil                                    |
| --- | ----------------------------------------- | ------------------------------------------- | -------------------------------------- |
| A   | `GET /adresser/autocomplete?q=...`        | Adresseforslag til brugeren                 | `dawa/client.ts → getSuggestions()`    |
| B   | `GET /adresser/{id}`                      | Kommunenavn, matrikeldata, adgangsadresseid | `dawa/client.ts → getAddressDetails()` |
| C   | `GET /adgangsadresser/{adgangsadresseid}` | Jordstykke-reference (href)                 | `dawa/client.ts → getAddressDetails()` |
| D   | `GET {jordstykke.href}`                   | `registreretAreal` (grundareal i m²)        | `dawa/client.ts → getAddressDetails()` |

**BBR-klienten** (`src/integrations/bbr/client.ts`) er allerede migreret til Datafordeler GraphQL v2 og er DAWA-fri. ✓

---

## 2. Datafordeler-erstatninger

### Kald A – Autocomplete

**Problem:** Datafordeler har _ikke_ et dedikeret autocomplete-endpoint tilsvarende DAWA's.

**Løsning (prioriteret rækkefølge):**

1. **Kortsigtet (nu → aug 2026):** Behold DAWA's autocomplete. Det er det eneste kald der ikke har en klar 1:1-erstatning endnu.
2. **Mellemlangt sigt:** SDFI forbereder et officielt Adressevælger-widget. Følg https://dataforsyningen.dk/news for udgivelsesdato.
3. **Alternativ:** Brug Datafordeler REST-søgning via `DAR_Adresse`-filteret på `adressebetegnelse` (fri tekst) kombineret med `first: 5`. Kræver GraphQL-kald per tastetryk — test latency.

> **Konklusion:** Migrer autocomplete sidst. Det berører kun UX, ikke dataintegritet. DAWA's autocomplete-endpoint er lavrisiko at beholde kortsigtet.

---

### Kald B – Adressedetaljer (kommunenavn, matrikel)

**Erstatning:** DAR GraphQL v1 på `https://graphql.datafordeler.dk/DAR/v1`

DAR indeholder `DAR_Adresse` (fuld adressebetegnelse, kommunekode) og `DAR_Husnummer` (koordinater, matrikelreference). Én GraphQL-query pr. type (én root field per kald = to separate HTTP-kald).

**Nødvendigt at bekræfte via DAR-schema:**

- Felt til kommunenavn: sandsynligvis `DAR_NavngivenVej.vejnavn` + kommuneref, eller `DAR_Adresse` med joined data
- Feltnavne for matrikelnummer og ejerlav (nødvendigt til Kald D)
- Om `DAR_Husnummer` eksponerer `ejerlavskode` (Long) direkte

```
# Hent DAR-schema (kør én gang i PowerShell):
$schema = Invoke-RestMethod 'https://graphql.datafordeler.dk/DAR/v1/schema'
$schema | Out-File -FilePath dar-schema.txt -Encoding utf8
```

---

### Kald C + D – Grundareal via Matrikelregistret

**Erstatning:** MAT GraphQL v2 på `https://graphql.datafordeler.dk/MAT/v2`

**Bekræftede schema-facts:**

- `MAT_Jordstykke.registreretAreal: Long!` ✓ (det vi har brug for)
- `MAT_Jordstykke`-filter: `ejerlavLokalId: DafStringOperationFilterInput` + `matrikelnummer: DafStringOperationFilterInput`
- `MAT_Ejerlav.ejerlavskode: Long!` (matches DAWA's `ejerlav.kode`)
- `MAT_Ejerlav.id_lokalId: String!` (dette er `ejerlavLokalId` i MAT_Jordstykke-filteret)
- Begge typer kræver `virkningstid` argument (bitemporalitet)

**2-trins opslag:**

```
Trin 1: MAT_Ejerlav
  Input:  ejerlavskode (Long fra DAWA/DAR)
  Output: id_lokalId (String → bruges som ejerlavLokalId i trin 2)

Trin 2: MAT_Jordstykke
  Input:  ejerlavLokalId (fra trin 1) + matrikelnummer (String fra DAWA/DAR)
  Output: registreretAreal (Long = grundareal i m²)
```

**Datakilder til ejerlavskode + matrikelnummer:**

- Kortsigtet: hentes fra DAWA (som nu, bare kald C/D erstattes af MAT)
- Langsigtet: hentes fra DAR_Husnummer (kræver DAR-schema bekræftelse)

Se implementering i `src/integrations/mat/client.ts`.

---

## 3. Implementeringsfaser

### Fase 1 – Grundareal via MAT GraphQL (kan startes NU)

**Estimat:** 1-2 dage · **Risiko:** Lav

- [x] Bekræft `MAT_Jordstykke.registreretAreal` i schema ✓
- [ ] Implementer `src/integrations/mat/client.ts` med `MatService.getGrundareal()`
- [ ] Opdater `dawa/client.ts`: fjern kald C og D (jordstykke href-opslag)
- [ ] Send `ejerlavskode` + `matrikelnummer` fra DAWA til MAT-klienten
- [ ] Test med en rigtig adresse (f.eks. Hasselvej 48, 2830 Virum)

**Resultat:** Grundareal hentes fra officiel MAT-kilde i stedet for DAWA-href. Resten af DAWA-integrationen forbliver uændret.

---

### Fase 2 – Adressedetaljer via DAR GraphQL (start senest juni 2026)

**Estimat:** 3-5 dage · **Risiko:** Middel (kræver DAR-schema)

- [ ] Download og analysér DAR GraphQL-schema
- [ ] Implementer `src/integrations/dar/client.ts`:
  - `DarService.getAddressDetails(adresseid)` → kommunenavn, matrikel, adgangsadresseid
  - `DarService.getHusnummer(adgangsadresseid)` → koordinater, ejerlavskode, matrikelnummer
- [ ] Erstat `DawaService.getAddressDetails()` med `DarService.getAddressDetails()`
- [ ] Opdater `projekt.adresse.tsx` til at bruge DAR i stedet for DAWA for detaljer
- [ ] Fjern kald A (autocomplete) fra DAWA hvis Adressevælgeren er tilgængelig

---

### Fase 3 – Autocomplete-erstatning (senest august 2026)

**Estimat:** 2-5 dage afhængig af løsning · **Risiko:** Høj (ingen klar erstatning)

- [ ] Evaluér officiel Adressevælger-widget fra SDFI
- [ ] Alternativt: implementér fri-tekst-søgning via DAR GraphQL
- [ ] Erstat `DawaService.getSuggestions()` i `projekt.adresse.tsx`
- [ ] Slet `src/integrations/dawa/client.ts`

---

## 4. Risici og håndtering

| Risiko                                              | Sandsynlighed | Konsekvens                 | Håndtering                                        |
| --------------------------------------------------- | ------------- | -------------------------- | ------------------------------------------------- |
| `MAT_Ejerlav`-filter virker ikke med `ejerlavskode` | Lav           | Blocker for fase 1         | Brug Datafordeler REST som fallback (se nedenfor) |
| DAR-schema mangler direkte matrikeldata             | Middel        | Fase 2 forsinkes           | Behold DAWA kald B/C frem til deadline            |
| Adressevælger ikke klar til aug 2026                | Middel        | Autocomplete failer        | Implementér DAR-tekstsøgning selv                 |
| `registreretAreal` afviger fra DAWA-værdi           | Lav           | Forkert bebyggelsesprocent | Sammenlign mod kendte adresser under test         |

### Fallback: Datafordeler REST for grundareal

Hvis MAT GraphQL ikke kan filtrere på `ejerlavskode`, brug:

```
GET https://services.datafordeler.dk/MATRIKELREGISTER/Matrikel/1/REST/Jordstykke
  ?Ejerlavskode={kode}&Matrikelnummer={nr}&username=...&password=...
```

Kræver adgangskode-autentificering (forskellig fra API-nøgle i GraphQL).

---

## 5. Miljøvariabler (ingen ændringer nødvendige for fase 1)

```env
# Allerede i brug:
DATAFORDELER_API_KEY=...          # bruges af BBR + MAT GraphQL
DATAFORDELER_BBR_ENDPOINT=...     # valgfrit override

# Nye til fase 2:
DATAFORDELER_DAR_ENDPOINT=https://graphql.datafordeler.dk/DAR/v1
DATAFORDELER_MAT_ENDPOINT=https://graphql.datafordeler.dk/MAT/v2
```

---

## 6. Testplan (fase 1)

Test med disse kendte adresser og sammenlign grundareal mod BBR-offentlige data:

| Adresse                          | Forventet grundareal (ca.) |
| -------------------------------- | -------------------------- |
| Hasselvej 48, 2830 Virum         | ~800-1200 m²               |
| Vimmelskaftet 42, 1161 København | Etageejendom – stor grund  |

Kør i browser-devtools og sammenlign `grundareal` fra MAT mod det der tidligere kom fra DAWA.
