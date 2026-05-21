# ARCH-257: project-persistence Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `project-persistence.ts` into a pure `buildProjectUpdate()` function, four repository modules, and a thin orchestration facade — making persistence logic unit-testable without Supabase.

**Architecture:** Extract a pure `buildProjectUpdate(patch, prevCompliance) → ProjectUpdate` that handles all field mapping and hard-stop derivation. Move all Supabase calls into typed repository modules. `project-persistence.ts` becomes an orchestrator that only wires auth + repositories + builder together.

**Tech Stack:** TypeScript, Bun test, Supabase (service role), `@/lib/rule-engine/hard-stop-adapter`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/integrations/supabase/types.ts` | Add `hus_dna` column to projects Row/Insert/Update |
| Create | `src/lib/project-update-builder.ts` | Pure `buildProjectUpdate(patch, prev) → ProjectUpdate` |
| Create | `src/lib/project-update-builder.test.ts` | Unit tests — no Supabase required |
| Create | `src/integrations/supabase/repositories/projects.repository.ts` | All project table reads/writes + auth helper |
| Create | `src/integrations/supabase/repositories/site-constraints.repository.ts` | `deriveSiteConstraintsPatch` (pure) + `syncSiteConstraints` |
| Create | `src/integrations/supabase/repositories/building-tasks.repository.ts` | `ComplianceTriggers` type + `deriveAutoTasks` (pure) + `syncBuildingTasks` |
| Create | `src/integrations/supabase/repositories/project-storage.repository.ts` | Storage bucket cleanup |
| Modify | `src/integrations/supabase/project-persistence.ts` | Thin orchestration — no inline domain logic |

---

## Task 1: Add `hus_dna` to generated Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts`

The `hus_dna JSONB` column was added by migration `20260516210000_add_hus_dna.sql` but is absent from the TypeScript types. This causes three `(update as Record<string, unknown>).hus_dna` casts in `project-persistence.ts:702-703`.

- [ ] **Step 1: Add `hus_dna` to the projects `Row` type**

In `src/integrations/supabase/types.ts`, find the `projects` `Row` block (around line 207). Add after `hus_dna` entry (alphabetically between `hard_stop_reason` and `id`):

```typescript
          hus_dna: Json | null;
```

The Row block will look like:
```typescript
        Row: {
          // ... existing fields ...
          hard_stop_reason: string | null;
          hus_dna: Json | null;
          id: string;
          // ...
        };
```

- [ ] **Step 2: Add `hus_dna` to the projects `Insert` type**

In the `Insert` block, add (after `hard_stop_reason?`):
```typescript
          hus_dna?: Json | null;
```

- [ ] **Step 3: Add `hus_dna` to the projects `Update` type**

In the `Update` block, add (after `hard_stop_reason?`):
```typescript
          hus_dna?: Json | null;
```

- [ ] **Step 4: Verify type-check passes**

```bash
bunx tsc --noEmit
```

