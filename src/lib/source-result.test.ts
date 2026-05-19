import { describe, expect, it } from "bun:test";
import {
  makeOkResult,
  makeErrorResult,
  makeMockResult,
  summarizeSourceResult,
} from "./source-result";
import type { SourceResult } from "./source-result";

type TestPayload = {
  value: boolean | null;
  label: string | null;
};

describe("makeOkResult", () => {
  it("returns status=ok with data", () => {
    const r = makeOkResult<TestPayload>(
      { value: true, label: "test" },
      { kilde: "test-source", sourceUrl: "https://example.com", rawFeatureCount: 1 },
    );
    expect(r.status).toBe("ok");
    expect(r.data).toEqual({ value: true, label: "test" });
    expect(r.isMock).toBe(false);
    expect(r.confidence).toBe("confirmed");
    expect(r.kilde).toBe("test-source");
    expect(r.rawFeatureCount).toBe(1);
  });

  it("preserves null values in data — does not coerce null to false", () => {
    const r = makeOkResult<TestPayload>(
      { value: null, label: null },
      { kilde: "test", sourceUrl: null, rawFeatureCount: 0 },
    );
    expect(r.data?.value).toBeNull();
    expect(r.data?.value === false).toBe(false);
  });
});

describe("makeErrorResult", () => {
  it("returns status=error with data=null", () => {
    const r = makeErrorResult<TestPayload>(new Error("timeout"), {
      kilde: "test-source",
      sourceUrl: "https://example.com",
    });
    expect(r.status).toBe("error");
    expect(r.data).toBeNull();
    expect(r.isMock).toBe(false);
    expect(r.confidence).toBe("unknown");
  });

  it("handles non-Error thrown values", () => {
    const r = makeErrorResult<TestPayload>("string error", {
      kilde: "test",
      sourceUrl: null,
    });
    expect(r.status).toBe("error");
    expect(r.data).toBeNull();
  });
});

describe("makeMockResult", () => {
  it("returns status=mock with isMock=true", () => {
    const r = makeMockResult<TestPayload>(
      { value: false, label: "mock" },
      { kilde: "test-source", sourceUrl: null, rawFeatureCount: 0 },
    );
    expect(r.status).toBe("mock");
    expect(r.isMock).toBe(true);
    expect(r.data).toEqual({ value: false, label: "mock" });
    expect(r.confidence).toBe("estimated");
  });
});

describe("summarizeSourceResult", () => {
  it("formats status and feature count", () => {
    const r = makeOkResult<TestPayload>(
      { value: true, label: "x" },
      { kilde: "test", sourceUrl: null, rawFeatureCount: 3 },
    );
    const s = summarizeSourceResult(r);
    expect(s).toContain("status=ok");
    expect(s).toContain("features=3");
    expect(s).toContain("confidence=confirmed");
  });

  it("appends custom data fields when provided", () => {
    const r = makeOkResult<TestPayload>(
      { value: null, label: "foo" },
      { kilde: "test", sourceUrl: null, rawFeatureCount: 0 },
    );
    const s = summarizeSourceResult(r, (d) => `value=${d.value} label=${d.label}`);
    expect(s).toContain("value=null");
    expect(s).toContain("label=foo");
  });

  it("includes isMock=true when mock", () => {
    const r = makeMockResult<TestPayload>(
      { value: false, label: null },
      { kilde: "test", sourceUrl: null, rawFeatureCount: 0 },
    );
    const s = summarizeSourceResult(r);
    expect(s).toContain("mock=true");
  });
});
