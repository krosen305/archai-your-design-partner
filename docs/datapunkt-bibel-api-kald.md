# Databibel — API-datapunkter og kald-afhængigheder

Opdateret: 2026-05-17  
Kilde: faktisk kodeflow i `src/lib/analysis-orchestrator.ts`, `src/lib/compliance-layer1.ts`, `src/lib/pre-check-adresse.ts` og integrationsklienter.

## 1) Startpunkt: adressevalg

Input ved adressevalg (minimum):
- `adresseid` (DAR_Adresse `id_lokalId`)

Primær enrich-kæde:
1. `adresseid` -> DAR (`DarService.getAddressDetails`)
2. DAR returnerer felter der unlocker Layer 1-kald
3. Layer 1 kalder BBR + MAT + Plandata + EBR/VUR
4. Layer 2/3/4 kalder specialservices (FBB, naturbeskyttelse, servitutter, terræn, m.fl.)

## 2) Datakæde (hvilket datapunkt unlocker næste service)

| Trin | Service | Kræver datapunkt(er) | Returnerer nøglefelter | Bruges til næste kald |
|---|---|---|---|---|
| A1 | DAR_Adresse | `adresseid` | `husnummer` (FK), `adressebetegnelse` | `husnummer` -> DAR_Husnummer |
| A2 | DAR_Husnummer | `husnummer` | `id_lokalId` (adgangsadresseid), `adgangspunkt`, `postnummer`, `jordstykke` | `adgangsadresseid` -> BBR/EBR/naboer, `jordstykke` -> MAT_Jordstykke, `adgangspunkt` -> koordinater |
| A3 | DAR_Adressepunkt | `adgangspunkt` | `position.wkt` (EPSG:25832) -> `koordinater{lat,lng}` | `koordinater` -> Plandata, naturbeskyttelse, fjernvarme, GEUS, DK-Jord, DHM, naboer |
| A4 | MAT_Jordstykke (via DAR-flow) | `jordstykke` FK | `matrikelnummer`, `ejerlavLokalId`, `registreretAreal` | `ejerlavLokalId` -> MAT_Ejerlav, `registreretAreal` -> grundareal |
| A5 | MAT_Ejerlav (via DAR-flow) | `ejerlavLokalId` | `ejerlavskode` | `ejerlavskode` + `matrikelnummer` -> MAT (Layer 1), Tinglysning |
| B1 | MAT (Layer 1) | `ejerlavskode`, `matrikelnummer` | `registreretAreal`, `strandbeskyttelse_omfang`, `fredskov_omfang`, `klitfredning_omfang` | Grundareal + mat-flags merges ind i BBR-resultat |
| B2 | BBR (Datafordeler) | `adgangsadresseid` (+ valgfri `grundareal`) | bygning/areal/fredning + `alle_bygning_lokal_ids` | `alle_bbr_public_ids` kræves til FBB |
| B2b | BBR Public | `adgangsadresseid` | `alle_bbr_public_ids` (integer IDs) | -> FBB `getSaveData(bygningIds)` |
| B3 | Plandata lokalplan | `koordinater` | `lokalplaner[]` inkl. `plandokumentLink` | `plandokumentLink` -> PDF extraction |
| B4 | Plandata kommuneplanramme | `koordinater` | `bebygpct`, `maxetager`, `maxbygnhjd`, etc. | Rule/compliance-beregning |
| B5 | EBR | `adgangsadresseid` (husnummerLokalId) | `bfeNr` | `bfeNr` -> VUR |
| B6 | VUR | `bfeNr` | `ejendomsvaerdi`, `grundvaerdi`, `vurderetAreal`, `vurderingsaar` | visning + økonomikontekst |
| C1 | Lokalplan PDF extractor | `lokalplaner[0].plandokumentLink` | struktureret lokalplan-ekstrakt | compliance forklaring/kontekst |
| C2 | Tinglysning | `addressId` (+ live kræver `ejerlavskode`,`matrikelnummer`) | `servitutter[]`, `pant` | risk/compliance-kontekst |
| C3 | FBB | `alle_bbr_public_ids[]` (fallback: `vejnavn`,`kommunenavn`) | `bevaringsvaerdi`, `fbb_er_fredet` | hard stop/warning regler (SAVE/fredning) |
| C4 | Naturbeskyttelse (DAI WFS) | `koordinater` | `strandbeskyttelse`, `skovbyggelinje`, `soebeskyttelse`, `aabeskyttelse`, `klitfredning` | blockers/advarsler |
| C5 | Fjernvarme (Plandata WFS) | `koordinater` | `fjernvarmeDaekket` | energikontekst |
| C6 | GEUS | `koordinater` | `radonRisk`, `groundwaterDepthM` | risikokontekst |
| C7 | DK-Jord | `koordinater` | `v1Kortlagt`, `v2Kortlagt`, `olietank`, `omraadeklassificering` | risikokontekst |
| C8 | DHM terræn | `koordinater` + valgfri `grundareal` | hældning, kotepunkter, orientering | teknisk kontekst |
| C9 | Naboer | `koordinater` + `adgangsadresseid` (exclude own) | afstande til naboadresser | nabokontekst |

## 3) Konkrete nøglefelter fra DAR, som unlocker resten

De vigtigste DAR-felter i praksis er:
- `adgangsadresseid` (DAR_Husnummer `id_lokalId`)
- `koordinater.lat/lng` (fra DAR_Adressepunkt `position.wkt`)
- `ejerlavskode` (via MAT_Ejerlav i DAR-flow)
- `matrikelnummer` (via MAT_Jordstykke i DAR-flow)
- `grundareal` (MAT_Jordstykke `registreretAreal`)

Uden disse felter:
- Uden `adgangsadresseid`: BBR/EBR/VUR/FBB/naboer kan ikke kaldes korrekt.
- Uden `koordinater`: Plandata, naturbeskyttelse, fjernvarme, GEUS, DK-Jord, DHM kan ikke kaldes.
- Uden `ejerlavskode` + `matrikelnummer`: MAT-fallback og live-tinglysning kan ikke kaldes.

## 4) Runtime-gating i orchestration

- Layer 1 (BBR/MAT) køres først.
- Hvis BBR allerede viser hard-stop (`fredet` eller MAT-beskyttelse), så skip pes dyre Layer 4-kald (GEUS, DK-Jord, DHM, naboer, fjernvarme).
- FBB køres stadig, fordi SAVE/fredning skal vises deterministisk.

## 5) Bemærkning om nuværende implementation vs. policy

Nuværende kode bruger stadig:
- DAWA for `NaboService`
- Dataforsyningen BBR Public for integer building IDs til FBB

Hvis I vil gøre flowet 100% i tråd med “DAWA er forbudt”-reglen, skal disse to led migreres til Datafordeler-baserede alternativer.