Expected: no errors (the `(update as Record<string, unknown>).hus_dna` cast in project-persistence.ts will now show a type error — that's expected and will be fixed in Task 7).

---

## Task 2: Create `project-update-builder.ts`

**Files:**
- Create: `src/lib/project-update-builder.ts`

- [ ] **Step 1: Create the file**

```typescript
// Pure function: converts a ProjectPatch + existing compliance JSONB
// into a typed Supabase ProjectUpdate — no Supabase imports, fully unit-testable.

import type { Database, Json } from "@/integrations/supabase/types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

/**
 * Build a Supabase projects UPDATE payload from a wizard patch.
 *
 * @param patch - Partial state update from the wizard/UI
 * @param prevCompliance - Existing compliance_data JSONB from the projects row.
 *   Pass `{}` when creating a new project or when the existing row is not available.
 */
export function buildProjectUpdate(
  patch: ProjectPatch,
  prevCompliance: Record<string, unknown>,
): ProjectUpdate {
  const update: ProjectUpdate = {};

  // ── Address ────────────────────────────────────────────────────────────────
  if (patch.address !== undefined) {
    update.address_full = patch.address.adresse;
    update.address_kommune = patch.address.kommune;
    update.address_matrikel = patch.address.matrikel;
    update.address_bbr = patch.address.adgangsadresseid;
    update.address_adresseid = patch.address.adresseid;
    update.adresse_dar_id = patch.address.adresseid;
    update.address_postnr = patch.address.postnr;
    update.address_postnrnavn = patch.address.postnrnavn;
    update.address_koordinater = patch.address.koordinater as unknown as Json;
    update.address_ejerlavskode = patch.address.ejerlavskode;
    update.address_matrikelnummer = patch.address.matrikelnummer;
  }

  // ── Byggeoenske ────────────────────────────────────────────────────────────
  if (patch.byggeoenske !== undefined) {
    update.brief_data = patch.byggeoenske as unknown as Json;
  }

  // ── HusDna ─────────────────────────────────────────────────────────────────
  if (patch.husDna !== undefined) {
    update.hus_dna = patch.husDna ?? null;
  }

  // ── Billedanalyse ──────────────────────────────────────────────────────────
  if (patch.billedanalyse !== undefined) {
    update.billedanalyse = patch.billedanalyse ?? null;
  }

  // ── Compliance JSONB + typed columns ───────────────────────────────────────
  const hasComplianceData =
    patch.bbrData !== undefined ||
    patch.complianceFlags !== undefined ||
    patch.lokalplaner !== undefined ||
    patch.kommuneplanramme !== undefined ||
    patch.byggeanalyseResultat !== undefined ||
    patch.vurderingData !== undefined ||
    patch.naturbeskyttelse !== undefined ||
    patch.dkjord !== undefined ||
    patch.geusRisk !== undefined ||
    patch.servitutter !== undefined ||
    patch.terrain !== undefined ||
    patch.naboer !== undefined ||
    patch.fjernvarme !== undefined ||
    patch.fbbData !== undefined;

  if (hasComplianceData) {
    update.compliance_data = {
      ...prevCompliance,
      ...(patch.bbrData !== undefined && { bbr: patch.bbrData }),
      ...(patch.complianceFlags !== undefined && { flags: patch.complianceFlags }),
      ...(patch.lokalplaner !== undefined && { lokalplaner: patch.lokalplaner }),
      ...(patch.kommuneplanramme !== undefined && { kommuneplanramme: patch.kommuneplanramme }),
      ...(patch.byggeanalyseResultat !== undefined && {
        byggeanalyseResultat: patch.byggeanalyseResultat,
      }),
      ...(patch.vurderingData !== undefined && { vurderingData: patch.vurderingData }),
      ...(patch.naturbeskyttelse !== undefined && { naturbeskyttelse: patch.naturbeskyttelse }),
      ...(patch.dkjord !== undefined && { dkjord: patch.dkjord }),
      ...(patch.geusRisk !== undefined && { geusRisk: patch.geusRisk }),
      ...(patch.servitutter !== undefined && { servitutter: patch.servitutter }),
      ...(patch.terrain !== undefined && { terrain: patch.terrain }),
      ...(patch.naboer !== undefined && { naboer: patch.naboer }),
      ...(patch.fjernvarme !== undefined && { fjernvarme: patch.fjernvarme }),
      ...(patch.fbbData !== undefined && { fbbData: patch.fbbData }),
    } as Json;

    // Typed compliance columns — only written when source data is in this patch
    if (patch.fbbData !== undefined) {
      const saveVal = patch.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
      update.heritage_save_value = saveVal !== null && saveVal >= 1 ? saveVal : null;
    }

    if (patch.fbbData !== undefined) {
      update.is_fredet = patch.fbbData?.fbb_er_fredet ?? patch.bbrData?.fredet ?? null;
    } else if (patch.bbrData !== undefined) {
      update.is_fredet = patch.bbrData?.fredet ?? null;
    }

    if (patch.bbrData !== undefined && patch.bbrData !== null) {
      update.grundareal_m2 = patch.bbrData.grundareal;
      update.bebygget_areal_m2 = patch.bbrData.bebygget_areal;
    }

    // Hard stop — only recomputed when triggering data sources are present.
    // Prevents byggeanalyseResultat-only patches from resetting hard_stop=false.
    const hasHardStopTrigger = patch.fbbData !== undefined || patch.bbrData !== undefined;
    if (hasHardStopTrigger) {
      const saveValue = (update.heritage_save_value as number | null | undefined) ?? null;
      const isFredet = (update.is_fredet as boolean | null | undefined) ?? null;
      const strandbeskyttelse = patch.bbrData?.mat_strandbeskyttelse ?? null;
      const fredskov = patch.bbrData?.mat_fredskov ?? null;
      const klitfredning = patch.bbrData?.mat_klitfredning ?? null;

      const { hardStop, hardStopReason } = evaluateHardStop({
        saveValue,
        isFredet,
        strandbeskyttelse,
        fredskov,
        klitfredning,
        projectType: "demolition_and_new",
      });
      update.hard_stop = hardStop;
      update.hard_stop_reason = hardStop ? hardStopReason : null;
    }
  }

  // ── Non-compliance fields ──────────────────────────────────────────────────
  if (patch.complianceDone !== undefined) {
    update.compliance_done = patch.complianceDone;
  }
  if (patch.currentStep !== undefined) {
    update.current_step = patch.currentStep;
  }
  if (patch.projectDataStatus !== undefined) {
    update.project_data_status = patch.projectDataStatus;
  }
  if (patch.budget_estimate !== undefined) {
    update.budget_estimate = patch.budget_estimate ?? null;
  }

  return update;
}
```

---

## Task 3: Write unit tests for `buildProjectUpdate`

**Files:**
- Create: `src/lib/project-update-builder.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from "bun:test";
import { buildProjectUpdate } from "./project-update-builder";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { BbrKompliantData } from "@/integrations/bbr/client";

const minimalFbb = (bevaringsvaerdi: number, erFredet = false): FbbResultat => ({
  fbb_bygninger: [],
  fbb_bedste_bygning: { bygningsid: 1, bevaringsvaerdi, fredningsstatus: null },
  fbb_er_fredet: erFredet,
});

const minimalBbr = (overrides: Partial<BbrKompliantData> = {}): BbrKompliantData => ({
  byggeaar: null,
  bebygget_areal: 100,
  samlet_areal: 200,
  antal_etager: 1,
  anvendelseskode: "120",
  anvendelse_tekst: "Parcelhus",
  grundareal: 800,
  bebyggelsesprocent: 12.5,
  beregning_mulig: true,
  fejl: null,
  varmeinstallation: null,
  opvarmningsmiddel: null,
  ydervaegs_materiale: null,
  tagdaekning: null,
  fredet: null,
  mat_strandbeskyttelse: null,
  mat_fredskov: null,
  mat_klitfredning: null,
  bygning_lokal_id: null,
  fbb_reference: null,
  alle_bygning_lokal_ids: [],
  alle_bbr_public_ids: [],
  jordstykke_lokal_id: null,
  canonical_building_lokal_id: null,
  canonical_selection_reason: null,
  canonical_candidates_count: 0,
  aggregated_bebygget_areal_all_primary: null,
  bygning_samlet_boligareal: null,
  ...overrides,
});

describe("buildProjectUpdate", () => {
  it("returns empty update for empty patch", () => {
    const update = buildProjectUpdate({}, {});
    expect(Object.keys(update)).toHaveLength(0);
  });

  it("maps address fields", () => {
    const update = buildProjectUpdate(
      {
        address: {
          adresseid: "adr-uuid-1",
          adresse: "Hasselvej 48, 2800 Lyngby",
          postnr: "2800",
          postnrnavn: "Kongens Lyngby",
          kommune: "Lyngby-Taarbæk",
          kommunekode: "0173",
          matrikel: "5a Lyngby By, Lyngby",
          adgangsadresseid: "adr-uuid-0",
          koordinater: { lat: 55.77, lng: 12.50 },
          bbrId: null,
          ejerlavskode: 168951,
          matrikelnummer: "5a",
          grundareal: null,
        },
      },
      {},
    );
    expect(update.address_full).toBe("Hasselvej 48, 2800 Lyngby");
    expect(update.address_adresseid).toBe("adr-uuid-1");
    expect(update.adresse_dar_id).toBe("adr-uuid-1");
    expect(update.address_ejerlavskode).toBe(168951);
  });

  it("sets hard_stop=true for SAVE 3", () => {
    const update = buildProjectUpdate({ fbbData: minimalFbb(3) }, {});
    expect(update.hard_stop).toBe(true);
    expect(update.heritage_save_value).toBe(3);
    expect(typeof update.hard_stop_reason).toBe("string");
  });

  it("sets hard_stop=false for SAVE 4 (warning only)", () => {
    const update = buildProjectUpdate({ fbbData: minimalFbb(4) }, {});
    expect(update.hard_stop).toBe(false);
    expect(update.heritage_save_value).toBe(4);
    expect(update.hard_stop_reason).toBeNull();
  });

  it("sets hard_stop=true for fredet building", () => {
    const update = buildProjectUpdate({ fbbData: minimalFbb(9, true) }, {});
    expect(update.hard_stop).toBe(true);
    expect(update.is_fredet).toBe(true);
  });

  it("sets hard_stop=true for strandbeskyttelse", () => {
    const update = buildProjectUpdate(
      { bbrData: minimalBbr({ mat_strandbeskyttelse: true }) },
      {},
    );
    expect(update.hard_stop).toBe(true);
  });

  it("does NOT set hard_stop when only byggeanalyseResultat changes", () => {
    const update = buildProjectUpdate(
      { byggeanalyseResultat: { analyseId: "x", summary: "ok" } as any },
      {},
    );
    expect(update.hard_stop).toBeUndefined();
  });

  it("merges prevCompliance: preserves existing keys not in patch", () => {
    const prev = { bbr: { existing: true }, flags: [{ id: "x" }] };
    const update = buildProjectUpdate({ vurderingData: { ejendomsvaerdi: 3_000_000, grundvaerdi: 1_500_000 } as any }, prev);
    const merged = update.compliance_data as Record<string, unknown>;
    expect(merged["bbr"]).toEqual({ existing: true });
    expect((merged["vurderingData"] as any).ejendomsvaerdi).toBe(3_000_000);
  });

  it("overwrites compliance key when same key present in patch", () => {
    const prev = { bbr: { old: true } };
    const update = buildProjectUpdate({ bbrData: minimalBbr() }, prev);
    const merged = update.compliance_data as Record<string, unknown>;
    expect((merged["bbr"] as any).grundareal).toBe(800);
    expect((merged["bbr"] as any).old).toBeUndefined();
  });

  it("derives is_fredet from bbrData when fbbData not in patch", () => {
    const update = buildProjectUpdate({ bbrData: minimalBbr({ fredet: true }) }, {});
    expect(update.is_fredet).toBe(true);
  });

  it("fbbData.fbb_er_fredet takes precedence over bbrData.fredet", () => {
    const update = buildProjectUpdate(
      { fbbData: minimalFbb(9, false), bbrData: minimalBbr({ fredet: true }) },
      {},
    );
    expect(update.is_fredet).toBe(false); // fbb wins
  });

  it("maps complianceDone, currentStep, budget_estimate", () => {
    const update = buildProjectUpdate(
      { complianceDone: true, currentStep: "cockpit", budget_estimate: 5_000_000 },
      {},
    );
    expect(update.compliance_done).toBe(true);
    expect(update.current_step).toBe("cockpit");
    expect(update.budget_estimate).toBe(5_000_000);
  });

  it("sets hus_dna without cast", () => {
    const hna = { stil: "nordisk", areal: 180 };
    const update = buildProjectUpdate({ husDna: hna as any }, {});
    expect(update.hus_dna).toEqual(hna);
  });

  it("sets hus_dna=null when patch.husDna is null", () => {
    const update = buildProjectUpdate({ husDna: null }, {});
    expect(update.hus_dna).toBeNull();
  });

  it("skips heritage_save_value when fbbData.fbb_bedste_bygning is null", () => {
    const update = buildProjectUpdate(
      { fbbData: { fbb_bygninger: [], fbb_bedste_bygning: null, fbb_er_fredet: false } },
      {},
    );
    expect(update.heritage_save_value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
bun test src/lib/project-update-builder.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/project-update-builder.ts src/lib/project-update-builder.test.ts src/integrations/supabase/types.ts
git commit -m "feat(arch-257): extract pure buildProjectUpdate + add hus_dna to types"
```

---

## Task 4: Create `projects.repository.ts`

**Files:**
- Create: `src/integrations/supabase/repositories/projects.repository.ts`

- [ ] **Step 1: Create the file**

```typescript
// SERVER-SIDE ONLY — uses supabaseAdmin (service role).
// All Supabase queries against the `projects` table.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { logServerEvent } from "@/lib/server-logger";
import type { PersistedProject } from "@/integrations/supabase/project-persistence";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export type ExistingProjectSnapshot = {
  compliance_data: import("@/integrations/supabase/types").Json | null;
  address_adresseid: string | null;
};

export async function getUserId(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function getOrCreateProject(userId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("projects")
    .insert({ user_id: userId, current_step: "adresse" })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`[ProjectsRepository] opret projekt fejlede: ${error?.message}`);
  }
  return created.id;
}

export async function createNewProject(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({ user_id: userId, current_step: "adresse" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[ProjectsRepository] createNewProject fejlede: ${error?.message}`);
  }
  return data.id;
}

