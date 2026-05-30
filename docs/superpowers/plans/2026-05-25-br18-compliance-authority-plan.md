# BR18 Compliance & Myndighed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Byg et versioneret BR18-compliance modul med applicability engine, evidence ledger og myndighedspakke-generator — struktureret som Ports & Adapters med pure TypeScript i domænelaget.

**Scope (Fase 0 — lukket beslutning):**

- Bygningstyper: enfamiliehus, tilbygning, nedrivning_nybyg, renovering
- Katalogformat: repo-fixtures i kode (ikke database-seed i v1)
- P0-kapitler: Bebyggelsesregulerende (kap 8), Brand (kap 5), Konstruktioner (kap 15), Energi (kap 11-13), LCA/klima, D&V/færdigmelding
- AI-rolle: Forklare og opsummere. Aldrig markere krav som opfyldt.

**Architecture:**

- Domænelag `src/lib/br18/` — pure TypeScript, nul eksterne deps, ingen imports fra rule-engine
- Eksisterende `rule-engine/` håndterer allerede machine-checkable BR18-beregninger (bebyggelsesprocent, højde, etager, skelafstand) via `calculations.ts` med `appliedRule: "br18_default"` fallback. BR18-modulet tilføjer IKKE duplicate regler — det mapper eksisterende `RuleEngineResult` til BR18-kravformatet
- Import-retning: `br18/` ← ingen imports fra `rule-engine/`. `br18-compliance.service.server.ts` importerer fra begge og mapper imellem dem
- `reactive-compliance.ts` (beskyttet fil): røres ikke. BR18 kører i sit eget service-spor
- Hard Stop: Service-laget skriver til `projects.hard_stop` via eksisterende `projects.repository.ts` når en BR18-violation er `"illegal"`

**Tech Stack:** TypeScript, Zod, bun:test, Supabase, TanStack `createServerFn`, `withAuth()`

---

## Filstruktur

### Nye filer

```
src/lib/br18/
  types.ts                              — Br18Requirement, Br18ApplicabilityResult, EvidenceItem, AuthorityPackageManifest, Br18ProjectFacts
  schemas.ts                            — Zod-schemas for alle ovenstående typer
  fixtures/
    br18-2024-catalog.ts               — 10 P0-krav med source-URL og metadata
  requirements/
    catalog.ts                         — loadBr18Catalog(version) + getCatalogVersions()
    catalog.test.ts
  applicability/
    engine.ts                          — evaluateApplicability() + evaluateAllRequirements()
    engine.test.ts
    rule-engine-bridge.ts              — mapRuleEngineResultToBr18() — oversætter RuleViolation → Br18ApplicabilityResult
    rule-engine-bridge.test.ts
  evidence/
    ledger.ts                          — deriveRequirementReadiness(), getMissingEvidence(), derivePackageReadiness()
    ledger.test.ts
  authority/
    manifest.ts                        — buildAuthorityPackageManifest()
    manifest.test.ts

src/lib/services/
  br18-compliance.service.server.ts    — runBr18Compliance() — orkestrerer applicability + rule-engine bridge + persistens
  br18-compliance.service.test.ts

src/integrations/supabase/repositories/
  br18-applicability.repository.ts     — upsertApplicabilityResult(), getApplicabilityForProject()
  br18-applicability.repository.test.ts
  br18-evidence.repository.ts          — upsertEvidenceItem(), getEvidenceForProject(), updateEvidenceStatus()
  br18-evidence.repository.test.ts

supabase/migrations/
  [TIMESTAMP]_br18_tables.sql          — project_br18_applicability, project_br18_evidence
  [TIMESTAMP]_br18_columns.sql         — projects.br18_version, projects.authority_readiness_status, site_constraints.fire_review_required osv.

src/hooks/
  use-project-br18-compliance.ts       — useProjectBr18Compliance(projectId)

src/components/br18/
  Br18KravMatrix.tsx                   — Viser typed applicability-resultater, ingen compliance-logik
```

### Modificerede filer

```
src/integrations/supabase/repositories/projects.repository.ts
  — Tilføj updateBr18HardStop(projectId, hardStop, reason) hvis metoden ikke allerede eksisterer
  — Tilføj updateAuthorityReadiness(projectId, status)
```

> ⚠️ **Beskyttede filer der IKKE røres:** `reactive-compliance.ts`, `project-store.ts`, `analysis-orchestrator.ts`, `pre-check-adresse.ts`, `project-persistence.ts`

---

## Phase 1: Domain Foundation

### Task 1: BR18 domænetyper og Zod-schemas

**Filer:**

- Create: `src/lib/br18/types.ts`
- Create: `src/lib/br18/schemas.ts`

- [ ] **Step 1.1: Opret `src/lib/br18/types.ts`**

```typescript
export type ProjectScope = "enfamiliehus" | "tilbygning" | "nedrivning_nybyg" | "renovering";

export type RequirementKind =
  | "machine_checkable"
  | "documentation"
  | "specialist_review"
  | "authority_discretion";

export type RequirementSeverity = "hard_stop" | "dispensation" | "warning" | "documentation";

export type ResponsibleRole =
  | "owner"
  | "architect"
  | "engineer"
  | "certified_static_engineer"
  | "certified_fire_consultant"
  | "energy_consultant"
  | "municipality";

export type ApplicabilityStatus =
  | "relevant"
  | "not_relevant"
  | "unknown_missing_data"
  | "requires_specialist_review"
  | "requires_authority_decision";

export type EvidenceStatus = "missing" | "draft" | "uploaded" | "validated" | "rejected";

export type EvidenceSource =
  | "datafordeler"
  | "plandata"
  | "user_upload"
  | "advisor"
  | "ai_extract"
  | "manual";

export type EvidenceType =
  | "register_data"
  | "drawing"
  | "calculation"
  | "declaration"
  | "product_documentation"
  | "photo"
  | "manual_upload"
  | "advisor_note"
  | "authority_response";

export type AuthorityReadinessStatus =
  | "preliminary"
  | "ready_for_advisor_review"
  | "ready_for_authority_review"
  | "missing_critical_documentation";

export type ApplicabilityCondition = {
  field: string;
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "in" | "present";
  value: unknown;
};

export type EvidenceRequirement = {
  evidenceType: EvidenceType;
  description: string;
};

export type SourceFactReference = {
  source: EvidenceSource;
  field: string;
  value: unknown;
};

export type Br18Requirement = {
  id: string;
  br18Version: string;
  chapter: string;
  paragraph: string | null;
  title: string;
  description: string;
  sourceUrl: string;
  validFrom: string;
  validTo: string | null;
  projectScopes: ProjectScope[];
  requirementKind: RequirementKind;
  severity: RequirementSeverity;
  applicability: ApplicabilityCondition[];
  requiredEvidence: EvidenceRequirement[];
  responsibleRole: ResponsibleRole;
};

export type Br18ApplicabilityResult = {
  requirementId: string;
  status: ApplicabilityStatus;
  reasons: string[];
  missingInputs: string[];
  sourceFacts: SourceFactReference[];
};

export type EvidenceItem = {
  id: string;
  projectId: string;
  requirementId: string;
  evidenceType: EvidenceType;
  status: EvidenceStatus;
  source: EvidenceSource;
  fileId: string | null;
  structuredPayload: Record<string, unknown> | null;
  validationNotes: string[];
  reviewedByRole: string | null;
  reviewedAt: string | null;
};

export type AuthorityPackageManifest = {
  projectId: string;
  br18Version: string;
  generatedAt: string;
  readinessStatus: AuthorityReadinessStatus;
  requirements: Br18ApplicabilityResult[];
  evidenceItems: EvidenceItem[];
  missingItems: string[];
  unknownItems: string[];
};

export type Br18ProjectFacts = {
  projectScope: ProjectScope;
  bebyggetArealM2: number | null;
  grundarealM2: number | null;
  antalEtager: number | null;
  bygningshojdeM: number | null;
  skelafstandM: number | null;
  anvendelseskategori: string | null;
  br18Version: string;
  municipality: string;
};
```

