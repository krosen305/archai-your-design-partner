# ARCH-279: rule-engine-input-assembler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/lib/rule-engine/input-assembler.ts` parsing helpers and domain mappers into separate tested modules, leaving the main assembler as pure coordination logic.

**Architecture:** Extract three clusters of functions from `input-assembler.ts` into `parsers.ts` (text → typed value), `mappers.ts` (domain code → domain enum), and `constants.ts` (named magic values). Each gets its own test file. `assembleRuleEngineInput` keeps the main logic and imports from the new modules.

**Tech Stack:** TypeScript, Bun test (bun:test), no new dependencies.

---

## File Map

| Action | File |
|--------|------|
| Create | `src/lib/rule-engine/parsers.ts` |
| Create | `src/lib/rule-engine/parsers.test.ts` |
| Create | `src/lib/rule-engine/mappers.ts` |
| Create | `src/lib/rule-engine/mappers.test.ts` |
| Modify | `src/lib/rule-engine/input-assembler.ts` |

---

### Task 1: Create `parsers.ts` with tests

**Files:**
- Create: `src/lib/rule-engine/parsers.ts`
- Create: `src/lib/rule-engine/parsers.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/rule-engine/parsers.test.ts
import { describe, it, expect } from "bun:test";
import { parseSetbackM, parseRoofTypes, parseZone } from "./parsers";

describe("parseSetbackM", () => {
  it("returns null for null input", () => {
    expect(parseSetbackM(null)).toBeNull();
  });
  it("extracts minimum setback from multi-value string", () => {
    expect(parseSetbackM("2,5 m fra vejskel, 2 m fra naboskel")).toBe(2);
  });
  it("handles single value with decimal comma", () => {
    expect(parseSetbackM("3,5 m")).toBe(3.5);
  });
  it("returns null for string with no meter values", () => {
    expect(parseSetbackM("ingen byggelinjer")).toBeNull();
  });
});

describe("parseRoofTypes", () => {
  it("returns null for null input", () => {
    expect(parseRoofTypes(null)).toBeNull();
  });
  it("detects sadeltag", () => {
    expect(parseRoofTypes("Sadeltag med hældning 25-45°")).toContain("saddeltag");
  });
  it("detects fladt tag", () => {
    expect(parseRoofTypes("Fladt tag tilladt")).toContain("fladt");
  });
  it("detects multiple types", () => {
    const result = parseRoofTypes("Sadeltag eller fladt tag");
    expect(result).toContain("saddeltag");
    expect(result).toContain("fladt");
  });
  it("falls back to trimmed input for unknown types", () => {
    const result = parseRoofTypes("Ukendt tagtype X");
    expect(result).toEqual(["Ukendt tagtype X"]);
  });
});

describe("parseZone", () => {
  it("returns urban for null ramme (dansk standard)", () => {
    expect(parseZone(null)).toBe("urban");
  });
  it("detects byzone", () => {
    expect(parseZone({ fremtidigzonestatus: "Byzone" } as any)).toBe("urban");
  });
  it("detects sommerhuszone", () => {
    expect(parseZone({ fremtidigzonestatus: "Sommerhuszone" } as any)).toBe("summerhouse");
  });
  it("detects landzone", () => {
    expect(parseZone({ fremtidigzonestatus: "Landzone" } as any)).toBe("rural");
  });
  it("returns unknown for unrecognized non-null ramme", () => {
    expect(parseZone({ fremtidigzonestatus: "Ukendt" } as any)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/lib/rule-engine/parsers.test.ts
```

Expected: `Cannot find module './parsers'`

- [ ] **Step 3: Create `parsers.ts`**

```typescript
// src/lib/rule-engine/parsers.ts
// Pure text-to-value parsers for rule engine input assembly.
// These parse free-text localplan fields with confidence < 1.0.

import type { Kommuneplanramme } from "@/integrations/plandata/client";
import type { RuleEngineInput } from "./types";

export function parseSetbackM(byggelinjer: string | null): number | null {
  if (!byggelinjer) return null;
  const normalized = byggelinjer.replace(",", ".");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*m/gi)];
  if (matches.length === 0) return null;
  const vals = matches.map((m) => parseFloat(m[1])).filter((v) => isFinite(v) && v > 0);
  return vals.length > 0 ? Math.min(...vals) : null;
}

export function parseRoofTypes(tagform: string | null): string[] | null {
  if (!tagform) return null;
  const lower = tagform.toLowerCase();
  const types: string[] = [];
  if (lower.includes("sadeltag") || lower.includes("to-fald")) types.push("saddeltag");
  if (lower.includes("fladt") || lower.includes("ensidig")) types.push("fladt");
  if (lower.includes("valm")) types.push("valm");
  if (lower.includes("mansard")) types.push("mansard");
  return types.length > 0 ? types : [tagform.trim()];
}

export function parseZone(ramme: Kommuneplanramme | null): RuleEngineInput["plot"]["zone"] {
  const raw = (ramme?.fremtidigzonestatus ?? "").toUpperCase();
  if (raw.includes("BYZONE") || raw.includes("BY")) return "urban";
  if (raw.includes("SOMMERHUS")) return "summerhouse";
  if (raw.includes("LANDZONE") || raw.includes("LAND")) return "rural";
  return ramme ? "unknown" : "urban";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/lib/rule-engine/parsers.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/parsers.ts src/lib/rule-engine/parsers.test.ts
git commit -m "feat(arch-279): extract parseSetbackM/parseRoofTypes/parseZone into rule-engine/parsers.ts"
```