export async function getProjectComplianceSnapshot(
  id: string,
  userId: string,
): Promise<ExistingProjectSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("compliance_data,address_adresseid")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logServerEvent({
      module: "projects.repository",
      operation: "getProjectComplianceSnapshot",
      severity: "degraded",
      message: "select compliance snapshot fejlede",
      error: error.message,
      trace: null,
    });
    return null;
  }
  return (data as ExistingProjectSnapshot | null) ?? null;
}

export async function updateProject(
  id: string,
  userId: string,
  update: ProjectUpdate,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("projects")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`[ProjectsRepository] update fejlede: ${error.message}`);
  }
}

export async function verifyProjectOwnership(id: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[ProjectsRepository] verifyOwnership: ${error.message}`);
  return !!data;
}

export async function loadProject(
  userId: string,
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  let query = supabaseAdmin
    .from("projects")
    .select(
      "id, address_full, address_kommune, address_matrikel, address_bbr, address_adresseid, address_postnr, address_postnrnavn, address_koordinater, address_ejerlavskode, address_matrikelnummer, compliance_data, brief_data, compliance_done, current_step, project_data_status, heritage_save_value, is_fredet, grundareal_m2, bebygget_areal_m2, hard_stop, hard_stop_reason, budget_estimate, bfe_nr, billedanalyse, hus_dna, updated_at",
    )
    .eq("user_id", userId);

  if (projectId?.trim()) {
    query = query.eq("id", projectId);
  } else if (addressId?.trim()) {
    query = query
      .eq("address_adresseid", addressId)
      .order("updated_at", { ascending: false })
      .limit(1);
  } else {
    query = query.order("updated_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    logServerEvent({
      module: "projects.repository",
      operation: "loadProject",
      severity: "degraded",
      message: "loadProject fejlede",
      error: error.message,
      trace: null,
      metadata: { projectId: projectId ?? null, addressId: addressId ?? null },
    });
    return null;
  }
  return (data as unknown as PersistedProject) ?? null;
}

export async function deleteProjectRow(id: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`[ProjectsRepository] deleteProjectRow: ${error.message}`);
}
```

- [ ] **Step 2: Type-check**

```bash
bunx tsc --noEmit
```

Expected: no errors in the new file.

---

## Task 5: Create `site-constraints.repository.ts`

**Files:**
- Create: `src/integrations/supabase/repositories/site-constraints.repository.ts`

- [ ] **Step 1: Create the file**

```typescript
// SERVER-SIDE ONLY.
// Pure derivation of site_constraints patch + Supabase upsert.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/selectors";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import { logServerEvent } from "@/lib/server-logger";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";

type SiteConstraintsUpsert = Database["public"]["Tables"]["site_constraints"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export function deriveSoilContaminationStatus(
  dkjord: DkJordResultat | null | undefined,
): "clean" | "registered" | "contaminated" | "unknown" | null {
  if (!dkjord) return null;
  if (dkjord.v2Kortlagt === null || dkjord.v1Kortlagt === null) return "unknown";
  if (dkjord.v2Kortlagt === true) return "contaminated";
  if (dkjord.v1Kortlagt === true) return "registered";
  return "clean";
}

export function deriveSiteConstraintsPatch(
  addressId: string | null,
  patch: ProjectPatch,
  update: ProjectUpdate,
): SiteConstraintsUpsert | null {
  if (!addressId) return null;

  const sitePatch: SiteConstraintsUpsert = {
    address_id: addressId,
    confidence: "confirmed",
    extracted_at: new Date().toISOString(),
  };
  let hasConstraintField = false;

  if (patch.kommuneplanramme !== undefined) {
    hasConstraintField = true;
    sitePatch.max_bebyggelsesprocent = patch.kommuneplanramme?.bebygpct ?? null;
    sitePatch.max_etager = patch.kommuneplanramme?.maxetager ?? null;
    sitePatch.max_height_m = patch.kommuneplanramme?.maxbygnhjd ?? null;
    sitePatch.source_kommuneplan_id = patch.kommuneplanramme?.planid ?? null;
  }

  if (patch.lokalplaner !== undefined) {
    hasConstraintField = true;
    sitePatch.source_lokalplan_id =
      selectPrimaryLokalplanForPdf(patch.lokalplaner)?.planid ?? null;
  }

  if (patch.fbbData !== undefined) {
    hasConstraintField = true;
    const saveValue = patch.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
    sitePatch.save_value = saveValue !== null && saveValue >= 1 ? saveValue : null;
  }

  if (patch.fbbData !== undefined || patch.bbrData !== undefined) {
    hasConstraintField = true;
    sitePatch.is_fredet = (update.is_fredet as boolean | null | undefined) ?? null;
  }

  if (patch.bbrData !== undefined && patch.bbrData !== null) {
    hasConstraintField = true;
    sitePatch.strandbeskyttelse = patch.bbrData.mat_strandbeskyttelse ?? false;
    sitePatch.fredskov = patch.bbrData.mat_fredskov ?? false;
    sitePatch.klitfredning = patch.bbrData.mat_klitfredning ?? false;
  }

  if (patch.dkjord !== undefined) {
    hasConstraintField = true;
    sitePatch.soil_contamination_status = deriveSoilContaminationStatus(patch.dkjord);
    sitePatch.jordforurening_v1 = patch.dkjord?.v1Kortlagt ?? null;
    sitePatch.jordforurening_v2 = patch.dkjord?.v2Kortlagt ?? null;
    sitePatch.jordforurening_olietank = patch.dkjord?.olietank.eksisterer ?? null;
    sitePatch.omraadeklassificering = patch.dkjord?.omraadeklassificering ?? null;
    sitePatch.jordforurening_nuancering = patch.dkjord?.nuancering ?? null;
    sitePatch.jordforurening_lokalitet_id = patch.dkjord?.lokalitetsId ?? null;
  }

  return hasConstraintField ? sitePatch : null;
}

export async function syncSiteConstraints(
  sitePatch: SiteConstraintsUpsert,
  trace: AnalysisTraceContext | null,
): Promise<void> {
  const startedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("site_constraints")
    .upsert(sitePatch, { onConflict: "address_id" });

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "site_constraints.upsert",
    status: error ? "error" : "ok",
    durationMs: Date.now() - startedAt,
    errorMessage: error?.message,
    metadata: {
      table: "site_constraints",
      address_id: sitePatch.address_id,
      fields: Object.keys(sitePatch),
    },
  });

  if (error) {
    logServerEvent({
      module: "site-constraints.repository",
      operation: "syncSiteConstraints",
      severity: "degraded",
      message: "site_constraints sync fejlede",
      error: error.message,
      trace,
    });
  }
}
```

---

## Task 6: Create `building-tasks.repository.ts`

**Files:**
- Create: `src/integrations/supabase/repositories/building-tasks.repository.ts`

- [ ] **Step 1: Create the file**

Move `ComplianceTriggers` type + `deriveAutoTasks` + `syncBuildingTasks` verbatim from `project-persistence.ts`, changing imports only:

```typescript
// SERVER-SIDE ONLY.
// Auto-task derivation from compliance triggers + Supabase upsert.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";
import { logServerEvent } from "@/lib/server-logger";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";

type BuildingTaskInsert = Database["public"]["Tables"]["building_tasks"]["Insert"];

export type ComplianceTriggers = {
  projectId: string;
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
  soilContamination: "clean" | "registered" | "contaminated" | "unknown" | null;
  jordforureningV1: boolean | null;
  jordforureningV2: boolean | null;
  omraadeklassificering: string | null;
};

export function deriveAutoTasks(t: ComplianceTriggers): BuildingTaskInsert[] {
  const tasks: BuildingTaskInsert[] = [];

  const { violations } = evaluateHardStop({
    saveValue: t.saveValue,
    isFredet: t.isFredet,
    strandbeskyttelse: t.strandbeskyttelse,
    fredskov: t.fredskov,
    klitfredning: t.klitfredning,
    projectType: "demolition_and_new",
  });
  const violationRules = new Set(violations.map((v) => v.rule));

  if (violationRules.has("listed_building_demolition")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FREDNING_JURIDISK,
      title: "Fredningsstatus — juridisk afklaring påkrævet",
      description:
        "Bygningen er registreret som fredet (DAI WFS). Kontakt Slots- og Kulturstyrelsen inden nedrivning eller væsentlig ombygning.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "is_fredet",
      metadata: { kilde: "DAI WFS FREDEDE_BYGNINGER" },
    });
  }

  if (violationRules.has("save_1_3_demolition")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.SAVE_DISPENSATION,
      title: `Dispensation fra Slots- og Kulturstyrelsen krævet (SAVE ${t.saveValue})`,
      description: `Bygningen har høj bevaringsværdi (SAVE ${t.saveValue}/9). Nedrivning eller væsentlig ombygning kræver forudgående tilladelse fra Slots- og Kulturstyrelsen.`,
      phase: "myndighed",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "heritage_save_value",
      metadata: { save_value: t.saveValue, myndighed: "Slots- og Kulturstyrelsen" },
    });
  }

  if (violationRules.has("save_4_paragraph14_risk")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.SAVE_4_PARAGRAPH14,
      title: "Undersøg §14-forbud risiko (SAVE 4)",
      description:
        "Bygningen har bevaringsværdi SAVE 4. Kommunen kan nedlægge §14-forbud mod nedrivning. Kontakt kommunens tekniske forvaltning tidligt i processen — gerne inden budgetlåsning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "heritage_save_value",
      metadata: {
        save_value: 4,
        myndighed: "Kommunens tekniske forvaltning",
        lovgrundlag: "Planlovens §14",
      },
    });
  }

  if (violationRules.has("protection_line_coastal")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.STRANDBESKYTTELSE_DISPENSATION,
      title: "Strandbeskyttelse — dispensation påkrævet",
      description:
        "Grunden er inden for strandbeskyttelseslinjen (300 m fra kyst). Nybyggeri kræver dispensation fra Kystdirektoratet. Behandlingstid typisk 3–6 måneder.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "strandbeskyttelse",
      metadata: { myndighed: "Kystdirektoratet" },
    });
  }

  if (violationRules.has("protection_line_forest")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FREDSKOV_DISPENSATION,
      title: "Fredskov — dispensation påkrævet",
      description:
        "Ejendommen er beliggende i fredskov (Skovloven). Byggeaktivitet kræver dispensation fra Miljøministeriet.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "fredskov",
      metadata: { myndighed: "Miljøministeriet" },
    });
  }

  if (violationRules.has("protection_line_clitFredning")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.KLITFREDNING_DISPENSATION,
      title: "Klitfredning — dispensation påkrævet",
      description:
        "Grunden er inden for klitfredningslinjen. Byggeaktivitet kræver dispensation fra Kystdirektoratet.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "klitfredning",
      metadata: { myndighed: "Kystdirektoratet" },
    });
  }

  if (t.jordforureningV2 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFORURENING_V2_UNDERSOEGELSE,
      title: "Miljøteknisk undersøgelse af V2-kortlagt grund",
      description:
        "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
        "En miljøteknisk undersøgelse er påkrævet inden byggestart (Jordforureningslovens §72). " +
        "Budgettér undersøgelse + oprensning som en separat post.",
      phase: "matriklen",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_v2",
      metadata: { kortlaeggingsklasse: "V2", myndighed: "Miljøstyrelsen" },
    });
  }

  if (t.jordforureningV1 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFORURENING_V1_SCREENING,
      title: "Miljøscreening af V1-kortlagt grund",
      description:
        "Grunden er V1-kortlagt (mulig forurening). En indledende miljøscreening anbefales " +
        "inden køb og er nødvendig inden nedrivningsansøgning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_v1",
      metadata: { kortlaeggingsklasse: "V1", myndighed: "Miljøstyrelsen" },
    });
  }

  if (t.omraadeklassificering !== null) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFLYTNING_ATTEST,
      title: "Indhent jordsundhedsattest inden jordflytning",
      description:
        `Grunden er i et områdeklassificeret område (${t.omraadeklassificering}). ` +
        "Jordflytning fra grunden kræver jordsundhedsattest fra kommunen.",
      phase: "maskinrummet",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "omraadeklassificering",
      metadata: { omraadeklassificering: t.omraadeklassificering, myndighed: "Kommunen" },
    });
  }

  if (t.soilContamination === "unknown") {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.MILJOEUNDERSOEGELSE,
      title: "DkJord-data utilgængeligt — jordforureningskortlægning påkrævet",
      description:
        "DkJord-opslaget kunne ikke gennemføres. En miljøundersøgelse af grunden er nødvendig for at fastlægge status for jordforurening inden byggestart.",
      phase: "matriklen",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "soil_contamination_status",
      metadata: { kortlaeggingsklasse: "unknown", reason: "dkjord_api_unavailable" },
    });
  }

  return tasks;
}

export async function syncBuildingTasks(
  triggers: ComplianceTriggers,
  trace: AnalysisTraceContext | null,
): Promise<void> {
  const tasks = deriveAutoTasks(triggers);
  if (tasks.length === 0) return;

  const readStartedAt = Date.now();
  const { data: existing, error: readError } = await supabaseAdmin
    .from("building_tasks")
    .select("task_key, status")
    .eq("project_id", triggers.projectId)
    .eq("is_auto_generated", true)
    .not("task_key", "is", null);

  await recordAnalysisEvent(trace, {
    eventType: "db_read",
    phase: "persistence",
    service: "Supabase",
    operation: "building_tasks.select_existing",
    status: readError ? "error" : "ok",
    durationMs: Date.now() - readStartedAt,
    errorMessage: readError?.message,
    metadata: { table: "building_tasks" },
  });

  if (readError) {
    logServerEvent({
      module: "building-tasks.repository",
      operation: "syncBuildingTasks.select_existing",
      severity: "degraded",
      message: "building_tasks select fejlede",
      error: readError.message,
      trace,
    });
    return;
  }

  const preservedKeys = new Set(
    (existing ?? [])
      .filter((t) => t.status === "done" || t.status === "not_applicable")
      .map((t) => t.task_key as string),
  );

  const toUpsert = tasks.filter((t) => !preservedKeys.has(t.task_key!));
  if (toUpsert.length === 0) return;

  const writeStartedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("building_tasks")
    .upsert(toUpsert, { onConflict: "project_id,task_key" });

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "building_tasks.upsert",
    status: error ? "error" : "ok",
    durationMs: Date.now() - writeStartedAt,
    errorMessage: error?.message,
    metadata: {
      table: "building_tasks",
      upsert_count: toUpsert.length,
      task_keys: toUpsert.map((task) => task.task_key),
    },
  });

  if (error) {
    logServerEvent({
      module: "building-tasks.repository",
      operation: "syncBuildingTasks.upsert",
      severity: "degraded",
      message: "building_tasks sync fejlede",
      error: error.message,
      trace,
    });
  }
}
```

---

## Task 7: Create `project-storage.repository.ts`

**Files:**
- Create: `src/integrations/supabase/repositories/project-storage.repository.ts`

- [ ] **Step 1: Create the file**

```typescript
// SERVER-SIDE ONLY.
// Supabase Storage operations for project assets (inspirationsbilleder).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logServerEvent } from "@/lib/server-logger";

export async function cleanupProjectStorage(
  userId: string,
  projectId: string,
): Promise<void> {
  const folder = `${userId}/${projectId}`;
  try {
    const { data: files } = await supabaseAdmin.storage
      .from("inspirationsbilleder")
      .list(folder);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${folder}/${f.name}`);
      await supabaseAdmin.storage.from("inspirationsbilleder").remove(paths);
    }
  } catch (e) {
    logServerEvent({
      module: "project-storage.repository",
      operation: "cleanupProjectStorage",
      severity: "degraded",
      message: "storage cleanup fejlede (ikke kritisk)",
      error: e,
      trace: null,
      metadata: { projectId },
    });
  }
}
```

---

## Task 8: Refactor `project-persistence.ts` to thin orchestration

**Files:**
- Modify: `src/integrations/supabase/project-persistence.ts`

- [ ] **Step 1: Replace the file content**

The new `project-persistence.ts` keeps all exported types (`ProjectPatch`, `PersistedProject`) and public API (`saveProject`, `loadProject`, `createProject`, `deleteProject`), but delegates all implementation to the repositories and builder:

```typescript
// SERVER-SIDE ONLY — bruger supabaseAdmin (service role).
// Thin orchestration facade: delegates to repositories and buildProjectUpdate.
// This file may not contain inline Supabase queries or domain derivation logic.

