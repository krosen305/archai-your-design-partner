# BR18 compliance- og myndighedsplan for ArchAI

Dato: 2026-05-25  
Status: Plan til Claude/human architecture review. Ingen implementation er
paabegyndt i denne fil.

## Executive summary

ArchAI boer behandle BR18 som et versioneret compliance- og
dokumentationssystem, ikke som en AI-chat eller en flad regel-liste.

Maalet er, at ArchAI kan:

- identificere hvilke BR18-krav der er relevante for et konkret projekt
- skelne mellem maskinelt kontrollerbare krav, dokumentationskrav,
  fagreviewkrav og myndighedsskoen
- generere en transparent krav- og evidenslog til bruger, raadgiver og kommune
- danne en myndighedspakke til Byg og Miljoe/kommunal byggesag
- understotte faerdigmelding med teknisk dokumentation

AI maa forklare, opsummere og skrive udkast. AI maa ikke vaere compliance
source of truth. Den autoritative sandhed skal komme fra versionerede BR18-krav,
validerede projektfakta, offentlige registre, faglige beregninger og uploadet
dokumentation.

## Produktprincip

BR18-flowet skal styrke ArchAI som "The Builder's Cockpit":

- I `Sandkassen` giver BR18 trygge rammer for inspiration, uden at kvaele ideer.
- I `Matriklen` finder BR18 og registerdata de tidlige hard stops og ukendte
  forhold.
- I `Maskinrummet` koerer BR18 som live feasibility- og dokumentationsmotor for
  designvalg, budget og BIM-retning.
- I `Myndighed` bliver BR18 til en kravmatrix, dokumentationspakke,
  ansogningsmanifest og faerdigmeldingscheckliste.

Pre-purchase due diligence er central: systemet skal kunne sige "koeb ikke foer
dette er afklaret", ikke kun "her er en flot ide".

## Hovedgreb

### 1. Versioneret BR18 Requirement Catalog

Der oprettes et kurateret, versioneret katalog over BR18-krav.

Kataloget maa ikke genereres frit af AI. Det skal opdateres via reviewet data,
helst som kode-naere fixtures eller database-seed med versionsstyring.

Foreslaaet domænemodel:

```ts
type Br18Requirement = {
  id: string;
  br18Version: string;
  chapter: string;
  paragraph: string | null;
  title: string;
  sourceUrl: string;
  validFrom: string;
  validTo: string | null;
  projectScopes: ProjectScope[];
  requirementKind:
    | "machine_checkable"
    | "documentation"
    | "specialist_review"
    | "authority_discretion";
  severity: "hard_stop" | "dispensation" | "warning" | "documentation";
  applicability: ApplicabilityCondition[];
  requiredEvidence: EvidenceRequirement[];
  responsibleRole:
    | "owner"
    | "architect"
    | "engineer"
    | "certified_static_engineer"
    | "certified_fire_consultant"
    | "energy_consultant"
    | "municipality";
};
```

Kataloget skal indeholde kilder, paragrafhenvisninger og vejledningslinks, saa
hver regel kan forklares og dokumenteres.

### 2. BR18 Applicability Engine

For hvert projekt skal ArchAI kunne afgore om et krav er relevant.

Output maa aldrig kun vaere `true/false`. Manglende data er en legitim og vigtig
tilstand.

Foreslaaet output:

```ts
type Br18ApplicabilityResult = {
  requirementId: string;
  status:
    | "relevant"
    | "not_relevant"
    | "unknown_missing_data"
    | "requires_specialist_review"
    | "requires_authority_decision";
  reasons: string[];
  missingInputs: string[];
  sourceFacts: SourceFactReference[];
};
```

Dette er vigtigt, fordi store dele af BR18 ikke kan afgøres maskinelt ud fra
adresse, BBR og en brugerbeskrivelse alene.

### 3. Rule Engine Extension

Den eksisterende `src/lib/rule-engine/` skal fortsat vaere compliance source of
truth for rene regler.

BR18 skal kobles paa som moduler, ikke som spredte if-statements i UI, hooks,
server functions eller AI-prompts.

Eksempler paa BR18-omraader:

- Bebygelsesregulerende forhold: areal, hoejde, etager, afstande.
- Brand: typisk dokumentations- og certificeret reviewspor, ikke simpel
  auto-godkendelse.
- Konstruktioner: dokumentation, statisk klasse, beregninger og evt.
  certificeret statiker.
- Energi: energiramme, klimaskaerm, installationer, varmetab og dokumentation.
- Indeklima: ventilation, fugt, dagslys, termisk komfort og radon.
- Tilgaengelighed: anvendelses- og projektartsafhaengigt.
- Lyd: dokumentation og evt. beregninger.
- LCA/klima: projekttype, stoerrelse, bygningskategori og gaeldende BR18-version.
- Drift, kontrol og vedligehold: D&V-dokumentation til faerdigmelding.