- [ ] **Step 1.2: Opret `src/lib/br18/schemas.ts`**

```typescript
import { z } from "zod";

export const projectScopeSchema = z.enum([
  "enfamiliehus",
  "tilbygning",
  "nedrivning_nybyg",
  "renovering",
]);

export const requirementKindSchema = z.enum([
  "machine_checkable",
  "documentation",
  "specialist_review",
  "authority_discretion",
]);

export const requirementSeveritySchema = z.enum([
  "hard_stop",
  "dispensation",
  "warning",
  "documentation",
]);

export const applicabilityStatusSchema = z.enum([
  "relevant",
  "not_relevant",
  "unknown_missing_data",
  "requires_specialist_review",
  "requires_authority_decision",
]);

export const evidenceStatusSchema = z.enum([
  "missing",
  "draft",
  "uploaded",
  "validated",
  "rejected",
]);

export const evidenceSourceSchema = z.enum([
  "datafordeler",
  "plandata",
  "user_upload",
  "advisor",
  "ai_extract",
  "manual",
]);

export const evidenceTypeSchema = z.enum([
  "register_data",
  "drawing",
  "calculation",
  "declaration",
  "product_documentation",
  "photo",
  "manual_upload",
  "advisor_note",
  "authority_response",
]);

export const authorityReadinessStatusSchema = z.enum([
  "preliminary",
  "ready_for_advisor_review",
  "ready_for_authority_review",
  "missing_critical_documentation",
]);

export const applicabilityConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "gt", "lt", "gte", "lte", "in", "present"]),
  value: z.unknown(),
});

export const br18RequirementSchema = z.object({
  id: z.string(),
  br18Version: z.string(),
  chapter: z.string(),
  paragraph: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  sourceUrl: z.string().url(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  projectScopes: z.array(projectScopeSchema),
  requirementKind: requirementKindSchema,
  severity: requirementSeveritySchema,
  applicability: z.array(applicabilityConditionSchema),
  requiredEvidence: z.array(
    z.object({
      evidenceType: evidenceTypeSchema,
      description: z.string(),
    }),
  ),
  responsibleRole: z.enum([
    "owner",
    "architect",
    "engineer",
    "certified_static_engineer",
    "certified_fire_consultant",
    "energy_consultant",
    "municipality",
  ]),
});

export const br18RequirementCatalogSchema = z.array(br18RequirementSchema);

export const br18ApplicabilityResultSchema = z.object({
  requirementId: z.string(),
  status: applicabilityStatusSchema,
  reasons: z.array(z.string()),
  missingInputs: z.array(z.string()),
  sourceFacts: z.array(
    z.object({
      source: evidenceSourceSchema,
      field: z.string(),
      value: z.unknown(),
    }),
  ),
});

export const evidenceItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  requirementId: z.string(),
  evidenceType: evidenceTypeSchema,
  status: evidenceStatusSchema,
  source: evidenceSourceSchema,
  fileId: z.string().nullable(),
  structuredPayload: z.record(z.unknown()).nullable(),
  validationNotes: z.array(z.string()),
  reviewedByRole: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});

export const authorityPackageManifestSchema = z.object({
  projectId: z.string(),
  br18Version: z.string(),
  generatedAt: z.string(),
  readinessStatus: authorityReadinessStatusSchema,
  requirements: z.array(br18ApplicabilityResultSchema),
  evidenceItems: z.array(evidenceItemSchema),
  missingItems: z.array(z.string()),
  unknownItems: z.array(z.string()),
});

export const br18ProjectFactsSchema = z.object({
  projectScope: projectScopeSchema,
  bebyggetArealM2: z.number().nullable(),
  grundarealM2: z.number().nullable(),
  antalEtager: z.number().nullable(),
  bygningshojdeM: z.number().nullable(),
  skelafstandM: z.number().nullable(),
  anvendelseskategori: z.string().nullable(),
  br18Version: z.string(),
  municipality: z.string(),
});
```

- [ ] **Step 1.3: Verificer TypeScript**

```bash
bunx tsc --noEmit
```

Forventet: Ingen fejl.

- [ ] **Step 1.4: Commit**

```bash
git add src/lib/br18/types.ts src/lib/br18/schemas.ts
git commit -m "feat(br18): tilfoej domænetyper og Zod-schemas"
```

---

### Task 2: BR18 kravkatalog-fixture (P0)

**Filer:**

- Create: `src/lib/br18/fixtures/br18-2024-catalog.ts`

- [ ] **Step 2.1: Opret `src/lib/br18/fixtures/br18-2024-catalog.ts`**

