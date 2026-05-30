import { describe, expect, it, mock } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { runCockpitComplianceWorkflow } from "@/lib/cockpit-compliance-workflow";
import type { Address } from "@/types/project-state";

const ADDRESS: Address = {
  adresseid: "addr-1",
  adgangsadresseid: "adg-1",
  adresse: "Testvej 1",
  postnr: "2800",
  postnrnavn: "Kongens Lyngby",
  kommune: "Lyngby-Taarbaek",
  kommunekode: "173",
  matrikel: null,
  koordinater: { lat: 55.77, lng: 12.5 },
  bbrId: null,
  ejerlavskode: 12345,
  matrikelnummer: "5fo",
  grundareal: 441,
};

function makeSession(): Session {
  return {
    access_token: "token-123",
    refresh_token: "refresh-123",
    expires_in: 3600,
    expires_at: 123456,
    token_type: "bearer",
    user: {
      id: "user-1",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-05-30T10:00:00Z",
    },
  } as Session;
}

describe("runCockpitComplianceWorkflow", () => {
  it("returns guest-specific auth error when no session exists", async () => {
    const result = await runCockpitComplianceWorkflow(
      { address: ADDRESS, projectId: "proj-1" },
      {
        fetchCompliance: mock(async () => {
          throw new Error("should not run");
        }) as never,
        getSession: async () => null,
        isGuest: () => true,
      },
    );

    expect(result).toEqual({
      status: "auth_error",
      message: "Start fra adresse-trinnet som gaest for at hente grunddata.",
    });
  });

  it("calls fetchCompliance with address payload and projectId when session exists", async () => {
    const fetchComplianceMock = mock(async ({ data }: { data: Record<string, unknown> }) => ({
      bbr: null,
      lokalplaner: [],
      kommuneplanramme: null,
      analysedAt: "2026-05-30T10:00:00Z",
      lokalplanExtract: null,
      naturbeskyttelse: null,
      dkjord: null,
      geusRisk: null,
      servitutter: null,
      terrain: null,
      naboer: null,
      fjernvarme: null,
      fbbData: null,
      plandataContext: null,
      arealdataContext: null,
      matGeometri: null,
      vurderingData: null,
      tjekditnetCoverage: null,
      energimaerke: null,
      requestEcho: data,
    }));

    const result = await runCockpitComplianceWorkflow(
      { address: ADDRESS, projectId: "proj-1" },
      {
        fetchCompliance: fetchComplianceMock as never,
        getSession: async () => makeSession(),
        isGuest: () => false,
      },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(fetchComplianceMock).toHaveBeenCalledTimes(1);
    expect(result.result.requestEcho).toEqual({
      addressId: "addr-1",
      adgangsadresseid: "adg-1",
      ejerlavskode: 12345,
      matrikelnummer: "5fo",
      koordinater: { lat: 55.77, lng: 12.5 },
      grundareal: 441,
      projectId: "proj-1",
      token: "token-123",
    });
  });
});
