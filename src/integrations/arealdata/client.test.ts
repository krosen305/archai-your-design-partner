import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ArealdataService } from "./client";

// GeoServer/Grukos JSON mock
function featureJson(totalFeatures: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ totalFeatures, features: [] }),
  } as unknown as Response;
}

function errorResponse(status = 500): Response {
  return { ok: false, status } as unknown as Response;
}

// URL-based mock dispatcher — returns response based on substring in URL
function urlMock(map: Record<string, Response>, fallback: Response): typeof fetch {
  return mock(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [key, res] of Object.entries(map)) {
      if (url.includes(key)) return res;
    }
    return fallback;
  }) as unknown as typeof fetch;
}

describe("ArealdataService.getContext", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returnerer status=ok med confirmed confidence når alle live lag lykkes", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: featureJson(0),
        habitat_omr: featureJson(0),
        fugle_bes_omr: featureJson(0),
        ramsar_omr: featureJson(0),
        bes_sten_jorddiger: featureJson(0),
        status_bnbo: featureJson(0),
        drikkevandsinteresser: featureJson(0),
        raastofomr: featureJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.paragraph3Nature).toBe(false);
    expect(result.data?.natura2000).toBe(false);
    expect(result.data?.osd).toBe(false);
    // fortidsminde/fortidsmindeBuffer er altid null (ingen endpoint)
    expect(result.data?.fortidsminde).toBeNull();
    expect(result.data?.fortidsmindeBuffer).toBeNull();
  });

  it("returnerer natura2000=true når fugle_bes_omr har features (OR-logik)", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: featureJson(0),
        habitat_omr: featureJson(0),
        fugle_bes_omr: featureJson(1), // hit på fugle
        ramsar_omr: featureJson(0),
        bes_sten_jorddiger: featureJson(0),
        status_bnbo: featureJson(0),
        drikkevandsinteresser: featureJson(0),
        raastofomr: featureJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.5, lng: 8.1 });

    expect(result.status).toBe("ok");
    expect(result.data?.natura2000).toBe(true);
  });

  it("returnerer osd=true via Grukos endpoint (wkb_geometry)", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: featureJson(0),
        habitat_omr: featureJson(0),
        fugle_bes_omr: featureJson(0),
        ramsar_omr: featureJson(0),
        bes_sten_jorddiger: featureJson(0),
        status_bnbo: featureJson(0),
        drikkevandsinteresser: featureJson(1), // OSD hit
        raastofomr: featureJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.75, lng: 12.45 });

    expect(result.status).toBe("ok");
    expect(result.data?.osd).toBe(true);
  });

  it("returnerer fortidsminde=null og fortidsmindeBuffer=null altid", async () => {
    globalThis.fetch = urlMock({}, featureJson(0));

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.data?.fortidsminde).toBeNull();
    expect(result.data?.fortidsmindeBuffer).toBeNull();
  });

  it("returnerer confidence=unknown når et live lag fejler (paragraph3Nature)", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: errorResponse(503), // paragraph3 fejler
        habitat_omr: featureJson(0),
        fugle_bes_omr: featureJson(0),
        ramsar_omr: featureJson(0),
        bes_sten_jorddiger: featureJson(0),
        status_bnbo: featureJson(0),
        drikkevandsinteresser: featureJson(0),
        raastofomr: featureJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("unknown");
    expect(result.data?.paragraph3Nature).toBeNull();
  });

  it("returnerer status=error når alle live lag fejler", async () => {
    globalThis.fetch = mock(async () => errorResponse(503)) as unknown as typeof fetch;

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("error");
  });
});