```typescript
import type { Br18Requirement } from "../types";

export const br18_2024_catalog: Br18Requirement[] = [
  // ── Kap 8: Bebyggelsesregulerende ──────────────────────────────────────────
  // OBS: Bebyggelsesprocent/højde/etager/skelafstand kontrolleres allerede af
  // den eksisterende rule-engine (calculations.ts, br18_default fallback).
  // Disse krav er medtaget for applicability-klassificering og evidens-tracking.
  {
    id: "BR18-8.3.1-bebyggelsesprocent",
    br18Version: "2024",
    chapter: "8",
    paragraph: "8.3.1",
    title: "Bebyggelsesprocent — enfamiliehuse",
    description:
      "Bebyggelsesprocenten for enfamiliehuse og dobbelthuse må ikke overstige 30 (BR18 default). Lokalplan kan fastsætte anden grænse.",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/08/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
    requirementKind: "machine_checkable",
    severity: "hard_stop",
    applicability: [
      {
        field: "projectScope",
        operator: "in",
        value: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
      },
      { field: "grundarealM2", operator: "present", value: null },
    ],
    requiredEvidence: [
      {
        evidenceType: "drawing",
        description: "Situationsplan med arealopmåling og beregning af bebyggelsesprocent",
      },
    ],
    responsibleRole: "architect",
  },
  {
    id: "BR18-8.4.1-bygningshoejde",
    br18Version: "2024",
    chapter: "8",
    paragraph: "8.4.1",
    title: "Bygningshøjde — enfamiliehuse",
    description:
      "Bygningshøjden for enfamiliehuse og dobbelthuse må ikke overstige 8,5 m (BR18 default).",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/08/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
    requirementKind: "machine_checkable",
    severity: "hard_stop",
    applicability: [
      {
        field: "projectScope",
        operator: "in",
        value: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
      },
    ],
    requiredEvidence: [{ evidenceType: "drawing", description: "Facadetegning med koter" }],
    responsibleRole: "architect",
  },
  {
    id: "BR18-8.4.2-etager",
    br18Version: "2024",
    chapter: "8",
    paragraph: "8.4.2",
    title: "Antal etager — enfamiliehuse",
    description: "Enfamiliehuse og dobbelthuse må ikke opføres med mere end 2 etager.",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/08/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
    requirementKind: "machine_checkable",
    severity: "hard_stop",
    applicability: [
      {
        field: "projectScope",
        operator: "in",
        value: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
      },
    ],
    requiredEvidence: [],
    responsibleRole: "architect",
  },
  {
    id: "BR18-8.4.3-skelafstand",
    br18Version: "2024",
    chapter: "8",
    paragraph: "8.4.3",
    title: "Skelafstand — enfamiliehuse",
    description:
      "Bebyggelse skal holdes i mindst 2,5 m fra skel mod nabo og vej (BR18 default). Lokalplan kan fastsætte anden grænse.",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/08/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
    requirementKind: "machine_checkable",
    severity: "hard_stop",
    applicability: [
      {
        field: "projectScope",
        operator: "in",
        value: ["enfamiliehus", "tilbygning", "nedrivning_nybyg"],
      },
      { field: "skelafstandM", operator: "present", value: null },
    ],
    requiredEvidence: [
      { evidenceType: "drawing", description: "Situationsplan med skelafstandsmål" },
    ],
    responsibleRole: "architect",
  },
  // ── Kap 5: Brand ──────────────────────────────────────────────────────────
  {
    id: "BR18-5-brandreview",
    br18Version: "2024",
    chapter: "5",
    paragraph: null,
    title: "Branddokumentation",
    description:
      "Bygninger skal opfylde brandsikringskrav. Brandklasse og dokumentationskrav afhænger af anvendelseskategori, størrelse og kompleksitet. Kræver typisk certificeret brandrådgiver.",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/05/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg", "renovering"],
    requirementKind: "specialist_review",
    severity: "dispensation",
    applicability: [],
    requiredEvidence: [
      {
        evidenceType: "declaration",
        description: "Brandteknisk dokumentation eller erklæring fra certificeret brandrådgiver",
      },
    ],
    responsibleRole: "certified_fire_consultant",
  },
  // ── Kap 15: Konstruktioner ────────────────────────────────────────────────
  {
    id: "BR18-15-statik-review",
    br18Version: "2024",
    chapter: "15",
    paragraph: null,
    title: "Konstruktionsdokumentation",
    description:
      "Bærende konstruktioner skal dokumenteres. Konstruktionsklasse afhænger af byggeriets art og kompleksitet. Typisk kræves certificeret statiker.",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/15/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg", "renovering"],
    requirementKind: "specialist_review",
    severity: "dispensation",
    applicability: [],
    requiredEvidence: [
      {
        evidenceType: "calculation",
        description: "Statisk beregning og konstruktionsdokumentation",
      },
      {
        evidenceType: "declaration",
        description: "Erklæring fra certificeret statiker (konstruktionsklasse 2+)",
      },
    ],
    responsibleRole: "certified_static_engineer",
  },
  // ── Kap 11: Energi ────────────────────────────────────────────────────────
  {
    id: "BR18-11-energiramme",
    br18Version: "2024",
    chapter: "11",
    paragraph: null,
    title: "Energiramme",
    description:
      "Nyt byggeri og tilbygninger over 50 m² skal overholde energirammen (BE18). Kræver energiberegning.",
    sourceUrl: "https://www.bygningsreglementet.dk/tekniske-bestemmelser/11/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "nedrivning_nybyg"],
    requirementKind: "documentation",
    severity: "documentation",
    applicability: [
      { field: "projectScope", operator: "in", value: ["enfamiliehus", "nedrivning_nybyg"] },
    ],
    requiredEvidence: [
      { evidenceType: "calculation", description: "Energiberegning (BE18 eller tilsvarende)" },
    ],
    responsibleRole: "energy_consultant",
  },
  // ── LCA/klima ─────────────────────────────────────────────────────────────
  {
    id: "BR18-11-lca-klimakrav",
    br18Version: "2024",
    chapter: "11",
    paragraph: null,
    title: "LCA-klimakrav (CO₂-dokumentation)",
    description:
      "LCA-krav for bygninger fra 2023. Tærskel og omfang afhænger af bruttoetageareal og bygningstype. Ukendt/relevant for enfamiliehuse.",
    sourceUrl:
      "https://www.sbst.dk/byggeri/baeredygtigt-byggeri/national-strategi-for-baeredygtigt-byggeri/klimakrav-lca-i-bygningsreglementet",
    validFrom: "2023-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "nedrivning_nybyg"],
    requirementKind: "documentation",
    severity: "warning",
    applicability: [{ field: "bebyggetArealM2", operator: "present", value: null }],
    requiredEvidence: [
      { evidenceType: "calculation", description: "LCA-beregning (livscyklusvurdering)" },
    ],
    responsibleRole: "energy_consultant",
  },
  // ── D&V / Færdigmelding ───────────────────────────────────────────────────
  {
    id: "BR18-faerdigmelding-dv",
    br18Version: "2024",
    chapter: "1",
    paragraph: null,
    title: "D&V-dokumentation til færdigmelding",
    description:
      "Inden færdigmelding skal bygherren sikre drifts- og vedligeholdelsesdokumentation.",
    sourceUrl:
      "https://www.bygningsreglementet.dk/media/0o1nbejw/dokumentation-af-bygningsreglementets-tekniske-bestemmelser-i-forbindelse-med-faerdigmelding-af-byggeriet-2025.pdf",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg", "renovering"],
    requirementKind: "documentation",
    severity: "documentation",
    applicability: [],
    requiredEvidence: [
      {
        evidenceType: "declaration",
        description: "D&V-manual til ejendommens drift og vedligehold",
      },
    ],
    responsibleRole: "owner",
  },
  // ── Myndighed / Dispensation ──────────────────────────────────────────────
  {
    id: "BR18-dispensation-lokalplan",
    br18Version: "2024",
    chapter: "1",
    paragraph: null,
    title: "Dispensation fra lokalplan eller BR18",
    description:
      "Overskrides lokalplan- eller BR18-grænser kræves dispensation fra kommunen. Afhænger af konkret projekt og kommunal praksis.",
    sourceUrl: "https://www.bygningsreglementet.dk/administrative-bestemmelser/krav/",
    validFrom: "2018-01-01",
    validTo: null,
    projectScopes: ["enfamiliehus", "tilbygning", "nedrivning_nybyg", "renovering"],
    requirementKind: "authority_discretion",
    severity: "dispensation",
    applicability: [],
    requiredEvidence: [
      { evidenceType: "authority_response", description: "Kommunal dispensationsafgørelse" },
    ],
    responsibleRole: "municipality",
  },
];
```

- [ ] **Step 2.2: Verificer TypeScript**

```bash
bunx tsc --noEmit
```

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/br18/fixtures/
git commit -m "feat(br18): tilfoej P0 kravkatalog-fixture (BR18 2024)"
```

---

### Task 3: Catalog loader

**Filer:**

- Create: `src/lib/br18/requirements/catalog.ts`
- Create: `src/lib/br18/requirements/catalog.test.ts`

- [ ] **Step 3.1: Skriv failing test**

Opret `src/lib/br18/requirements/catalog.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { loadBr18Catalog, getCatalogVersions } from "./catalog";

