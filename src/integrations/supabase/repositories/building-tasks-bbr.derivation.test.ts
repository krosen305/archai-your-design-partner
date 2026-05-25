import { describe, expect, it } from "bun:test";
import { deriveAutoTasks } from "@/integrations/supabase/repositories/building-tasks.derivation";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";

const baseProject = "project-uuid-123";

const baseTriggers = {
  projectId: baseProject,
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
  jordforureningOlietank: null,
  bbrAfloebsforholdKode: null,
  bbrSaneringsRisiko: null,
} as const;

describe("ARCH-246 building tasks", () => {
  it("generates OLIETANK_MILJOESCREENING when olietank is true", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningOlietank: true });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING);
  });

  it("does NOT generate OLIETANK_MILJOESCREENING when olietank is false", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningOlietank: false });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING);
  });

  it("does NOT generate OLIETANK_MILJOESCREENING when olietank is null (unknown)", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningOlietank: null });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING);
  });

  it("generates ASBEST_PCB_SCREENING when saneringsrisiko is hoej", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrSaneringsRisiko: "hoej" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING);
  });

  it("generates ASBEST_PCB_SCREENING when saneringsrisiko is moderat", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrSaneringsRisiko: "moderat" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING);
  });

  it("does NOT generate ASBEST_PCB_SCREENING when saneringsrisiko is lav", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrSaneringsRisiko: "lav" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING);
  });

  it("generates KLOAK_NEDSIVNING_AFKLARING when afloebsforhold is nedsivning (kode 4)", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrAfloebsforholdKode: "4" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING);
  });

  it("does NOT generate KLOAK_NEDSIVNING_AFKLARING for fælleskloak (kode 1)", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrAfloebsforholdKode: "1" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING);
  });
});