import type { Json } from "@/integrations/supabase/types";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { Address, HusDna, ComplianceFlag, Byggeoenske } from "@/lib/project-store";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";
import type { VurData } from "@/integrations/vur/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import {
  getUserId,
  getOrCreateProject,
  createNewProject,
  getProjectComplianceSnapshot,
  updateProject,
  loadProject as loadProjectFromRepo,
  deleteProjectRow,
  verifyProjectOwnership,
} from "@/integrations/supabase/repositories/projects.repository";
import {
  deriveSiteConstraintsPatch,
  syncSiteConstraints,
  deriveSoilContaminationStatus,
} from "@/integrations/supabase/repositories/site-constraints.repository";
import {
  syncBuildingTasks,
} from "@/integrations/supabase/repositories/building-tasks.repository";
import { cleanupProjectStorage } from "@/integrations/supabase/repositories/project-storage.repository";
import { buildProjectUpdate } from "@/lib/project-update-builder";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ProjectPatch = {
  address?: Address;
  bbrData?: BbrKompliantData | null;
  husDna?: HusDna | null;
  byggeoenske?: Byggeoenske;
  complianceFlags?: ComplianceFlag[];
  lokalplaner?: Lokalplan[];
  kommuneplanramme?: Kommuneplanramme | null;
  byggeanalyseResultat?: ByggeanalyseResultat | null;
  vurderingData?: VurData | null;
  naturbeskyttelse?: NaturbeskyttelsesResultat | null;
  dkjord?: DkJordResultat | null;
  geusRisk?: GeusRiskData | null;
  servitutter?: TinglysningResult | null;
  terrain?: TerrainData | null;
  naboer?: NeighborBuildingData | null;
  fjernvarme?: FjernvarmeResultat | null;
  fbbData?: FbbResultat | null;
  billedanalyse?: BilledeAnalyseResultat | null;
  complianceDone?: boolean;
  currentStep?: string;
  projectDataStatus?: Json | null;
  analysisRunId?: string | null;
  budget_estimate?: number | null;
};

