// Unit tests for deriveAutoTasks.
// No Supabase client, no env vars required.

import { describe, it, expect } from "bun:test";
import { deriveAutoTasks, type ComplianceTriggers } from "./building-tasks.derivation";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";

const baseTriggers: ComplianceTriggers = {
  projectId: "project-1",
  saveValue: null,
  isFredet: null,
  strandbeskyttelse: null,
  fredskov: null,
  klitfredning: null,
  soilContamination: null,
  jordforureningV1: null,
  jordforureningV2: null,
  omraadeklassificering: null,
};

describe("deriveAutoTasks", () => {
  it("returns empty array for clean triggers", () => {
    const tasks = deriveAutoTasks(baseTriggers);
    expect(tasks).toEqual([]);
  });

  it("SAVE 3 → task key SAVE_DISPENSATION with status blocked", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, saveValue: 3 });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.SAVE_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("SAVE 4 → task key SAVE_4_PARAGRAPH14 with status pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, saveValue: 4 });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.SAVE_4_PARAGRAPH14);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("SAVE 4 does NOT produce SAVE_DISPENSATION task", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, saveValue: 4 });
    const dispensation = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.SAVE_DISPENSATION);
    expect(dispensation).toBeUndefined();
  });

  it("isFredet=true → task key FREDNING_JURIDISK with status blocked", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, isFredet: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.FREDNING_JURIDISK);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("strandbeskyttelse=true → task key STRANDBESKYTTELSE_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, strandbeskyttelse: true });
    const task = tasks.find(
      (t) => t.task_key === BUILDING_TASK_KEYS.STRANDBESKYTTELSE_DISPENSATION,
    );
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("fredskov=true → task key FREDSKOV_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, fredskov: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.FREDSKOV_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("klitfredning=true → task key KLITFREDNING_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, klitfredning: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.KLITFREDNING_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("jordforureningV2=true → task key JORDFORURENING_V2_UNDERSOEGELSE with status blocked", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningV2: true });
    const task = tasks.find(
      (t) => t.task_key === BUILDING_TASK_KEYS.JORDFORURENING_V2_UNDERSOEGELSE,
    );
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("jordforureningV1=true → task key JORDFORURENING_V1_SCREENING with status pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningV1: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.JORDFORURENING_V1_SCREENING);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("omraadeklassificering set → task key JORDFLYTNING_ATTEST with status pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, omraadeklassificering: "Klasse B" });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.JORDFLYTNING_ATTEST);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("soilContamination=unknown → task key MILJOEUNDERSOEGELSE with status pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, soilContamination: "unknown" });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.MILJOEUNDERSOEGELSE);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("all tasks reference the correct project_id", () => {
    const tasks = deriveAutoTasks({
      ...baseTriggers,
      saveValue: 3,
      isFredet: true,
      jordforureningV2: true,
    });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.project_id).toBe("project-1");
    }
  });
});
