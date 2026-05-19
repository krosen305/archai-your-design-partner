// src/lib/analysis-tracing.test.ts
import { describe, it, expect } from "bun:test";
import { traceStep, recordAnalysisEvent, type AnalysisTraceContext } from "./analysis-tracing";

describe("analysis-tracing: summary fields", () => {
  it("traceStep accepts outputSummary callback and returns value", async () => {
    const fn = async () => "hello";
    const result = await traceStep(
      null, // null trace → no DB write, no error
      { eventType: "pipeline_step", service: "TEST", operation: "op" },
      fn,
      { outputSummary: (v: string) => `result=${v}` },
    );
    expect(result).toBe("hello");
  });

  it("recordAnalysisEvent accepts inputSummary, outputSummary, decisionSummary without error", async () => {
    await expect(
      recordAnalysisEvent(null, {
        eventType: "pipeline_step",
        service: "BBR",
        operation: "getKompliantData",
        inputSummary: "adresseid=abc",
        outputSummary: "grundareal=441",
        decisionSummary: null,
      }),
    ).resolves.toBeUndefined();
  });
});
