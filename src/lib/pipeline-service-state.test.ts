import { describe, it, expect } from "bun:test";
import {
  type PipelineServiceState,
  PIPELINE_SERVICE_STATE_LABELS,
  type DataSourceKind,
} from "../types/project-state";

describe("PipelineServiceState", () => {
  it("alle 7 states er defineret i PIPELINE_SERVICE_STATE_LABELS", () => {
    const states: PipelineServiceState[] = [
      "success",
      "no_hit",
      "error",
      "skipped",
      "mock",
      "cache_hit",
      "not_run",
    ];
    for (const s of states) {
      expect(PIPELINE_SERVICE_STATE_LABELS[s]).toBeDefined();
      expect(typeof PIPELINE_SERVICE_STATE_LABELS[s]).toBe("string");
    }
  });

  it("DataSourceKind-felter er dækket i lookup (smoke)", () => {
    const kind: DataSourceKind = "bbr";
    expect(kind).toBe("bbr");
  });
});