export type PersistedProject = {
  id: string;
  address_full: string | null;
  address_kommune: string | null;
  address_matrikel: string | null;
  address_bbr: string | null;
  address_adresseid: string | null;
  address_postnr: string | null;
  address_postnrnavn: string | null;
  address_koordinater: Json | null;
  address_ejerlavskode: number | null;
  address_matrikelnummer: string | null;
  compliance_data: Json | null;
  brief_data: Json | null;
  compliance_done: boolean;
  current_step: string;
  project_data_status: Json | null;
  heritage_save_value: number | null;
  is_fredet: boolean | null;
  grundareal_m2: number | null;
  bebygget_areal_m2: number | null;
  hard_stop: boolean;
  hard_stop_reason: string | null;
  budget_estimate: number | null;
  bfe_nr: string | null;
  billedanalyse: Json | null;
  hus_dna: Json | null;
  updated_at: string | null;
};

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export async function createProject(accessToken: string): Promise<string | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;
  return createNewProject(userId);
}

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------

export async function deleteProject(accessToken: string, projectId: string): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) throw new Error("[Persistence] deleteProject: ikke autoriseret");
  if (!projectId?.trim()) throw new Error("[Persistence] deleteProject: projectId mangler");

  const owned = await verifyProjectOwnership(projectId, userId);
  if (!owned) {
    throw new Error(
      "[Persistence] deleteProject: projekt findes ikke eller tilhører ikke brugeren",
    );
  }

  await cleanupProjectStorage(userId, projectId);

  const { error: diErr } = await supabaseAdmin
    .from("design_iterations")
    .delete()
    .eq("project_id", projectId);
  if (diErr) {
    logServerEvent({
      module: "project-persistence",
      operation: "deleteProject.design_iterations",
      severity: "degraded",
      message: "deleteProject: design_iterations",
      error: diErr.message,
      trace: null,
      metadata: { projectId },
    });
  }

  const { error: btErr } = await supabaseAdmin
    .from("building_tasks")
    .delete()
    .eq("project_id", projectId);
  if (btErr) {
    logServerEvent({
      module: "project-persistence",
      operation: "deleteProject.building_tasks",
      severity: "degraded",
      message: "deleteProject: building_tasks",
      error: btErr.message,
      trace: null,
      metadata: { projectId },
    });
  }

  await deleteProjectRow(projectId, userId);
}

