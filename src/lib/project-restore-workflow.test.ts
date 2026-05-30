import { describe, expect, it, mock } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { runProjectRestoreWorkflow } from "@/lib/project-restore-workflow";

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

describe("runProjectRestoreWorkflow", () => {
  it("returns null when no session exists", async () => {
    const loadProjectRestoreMock = mock(async () => {
      throw new Error("should not run");
    });

    const result = await runProjectRestoreWorkflow(
      { projectId: "proj-1", addressId: "addr-1" },
      {
        getSession: async () => null,
        loadProjectRestore: loadProjectRestoreMock as never,
      },
    );

    expect(result).toBeNull();
    expect(loadProjectRestoreMock).not.toHaveBeenCalled();
  });

  it("loads restore payload with access token from session", async () => {
    const project = { id: "proj-1" };
    const loadProjectRestoreMock = mock(async () => project);

    const result = await runProjectRestoreWorkflow(
      { projectId: "proj-1", addressId: "addr-1" },
      {
        getSession: async () => makeSession(),
        loadProjectRestore: loadProjectRestoreMock as never,
      },
    );

    expect(result).toBe(project);
    expect(loadProjectRestoreMock).toHaveBeenCalledTimes(1);
    expect(loadProjectRestoreMock).toHaveBeenCalledWith({
      accessToken: "token-123",
      projectId: "proj-1",
      addressId: "addr-1",
    });
  });
});
