# Opgavebeskrivelse: Interaktiv Plantegningseditor — UI (Codex handoff)

**Dato:** 2026-05-30
**Til:** Codex (overtager frontend-arbejdet)
**Status:** Backend komplet og committet på `feat/beliggenhedsplan-authority-grade`. Frontend ikke påbegyndt.
**Mål:** Byg den interaktive plantegningseditor-UI ovenpå den færdige backend-vertikal.

---

## 0. TL;DR

Backenden er færdig: domæne, services, persistence (live i DB), render (SVG+PDF), AI-parser
og **fem `createServerFn`-handlers** (generér/load/verificér/anvend-command/eksportér). Alt er
TDD-bygget, `tsc`/`eslint` rent, build passerer.

Din opgave: byg React-editoren der lader brugeren oprette, se og redigere en plantegning ved
at trække i vægge/døre/vinduer/fixtures, med live feedback og server-side verifikation/eksport.
**Du må ikke ændre domæne-/service-/persistence-koden** — kald de eksisterende handlers og
genbrug de pure domænefunktioner. UI er en adapter (CLAUDE.md Rule 2).

---

## 1. Kontekst du SKAL læse først (i rækkefølge)

1. **`CLAUDE.md`** — arkitekturkontrakt. Især:
   - Rule 2 (UI er en adapter — ingen compliance/persistence/AI i komponenter)
   - Rule 3 (server functions er tynde)
   - Rule 8 (ingen cirkulære imports)
   - Testing-afsnit (bun:test, `.test.tsx` kræver `import "@/testing/react-test-setup"`)
2. **`AGENTS.md`** — delte implementeringsregler for Codex.
3. **`docs/superpowers/specs/2026-05-30-interaktiv-plantegning-verifikation-materialer-design.md`**
   — den fulde kravspecifikation. Især §7 (arkitekturprincipper), §8.2 (vertical slice),
   §16 (UX-krav), §18 (AI-token-strategi), §23.3 (lukkede beslutninger), §24.4 (hit-testing/snap-boundary).
4. **Backend du bygger ovenpå** (læs signaturer, ikke implementér om):
   - `src/lib/floor-plan/floor-plan.functions.ts` — de fem handlers
   - `src/domain/floor-plan/floor-plan.types.ts` — `FloorPlanDocument`, `Wall`, `RoomZone`, `Opening`, `Fixture`, `FloorLevel`
   - `src/domain/floor-plan/commands.ts` + `command.schemas.ts` — `FloorPlanCommand`, `CommandResult`
   - `src/domain/floor-plan/apply-command.ts` — `applyCommand(doc, command)` (PURE — kør lokalt for instant feedback)
   - `src/domain/floor-plan/verification-engine.ts` — `runVerification(doc)` (PURE), `VerificationFinding`, `FloorPlanVerificationReport`
   - `src/lib/floor-plan/floor-plan-render-model.ts` — `buildRenderModel(doc, levelId)`, `FloorPlanRenderModel`
   - `src/lib/floor-plan/render-floor-plan-svg.ts` — `renderFloorPlanSvg(model)` (kun preview/eksport, IKKE den interaktive canvas)
   - `src/domain/geometry/polygon-ops.ts` + `geometry-2d.types.ts` — `Point2D`, `Polygon2D`, `pointInPolygon`, `polygonCentroid`, `lineLengthM`
5. **Klient-kaldmønster (kopiér dette præcist):** `src/routes/projekt.datacheck.tsx` linje ~93–129
   viser hvordan en route henter token og kalder en `createServerFn`.

---

## 2. Hvad backenden allerede giver dig

### 2.1 Server functions (alle `POST`, alle tager `token`)

Importér fra `@/lib/floor-plan/floor-plan.functions`:

