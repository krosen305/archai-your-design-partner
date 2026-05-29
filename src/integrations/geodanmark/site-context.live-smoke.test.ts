import { describe, expect, it } from "bun:test";
import { GeoDanmarkSiteContextService } from "./site-context";

const LIVE = process.env.RUN_LIVE_GEODANMARK_SMOKE === "true";
const describeLive = LIVE ? describe : describe.skip;

describeLive("GeoDanmarkSiteContextService live smoke", () => {
  it("returns a typed SourceResult from GEODKV GraphQL", async () => {
    const result = await GeoDanmarkSiteContextService.getSiteContext(
      {
        bbox25832: [724000, 6172000, 724200, 6172200],
        first: 10,
      },
      { mock: false },
    );

    expect(result.status).toBe("ok");
    expect(result.isMock).toBe(false);
    expect(result.kilde).toBe("geodanmark_nabo");
    expect(result.data?.coverage).toBe("covered");
    expect(result.rawFeatureCount).toBeTypeOf("number");
  });
});
