// src/integrations/ai/gateway.test.ts
import { describe, it, expect } from "bun:test";
import { extractStructuredOutput } from "./gateway";
import { z } from "zod";

const TestSchema = z.object({ result: z.string(), score: z.number() });

describe("extractStructuredOutput", () => {
  it("parses plain JSON", () => {
    const out = extractStructuredOutput(TestSchema, '{"result":"ok","score":5}');
    expect(out).toEqual({ result: "ok", score: 5 });
  });

  it("parses JSON inside a markdown code fence", () => {
    const out = extractStructuredOutput(
      TestSchema,
      'Here is the analysis:\n```json\n{"result":"ok","score":5}\n```',
    );
    expect(out).toEqual({ result: "ok", score: 5 });
  });

  it("throws for invalid JSON", () => {
    expect(() => extractStructuredOutput(TestSchema, "not json")).toThrow();
  });

  it("throws for JSON that fails schema validation", () => {
    expect(() =>
      extractStructuredOutput(TestSchema, '{"result":"ok","score":"not-a-number"}'),
    ).toThrow();
  });
});
