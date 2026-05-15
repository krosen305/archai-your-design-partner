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
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { VurData } from "@/integrations/vur/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { SaveData } from "@/integrations/save/client";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";

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
  save?: SaveData | null;
  fbbData?: FbbResultat | null;
  complianceDone?: boolean;
  currentStep?: string;
  projectDataStatus?: Json | null;
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

async function syncBuildingTasks(triggers: ComplianceTriggers): Promise<void> {
  const tasks = deriveAutoTasks(triggers);
  if (tasks.length === 0) return;

  // Load existing auto-generated tasks once to avoid overwriting user-completed tasks
  const { data: existing } = await supabaseAdmin
    .from("building_tasks")
    .select("task_key, status")
    .eq("project_id", triggers.projectId)
    .eq("is_auto_generated", true)
    .not("task_key", "is", null);

  const preservedKeys = new Set(
    (existing ?? [])
      .filter((t) => t.status === "done" || t.status === "not_applicable")
      .map((t) => t.task_key as string),
  );

  const toUpsert = tasks.filter((t) => !preservedKeys.has(t.task_key!));
  if (toUpsert.length === 0) return;

  const { error } = await supabaseAdmin
    .from("building_tasks")
    .upsert(toUpsert, { onConflict: "project_id,task_key" });

  if (error) {
    // Non-fatal: building_tasks sync failure must not block the main project save
    console.warn("[Persistence] building_tasks sync fejlede:", error.message);
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

  const update: ProjectUpdate = {};

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

  // ── Byggeoenske / HusDna ─────────────────────────────────────────────────
  if (patch.byggeoenske !== undefined) {
    update.brief_data = patch.byggeoenske as unknown as Json;
  } else if (patch.husDna !== undefined) {
    update.brief_data = patch.husDna;
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
    patch.save !== undefined ||
    patch.fbbData !== undefined;

  if (hasComplianceData) {
    // Keep the JSONB blob for backward compat — readers not yet migrated to typed columns
    update.compliance_data = {
      bbr: patch.bbrData ?? null,
      flags: patch.complianceFlags ?? [],
      lokalplaner: patch.lokalplaner ?? [],
      kommuneplanramme: patch.kommuneplanramme ?? null,
      byggeanalyseResultat: patch.byggeanalyseResultat ?? null,
      vurderingData: patch.vurderingData ?? null,
      naturbeskyttelse: patch.naturbeskyttelse ?? null,
      dkjord: patch.dkjord ?? null,
      geusRisk: patch.geusRisk ?? null,
      servitutter: patch.servitutter ?? null,
      terrain: patch.terrain ?? null,
      naboer: patch.naboer ?? null,
      fjernvarme: patch.fjernvarme ?? null,
      save: patch.save ?? null,
      fbbData: patch.fbbData ?? null,
    };

    // ── Extract typed compliance values ─────────────────────────────────────
    // Rule: only write a typed column when its source data is explicitly in this patch.
    // This prevents a partial patch from zeroing out values set by an earlier full patch.

    // heritage_save_value: authoritative source is FBB (saveBevaringsvaerdi is always null)
    if (patch.fbbData !== undefined) {
      const saveVal = patch.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
      // FBB returns -1 for "not SAVE-registered" — store as null
      update.heritage_save_value = saveVal !== null && saveVal >= 1 ? saveVal : null;
    }

    // is_fredet: SaveData.fredet is the authoritative live check (DAI WFS)
    // Fall back to BBR byg070 flag if SaveData not in this patch
    if (patch.save !== undefined) {
      update.is_fredet = patch.save?.fredet ?? null;
    } else if (patch.bbrData !== undefined) {
      update.is_fredet = patch.bbrData?.fredet ?? null;
    }

    // grundareal_m2 and bebygget_areal_m2: from BBR/MAT
    if (patch.bbrData !== undefined && patch.bbrData !== null) {
      update.grundareal_m2 = patch.bbrData.grundareal;
      update.bebygget_areal_m2 = patch.bbrData.bebygget_areal;
    }

    // ── Aggregate hard_stop flag ─────────────────────────────────────────────
    // Re-compute every time compliance data arrives so the flag stays current.
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

  if (Object.keys(update).length === 0) return;

  const { error } = await supabaseAdmin.from("projects").update(update).eq("id", id);

  if (error) {
    throw new Error(`[Persistence] update fejlede: ${error.message}`);
  }

  // ── Auto-generate building tasks from compliance triggers ─────────────────
  // Run after the project write so task generation never blocks the main save.
  if (hasComplianceData) {
    const soilContamination = deriveSoilContaminationStatus(patch.dkjord);
    const saveVal = (update.heritage_save_value as number | null | undefined) ?? null;
    const isFredetVal = (update.is_fredet as boolean | null | undefined) ?? null;

    await syncBuildingTasks({
      projectId: id,
      saveValue: saveVal,
      isFredet: isFredetVal,
      strandbeskyttelse: patch.bbrData?.mat_strandbeskyttelse ?? null,
      fredskov: patch.bbrData?.mat_fredskov ?? null,
      klitfredning: patch.bbrData?.mat_klitfredning ?? null,
      soilContamination,
    });
  }
}

// ---------------------------------------------------------------------------
// loadProject: hent seneste projekt for bruger
// ---------------------------------------------------------------------------

export async function loadProject(
  accessToken: string,
  projectId?: string | null,
): Promise<PersistedProject | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;

  let query = supabaseAdmin
    .from("projects")
    .select(
      "id, address_full, address_kommune, address_matrikel, address_bbr, address_adresseid, address_postnr, address_postnrnavn, address_koordinater, address_ejerlavskode, address_matrikelnummer, compliance_data, brief_data, compliance_done, current_step, project_data_status, heritage_save_value, is_fredet, grundareal_m2, bebygget_areal_m2, hard_stop, hard_stop_reason",
    )
    .eq("user_id", userId);

  if (projectId?.trim()) {
    query = query.eq("id", projectId);
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