| Function                  | Input (`data`)                                                                                                                           | Output                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `generateFloorPlanFn`     | `{ projectId(uuid), designIterationId(uuid\|null=null), targetAreaM2(>0), rooms:[{name, roomType}], footprint?:{widthM,depthM}, token }` | `{ generated:true, floorPlanIterationId, document } \| { generated:false, blockers:string[] }`                                           |
| `loadActiveFloorPlanFn`   | `{ projectId(uuid), token }`                                                                                                             | `{ iterationId, document } \| null`                                                                                                      |
| `verifyFloorPlanFn`       | `{ projectId(uuid), floorPlanIterationId(uuid), token }`                                                                                 | `FloorPlanVerificationResult` (status, findings, metrics, materialBasis, inputHash, …)                                                   |
| `applyFloorPlanCommandFn` | `{ projectId(uuid), floorPlanIterationId(uuid), command:FloorPlanCommand, source("drag"\|"keyboard"\|"ai"\|"system")="drag", token }`    | `{ accepted:true, floorPlanIterationId, changedElementIds, liveFindings } \| { accepted:false, reasonCode, message, suggestedCommands }` |
| `exportFloorPlanFn`       | `{ projectId(uuid), floorPlanIterationId(uuid), levelId?:string, token }`                                                                | `{ exportId, svgPath, svgContent, pdfPath, pdfUrl, readinessStatus }`                                                                    |

`roomType` enum: `entrance|hall|living|kitchen|bedroom|bathroom|utility|office|storage|technical|stair|garage|other`.

`FloorPlanCommand` union (v1 understøttede i `applyCommand`): `move_wall {wallId,deltaM,axis:"x"|"y"}`,
`move_opening {openingId,wallId,offsetM}`, `move_fixture {fixtureId,roomId,x,y}`. (Andre command-typer
findes i schemaet men afvises endnu af apply-pipelinen — vis dem som "kommer snart" eller skjul.)

### 2.2 Pure domænefunktioner (kør i browseren — 0 AI tokens, <50 ms)

- `applyCommand(doc, command)` → `ApplyOutcome` (`{accepted:true, document, changedElementIds, liveFindings}` eller afvisning).
  **Brug denne lokalt for optimistisk feedback under drag.** Serveren er stadig autoritet (kald
  `applyFloorPlanCommandFn` for at persistere — den kører samme `applyCommand` server-side).
- `runVerification(doc)` → live findings til inline-feedback.
- `buildRenderModel(doc, levelId)` → struktureret `{ viewBox, walls[], rooms[], openings[], fixtures[] }`
  med element-id'er og LOCAL_METER-koordinater. **Brug denne til den interaktive canvas** (map hvert
  element til et `<line>/<polygon>/<circle>` med pointer-handlers).

### 2.3 Klient-kald (kopiér mønster)

```ts
const { getSession } = await import("@/lib/auth");
const session = await getSession();
if (!session) return;
const result = await applyFloorPlanCommandFn({
  data: { projectId, floorPlanIterationId, command, source: "drag", token: session.access_token },
});
```

`useProject()` (fra `@/lib/project-store`) giver `currentProjectId` og `address`.

---

## 3. Arkitektur- og state-regler (NON-NEGOTIABLE)

1. **`FloorPlanDocument` er sandheden — ikke React/canvas-state.** Hold det aktive dokument i ét
   sted (en hook/`useState` er ok som _interaktionscache_, men det er en kopi af server-modellen,
   ikke en konkurrerende sandhed). Compliance/areal/verifikation ejes af domæne/server.
2. **Drag-flow:** pointer-event → byg `FloorPlanCommand` → kør `applyCommand` lokalt for instant
   preview → ved drag-slut: send command til `applyFloorPlanCommandFn` → erstat lokalt dokument med
   serverens resultat (autoritativt). Ved afvisning: rul preview tilbage og vis `reasonCode`/`message`.
3. **Live validation = samme motor:** importér `runVerification`/`applyCommand` fra domænet. **Ingen
   parallel valideringslogik i UI.** (Spec FR-VER-001, §18.1.)
4. **Hit-testing & snap er pure helpers** i `src/lib/floor-plan/` mod domænegeometri (§24.4):
   tilladt = punkt-til-væg-afstand, snap-kandidat-scoring, bbox-queries, meter↔px-transform.
   IKKE tilladt i de pure helpers: DOM-reads, SVG-mutation, React-state, browser-event-parsing.
   Browser-pointer-mapping bor i komponenten/hooken.
5. **Ingen direkte Supabase/AI/Datafordeler-kald fra komponenter.** Kun via de fem handlers.
6. **AI-tokenforbrug:** drag/inspector/snap/live-validation bruger 0 AI tokens. AI bruges kun til
   fritekst-kommandoer (parseren findes: `src/integrations/ai/floor-plan-command-parser.ts`, men den
   konkrete gateway + et `parseFloorPlanCommandFn`-handler er IKKE bygget endnu — se §6 Ude-af-scope).