### 4. Evidence Ledger

Alle relevante krav skal kunne pege paa evidens.

Foreslaaet model:

```ts
type EvidenceItem = {
  id: string;
  projectId: string;
  requirementId: string;
  evidenceType:
    | "register_data"
    | "drawing"
    | "calculation"
    | "declaration"
    | "product_documentation"
    | "photo"
    | "manual_upload"
    | "advisor_note"
    | "authority_response";
  status: "missing" | "draft" | "uploaded" | "validated" | "rejected";
  source: "datafordeler" | "plandata" | "user_upload" | "advisor" | "ai_extract" | "manual";
  fileId: string | null;
  structuredPayload: Record<string, unknown> | null;
  validationNotes: string[];
  reviewedByRole: string | null;
  reviewedAt: string | null;
};
```

JSONB maa kun bruges som arkiv eller secondary payload. Domain-kritiske
compliance-vaerdier skal have typed columns eller typed tabeller.

### 5. Myndighed Package Generator

ArchAI skal kunne generere en myndighedspakke, men ikke love at den er klar til
indsendelse uden review.

Pakken boer indeholde:

- projektresume
- adresse, matrikel, BFE, BBR og planforhold
- BR18-kravmatrix
- mangelliste og ukendte forhold
- tegningsliste
- beliggenhedsplan og situationsplan, naar datakvalitet er tilstraekkelig
- branddokumentation eller brand-reviewtask
- konstruktionsdokumentation eller statiker-reviewtask
- energidokumentation eller energikonsulent-task
- LCA/klimadokumentation hvis relevant
- D&V-dokumentation og faerdigmeldingscheckliste
- authority package manifest med versions- og kildehenvisninger

Generatoren skal kunne markere:

- `FORELOEBIG - ikke til myndighedsbrug`
- `KLAR TIL RAADGIVERREVIEW`
- `KLAR TIL MYNDIGHEDSREVIEW`
- `MANGLER KRITISK DOKUMENTATION`

## Arkitekturplan efter CLAUDE.md Gatekeeper Protocol

### 1. Hvilken boundary krydser aendringen?

BR18-planen krydser flere risikoboundaries:

- offentlige BR18-kilder og vejledninger
- brugerinput om projektart, design og tekniske valg
- registerdata fra Datafordeler, Plandata, BBR, MAT, FBB og Arealdata
- AI-ekstraheret dokumentation fra PDF'er og uploads
- Supabase-persistens
- myndighedsrettede dokumenter og eksportpakker

Alle boundaries skal valideres ved indgang.

### 2. Hvilken schema eller decoder validerer data?

Nye schemas boer ligge i domain eller types-lag, afhængigt af retning:

- `br18RequirementSchema`
- `br18RequirementCatalogSchema`
- `br18ApplicabilityResultSchema`
- `br18ComplianceResultSchema`
- `evidenceItemSchema`
- `authorityPackageManifestSchema`
- `br18ProjectFactsSchema`

AI-output maa kun bruges efter schema-parse. Uparseable AI-output skal give
degraded state, ikke compliance-sandhed.

### 3. Hvor bor business logic?

Business logic skal ligge i pure TypeScript:

- `src/lib/br18/requirements/`
- `src/lib/br18/applicability/`
- `src/lib/br18/evidence/`
- `src/lib/rule-engine/rules/br18-*`

Domænelaget maa ikke importere React, Supabase, Datafordeler-klienter,
server functions eller AI SDK'er.

### 4. Hvilken application service ejer workflowet?

Foreslaaede services:

- `br18-compliance.service.server.ts`: samler project facts og koerer BR18
  applicability + regelmotor.
- `br18-documentation.service.server.ts`: opdaterer evidence ledger og udleder
  dokumentationsstatus.
- `authority-package.service.server.ts`: samler manifest, filer og
  myndighedspakke.
- `br18-catalog.service.server.ts`: laeser versioneret kravkatalog og validerer
  katalogversion.

Server functions skal vaere tynde inbound adapters:

1. validate input
2. authenticate with `withAuth()`
3. dynamically import service
4. return service result

### 5. Hvilken adapter haandterer Supabase, Datafordeler, AI, storage eller cache?

Adapters/repositories:

- Supabase writes i `src/integrations/supabase/repositories/`
- registerdata i eksisterende integrationsklienter
- AI extraction i `src/integrations/ai/`
- file storage via storage adapter
- cached raw/source data i `address_source_results`
- compliance-kritiske facts i `projects`, `site_constraints` eller nye typed
  tabeller