describe("loadBr18Catalog", () => {
  it("returnerer ikke-tom array af validerede krav", () => {
    const catalog = loadBr18Catalog("2024");
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("kaster ved ukendt version", () => {
    expect(() => loadBr18Catalog("1990")).toThrow(/Unknown BR18 version/);
  });

  it("alle krav har sourceUrl der starter med https://", () => {
    const catalog = loadBr18Catalog("2024");
    for (const req of catalog) {
      expect(req.sourceUrl).toStartWith("https://");
    }
  });

  it("alle krav har unik id", () => {
    const catalog = loadBr18Catalog("2024");
    const ids = catalog.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("getCatalogVersions", () => {
  it("returnerer mindst version 2024", () => {
    expect(getCatalogVersions()).toContain("2024");
  });
});
```

- [ ] **Step 3.2: Kør og verificer FAIL**

```bash
bun test src/lib/br18/requirements/catalog.test.ts
```

Forventet: FAIL — "Cannot find module './catalog'"

- [ ] **Step 3.3: Implementer `src/lib/br18/requirements/catalog.ts`**

```typescript
import { br18RequirementCatalogSchema } from "../schemas";
import { br18_2024_catalog } from "../fixtures/br18-2024-catalog";
import type { Br18Requirement } from "../types";

const CATALOGS: Record<string, Br18Requirement[]> = {
  "2024": br18_2024_catalog,
};

export function loadBr18Catalog(version: string): Br18Requirement[] {
  const raw = CATALOGS[version];
  if (!raw) throw new Error(`Unknown BR18 version: ${version}`);
  return br18RequirementCatalogSchema.parse(raw);
}

export function getCatalogVersions(): string[] {
  return Object.keys(CATALOGS);
}
```

- [ ] **Step 3.4: Kør og verificer PASS**

```bash
bun test src/lib/br18/requirements/catalog.test.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/br18/requirements/
git commit -m "feat(br18): tilfoej catalog loader med version-validering"
```

---

### Task 4: Applicability Engine

**Filer:**

- Create: `src/lib/br18/applicability/engine.ts`
- Create: `src/lib/br18/applicability/engine.test.ts`

- [ ] **Step 4.1: Skriv failing tests**

Opret `src/lib/br18/applicability/engine.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { evaluateApplicability } from "./engine";
import type { Br18Requirement, Br18ProjectFacts } from "../types";

const baseReq: Br18Requirement = {
  id: "test-req",
  br18Version: "2024",
  chapter: "8",
  paragraph: "8.3.1",
  title: "Test",
  description: "Test",
  sourceUrl: "https://www.bygningsreglementet.dk/",
  validFrom: "2018-01-01",
  validTo: null,
  projectScopes: ["enfamiliehus"],
  requirementKind: "machine_checkable",
  severity: "hard_stop",
  applicability: [{ field: "projectScope", operator: "in", value: ["enfamiliehus"] }],
  requiredEvidence: [],
  responsibleRole: "architect",
};

const baseFacts: Br18ProjectFacts = {
  projectScope: "enfamiliehus",
  bebyggetArealM2: 60,
  grundarealM2: 300,
  antalEtager: 1,
  bygningshojdeM: 5.0,
  skelafstandM: 3.5,
  anvendelseskategori: null,
  br18Version: "2024",
  municipality: "0101",
};

describe("evaluateApplicability", () => {
  it("relevant når conditions matcher", () => {
    expect(evaluateApplicability(baseReq, baseFacts).status).toBe("relevant");
  });

  it("not_relevant når projectScope ikke matcher", () => {
    const req = { ...baseReq, projectScopes: ["tilbygning"] as const };
    expect(evaluateApplicability(req as Br18Requirement, baseFacts).status).toBe("not_relevant");
  });

  it("unknown_missing_data når required field er null", () => {
    const req: Br18Requirement = {
      ...baseReq,
      applicability: [{ field: "grundarealM2", operator: "present", value: null }],
    };
    const facts: Br18ProjectFacts = { ...baseFacts, grundarealM2: null };
    const result = evaluateApplicability(req, facts);
    expect(result.status).toBe("unknown_missing_data");
    expect(result.missingInputs).toContain("grundarealM2");
  });

  it("requires_specialist_review for specialist_review krav", () => {
    const req: Br18Requirement = {
      ...baseReq,
      requirementKind: "specialist_review",
      applicability: [],
    };
    expect(evaluateApplicability(req, baseFacts).status).toBe("requires_specialist_review");
  });

  it("requires_authority_decision for authority_discretion krav", () => {
    const req: Br18Requirement = {
      ...baseReq,
      requirementKind: "authority_discretion",
      applicability: [],
    };
    expect(evaluateApplicability(req, baseFacts).status).toBe("requires_authority_decision");
  });
});
```

- [ ] **Step 4.2: Kør og verificer FAIL**

```bash
bun test src/lib/br18/applicability/engine.test.ts
```

- [ ] **Step 4.3: Implementer `src/lib/br18/applicability/engine.ts`**

```typescript
import type {
  Br18Requirement,
  Br18ApplicabilityResult,
  Br18ProjectFacts,
  ApplicabilityCondition,
} from "../types";

function checkCondition(
  condition: ApplicabilityCondition,
  facts: Br18ProjectFacts,
): { passes: boolean; missingInput: string | null } {
  const value = facts[condition.field as keyof Br18ProjectFacts];

  if (condition.operator === "present") {
    return value == null
      ? { passes: false, missingInput: condition.field }
      : { passes: true, missingInput: null };
  }
  if (value == null) {
    return { passes: false, missingInput: condition.field };
  }

  switch (condition.operator) {
    case "eq":
      return { passes: value === condition.value, missingInput: null };
    case "gt":
      return { passes: (value as number) > (condition.value as number), missingInput: null };
    case "lt":
      return { passes: (value as number) < (condition.value as number), missingInput: null };
    case "gte":
      return { passes: (value as number) >= (condition.value as number), missingInput: null };
    case "lte":
      return { passes: (value as number) <= (condition.value as number), missingInput: null };
    case "in":
      return { passes: (condition.value as unknown[]).includes(value), missingInput: null };
    default:
      return { passes: false, missingInput: null };
  }
}

export function evaluateApplicability(
  requirement: Br18Requirement,
  facts: Br18ProjectFacts,
): Br18ApplicabilityResult {
  if (!requirement.projectScopes.includes(facts.projectScope)) {
    return {
      requirementId: requirement.id,
      status: "not_relevant",
      reasons: [`Gælder ikke for ${facts.projectScope}`],
      missingInputs: [],
      sourceFacts: [],
    };
  }

  if (requirement.requirementKind === "specialist_review") {
    return {
      requirementId: requirement.id,
      status: "requires_specialist_review",
      reasons: ["Kræver faglig review"],
      missingInputs: [],
      sourceFacts: [],
    };
  }
  if (requirement.requirementKind === "authority_discretion") {
    return {
      requirementId: requirement.id,
      status: "requires_authority_decision",
      reasons: ["Afgøres af myndighed"],
      missingInputs: [],
      sourceFacts: [],
    };
  }

  const missingInputs: string[] = [];
  const failedConditions: string[] = [];

  for (const condition of requirement.applicability) {
    const { passes, missingInput } = checkCondition(condition, facts);
    if (missingInput) missingInputs.push(missingInput);
    else if (!passes)
      failedConditions.push(`${condition.field} ${condition.operator} ikke opfyldt`);
  }

  if (missingInputs.length > 0) {
    return {
      requirementId: requirement.id,
      status: "unknown_missing_data",
      reasons: ["Manglende data"],
      missingInputs,
      sourceFacts: [],
    };
  }
  if (failedConditions.length > 0) {
    return {
      requirementId: requirement.id,
      status: "not_relevant",
      reasons: failedConditions,
      missingInputs: [],
      sourceFacts: [],
    };
  }

  return {
    requirementId: requirement.id,
    status: "relevant",
    reasons: ["Krav er relevant"],
    missingInputs: [],
    sourceFacts: [],
  };
}

export function evaluateAllRequirements(
  requirements: Br18Requirement[],
  facts: Br18ProjectFacts,
): Br18ApplicabilityResult[] {
  return requirements.map((req) => evaluateApplicability(req, facts));
}
```

- [ ] **Step 4.4: Kør og verificer PASS**

```bash
bun test src/lib/br18/applicability/engine.test.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/br18/applicability/engine.ts src/lib/br18/applicability/engine.test.ts
git commit -m "feat(br18): tilfoej applicability engine"
```

---

### Task 5: Rule Engine Bridge

Mapper eksisterende `RuleEngineResult`-violations til `Br18ApplicabilityResult` for machine-checkable krav.  
`RuleViolation` fra `src/lib/rule-engine/types.ts` har: `rule: string`, `severity: "illegal" | "dispensation_required" | "warning"`, `reason: string`.

**Filer:**

- Create: `src/lib/br18/applicability/rule-engine-bridge.ts`
- Create: `src/lib/br18/applicability/rule-engine-bridge.test.ts`

- [ ] **Step 5.1: Skriv failing test**

Opret `src/lib/br18/applicability/rule-engine-bridge.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { mapRuleEngineViolationsToBr18 } from "./rule-engine-bridge";
import type { RuleViolation } from "@/lib/rule-engine/types";

const bebyggelseViolation: RuleViolation = {
  rule: "buildingPercent",
  severity: "illegal",
  reason: "Bebyggelsesprocent 35% overstiger 30%",
};

describe("mapRuleEngineViolationsToBr18", () => {
  it("mapper buildingPercent violation til BR18-8.3.1", () => {
    const results = mapRuleEngineViolationsToBr18([bebyggelseViolation]);
    const r = results.find((r) => r.requirementId === "BR18-8.3.1-bebyggelsesprocent");
    expect(r).toBeDefined();
    expect(r?.status).toBe("relevant");
    expect(r?.reasons[0]).toContain("35%");
  });

  it("returnerer tom array ved ingen violations", () => {
    expect(mapRuleEngineViolationsToBr18([])).toHaveLength(0);
  });
});
```

- [ ] **Step 5.2: Kør og verificer FAIL**

```bash
bun test src/lib/br18/applicability/rule-engine-bridge.test.ts
```

- [ ] **Step 5.3: Implementer `src/lib/br18/applicability/rule-engine-bridge.ts`**

```typescript
import type { RuleViolation } from "@/lib/rule-engine/types";
import type { Br18ApplicabilityResult } from "../types";

// Mapning fra regelmotor-rule-id til BR18-krav-id
const RULE_TO_BR18_ID: Record<string, string> = {
  buildingPercent: "BR18-8.3.1-bebyggelsesprocent",
  height: "BR18-8.4.1-bygningshoejde",
  storeys: "BR18-8.4.2-etager",
  setback: "BR18-8.4.3-skelafstand",
};

export function mapRuleEngineViolationsToBr18(
  violations: RuleViolation[],
): Br18ApplicabilityResult[] {
  const results: Br18ApplicabilityResult[] = [];

  for (const violation of violations) {
    const requirementId = RULE_TO_BR18_ID[violation.rule];
    if (!requirementId) continue;

    results.push({
      requirementId,
      status: "relevant",
      reasons: [violation.reason],
      missingInputs: [],
      sourceFacts: [],
    });
  }

  return results;
}
```

> **OBS:** `violation.rule` indeholder den nøgle som `calculations.ts` og `plandata-rules.ts` bruger. Tjek at `"buildingPercent"`, `"height"`, `"storeys"`, `"setback"` matcher de faktiske rule-nøgler ved at køre `grep -r 'rule:' src/lib/rule-engine/rules/` og tilpas mapningen.

- [ ] **Step 5.4: Kør og verificer PASS**

```bash
bun test src/lib/br18/applicability/rule-engine-bridge.test.ts
```

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/br18/applicability/rule-engine-bridge.ts src/lib/br18/applicability/rule-engine-bridge.test.ts
git commit -m "feat(br18): tilfoej rule-engine bridge der mapper violations til BR18-krav"
```

---

### Task 6: Evidence Ledger helpers

**Filer:**

- Create: `src/lib/br18/evidence/ledger.ts`
- Create: `src/lib/br18/evidence/ledger.test.ts`

- [ ] **Step 6.1: Skriv failing tests**

Opret `src/lib/br18/evidence/ledger.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { deriveRequirementReadiness, getMissingEvidence, derivePackageReadiness } from "./ledger";
import type { EvidenceItem, Br18ApplicabilityResult } from "../types";

const makeEvidence = (reqId: string, status: EvidenceItem["status"]): EvidenceItem => ({
  id: `ev-${reqId}`,
  projectId: "p1",
  requirementId: reqId,
  evidenceType: "drawing",
  status,
  source: "user_upload",
  fileId: null,
  structuredPayload: null,
  validationNotes: [],
  reviewedByRole: null,
  reviewedAt: null,
});

const makeResult = (
  reqId: string,
  status: Br18ApplicabilityResult["status"],
): Br18ApplicabilityResult => ({
  requirementId: reqId,
  status,
  reasons: [],
  missingInputs: [],
  sourceFacts: [],
});

describe("deriveRequirementReadiness", () => {
  it("missing når ingen evidens", () => {
    expect(deriveRequirementReadiness([], "req-1")).toBe("missing");
  });
  it("validated ved validated evidens", () => {
    expect(deriveRequirementReadiness([makeEvidence("req-1", "validated")], "req-1")).toBe(
      "validated",
    );
  });
  it("rejected ved rejected evidens", () => {
    expect(deriveRequirementReadiness([makeEvidence("req-1", "rejected")], "req-1")).toBe(
      "rejected",
    );
  });
});

describe("getMissingEvidence", () => {
  it("returnerer krav-ids med manglende evidens", () => {
    const applicability = [makeResult("req-1", "relevant"), makeResult("req-2", "relevant")];
    const evidence = [makeEvidence("req-1", "validated")];
    const missing = getMissingEvidence(applicability, evidence);
    expect(missing).toContain("req-2");
    expect(missing).not.toContain("req-1");
  });
});

describe("derivePackageReadiness", () => {
  it("preliminary ved ingen relevante krav", () => {
    expect(derivePackageReadiness([], [])).toBe("preliminary");
  });
  it("missing_critical_documentation ved manglende evidens", () => {
    const applicability = [makeResult("req-1", "relevant")];
    expect(derivePackageReadiness(applicability, [])).toBe("missing_critical_documentation");
  });
  it("ready_for_advisor_review når alt er validated", () => {
    const applicability = [makeResult("req-1", "relevant")];
    const evidence = [makeEvidence("req-1", "validated")];
    expect(derivePackageReadiness(applicability, evidence)).toBe("ready_for_advisor_review");
  });
});
```

- [ ] **Step 6.2: Kør og verificer FAIL**

```bash
bun test src/lib/br18/evidence/ledger.test.ts
```

- [ ] **Step 6.3: Implementer `src/lib/br18/evidence/ledger.ts`**

```typescript
import type {
  EvidenceItem,
  EvidenceStatus,
  Br18ApplicabilityResult,
  AuthorityReadinessStatus,
} from "../types";

export function deriveRequirementReadiness(
  items: EvidenceItem[],
  requirementId: string,
): EvidenceStatus {
  const relevant = items.filter((e) => e.requirementId === requirementId);
  if (relevant.length === 0) return "missing";
  if (relevant.some((e) => e.status === "rejected")) return "rejected";
  if (relevant.some((e) => e.status === "validated")) return "validated";
  if (relevant.some((e) => e.status === "uploaded")) return "uploaded";
  if (relevant.some((e) => e.status === "draft")) return "draft";
  return "missing";
}

export function getMissingEvidence(
  applicabilityResults: Br18ApplicabilityResult[],
  evidenceItems: EvidenceItem[],
): string[] {
  return applicabilityResults
    .filter((r) => r.status === "relevant")
    .filter((r) => deriveRequirementReadiness(evidenceItems, r.requirementId) === "missing")
    .map((r) => r.requirementId);
}

export function derivePackageReadiness(
  applicabilityResults: Br18ApplicabilityResult[],
  evidenceItems: EvidenceItem[],
): AuthorityReadinessStatus {
  const relevant = applicabilityResults.filter((r) => r.status === "relevant");
  if (relevant.length === 0) return "preliminary";

  if (getMissingEvidence(applicabilityResults, evidenceItems).length > 0) {
    return "missing_critical_documentation";
  }
  if (evidenceItems.some((e) => e.status === "rejected")) {
    return "missing_critical_documentation";
  }

  const allValidated = relevant.every(
    (r) => deriveRequirementReadiness(evidenceItems, r.requirementId) === "validated",
  );
  return allValidated ? "ready_for_advisor_review" : "preliminary";
}
```

- [ ] **Step 6.4: Kør og verificer PASS**

```bash
bun test src/lib/br18/evidence/ledger.test.ts
```

- [ ] **Step 6.5: Kør alle BR18 domain tests**

```bash
bun test src/lib/br18/
```

Forventet: Alle PASS

- [ ] **Step 6.6: Commit**

```bash
git add src/lib/br18/evidence/
git commit -m "feat(br18): tilfoej evidence ledger helpers"
```

---

### Task 7: Authority Package manifest builder

**Filer:**

- Create: `src/lib/br18/authority/manifest.ts`
- Create: `src/lib/br18/authority/manifest.test.ts`

- [ ] **Step 7.1: Skriv failing tests**

Opret `src/lib/br18/authority/manifest.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { buildAuthorityPackageManifest } from "./manifest";
import type { Br18ApplicabilityResult, EvidenceItem } from "../types";

describe("buildAuthorityPackageManifest", () => {
  it("preliminary med manglende evidens", () => {
    const applicability: Br18ApplicabilityResult[] = [
      {
        requirementId: "req-1",
        status: "relevant",
        reasons: [],
        missingInputs: [],
        sourceFacts: [],
      },
    ];
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", applicability, []);
    expect(manifest.readinessStatus).toBe("missing_critical_documentation");
    expect(manifest.missingItems).toContain("req-1");
  });

  it("ready_for_advisor_review ved validated evidens", () => {
    const applicability: Br18ApplicabilityResult[] = [
      {
        requirementId: "req-1",
        status: "relevant",
        reasons: [],
        missingInputs: [],
        sourceFacts: [],
      },
    ];
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        projectId: "proj-1",
        requirementId: "req-1",
        evidenceType: "drawing",
        status: "validated",
        source: "user_upload",
        fileId: null,
        structuredPayload: null,
        validationNotes: [],
        reviewedByRole: null,
        reviewedAt: null,
      },
    ];
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", applicability, evidence);
    expect(manifest.readinessStatus).toBe("ready_for_advisor_review");
    expect(manifest.missingItems).toHaveLength(0);
  });

  it("unknownItems indeholder unknown_missing_data krav", () => {
    const applicability: Br18ApplicabilityResult[] = [
      {
        requirementId: "req-unknown",
        status: "unknown_missing_data",
        reasons: [],
        missingInputs: ["grundarealM2"],
        sourceFacts: [],
      },
    ];
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", applicability, []);
    expect(manifest.unknownItems).toContain("req-unknown");
  });
});
```

- [ ] **Step 7.2: Kør og verificer FAIL**

```bash
bun test src/lib/br18/authority/manifest.test.ts
```

- [ ] **Step 7.3: Implementer `src/lib/br18/authority/manifest.ts`**

```typescript
import { derivePackageReadiness, getMissingEvidence } from "../evidence/ledger";
import type { AuthorityPackageManifest, Br18ApplicabilityResult, EvidenceItem } from "../types";

export function buildAuthorityPackageManifest(
  projectId: string,
  br18Version: string,
  applicabilityResults: Br18ApplicabilityResult[],
  evidenceItems: EvidenceItem[],
): AuthorityPackageManifest {
  return {
    projectId,
    br18Version,
    generatedAt: new Date().toISOString(),
    readinessStatus: derivePackageReadiness(applicabilityResults, evidenceItems),
    requirements: applicabilityResults,
    evidenceItems,
    missingItems: getMissingEvidence(applicabilityResults, evidenceItems),
    unknownItems: applicabilityResults
      .filter((r) => r.status === "unknown_missing_data")
      .map((r) => r.requirementId),
  };
}
```

- [ ] **Step 7.4: Kør og verificer PASS**

```bash
bun test src/lib/br18/authority/manifest.test.ts
bun test src/lib/br18/
```

- [ ] **Step 7.5: Commit**

```bash
git add src/lib/br18/authority/
git commit -m "feat(br18): tilfoej authority package manifest builder"
```

---

## Phase 2: Supabase Layer

### Task 8: Database migrations

**Filer:**

- Create: `supabase/migrations/[TIMESTAMP]_br18_tables.sql`
- Create: `supabase/migrations/[TIMESTAMP+1]_br18_columns.sql`

- [ ] **Step 8.1: Find eksisterende migrations timestamp-format**

```bash
ls supabase/migrations/ | tail -3
```

Brug samme timestamp-format som eksisterende filer.

- [ ] **Step 8.2: Opret `[TIMESTAMP]_br18_tables.sql`**

```sql
create table if not exists project_br18_applicability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  requirement_id text not null,
  br18_version text not null default '2024',
  status text not null check (status in (
    'relevant','not_relevant','unknown_missing_data',
    'requires_specialist_review','requires_authority_decision'
  )),
  reasons text[] not null default '{}',
  missing_inputs text[] not null default '{}',
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, requirement_id, br18_version)
);

create table if not exists project_br18_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  requirement_id text not null,
  evidence_type text not null check (evidence_type in (
    'register_data','drawing','calculation','declaration',
    'product_documentation','photo','manual_upload','advisor_note','authority_response'
  )),
  status text not null check (status in ('missing','draft','uploaded','validated','rejected')) default 'missing',
  source text not null check (source in ('datafordeler','plandata','user_upload','advisor','ai_extract','manual')),
  file_id uuid null,
  structured_payload jsonb null,
  validation_notes text[] not null default '{}',
  reviewed_by_role text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_br18_applicability_project_id on project_br18_applicability(project_id);
create index if not exists idx_br18_evidence_project_id on project_br18_evidence(project_id);
```

- [ ] **Step 8.3: Opret `[TIMESTAMP+1]_br18_columns.sql`**

```sql
alter table projects
  add column if not exists br18_version text not null default '2024',
  add column if not exists authority_readiness_status text
    check (authority_readiness_status in (
      'preliminary','ready_for_advisor_review',
      'ready_for_authority_review','missing_critical_documentation'
    )) default 'preliminary';

alter table site_constraints
  add column if not exists lca_required boolean,
  add column if not exists energy_frame_required boolean,
  add column if not exists fire_review_required boolean,
  add column if not exists static_review_required boolean;
```

- [ ] **Step 8.4: Commit migrations**

```bash
git add supabase/migrations/
git commit -m "feat(br18): tilfoej database migrations for BR18 tabeller og kolonner"
```

---

### Task 9: BR18 Applicability Repository

**Filer:**

- Create: `src/integrations/supabase/repositories/br18-applicability.repository.ts`
- Create: `src/integrations/supabase/repositories/br18-applicability.repository.test.ts`

- [ ] **Step 9.1: Skriv test (LIVE-guard pattern fra eksisterende repos)**

Opret `src/integrations/supabase/repositories/br18-applicability.repository.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  upsertApplicabilityResult,
  getApplicabilityForProject,
} from "./br18-applicability.repository";

const LIVE = process.env.RUN_LIVE_SUPABASE_TESTS === "true";

if (!LIVE) {
  describe("br18-applicability.repository (type-check)", () => {
    it("eksporterer forventede funktioner", () => {
      expect(typeof upsertApplicabilityResult).toBe("function");
      expect(typeof getApplicabilityForProject).toBe("function");
    });
  });
}
```

- [ ] **Step 9.2: Implementer `src/integrations/supabase/repositories/br18-applicability.repository.ts`**

```typescript
import { createClient } from "../client.server";
import { br18ApplicabilityResultSchema } from "@/lib/br18/schemas";
import type { Br18ApplicabilityResult } from "@/lib/br18/types";

export async function upsertApplicabilityResult(
  projectId: string,
  result: Br18ApplicabilityResult,
  br18Version: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_br18_applicability").upsert(
    {
      project_id: projectId,
      requirement_id: result.requirementId,
      br18_version: br18Version,
      status: result.status,
      reasons: result.reasons,
      missing_inputs: result.missingInputs,
      evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,requirement_id,br18_version" },
  );
  if (error) throw new Error(`br18-applicability upsert: ${error.message}`);
}

export async function getApplicabilityForProject(
  projectId: string,
): Promise<Br18ApplicabilityResult[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_br18_applicability")
    .select("*")
    .eq("project_id", projectId);

  if (error) throw new Error(`br18-applicability read: ${error.message}`);
  return (data ?? []).map((row) =>
    br18ApplicabilityResultSchema.parse({
      requirementId: row.requirement_id,
      status: row.status,
      reasons: row.reasons,
      missingInputs: row.missing_inputs,
      sourceFacts: [],
    }),
  );
}
```

- [ ] **Step 9.3: Verificer TypeScript og tests**

```bash
bunx tsc --noEmit
bun test src/integrations/supabase/repositories/br18-applicability.repository.test.ts
```

- [ ] **Step 9.4: Commit**

```bash
git add src/integrations/supabase/repositories/br18-applicability.repository.ts \
        src/integrations/supabase/repositories/br18-applicability.repository.test.ts
git commit -m "feat(br18): tilfoej BR18 applicability repository"
```

---

### Task 10: BR18 Evidence Repository

**Filer:**

- Create: `src/integrations/supabase/repositories/br18-evidence.repository.ts`
- Create: `src/integrations/supabase/repositories/br18-evidence.repository.test.ts`

- [ ] **Step 10.1: Skriv test**

Opret `src/integrations/supabase/repositories/br18-evidence.repository.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  upsertEvidenceItem,
  getEvidenceForProject,
  updateEvidenceStatus,
} from "./br18-evidence.repository";

describe("br18-evidence.repository (type-check)", () => {
  it("eksporterer forventede funktioner", () => {
    expect(typeof upsertEvidenceItem).toBe("function");
    expect(typeof getEvidenceForProject).toBe("function");
    expect(typeof updateEvidenceStatus).toBe("function");
  });
});
```

- [ ] **Step 10.2: Implementer `src/integrations/supabase/repositories/br18-evidence.repository.ts`**

```typescript
import { createClient } from "../client.server";
import { evidenceItemSchema } from "@/lib/br18/schemas";
import type { EvidenceItem, EvidenceStatus } from "@/lib/br18/types";

export async function upsertEvidenceItem(item: EvidenceItem): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_br18_evidence").upsert(
    {
      id: item.id,
      project_id: item.projectId,
      requirement_id: item.requirementId,
      evidence_type: item.evidenceType,
      status: item.status,
      source: item.source,
      file_id: item.fileId,
      structured_payload: item.structuredPayload,
      validation_notes: item.validationNotes,
      reviewed_by_role: item.reviewedByRole,
      reviewed_at: item.reviewedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`br18-evidence upsert: ${error.message}`);
}

export async function getEvidenceForProject(projectId: string): Promise<EvidenceItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_br18_evidence")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw new Error(`br18-evidence read: ${error.message}`);
  return (data ?? []).map((row) =>
    evidenceItemSchema.parse({
      id: row.id,
      projectId: row.project_id,
      requirementId: row.requirement_id,
      evidenceType: row.evidence_type,
      status: row.status,
      source: row.source,
      fileId: row.file_id,
      structuredPayload: row.structured_payload,
      validationNotes: row.validation_notes,
      reviewedByRole: row.reviewed_by_role,
      reviewedAt: row.reviewed_at,
    }),
  );
}

export async function updateEvidenceStatus(
  evidenceId: string,
  status: EvidenceStatus,
  validationNotes: string[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("project_br18_evidence")
    .update({ status, validation_notes: validationNotes, updated_at: new Date().toISOString() })
    .eq("id", evidenceId);
  if (error) throw new Error(`br18-evidence status update: ${error.message}`);
}
```

- [ ] **Step 10.3: Verificer og commit**

```bash
bunx tsc --noEmit
bun test src/integrations/supabase/repositories/br18-evidence.repository.test.ts
git add src/integrations/supabase/repositories/br18-evidence.repository.ts \
        src/integrations/supabase/repositories/br18-evidence.repository.test.ts
git commit -m "feat(br18): tilfoej BR18 evidence repository"
```

---

## Phase 3: Service Layer

### Task 11: br18-compliance.service.server.ts

> Tjek om `src/lib/services/` eksisterer: `ls src/lib/services/`. Opret mappen hvis den ikke er der.

**Filer:**

- Create: `src/lib/services/br18-compliance.service.server.ts`
- Create: `src/lib/services/br18-compliance.service.test.ts`

- [ ] **Step 11.1: Skriv failing test**

Opret `src/lib/services/br18-compliance.service.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { runBr18Compliance } from "./br18-compliance.service.server";
import type { Br18ApplicabilityResult } from "@/lib/br18/types";

const fakeDeps = {
  upsertApplicabilityResult: async () => {},
  getApplicabilityForProject: async (): Promise<Br18ApplicabilityResult[]> => [],
  updateProjectHardStop: async () => {},
  updateAuthorityReadiness: async () => {},
};

describe("runBr18Compliance", () => {
  it("returnerer applicability-resultater for enfamiliehus med fulde data", async () => {
    const result = await runBr18Compliance(
      "proj-1",
      {
        projectScope: "enfamiliehus",
        bebyggetArealM2: 60,
        grundarealM2: 300,
        antalEtager: 1,
        bygningshojdeM: 5.0,
        skelafstandM: 3.5,
        anvendelseskategori: null,
        br18Version: "2024",
        municipality: "0101",
      },
      fakeDeps,
    );
    expect(result.applicabilityResults.length).toBeGreaterThan(0);
    expect(result.hardStopTriggered).toBe(false);
  });

  it("sætter hardStopTriggered når tilbygning har wrong scope krav", async () => {
    // Tilbygning matcher ikke krav der kun gælder enfamiliehus → not_relevant
    const result = await runBr18Compliance(
      "proj-1",
      {
        projectScope: "tilbygning",
        bebyggetArealM2: null,
        grundarealM2: null,
        antalEtager: null,
        bygningshojdeM: null,
        skelafstandM: null,
        anvendelseskategori: null,
        br18Version: "2024",
        municipality: "0101",
      },
      fakeDeps,
    );
    const unknown = result.applicabilityResults.filter((r) => r.status === "unknown_missing_data");
    // Krav med `present`-condition og null facts → unknown_missing_data
    expect(unknown.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 11.2: Kør og verificer FAIL**

```bash
bun test src/lib/services/br18-compliance.service.test.ts
```

- [ ] **Step 11.3: Implementer `src/lib/services/br18-compliance.service.server.ts`**

```typescript
import { loadBr18Catalog } from "@/lib/br18/requirements/catalog";
import { evaluateAllRequirements } from "@/lib/br18/applicability/engine";
import { derivePackageReadiness } from "@/lib/br18/evidence/ledger";
import type {
  Br18ProjectFacts,
  Br18ApplicabilityResult,
  EvidenceItem,
  AuthorityReadinessStatus,
} from "@/lib/br18/types";

export type Br18ComplianceDeps = {
  upsertApplicabilityResult: (
    projectId: string,
    result: Br18ApplicabilityResult,
    br18Version: string,
  ) => Promise<void>;
  getApplicabilityForProject: (projectId: string) => Promise<Br18ApplicabilityResult[]>;
  updateProjectHardStop?: (
    projectId: string,
    hardStop: boolean,
    reason: string | null,
  ) => Promise<void>;
  updateAuthorityReadiness?: (projectId: string, status: AuthorityReadinessStatus) => Promise<void>;
};

export type Br18ComplianceResult = {
  applicabilityResults: Br18ApplicabilityResult[];
  hardStopTriggered: boolean;
  hardStopReason: string | null;
  authorityReadiness: AuthorityReadinessStatus;
};

export async function runBr18Compliance(
  projectId: string,
  facts: Br18ProjectFacts,
  deps: Br18ComplianceDeps,
  evidenceItems: EvidenceItem[] = [],
): Promise<Br18ComplianceResult> {
  const catalog = loadBr18Catalog(facts.br18Version);
  const applicabilityResults = evaluateAllRequirements(catalog, facts);

  await Promise.all(
    applicabilityResults.map((r) =>
      deps.upsertApplicabilityResult(projectId, r, facts.br18Version),
    ),
  );

  const missingCritical = applicabilityResults.some(
    (r) => r.status === "unknown_missing_data" && r.missingInputs.length > 0,
  );
  const hardStopTriggered = missingCritical;
  const hardStopReason = missingCritical
    ? "Manglende data til BR18-vurdering: " +
      applicabilityResults
        .filter((r) => r.status === "unknown_missing_data")
        .flatMap((r) => r.missingInputs)
        .join(", ")
    : null;

  const authorityReadiness = derivePackageReadiness(applicabilityResults, evidenceItems);

  if (deps.updateProjectHardStop) {
    await deps.updateProjectHardStop(projectId, hardStopTriggered, hardStopReason);
  }
  if (deps.updateAuthorityReadiness) {
    await deps.updateAuthorityReadiness(projectId, authorityReadiness);
  }

  return { applicabilityResults, hardStopTriggered, hardStopReason, authorityReadiness };
}
```

- [ ] **Step 11.4: Kør og verificer PASS**

```bash
bun test src/lib/services/br18-compliance.service.test.ts
```

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/services/
git commit -m "feat(br18): tilfoej BR18 compliance service med injected deps"
```

---

## Phase 4: Server Functions

### Task 12: Server functions (get + update)

> Tjek eksisterende server function-mønster: `grep -r "createServerFn" src/ --include="*.ts" -l | head -5`. Matc filplacering og import-sti til eksisterende konvention.

**Filer:**

- Create: `src/server-functions/get-br18-compliance.ts` _(tilpas sti til eksisterende konvention)_
- Create: `src/server-functions/update-br18-evidence.ts`

- [ ] **Step 12.1: Implementer `get-br18-compliance.ts`**

```typescript
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { withAuth } from "@/integrations/supabase/auth-middleware";
import { br18ProjectFactsSchema } from "@/lib/br18/schemas";

const inputSchema = z.object({
  projectId: z.string().uuid(),
  facts: br18ProjectFactsSchema,
});

export const getBr18Compliance = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    return withAuth(async () => {
      const { runBr18Compliance } = await import("@/lib/services/br18-compliance.service.server");
      const { upsertApplicabilityResult, getApplicabilityForProject } =
        await import("@/integrations/supabase/repositories/br18-applicability.repository");
      const { getEvidenceForProject } =
        await import("@/integrations/supabase/repositories/br18-evidence.repository");

      const evidenceItems = await getEvidenceForProject(data.projectId);
      return runBr18Compliance(
        data.projectId,
        data.facts,
        {
          upsertApplicabilityResult,
          getApplicabilityForProject,
        },
        evidenceItems,
      );
    });
  });
```

> **OBS:** Tjek signaturen på `withAuth()` i `src/integrations/supabase/auth-middleware.ts`. Tilpas kaldet hvis den bruger en anden konvention (f.eks. returnerer `userId` eller tager en `request`-parameter).

- [ ] **Step 12.2: Implementer `update-br18-evidence.ts`**

```typescript
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { withAuth } from "@/integrations/supabase/auth-middleware";
import { evidenceStatusSchema } from "@/lib/br18/schemas";

const inputSchema = z.object({
  evidenceId: z.string().uuid(),
  status: evidenceStatusSchema,
  validationNotes: z.array(z.string()).default([]),
});

export const updateBr18Evidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    return withAuth(async () => {
      const { updateEvidenceStatus } =
        await import("@/integrations/supabase/repositories/br18-evidence.repository");
      await updateEvidenceStatus(data.evidenceId, data.status, data.validationNotes);
      return { success: true };
    });
  });
```

- [ ] **Step 12.3: Verificer TypeScript**

```bash
bunx tsc --noEmit
```

- [ ] **Step 12.4: Commit**

```bash
git add src/server-functions/get-br18-compliance.ts src/server-functions/update-br18-evidence.ts
git commit -m "feat(br18): tilfoej server functions for BR18 compliance og evidence"
```

---

## Phase 5: Cockpit Read Model (UI)

### Task 13: Hook og komponent

**Filer:**

- Create: `src/hooks/use-project-br18-compliance.ts`
- Create: `src/components/br18/Br18KravMatrix.tsx`

- [ ] **Step 13.1: Implementer `src/hooks/use-project-br18-compliance.ts`**

```typescript
import { useCallback, useState } from "react";
import { getBr18Compliance } from "@/server-functions/get-br18-compliance";
import type { Br18ComplianceResult } from "@/lib/services/br18-compliance.service.server";
import type { Br18ProjectFacts } from "@/lib/br18/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Br18ComplianceResult }
  | { status: "error"; message: string };

export function useProjectBr18Compliance(projectId: string) {
  const [state, setState] = useState<State>({ status: "idle" });

  const runCompliance = useCallback(
    async (facts: Br18ProjectFacts) => {
      setState({ status: "loading" });
      try {
        const data = await getBr18Compliance({ data: { projectId, facts } });
        setState({ status: "success", data });
      } catch (e) {
        setState({ status: "error", message: String(e) });
      }
    },
    [projectId],
  );

  return { state, runCompliance };
}
```

- [ ] **Step 13.2: Implementer `src/components/br18/Br18KravMatrix.tsx`**

```typescript
import type { Br18ApplicabilityResult } from "@/lib/br18/types";

type Props = {
  results: Br18ApplicabilityResult[];
  isLoading: boolean;
};

const STATUS_LABEL: Record<Br18ApplicabilityResult["status"], string> = {
  relevant: "Relevant",
  not_relevant: "Ikke relevant",
  unknown_missing_data: "Manglende data",
  requires_specialist_review: "Kræver faglig review",
  requires_authority_decision: "Kræver myndighedsafgørelse",
};

const STATUS_COLOR: Record<Br18ApplicabilityResult["status"], string> = {
  relevant: "text-amber-700 bg-amber-50 border-amber-200",
  not_relevant: "text-gray-500 bg-gray-50 border-gray-200",
  unknown_missing_data: "text-red-700 bg-red-50 border-red-200",
  requires_specialist_review: "text-blue-700 bg-blue-50 border-blue-200",
  requires_authority_decision: "text-purple-700 bg-purple-50 border-purple-200",
};

export function Br18KravMatrix({ results, isLoading }: Props) {
  if (isLoading) {
    return <p className="text-sm text-gray-500">Henter BR18-kravmatrix…</p>;
  }
  if (results.length === 0) {
    return <p className="text-sm text-gray-500">Ingen BR18-krav evalueret endnu.</p>;
  }

  return (
    <div className="space-y-2">
      {results.map((result) => (
        <div
          key={result.requirementId}
          className={`flex items-start justify-between rounded border px-3 py-2 ${STATUS_COLOR[result.status]}`}
        >
          <span className="text-sm font-medium">{result.requirementId}</span>
          <span className="ml-4 shrink-0 text-xs font-semibold">
            {STATUS_LABEL[result.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 13.3: Verificer TypeScript**

```bash
bunx tsc --noEmit
```

- [ ] **Step 13.4: Commit**

```bash
git add src/hooks/use-project-br18-compliance.ts src/components/br18/
git commit -m "feat(br18): tilfoej BR18 hook og Br18KravMatrix komponent"
```

---

## Definition of Done — køres inden phase lukkes

```bash
bunx tsc --noEmit        # ingen fejl
bun test src/            # alle PASS
bunx eslint .            # ingen nye fejl
bun run build            # bygger uden fejl
```

Tjekliste:

- [ ] Ingen `any` eller `as unknown as Type` casts i nye filer
- [ ] Ingen direkte Supabase-kald uden for `repositories/`
- [ ] Ingen compliance-logik i React-komponenter
- [ ] `withAuth()` kaldt i alle server functions
- [ ] `loadBr18Catalog()` kaster ved ugyldig version (ikke silent fail)
- [ ] Alle AI-svar schema-valideres (gælder Phase 6+)
- [ ] `reactive-compliance.ts`, `project-store.ts` og øvrige beskyttede filer er urørt

---

## Fremtidige faser (ikke i dette plans scope)

- **Phase 6 — br18-documentation.service** — evidence writeback via service (generate-authority-package server function)
- **Phase 7 — Specialist tracks** — brandspor, konstruktionsspor, energispor, LCA/klimaspor, D&V/færdigmeldingsspor
- **Phase 8 — Governance** — katalogversioner, re-evaluerings-workflow, diff mellem BR18-versioner, audit log