---

## 4. Komponenter & filer du skal bygge

Følg modulstrukturen fra spec §8:

```txt
src/components/floor-plan/
  FloorPlanEditor.tsx      # container: layout, henter/holder aktivt dokument + iterationId
  FloorPlanCanvas.tsx      # interaktiv SVG: render fra buildRenderModel, pointer-handlers, zoom/pan
  FloorPlanToolbar.tsx     # venstre værktøjslinje (vælg, væg, dør, vindue, fixture, undo/redo)
  FloorPlanInspector.tsx   # højre panel: præcise mål for valgt element
  VerificationPanel.tsx    # sidepanel: status + findings (severity-farver), "Verificer"-knap

src/lib/floor-plan/
  editor-hit-testing.ts    # PURE: pick element fra punkt, nærmeste væg/segment (+ .test.ts)
  snap-engine.ts           # PURE: snap til grid/parallel/hjørne/vægforlængelse (+ .test.ts)
  editor-viewport.ts       # PURE: meter↔skærm-px transform (zoom/pan, y-flip) (+ .test.ts)

src/hooks/
  useFloorPlanEditor.ts    # workflow: load/generate, anvend command (lokal+server), undo/redo-stak,
                           # selection, verify, export. Holder dokument-state. (Tier-2 .test.tsx)

src/routes/
  projekt.$id.plantegning.tsx   # ny route der monterer FloorPlanEditor (eller integrér i cockpit —
                                # afklar placering med menneske før du tilføjer en topnav-indgang)
```

### UX-krav (spec §16)

- Central plantegning, venstre værktøjslinje, højre inspector, nederste statuslinje (arealer/status),
  verification-panel som sidepanel, undo/redo, zoom/pan, snap-settings, etage-tabs.
- Klik væg → vælg. Træk væg → flyt. Træk endpoint → ændr længde (hvor tilladt). Træk dør/vindue langs
  parent wall. Inspector ændrer præcise mål. Invalid moves vises med **inline, handlingsorienteret**
  feedback (ikke "Plan invalid", men fx "Værelse 2 er ikke længere lukket. Flyt væggen tilbage…").
- Låste/bærende elementer: kræv eksplicit bekræftelse eller bloker (serveren håndhæver allerede —
  vis bare `reasonCode` pænt: `ELEMENT_LOCKED`, `OPENING_OUTSIDE_PARENT_WALL`, osv.).

### Koordinatmapping (vigtigt)

Render-modellen er i LOCAL_METER (y-up, arkitektonisk). SVG er y-down. Brug samme konvention som
`renderFloorPlanSvg`: `screenX = (x - minX)*scale`, `screenY = (maxY - y)*scale`, hvor
`maxY = viewBox.minY + viewBox.height`. Læg zoom/pan ovenpå. Saml dette i `editor-viewport.ts` (pure).

---

## 5. Acceptkriterier (vertical slice, spec §8.2 + §21)

1. Bruger kan **generere** en 1-plans plantegning (kald `generateFloorPlanFn` fra en simpel "opret"-form
   med areal + rumliste) ELLER **loade** eksisterende (`loadActiveFloorPlanFn`).
2. Planen renderes i den interaktive SVG-editor (vægge, rumstempler m. navn+areal, døre, vinduer, fixtures).
3. Bruger kan **vælge og trække intern væg**; tilstødende rumarealer opdateres live.
4. Bruger kan **flytte dør langs væg** og **vindue langs ydervæg**.
5. Bruger kan **flytte teknikskab/fixture** til andet rum.
6. **Live validation kører efter hver operation** (via `runVerification`/`applyCommand`-findings), inline.
7. Hver accepteret edit **persisteres** via `applyFloorPlanCommandFn` (ny aktiv version gemmes server-side).
8. Bruger kan køre **formel verifikation** (`verifyFloorPlanFn`) og se status + findings i panelet.
9. Bruger kan **eksportere SVG/PDF** (`exportFloorPlanFn`) og se status-stempel.
10. **Undo/redo** virker via en in-memory snapshot-stak (spec §23.3.2 — snapshot er canonical, ikke replay).
11. Ingen compliance-sandhed i UI; ingen direkte Supabase-writes; ingen nye cirkulære imports.