Der maa ikke komme direkte Supabase-kald i UI, routes eller server function
handlers.

### 6. Hvordan forhindres UI i at eje domain logic?

UI maa kun vise:

- kravstatus
- manglende dokumentation
- naeste handlinger
- reviewstatus
- download/eksportstatus

UI maa ikke:

- hardcode BR18-paragraffer som logik
- udlede compliance via tekst/regex
- vurdere hard stops
- acceptere client-provided compliance-signaler som autoritative

UI skal kalde fokuserede hooks/server functions, som returnerer typed status.

### 7. Hvilke tests beviser boundary og domain behavior?

Tier 1:

- Applicability tests for projektart, bygningstype, areal, anvendelse og
  manglende data.
- Rule tests for BR18 default-grænser, prioritering mellem lokalplan,
  kommuneplan og BR18.
- Evidence ledger tests for missing/draft/validated/rejected.

Tier 2:

- Application service tests med fake repositories og fake BR18 catalog.
- Authority manifest tests uden real Supabase, storage eller AI.
- AI extraction tests med schema-valid og schema-invalid payload.

Tier 3:

- Address -> cockpit -> BR18 kravmatrix.
- Hard stop gate foer design/AI-output.
- Myndighedspakke smoke med seeded project og fake dokumentation.

## Datamodelretning

Undgaa at smide BR18 ind i `compliance_data` JSONB som sandhed.

Mulige nye typed tabeller:

- `br18_requirement_versions`
- `project_br18_applicability`
- `project_br18_evidence`
- `authority_packages`
- `authority_package_items`

Mulige typed columns paa eksisterende tabeller skal kun tilfoejes, naar en
vaerdi er domain-kritisk og faktisk bruges af regelmotoren eller hard stop.

Eksempler:

- `projects.br18_version`
- `projects.authority_readiness_status`
- `site_constraints.lca_required`
- `site_constraints.energy_frame_required`
- `site_constraints.fire_review_required`
- `site_constraints.static_review_required`

Foelg AGENTS.md: typed columns beat JSONB, men tilfoej ikke kolonner
spekulativt.

## BR18-kildehaandtering

BR18-kataloget skal have explicit source governance:

- kilde er `bygningsreglementet.dk` og officielle vejledninger
- hver regel skal have kilde-URL og version
- aendringer i BR18 skal kunne indfoeres som ny katalogversion
- projekter skal kunne fastlaases til en BR18-version
- historiske projekter maa ikke aendre compliance-resultat uden eksplicit
  re-evaluering

Anbefalede officielle startkilder:

- https://www.bygningsreglementet.dk/
- https://www.bygningsreglementet.dk/administrative-bestemmelser/krav/
- https://www.bygningsreglementet.dk/Administrative-bestemmelser/BRV/Vejledning-om-byggesagsbehandling-efter-BR18/
- https://www.bygningsreglementet.dk/media/0o1nbejw/dokumentation-af-bygningsreglementets-tekniske-bestemmelser-i-forbindelse-med-faerdigmelding-af-byggeriet-2025.pdf
- https://www.sbst.dk/byggeri/baeredygtigt-byggeri/national-strategi-for-baeredygtigt-byggeri/klimakrav-lca-i-bygningsreglementet

## Klassificering af BR18-krav

Ikke alle BR18-krav skal behandles ens.

### Machine-checkable

Kan beregnes deterministisk fra trusted facts:

- bebyggelsesprocent, naar arealer og planhierarki er kendt
- hoejde/etager, naar design og planhierarki er kendt
- skelafstand, naar geometri er myndighedsnaer nok
- simple projektart- og arealtriggers

### Documentation-required

Kan ikke godkendes af ArchAI, men kan trackes og pakkes:

- energiberegning
- LCA-beregning
- D&V-dokumentation
- produktdokumentation
- tegninger
- materialelister

### Specialist-review

Kraever fagperson eller certificeret raadgiver:

- baerende konstruktioner/statik
- brandforhold
- komplekse fugt/indeklima/ventilation-forhold
- akustik/lyd
- specialfundering/geoteknik

### Authority-discretion

Kraever kommune eller anden myndighed:

- dispensationer
- lokalplanfortolkning
- landzoneforhold
- bevaringsforhold
- naboorientering/partshoering
- uklar anvendelsesklassifikation

## AI-strategi

AI skal bruges som assistent, ikke dommer.

Tilladt:

- forklare krav paa dansk
- lave udkast til ansogningsnotater
- opsummere uploadede dokumenter
- foreslaa manglende bilag
- skrive raadgiverbriefs
- omformulere myndighedssprog til brugerforstaaeligt sprog

Ikke tilladt:

- markere BR18-krav som opfyldt uden rule/evidence
- finde paa paragrafhenvisninger
- bruge client-provided hard stop-signaler som autoritet
- give "klar til myndighed" uden evidence ledger og readiness gate

Alle AI-svar der gemmes eller bruges i dokumentationsflowet skal schema-valideres.

## Myndighedsflow

### Foer ansogning

ArchAI skal danne:

- kravmatrix
- projektfakta
- tegnings- og bilagsliste
- mangelliste
- risikolog
- raadgiverbrief
- myndighedsrettet ansogningsudkast

### Under ansogning

ArchAI skal tracke:

- indsendte bilag
- kommunale svar
- krav om supplerende dokumentation
- partshoering/naboorientering
- dispensationer og vilkaar

### Foer faerdigmelding

ArchAI skal tracke:

- teknisk dokumentation
- erklaeringer
- beregninger
- kontrolplaner
- D&V
- evt. dokumentation fra certificerede raadgivere

## Implementation roadmap

### Fase 0 - Architecture review

- Claude reviewer denne plan.
- Afklar scope: enfamiliehus foerst eller bredere bygningstyper.
- Afklar om BR18-katalog starter som repo-fixtures eller database-seed.
- Afklar hvilke kapitler der er P0.

### Fase 1 - Domain foundation

- Opret pure BR18 types og schemas.
- Opret minimal kravkatalogfixture med 10-20 representative krav.
- Opret applicability engine.
- Opret evidence ledger domain helpers.
- Tilfoej Tier 1 tests.

### Fase 2 - Service layer

- Opret application services med injected deps.
- Opret repositories for project BR18 applicability/evidence.
- Opret typed service tests.
- Ingen UI-logik endnu.

### Fase 3 - Cockpit read model

- Vis BR18 kravmatrix i cockpit.
- Vis missing evidence og next actions.
- Brug `building_tasks` til opgaver.
- UI viser kun typed resultater.

### Fase 4 - Myndighed package MVP

- Lav authority manifest.
- Generer foreloebig PDF/Markdown/ZIP-struktur.
- Marker tydeligt om pakken er foreloebig, klar til raadgiverreview eller klar
  til myndighedsreview.

### Fase 5 - Specialist tracks

- Brandspor.
- Konstruktionsspor.
- Energispor.
- LCA/klimaspor.
- D&V/faerdigmeldingsspor.

### Fase 6 - Governance og versionering

- Katalogversioner.
- Re-evaluation workflow.
- Diff mellem BR18-versioner.
- Audit log for kravstatus og dokumentation.

## P0-scopeforslag

Start med enfamiliehus, tilbygning, nedrivning-og-nybyg samt renovering.

P0-krav:

- planhierarki og BR18-defaults for bebyggelsesprocent/hoejde/etager/skel
- brandreview-required classification
- static-review-required classification
- energy-documentation-required classification
- LCA-required unknown/relevant classification
- D&V/faerdigmeldingsdokumentation checklist
- authority package manifest

Dette giver hurtigt reel vaerdi uden at paastaa, at ArchAI automatisk kan
godkende alle BR18-kapitler.

## Risici

- Falsk tryghed hvis UI viser "godkendt" uden dokumentation.
- BR18-versioner aendrer sig over tid.
- Lokale kommunale praksisser og lokalplaner kan overrule eller supplere
  BR18-defaults.
- Brand, konstruktioner, energi og LCA kan ikke reduceres til simple
  if-statements.
- AI kan hallucinerer paragrafhenvisninger, hvis den ikke bindes til katalog og
  citations.
- JSONB-only compliance vil goere myndighedsflowet svagt og svaert at auditere.

## Non-goals

- ArchAI skal ikke automatisk indsende til Byg og Miljoe i foerste version.
- ArchAI skal ikke erstatte certificerede brand- eller statikraadgivere.
- ArchAI skal ikke love myndighedsgodkendelse.
- ArchAI skal ikke scrape BR18 live som runtime dependency.
- ArchAI skal ikke gemme compliance-kritiske vaerdier kun i JSONB.

## Definition of done for foerste implementation

- Pure domain tests for applicability og evidence ledger.
- Service tests med fake deps.
- Ingen nye direkte Supabase-kald uden for repositories.
- Ingen BR18-regler i UI.
- Ingen client-provided compliance-signaler som server-authority.
- Alle AI-payloads schema-valideres.
- Katalogregler har version, kilde og reviewbar tekst.
- Myndighedspakke markerer tydeligt readiness og mangler.
- `bunx tsc --noEmit`, `bun test`, `bunx eslint .` og `bun run build` passer,
  medmindre en kendt baseline-fejl eksplicit accepteres.
