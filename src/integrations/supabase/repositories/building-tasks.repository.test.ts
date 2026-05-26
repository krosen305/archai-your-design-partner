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
  landzonePermitRequired: null,
  lokalplanByggefeltPresent: null,
  withinBuildingField: null,
  wastewaterPlanStatus: null,
  sewerAreaType: null,
  paragraph3Nature: null,
  natura2000: null,
  protectedDige: null,
  fortidsminde: null,
  fortidsmindeBuffer: null,
  bnbo: null,
  osd: null,
  rawMaterialArea: null,
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

  it("SAVE 3 creates SAVE_DISPENSATION as blocked", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, saveValue: 3 });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.SAVE_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("SAVE 4 creates SAVE_4_PARAGRAPH14 as pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, saveValue: 4 });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.SAVE_4_PARAGRAPH14);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("SAVE 4 does not create SAVE_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, saveValue: 4 });
    const dispensation = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.SAVE_DISPENSATION);
    expect(dispensation).toBeUndefined();
  });

  it("isFredet=true creates FREDNING_JURIDISK as blocked", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, isFredet: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.FREDNING_JURIDISK);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("strandbeskyttelse=true creates STRANDBESKYTTELSE_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, strandbeskyttelse: true });
    const task = tasks.find(
      (t) => t.task_key === BUILDING_TASK_KEYS.STRANDBESKYTTELSE_DISPENSATION,
    );
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("fredskov=true creates FREDSKOV_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, fredskov: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.FREDSKOV_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("klitfredning=true creates KLITFREDNING_DISPENSATION", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, klitfredning: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.KLITFREDNING_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("landzonePermitRequired=true creates LANDZONE_TILLADELSE", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, landzonePermitRequired: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.LANDZONE_TILLADELSE);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("outside building field creates BYGGEFELT_DISPENSATION", () => {
    const tasks = deriveAutoTasks({
      ...baseTriggers,
      lokalplanByggefeltPresent: true,
      withinBuildingField: false,
    });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.BYGGEFELT_DISPENSATION);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("wastewater context creates KLOAK_NEDSIVNING_AFKLARING", () => {
    const tasks = deriveAutoTasks({
      ...baseTriggers,
      wastewaterPlanStatus: "Vedtaget",
      sewerAreaType: "Separatkloakeret",
    });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("paragraph3Nature=true creates PARAGRAF3_AFKLARING", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, paragraph3Nature: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.PARAGRAF3_AFKLARING);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("protectedDige=true creates DIGE_BESKYTTELSE", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, protectedDige: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.DIGE_BESKYTTELSE);
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("fortidsmindeBuffer=true creates FORTIDSMINDE_AFKLARING", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, fortidsmindeBuffer: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.FORTIDSMINDE_AFKLARING);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("natura2000, bnbo and rawMaterialArea create screening tasks", () => {
    const tasks = deriveAutoTasks({
      ...baseTriggers,
      natura2000: true,
      bnbo: true,
      rawMaterialArea: true,
    });
    expect(tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.NATURA2000_AFKLARING)).toBeDefined();
    expect(tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.BNBO_OSD_AFKLARING)).toBeDefined();
    expect(tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.RAASTOF_AFKLARING)).toBeDefined();
  });

  it("jordforureningV2=true creates JORDFORURENING_V2_UNDERSOEGELSE as blocked", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningV2: true });
    const task = tasks.find(
      (t) => t.task_key === BUILDING_TASK_KEYS.JORDFORURENING_V2_UNDERSOEGELSE,
    );
    expect(task).toBeDefined();
    expect(task!.status).toBe("blocked");
  });

  it("jordforureningV1=true creates JORDFORURENING_V1_SCREENING as pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningV1: true });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.JORDFORURENING_V1_SCREENING);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("omraadeklassificering creates JORDFLYTNING_ATTEST as pending", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, omraadeklassificering: "Klasse B" });
    const task = tasks.find((t) => t.task_key === BUILDING_TASK_KEYS.JORDFLYTNING_ATTEST);
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
  });

  it("soilContamination=unknown creates MILJOEUNDERSOEGELSE as pending", () => {
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
