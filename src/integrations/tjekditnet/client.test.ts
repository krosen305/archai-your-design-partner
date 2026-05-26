// Tests for TjekditnetService — mocks Supabase, does NOT hit live DB.
import { describe, expect, it, mock, beforeEach } from "bun:test";

// Mock the Supabase admin client before importing the service
const mockMaybeSingle = mock(async () => ({ data: null, error: null }));
const mockEq = mock(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = mock(() => ({ eq: mockEq }));
const mockFrom = mock(() => ({ select: mockSelect }));

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mockFrom },
}));

// Import after mocking
const { TjekditnetService } = await import("@/integrations/tjekditnet/client");

const FIBER_ROW = {
  adgangsadresse_id: "test-uuid",
  fiber_download_mbit: 1000,
  fiber_upload_mbit: 500,
  kabel_tv_download_mbit: null,
  kabel_tv_upload_mbit: null,
  xdsl_download_mbit: null,
  xdsl_upload_mbit: null,
  fast_traadloes_download_mbit: null,
  fast_traadloes_upload_mbit: null,
  mobil_download_mbit: 300,
  source_url: "https://tjekditnet.dk/sites/default/files/raadata/tek.zip",
  imported_at: "2026-01-01T00:00:00Z",
};

const NO_COVERAGE_ROW = {
  adgangsadresse_id: "test-uuid-2",
  fiber_download_mbit: 0,
  fiber_upload_mbit: 0,
  kabel_tv_download_mbit: 0,
  kabel_tv_upload_mbit: 0,
  xdsl_download_mbit: 0,
  xdsl_upload_mbit: 0,
  fast_traadloes_download_mbit: 0,
  fast_traadloes_upload_mbit: 0,
  mobil_download_mbit: 0,
  source_url: null,
  imported_at: "2026-01-01T00:00:00Z",
};

describe("TjekditnetService.getCoverage", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockMaybeSingle.mockImplementation(async () => ({ data: null, error: null }));
  });

  it("returns confirmed ok result with fiber when row exists", async () => {
    mockMaybeSingle.mockImplementation(async () => ({ data: FIBER_ROW, error: null }));

    const result = await TjekditnetService.getCoverage("test-uuid");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.fiber_download_mbit).toBe(1000);
    expect(result.data?.fiber_tilgaengelig).toBe(true);
    expect(result.data?.max_fast_download_mbit).toBe(1000);
    expect(result.data?.match_type).toBe("uuid");
    expect(result.data?.kilde).toBe("tjekditnet");
  });

  it("returns ok with no_hit when address not in DB", async () => {
    mockMaybeSingle.mockImplementation(async () => ({ data: null, error: null }));

    const result = await TjekditnetService.getCoverage("unknown-uuid");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("missing");
    expect(result.data?.match_type).toBe("no_hit");
    expect(result.data?.fiber_tilgaengelig).toBeNull();
    // no_hit must NOT return false — that would mean "no coverage" instead of "unknown"
  });

  it("marks fiber_tilgaengelig=false when fiber speed is 0 (coverage mapped but zero speed)", async () => {
    mockMaybeSingle.mockImplementation(async () => ({ data: NO_COVERAGE_ROW, error: null }));

    const result = await TjekditnetService.getCoverage("test-uuid-2");

    expect(result.status).toBe("ok");
    expect(result.data?.fiber_tilgaengelig).toBe(false);
    expect(result.data?.max_fast_download_mbit).toBeNull();
  });

  it("returns error result on DB error — does NOT map to no_hit", async () => {
    mockMaybeSingle.mockImplementation(async () => ({
      data: null,
      error: { message: "DB connection failed" },
    }));

    const result = await TjekditnetService.getCoverage("test-uuid");

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    expect(result.confidence).toBe("unknown");
  });

  it("computes max_fast_download_mbit as best across all fixed technologies", async () => {
    const row = {
      ...FIBER_ROW,
      fiber_download_mbit: 100,
      kabel_tv_download_mbit: 300,
      xdsl_download_mbit: 50,
      fast_traadloes_download_mbit: 150,
    };
    mockMaybeSingle.mockImplementation(async () => ({ data: row, error: null }));

    const result = await TjekditnetService.getCoverage("test-uuid");

    expect(result.data?.max_fast_download_mbit).toBe(300);
  });
});
