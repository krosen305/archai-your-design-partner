import { describe, expect, it } from "bun:test";
import { TinglysningService } from "./client";

describe("TinglysningService.getServitutter", () => {
  it("returns empty for missing address id", async () => {
    const result = await TinglysningService.getServitutter("");
    expect(result.servitutter).toHaveLength(0);
    expect(result.pant).toBe(0);
  });

  it("returns deterministic mock when mock flag is enabled", async () => {
    const result = await TinglysningService.getServitutter("addr-1");
    expect(result.kilde).toBe("mock");
    expect(result.servitutter.length).toBeGreaterThan(0);
  });
});
