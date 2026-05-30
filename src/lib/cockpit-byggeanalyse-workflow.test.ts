import { describe, expect, it, mock } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { runCockpitByggeanalyseWorkflow } from "@/lib/cockpit-byggeanalyse-workflow";

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

describe("runCockpitByggeanalyseWorkflow", () => {
  it("returns auth_error when no session exists", async () => {
    const result = await runCockpitByggeanalyseWorkflow(
      {
        projectId: "6db887cf-2e30-45ca-a47b-a59e3d72f478",
        byggeoenske: { byggetype: "nybyg" },
      },
      {
        getSession: async () => null,
        runByggeanalyse: mock(async () => {
          throw new Error("should not run");
        }) as never,
      },
    );

    expect(result).toEqual({ status: "auth_error" });
  });

  it("returns no_project when project id is missing", async () => {
    const result = await runCockpitByggeanalyseWorkflow(
      {
        projectId: null,
        byggeoenske: { byggetype: "nybyg" },
      },
      {
        getSession: async () => makeSession(),
        runByggeanalyse: mock(async () => {
          throw new Error("should not run");
        }) as never,
      },
    );

    expect(result).toEqual({ status: "no_project" });
  });

  it("returns stripped analyse payload on ok", async () => {
    const runByggeanalyseMock = mock(async ({ data }: { data: Record<string, unknown> }) => ({
      status: "ok" as const,
      tilladt: [],
      kraever_dispensation: [],
      konflikt: [],
      mangler_data: [],
      stilOpsummering: "Moderne traehus",
      kilde: "mock" as const,
      requestEcho: data,
    }));

    const result = await runCockpitByggeanalyseWorkflow(
      {
        projectId: "6db887cf-2e30-45ca-a47b-a59e3d72f478",
        byggeoenske: { byggetype: "nybyg", oensketAreal: 180 },
      },
      {
        getSession: async () => makeSession(),
        runByggeanalyse: runByggeanalyseMock as never,
      },
    );

    expect(runByggeanalyseMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "ok",
      analyse: {
        tilladt: [],
        kraever_dispensation: [],
        konflikt: [],
        mangler_data: [],
        stilOpsummering: "Moderne traehus",
        kilde: "mock",
        requestEcho: {
          projectId: "6db887cf-2e30-45ca-a47b-a59e3d72f478",
          accessToken: "token-123",
          byggeoenske: { byggetype: "nybyg", oensketAreal: 180 },
        },
      },
    });
  });
});