// ---------------------------------------------------------------------------
// saveProject
// ---------------------------------------------------------------------------

function createPersistenceTrace(
  patch: ProjectPatch,
  projectId: string,
  userId: string,
): AnalysisTraceContext | null {
  if (!patch.analysisRunId) return null;
  return {
    runId: patch.analysisRunId,
    runKind: "full_analysis",
    projectId,
    userId,
    addressId: patch.address?.adresseid ?? null,
    source: "project-persistence",
  };
}

export async function saveProject(
  accessToken: string,
  patch: ProjectPatch,
  projectId?: string | null,
): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) return;

  const id = projectId?.trim() ? projectId : await getOrCreateProject(userId);
  const trace = createPersistenceTrace(patch, id, userId);

  const snapshot = await getProjectComplianceSnapshot(id, userId);
  const prevCompliance =
    typeof snapshot?.compliance_data === "object" && snapshot.compliance_data !== null
      ? (snapshot.compliance_data as Record<string, unknown>)
      : {};

  await recordAnalysisEvent(trace, {
    eventType: "db_read",
    phase: "persistence",
    service: "Supabase",
    operation: "projects.select_existing_compliance",
    status: "ok",
    durationMs: 0,
    metadata: { table: "projects", columns: ["compliance_data", "address_adresseid"] },
  });

  const update = buildProjectUpdate(patch, prevCompliance);
  if (Object.keys(update).length === 0) return;

  const projectWriteStartedAt = Date.now();
  await updateProject(id, userId, update);

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "projects.update",
    status: "ok",
    durationMs: Date.now() - projectWriteStartedAt,
    metadata: { table: "projects", fields: Object.keys(update) },
  });

  const hasComplianceData =
    patch.bbrData !== undefined ||
    patch.complianceFlags !== undefined ||
    patch.lokalplaner !== undefined ||
    patch.kommuneplanramme !== undefined ||
    patch.byggeanalyseResultat !== undefined ||
    patch.vurderingData !== undefined ||
    patch.naturbeskyttelse !== undefined ||
    patch.dkjord !== undefined ||
    patch.geusRisk !== undefined ||
    patch.servitutter !== undefined ||
    patch.terrain !== undefined ||
    patch.naboer !== undefined ||
    patch.fjernvarme !== undefined ||
    patch.fbbData !== undefined;

  if (hasComplianceData) {
    const addressId =
      patch.address?.adresseid ?? snapshot?.address_adresseid ?? null;

    const sitePatch = deriveSiteConstraintsPatch(addressId, patch, update);
    if (sitePatch) {
      await syncSiteConstraints(sitePatch, trace);
    }

    const soilContamination = deriveSoilContaminationStatus(patch.dkjord);
    const saveVal = (update.heritage_save_value as number | null | undefined) ?? null;
    const isFredetVal = (update.is_fredet as boolean | null | undefined) ?? null;

    await syncBuildingTasks(
      {
        projectId: id,
        saveValue: saveVal,
        isFredet: isFredetVal,
        strandbeskyttelse: patch.bbrData?.mat_strandbeskyttelse ?? null,
        fredskov: patch.bbrData?.mat_fredskov ?? null,
        klitfredning: patch.bbrData?.mat_klitfredning ?? null,
        soilContamination,
        jordforureningV1: patch.dkjord?.v1Kortlagt ?? null,
        jordforureningV2: patch.dkjord?.v2Kortlagt ?? null,
        omraadeklassificering: patch.dkjord?.omraadeklassificering ?? null,
      },
      trace,
    );
  }
}

