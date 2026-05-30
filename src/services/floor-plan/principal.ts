// src/services/floor-plan/principal.ts
//
// Typed principal for floor-plan application services (spec §24.6). Inbound
// adapters translate Supabase sessions, REST auth or background jobs into this
// shape; authorization is enforced at the service boundary, never in React.

export type FloorPlanPrincipal = {
  subjectId: string;
  subjectKind: "user" | "organization" | "api_key" | "service_account";
  projectRole: "owner" | "editor" | "viewer" | "service";
};

const ROLES_CAN_EDIT: ReadonlySet<FloorPlanPrincipal["projectRole"]> = new Set([
  "owner",
  "editor",
  "service",
]);

export function assertCanVerify(principal: FloorPlanPrincipal): void {
  if (!ROLES_CAN_EDIT.has(principal.projectRole)) {
    throw new Error(`Rolle "${principal.projectRole}" må ikke køre verifikation.`);
  }
}

export function assertCanEdit(principal: FloorPlanPrincipal): void {
  if (!ROLES_CAN_EDIT.has(principal.projectRole)) {
    throw new Error(`Rolle "${principal.projectRole}" må ikke redigere plantegningen.`);
  }
}

/**
 * Translate a verified project ownership into a typed principal. Inbound
 * adapters call this after resolving the Supabase user; non-owners are rejected
 * with a 403 before any service runs (server authority, Rule 4).
 */
export function buildOwnerPrincipal(userId: string, isOwner: boolean): FloorPlanPrincipal {
  if (!isOwner) {
    throw new Response("Forbudt: ingen adgang til projektet", { status: 403 });
  }
  return { subjectId: userId, subjectKind: "user", projectRole: "owner" };
}