---

### Task 2: Create `mappers.ts` with tests

**Files:**
- Create: `src/lib/rule-engine/mappers.ts`
- Create: `src/lib/rule-engine/mappers.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/rule-engine/mappers.test.ts
import { describe, it, expect } from "bun:test";
import { mapByggetypeToProjectType, mapUsageFromBbr, mapAntalEtager } from "./mappers";

describe("mapByggetypeToProjectType", () => {
  it("maps nybyg → new_build", () => {
    expect(mapByggetypeToProjectType("nybyg")).toBe("new_build");
  });
  it("maps tilbyg → extension", () => {
    expect(mapByggetypeToProjectType("tilbyg")).toBe("extension");
  });
  it("maps ombyg → renovation", () => {
    expect(mapByggetypeToProjectType("ombyg")).toBe("renovation");
  });
  it("defaults unknown type to new_build", () => {
    expect(mapByggetypeToProjectType(undefined)).toBe("new_build");
  });
});

describe("mapUsageFromBbr", () => {
  it("returns residential for null code", () => {
    expect(mapUsageFromBbr(null)).toBe("residential");
  });
  it("returns residential for code 120", () => {
    expect(mapUsageFromBbr("120")).toBe("residential");
  });
  it("returns garage for code 910", () => {
    expect(mapUsageFromBbr("910")).toBe("garage");
  });
  it("returns commercial for code 320", () => {
    expect(mapUsageFromBbr("320")).toBe("commercial");
  });
  it("returns mixed for unrecognized code", () => {
    expect(mapUsageFromBbr("999")).toBe("mixed");
  });
});

describe("mapAntalEtager", () => {
  it("returns null for undefined", () => {
    expect(mapAntalEtager(undefined)).toBeNull();
  });
  it("rounds up fractional floors", () => {
    expect(mapAntalEtager(1.5)).toBe(2);
  });
  it("returns integer as-is", () => {
    expect(mapAntalEtager(2)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/lib/rule-engine/mappers.test.ts
```

Expected: `Cannot find module './mappers'`

- [ ] **Step 3: Create `mappers.ts`**

```typescript
// src/lib/rule-engine/mappers.ts
// Domain code-to-enum mappers for rule engine input assembly.

import type { Byggeoenske } from "@/types/project-state";
import type { ProjectType, BuildingUsage } from "./types";

export function mapByggetypeToProjectType(
  byggetype: Byggeoenske["byggetype"] | undefined,
): ProjectType {
  switch (byggetype) {
    case "nybyg":
      return "new_build";
    case "tilbyg":
      return "extension";
    case "ombyg":
      return "renovation";
    default:
      return "new_build";
  }
}

export function mapAntalEtager(antalEtager: Byggeoenske["antalEtager"] | undefined): number | null {
  if (antalEtager === undefined) return null;
  return Math.ceil(antalEtager);
}

export function mapUsageFromBbr(kode: string | null): BuildingUsage {
  if (!kode) return "residential";
  const n = parseInt(kode, 10);
  if (n >= 110 && n <= 190) return "residential";
  if (n === 910 || n === 920) return "garage";
  if (n >= 320 && n <= 399) return "commercial";
  return "mixed";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/lib/rule-engine/mappers.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/mappers.ts src/lib/rule-engine/mappers.test.ts
git commit -m "feat(arch-279): extract domain mappers into rule-engine/mappers.ts"
```

---

### Task 3: Update `input-assembler.ts` to import from new modules

**Files:**
- Modify: `src/lib/rule-engine/input-assembler.ts`

- [ ] **Step 1: Replace inline helpers with imports**

In `src/lib/rule-engine/input-assembler.ts`, replace the top of the file (lines 54–125) with imports:

```typescript
import { parseSetbackM, parseRoofTypes, parseZone } from "./parsers";
import { mapByggetypeToProjectType, mapAntalEtager, mapUsageFromBbr } from "./mappers";
```

Remove the inline definitions of `parseSetbackM`, `parseRoofTypes`, `parseZone`, `mapByggetypeToProjectType`, `mapAntalEtager`, and `mapUsageFromBbr`.

The `makeRuleValue` helper stays in `input-assembler.ts` as it is specific to `RuleValue<T>` construction.

- [ ] **Step 2: Run the full test suite**

```bash
bunx tsc --noEmit && bun test src/lib/rule-engine/
```

Expected: All tests pass, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rule-engine/input-assembler.ts
git commit -m "refactor(arch-279): input-assembler imports parsers and mappers from extracted modules"
```

---

### Task 4: Verify no regressions

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.