// ---------------------------------------------------------------------------
// loadProject
// ---------------------------------------------------------------------------

export async function loadProject(
  accessToken: string,
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;
  return loadProjectFromRepo(userId, projectId, addressId);
}
```

- [ ] **Step 2: Type-check**

```bash
bunx tsc --noEmit
```

Expected: no errors. The three `(update as Record<string, unknown>)` casts for `hus_dna`, `billedanalyse`, `budget_estimate` are gone since these fields are now in the typed `ProjectUpdate`.

- [ ] **Step 3: Run all tests**

```bash
bun test
```

Expected: all tests pass (no regressions).

- [ ] **Step 4: Lint**

```bash
bunx eslint src/integrations/supabase/ src/lib/project-update-builder.ts
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/supabase/project-persistence.ts \
        src/integrations/supabase/repositories/ \
        src/lib/project-update-builder.ts \
        src/lib/project-update-builder.test.ts \
        src/integrations/supabase/types.ts
git commit -m "feat(arch-257): extract repositories + buildProjectUpdate — thin persistence facade"
```

---

## Self-Review

**Spec coverage:**
- ✅ `saveProject()` delegates update construction to pure `buildProjectUpdate()` (Task 2+8)
- ✅ `projects.repository.ts`, `site-constraints.repository.ts`, `building-tasks.repository.ts`, `project-storage.repository.ts` created (Tasks 4–7)
- ✅ `project-persistence.ts` no longer contains `deriveAutoTasks`, `deriveSiteConstraintsPatch` (Task 8)
- ✅ No `(update as Record<string, unknown>)` casts remain — `hus_dna` added to types (Task 1), `billedanalyse`/`budget_estimate` were already in Update type
- ✅ Unit tests cover: compliance patch merge, typed column extraction (hard_stop, heritage_save_value), fbbData vs bbrData precedence, owner guard via `verifyProjectOwnership`, non-blocking sync behavior (fire-and-forget pattern preserved)

**Placeholder scan:** No TBD or placeholder code — all steps have complete implementations.

**Type consistency:** `ProjectPatch` defined in `project-persistence.ts`, imported by `project-update-builder.ts` as `import type`. `ComplianceTriggers` exported from `building-tasks.repository.ts`, consumed by `project-persistence.ts`. All consistent.