---

## 6. Ude af scope (rør ikke / senere)

- **Backend-koden** (domæne/services/persistence/handlers) — brug som den er.
- **Konkret Anthropic AI-gateway** + `parseFloorPlanCommandFn`-handler: ikke bygget. Fritekst-kommando-UI
  må vente, eller bygges bag et feature-flag når gatewayen findes. (Parseren + porten findes allerede.)
- **Trusted-site footprint-kilde** (`TrustedSiteAdapter` returnerer p.t. `null` → verifikation viser
  `FP-GEO-003 review_required`. Det er forventet; vis det som en mangel, ikke en fejl.)
- **Generated Supabase-typer** er ikke regenereret (repos bruger untyped-handle som `drawing_exports`).
- **Topology X-krydsninger**: motoren håndterer ortogonale vægge + T-junctions, ikke vilkårlige krydsninger.
  Begræns editor-operationer til ortogonale flytninger i v1; markér andet som review.
- Avanceret BR18-brand/tilgængelighed, materialeberegning (kun geometry-only summary findes), split-level.

---

## 7. Test & Definition of Done

- **Pure helpers** (`editor-hit-testing`, `snap-engine`, `editor-viewport`): `bun:test` unit-tests
  (`src/lib/floor-plan/*.test.ts`). Højeste værdi — test disse grundigt.
- **Hook** (`useFloorPlanEditor`): `.test.tsx` med `import "@/testing/react-test-setup"` øverst; mock
  server-functions på modulniveau (IKKE `@/lib/project-store`/`project-sync` — forbudt at mocke på filniveau).
- **Tier-3 Playwright** (`tests/*.spec.ts`): 1–2 journeys max — fx "generér → træk væg → verificér → eksportér PDF".
- Visuel verifikation: kør appen (`bun dev`) og bekræft drag/feedback føles øjeblikkelig.
- Før "done": `bunx tsc --noEmit`, `bun test`, `bunx eslint .`, `bun run build` skal alle passere.
  Ingen debug-logs, ingen nye `any`/ucheckede boundary-casts, ingen direkte Supabase-kald i UI.

---

## 8. Anbefalet rækkefølge

1. `editor-viewport.ts` (meter↔px) + test — fundament for al rendering/hit-testing.
2. `FloorPlanCanvas.tsx` read-only: render `buildRenderModel`-output som interaktiv SVG (ingen drag endnu).
3. `editor-hit-testing.ts` + selection i canvas.
4. `useFloorPlanEditor.ts`: load/generate + selection-state + dokument-state.
5. Drag væg → lokal `applyCommand` preview → `applyFloorPlanCommandFn` persist → erstat dokument.
6. `snap-engine.ts` + snap under drag.
7. Dør/vindue/fixture-drag (samme mønster).
8. `FloorPlanInspector.tsx` (præcise mål) + `FloorPlanToolbar.tsx` + undo/redo.
9. `VerificationPanel.tsx` (`verifyFloorPlanFn`) + eksport-knapper (`exportFloorPlanFn`).
10. Route + (efter menneske-OK) navigationsindgang. Playwright-journey.

---

## 9. Gotchas

- `renderFloorPlanSvg` (string) er til **eksport/preview**, ikke den interaktive canvas — byg interaktiv
  SVG i React fra `buildRenderModel`-data, så hvert element har sin egen event-handler og `data-*-id`.
- Et `move_wall` flytter også tilstødende vægendepunkter (domænet gør det) → re-render hele niveauet
  efter et accepteret command, brug ikke kun det enkelte element.
- Server returnerer et **nyt `floorPlanIterationId`** ved hver accepteret edit — opdatér din reference,
  ellers peger næste command på en forældet version.
- Afviste commands må ALDRIG efterlade brugeren med en muteret model — rul den optimistiske preview tilbage.
- `verifyFloorPlanFn` har et `verifiedAt`-timestamp (ikke-deterministisk) — forvent ikke idempotente
  outputs på tværs af kald; `inputHash` er derimod reproducerbar for samme model.

```

```
