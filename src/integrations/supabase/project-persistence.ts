// SERVER-SIDE ONLY — bruger supabaseAdmin (service role).
// Gem og gendan wizard-state i `projects`-tabellen.
//
// Kun for indloggede brugere — gæster returnerer null/no-op uden fejl.
// Access token verificeres server-side via Supabase auth.getUser().

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, Database } from "@/integrations/supabase/types";
import type { FbbResultat } from "@/integrations/fbb/client";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];
type BuildingTaskInsert = Database["public"]["Tables"]["building_tasks"]["Insert"];

import type { Address, HusDna, ComplianceFlag, Byggeoenske } from "@/lib/project-store";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/client";
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
import { BUILDING_TASK_KEYS } from "@/types/building-platform";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";

// ---------------------------------------------------------------------------
// Typer
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
  // Typed compliance columns (may be null if pipeline has not run yet)
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
// Interne hjælpertyper
// ---------------------------------------------------------------------------

type ComplianceTriggers = {
  projectId: string;
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
  soilContamination: "clean" | "registered" | "contaminated" | null;
};

type ExistingProjectSnapshot = {
  compliance_data: Json | null;
  address_adresseid: string | null;
};

type SiteConstraintsUpsert = Database["public"]["Tables"]["site_constraints"]["Insert"];

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

function deriveSiteConstraintsPatch(
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
    sitePatch.source_lokalplan_id = selectPrimaryLokalplanForPdf(patch.lokalplaner)?.planid ?? null;
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
  }

  return hasConstraintField ? sitePatch : null;
}

// ---------------------------------------------------------------------------
// Hjælpere: Hard Stop aggregering
// ---------------------------------------------------------------------------

function deriveSoilContaminationStatus(
  dkjord: DkJordResultat | null | undefined,
): "clean" | "registered" | "contaminated" | null {
  if (!dkjord) return null;
  if (dkjord.v2Kortlagt) return "contaminated";
  if (dkjord.v1Kortlagt) return "registered";
  return "clean";
}

function deriveHardStopReason(opts: {
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
}): string | null {
  const reasons: string[] = [];
  if (opts.isFredet === true) reasons.push("Fredet bygning (DAI WFS)");
  if (opts.saveValue !== null && opts.saveValue <= 3)
    reasons.push(`SAVE ${opts.saveValue} — dispensation kræves (Slots- og Kulturstyrelsen)`);
  if (opts.strandbeskyttelse === true) reasons.push("Strandbeskyttelse");
  if (opts.fredskov === true) reasons.push("Fredskov");
  if (opts.klitfredning === true) reasons.push("Klitfredning");
  return reasons.length > 0 ? reasons.join("; ") : null;
}

// ---------------------------------------------------------------------------
// Building Tasks: auto-generering baseret på compliance-data
// ---------------------------------------------------------------------------

