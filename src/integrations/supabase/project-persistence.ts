// SERVER-SIDE ONLY — bruger supabaseAdmin (service role).
// Gem og gendan wizard-state i `projects`-tabellen.
//
// Kun for indloggede brugere — gæster returnerer null/no-op uden fejl.
// Access token verificeres server-side via Supabase auth.getUser().

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { Json, Database } from '@/integrations/supabase/types';

type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
import type { Address, HusDna, ComplianceFlag } from '@/lib/project-store';
import type { Lokalplan, Kommuneplanramme } from '@/integrations/plandata/client';
import type { BbrKompliantData } from '@/integrations/bbr/client';

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type ProjectPatch = {
  address?: Address;
  bbrData?: BbrKompliantData | null;
  husDna?: HusDna | null;
  complianceFlags?: ComplianceFlag[];
  lokalplaner?: Lokalplan[];
  kommuneplanramme?: Kommuneplanramme | null;
  complianceDone?: boolean;
  currentStep?: string;
};

export type PersistedProject = {
  id: string;
  address_full: string | null;
  address_kommune: string | null;
  address_matrikel: string | null;
  address_bbr: string | null;
  compliance_data: Json | null;
  brief_data: Json | null;
  compliance_done: boolean;
  current_step: string;
};

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
  // Prøv at finde eksisterende projekt
  const { data: existing } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Opret nyt projekt
  const { data: created, error } = await supabaseAdmin
    .from('projects')
    .insert({ user_id: userId, current_step: 'adresse' })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`[Persistence] kunne ikke oprette projekt: ${error?.message}`);
  }
  return created.id;
}

// ---------------------------------------------------------------------------
// saveProject: gem state-patch til Supabase
// ---------------------------------------------------------------------------

export async function saveProject(
  accessToken: string,
  patch: ProjectPatch
): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) return; // Gæst — no-op

  const projectId = await getOrCreateProject(userId);

  const update: ProjectUpdate = {};

  if (patch.address !== undefined) {
    update.address_full = patch.address.adresse;
    update.address_kommune = patch.address.kommune;
    update.address_matrikel = patch.address.matrikel;
    update.address_bbr = patch.address.adgangsadresseid;
  }

  if (patch.husDna !== undefined) {
    update.brief_data = patch.husDna;
  }

  if (patch.bbrData !== undefined || patch.complianceFlags !== undefined || patch.lokalplaner !== undefined) {
    update.compliance_data = {
      bbr: patch.bbrData ?? null,
      flags: patch.complianceFlags ?? [],
      lokalplaner: patch.lokalplaner ?? [],
    };
  }

  if (patch.complianceDone !== undefined) {
    update.compliance_done = patch.complianceDone;
  }

  if (patch.currentStep !== undefined) {
    update.current_step = patch.currentStep;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabaseAdmin
    .from('projects')
    .update(update)
    .eq('id', projectId);

  if (error) {
    throw new Error(`[Persistence] update fejlede: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// loadProject: hent seneste projekt for bruger
// ---------------------------------------------------------------------------

export async function loadProject(
  accessToken: string
): Promise<PersistedProject | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, address_full, address_kommune, address_matrikel, address_bbr, compliance_data, brief_data, compliance_done, current_step')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[Persistence] loadProject fejlede:', error.message);
    return null;
  }

  return data ?? null;
}
