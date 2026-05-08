import { describe, it, expect } from "bun:test";
import { SaveService } from "./client";

// IS_MOCK=true — alle tests kører mod mock-implementationen

describe("SaveService (IS_MOCK=true)", () => {
  it("returnerer fredet=false og saveBevaringsvaerdi=null for alle koordinater", async () => {
    const result = await SaveService.getBevaringsdata({ lat: 55.676, lng: 12.568 });
    expect(result.fredet).toBe(false);
    expect(result.saveBevaringsvaerdi).toBeNull();
    expect(result.kilde).toBe("mock");
  });

  it("returnerer samme mock-data uanset koordinater", async () => {
    const r1 = await SaveService.getBevaringsdata({ lat: 55.0, lng: 10.0 });
    const r2 = await SaveService.getBevaringsdata({ lat: 57.0, lng: 9.0 });
    expect(r1).toEqual(r2);
  });
});
