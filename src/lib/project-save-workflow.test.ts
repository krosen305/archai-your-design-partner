import { describe, expect, it, mock } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { runProjectSaveWorkflow } from "@/lib/project-save-workflow";

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

describe("runProjectSaveWorkflow", () => {
  it("does nothing when no session exists", async () => {
    const saveProjectPatchMock = mock(async () => {});

    await runProjectSaveWorkflow(
      {
        patch: { complianceDone: false },
        projectId: "proj-1",
      },
      {
        getSession: async () => null,
        saveProjectPatch: saveProjectPatchMock as never,
      },
    );

    expect(saveProjectPatchMock).not.toHaveBeenCalled();
  });

  it("passes access token and project id to saveProjectPatch", async () => {
    const saveProjectPatchMock = mock(async () => {});

    await runProjectSaveWorkflow(
      {
        patch: { complianceDone: false },
        projectId: "proj-1",
      },
      {
        getSession: async () => makeSession(),
        saveProjectPatch: saveProjectPatchMock as never,
      },
    );

    expect(saveProjectPatchMock).toHaveBeenCalledTimes(1);
    expect(saveProjectPatchMock).toHaveBeenCalledWith(
      { complianceDone: false },
      {
        accessToken: "token-123",
        projectId: "proj-1",
      },
    );
  });
});