function deriveAutoTasks(t: ComplianceTriggers): BuildingTaskInsert[] {
  const tasks: BuildingTaskInsert[] = [];

  if (t.isFredet === true) {
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

  if (t.saveValue !== null && t.saveValue <= 3) {
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

  if (t.saveValue === 4) {
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

  if (t.strandbeskyttelse === true) {
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

  if (t.fredskov === true) {
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

  if (t.klitfredning === true) {
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

  if (t.soilContamination === "contaminated" || t.soilContamination === "registered") {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.MILJOEUNDERSOEGELSE,
      title: "Miljøundersøgelse af grund påkrævet",
      description:
        t.soilContamination === "contaminated"
          ? "Grunden er V2-kortlagt (dokumenteret forurening). En miljøundersøgelse og evt. oprensning er nødvendig inden byggestart. Budgetér 200.000–500.000 kr+."
          : "Grunden er V1-kortlagt (mulig forurening). En indledende miljøundersøgelse er nødvendig inden byggetilladelse kan opnås.",
      phase: "matriklen",
      status: t.soilContamination === "contaminated" ? "blocked" : "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "soil_contamination_status",
      metadata: { kortlaeggingsklasse: t.soilContamination },
    });
  }

  return tasks;
}

async function syncBuildingTasks(
  triggers: ComplianceTriggers,
  trace: AnalysisTraceContext | null,
): Promise<void> {
  const tasks = deriveAutoTasks(triggers);
  if (tasks.length === 0) return;

  // Load existing auto-generated tasks once to avoid overwriting user-completed tasks
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
    console.warn("[Persistence] building_tasks select fejlede:", readError.message);
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
    // Non-fatal: building_tasks sync failure must not block the main project save
    console.warn("[Persistence] building_tasks sync fejlede:", error.message);
  }
}

async function syncSiteConstraints(
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
    // Non-fatal: projects remains the SSOT; site_constraints powers validation/debugging.
    console.warn("[Persistence] site_constraints sync fejlede:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Hjælper: verificér access token og returnér userId
// ---------------------------------------------------------------------------

async function getUserId(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Find eller opret projekt for bruger
// ---------------------------------------------------------------------------

async function getOrCreateProject(userId: string): Promise<string> {
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
    throw new Error(`[Persistence] kunne ikke oprette projekt: ${error?.message}`);
  }
  return created.id;
}

// ---------------------------------------------------------------------------
// createProject: opret tomt nyt projekt (bruges ved "Nyt projekt")
// ---------------------------------------------------------------------------

export async function createProject(accessToken: string): Promise<string | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({ user_id: userId, current_step: "adresse" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[Persistence] createProject fejlede: ${error?.message}`);
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// deleteProject: slet projekt + relateret data (storage, design_iterations,
// building_tasks). address_analysis / site_constraints er delt cache og røres ikke.
// ---------------------------------------------------------------------------

export async function deleteProject(
  accessToken: string,
  projectId: string,
): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) throw new Error("[Persistence] deleteProject: ikke autoriseret");
  if (!projectId?.trim()) throw new Error("[Persistence] deleteProject: projectId mangler");

  // Verificér ejerskab inden vi sletter noget
  const { data: owned, error: ownErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ownErr) throw new Error(`[Persistence] deleteProject: ${ownErr.message}`);
  if (!owned) throw new Error("[Persistence] deleteProject: projekt findes ikke eller tilhører ikke brugeren");

  // 1. Storage: fjern alle inspirationsbilleder for projektet
  const folder = `${userId}/${projectId}`;
  try {
    const { data: files } = await supabaseAdmin.storage.from("inspirationsbilleder").list(folder);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${folder}/${f.name}`);
      await supabaseAdmin.storage.from("inspirationsbilleder").remove(paths);
    }
  } catch (e) {
    console.warn("[Persistence] deleteProject: storage cleanup fejlede (ikke kritisk):", (e as Error).message);
  }

  // 2. design_iterations — ingen DB-cascade
  const { error: diErr } = await supabaseAdmin
    .from("design_iterations")
    .delete()
    .eq("project_id", projectId);
  if (diErr) console.warn("[Persistence] deleteProject: design_iterations:", diErr.message);

  // 3. building_tasks — ingen DB-cascade
  const { error: btErr } = await supabaseAdmin
    .from("building_tasks")
    .delete()
    .eq("project_id", projectId);
  if (btErr) console.warn("[Persistence] deleteProject: building_tasks:", btErr.message);

  // 4. selve projektet
  const { error: pErr } = await supabaseAdmin
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (pErr) throw new Error(`[Persistence] deleteProject: ${pErr.message}`);
}

// ---------------------------------------------------------------------------
// saveProject: gem state-patch til Supabase
// ---------------------------------------------------------------------------

export async function saveProject(
  accessToken: string,
  patch: ProjectPatch,
  projectId?: string | null,
): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) return;

  const id = projectId?.trim() ? projectId : await getOrCreateProject(userId);
  const trace = createPersistenceTrace(patch, id, userId);

  const update: ProjectUpdate = {};
  let existingRow: ExistingProjectSnapshot | null = null;

  // ── Adresse ──────────────────────────────────────────────────────────────
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

  // ── Byggeoenske ──────────────────────────────────────────────────────────
  if (patch.byggeoenske !== undefined) {
    update.brief_data = patch.byggeoenske as unknown as Json;
  }

  // ── HusDna — dedikeret kolonne (ARCH-197) ────────────────────────────────
  if (patch.husDna !== undefined) {
    (update as Record<string, unknown>).hus_dna = patch.husDna ?? null;
  }

  // ── Compliance JSONB (backward compat) + typed columns ───────────────────
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
    // Read existing compliance_data and merge — prevents partial patches from
    // overwriting unpatched fields with null/[] and from incorrectly resetting
    // hard_stop when only e.g. byggeanalyseResultat is in the patch (finding #2).
    // The ownership filter here also provides a secondary IDOR guard.
    const readStartedAt = Date.now();
    const { data, error: existingReadError } = await supabaseAdmin
      .from("projects")
      .select("compliance_data,address_adresseid")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    existingRow = (data as ExistingProjectSnapshot | null) ?? null;

    await recordAnalysisEvent(trace, {
      eventType: "db_read",
      phase: "persistence",
      service: "Supabase",
      operation: "projects.select_existing_compliance",
      status: existingReadError ? "error" : "ok",
      durationMs: Date.now() - readStartedAt,
      errorMessage: existingReadError?.message,
      metadata: { table: "projects", columns: ["compliance_data", "address_adresseid"] },
    });

    if (existingReadError) {
      console.warn("[Persistence] existing compliance read fejlede:", existingReadError.message);
    }

    const prev =
      typeof existingRow?.compliance_data === "object" && existingRow.compliance_data !== null
        ? (existingRow.compliance_data as Record<string, unknown>)
        : {};

    update.compliance_data = {
      ...prev,
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
    };

    // ── Extract typed compliance values ─────────────────────────────────────
    // Rule: only write a typed column when its source data is explicitly in this patch.

    if (patch.fbbData !== undefined) {
      const saveVal = patch.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
      update.heritage_save_value = saveVal !== null && saveVal >= 1 ? saveVal : null;
    }

    if (patch.fbbData !== undefined) {
      // FBB er autoritativ; BBR som backup når FBB-opslag fejlede (fbbData=null)
      update.is_fredet = patch.fbbData?.fbb_er_fredet ?? patch.bbrData?.fredet ?? null;
    } else if (patch.bbrData !== undefined) {
      update.is_fredet = patch.bbrData?.fredet ?? null;
    }

    if (patch.bbrData !== undefined && patch.bbrData !== null) {
      update.grundareal_m2 = patch.bbrData.grundareal;
      update.bebygget_areal_m2 = patch.bbrData.bebygget_areal;
    }

    // ── Aggregate hard_stop flag ─────────────────────────────────────────────
    // Only recompute when the triggering data sources are in this patch.
    // This prevents byggeanalyseResultat-only patches from resetting hard_stop=false.
    const hasHardStopTrigger = patch.fbbData !== undefined || patch.bbrData !== undefined;

    if (hasHardStopTrigger) {
      const saveValue = (update.heritage_save_value as number | null | undefined) ?? null;
      const isFredet = (update.is_fredet as boolean | null | undefined) ?? null;
      const strandbeskyttelse = patch.bbrData?.mat_strandbeskyttelse ?? null;
      const fredskov = patch.bbrData?.mat_fredskov ?? null;
      const klitfredning = patch.bbrData?.mat_klitfredning ?? null;

      const hardStop =
        isFredet === true ||
        (saveValue !== null && saveValue <= 3) ||
        strandbeskyttelse === true ||
        fredskov === true ||
        klitfredning === true;

      update.hard_stop = hardStop;
      update.hard_stop_reason = hardStop
        ? deriveHardStopReason({ saveValue, isFredet, strandbeskyttelse, fredskov, klitfredning })
        : null;
    }
  }

  // ── Billedanalyse — AI-analyse af inspirationsbilleder (ARCH-190) ─────────
  if (patch.billedanalyse !== undefined) {
    (update as Record<string, unknown>).billedanalyse = patch.billedanalyse ?? null;
  }

  // ── Compliance done flag ──────────────────────────────────────────────────
  if (patch.complianceDone !== undefined) {
    update.compliance_done = patch.complianceDone;
  }

  // ── Current step ─────────────────────────────────────────────────────────
  if (patch.currentStep !== undefined) {
    update.current_step = patch.currentStep;
  }

  // ── Project data status ───────────────────────────────────────────────────
  if (patch.projectDataStatus !== undefined) {
    update.project_data_status = patch.projectDataStatus;
  }

  // ── Budget estimate (ARCH-213) ────────────────────────────────────────────
  if (patch.budget_estimate !== undefined) {
    (update as Record<string, unknown>).budget_estimate = patch.budget_estimate;
  }

  if (Object.keys(update).length === 0) return;

  const projectWriteStartedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("projects")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId);

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "projects.update",
    status: error ? "error" : "ok",
    durationMs: Date.now() - projectWriteStartedAt,
    errorMessage: error?.message,
    metadata: {
      table: "projects",
      fields: Object.keys(update),
      has_compliance_data: hasComplianceData,
    },
  });

  if (error) {
    throw new Error(`[Persistence] update fejlede: ${error.message}`);
  }

  // ── Auto-generate building tasks from compliance triggers ─────────────────
  // Run after the project write so task generation never blocks the main save.
  if (hasComplianceData) {
    const siteConstraintsPatch = deriveSiteConstraintsPatch(
      patch.address?.adresseid ?? existingRow?.address_adresseid ?? null,
      patch,
      update,
    );
    if (siteConstraintsPatch) {
      await syncSiteConstraints(siteConstraintsPatch, trace);
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
      },
      trace,
    );
  }
}

// ---------------------------------------------------------------------------
// loadProject: hent seneste projekt for bruger
// ---------------------------------------------------------------------------

export async function loadProject(
  accessToken: string,
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;

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
    console.warn("[Persistence] loadProject fejlede:", error.message);
    return null;
  }

  return (data as unknown as PersistedProject) ?? null;
}
