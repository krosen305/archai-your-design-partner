# Billedanalyse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Udvid AiDesignHero så brugeren uploader op til 4 billeder, der analyseres for arkitektoniske kendetegn af Claude Haiku, valideres af brugeren (tags + konfliktløsning), og gemmes som koherent `billedanalyse` på projektet.

**Architecture:** Haiku 4.5 analyserer alle billeder i ét API-kald med et predefineret vocab-katalog og prompt-caching. Resultatet indeholder enige tags per kategori plus konflikter der kræver brugervalg. Gem-knap er låst til alle konflikter er løst. `billedanalyse` gemmes i sin egen JSONB-kolonne i `projects` — Byggeoenske røres aldrig automatisk.

**Tech Stack:** Bun, TanStack Start, Cloudflare Workers, Supabase Storage + DB, Anthropic API (Haiku 4.5), Zustand, Zod, React

**Spec:** `docs/superpowers/specs/2026-05-16-billede-analyse-design.md`

---

## Filstruktur

| Fil | Handling |
|-----|----------|
| `src/lib/billede-analyse-vocabulary.ts` | Ny — typer, vocab-katalog, system-prompt |
| `src/integrations/ai/billede-analyse.ts` | Ny — BilledeAnalyseService (Haiku + mock) |
| `src/lib/billede-analyse.functions.ts` | Ny — `uploadBillede` + `analyserBillederFn` createServerFns |
| `supabase/migrations/20260516000000_add_billedanalyse.sql` | Ny — ALTER TABLE projects |
| `src/lib/project-store.ts` | Udvid — `billedanalyse` felt + setter **(beskyttet fil)** |
| `src/integrations/supabase/project-persistence.ts` | Udvid — ProjectPatch + save/load |
| `src/lib/feature-flags.ts` | Udvid — `billedanalyseMock` flag |
| `src/components/cockpit/AiDesignHero.tsx` | Omskriv — upload, analyse-trigger, validerings-UI |

---

## Task 1: Typer og vocab-katalog

**Linear:** ARCH-XXX — `feat: billede-analyse typer og vocab-katalog`
**Label:** `codex-safe`
**Depends on:** ingen

**Files:**
- Create: `src/lib/billede-analyse-vocabulary.ts`
- Create: `src/lib/billede-analyse-vocabulary.test.ts`

- [ ] **Step 1: Skriv den fejlende test**

```typescript
// src/lib/billede-analyse-vocabulary.test.ts
import { describe, test, expect } from "bun:test";
import {
  BILLEDE_ANALYSE_VOCAB,
  BILLEDE_ANALYSE_SYSTEM_PROMPT,
  type BilledeAnalyseResultat,
} from "./billede-analyse-vocabulary";

describe("BILLEDE_ANALYSE_VOCAB", () => {
  const KATEGORIER = ["facade", "tagform", "vinduer", "materialer", "saerligeTraek", "farver", "stil"] as const;

  test("alle 7 kategorier eksisterer", () => {
    for (const k of KATEGORIER) {
      expect(BILLEDE_ANALYSE_VOCAB[k]).toBeDefined();
    }
  });

  test("hver kategori har mindst 5 termer", () => {
    for (const k of KATEGORIER) {
      expect(BILLEDE_ANALYSE_VOCAB[k].length).toBeGreaterThanOrEqual(5);
    }
  });

  test("ingen dubletter inden for en kategori", () => {
    for (const k of KATEGORIER) {
      const terms = BILLEDE_ANALYSE_VOCAB[k];
      expect(new Set(terms).size).toBe(terms.length);
    }
  });
});

describe("BILLEDE_ANALYSE_SYSTEM_PROMPT", () => {
  test("indeholder alle kategorinavne", () => {
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain("facade");
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain("tagform");
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain("saerligeTraek");
  });

  test("indeholder JSON-format-skabelon", () => {
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"kategorier"');
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"konflikter"');
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"ekstraTags"');
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"confidence"');
  });

  test("indeholder cache-venligt VOCAB-afsnit", () => {
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain("VOCAB:");
  });
});
```

- [ ] **Step 2: Kør test — verificer at de fejler**

```bash
bun test src/lib/billede-analyse-vocabulary.test.ts
```

Forventet: `Cannot find module './billede-analyse-vocabulary'`

- [ ] **Step 3: Implementér vocab-filen**

```typescript
// src/lib/billede-analyse-vocabulary.ts

export type BilledeAnalyseKategorier = {
  facade:        string[];
  tagform:       string[];
  vinduer:       string[];
  materialer:    string[];
  saerligeTraek: string[];
  farver:        string[];
  stil:          string[];
};

export type BilledeAnalyseKonflikt = {
  kategori:    keyof BilledeAnalyseKategorier;
  muligheder:  string[][];
  billedAntal: number[];
};

export type BilledeAnalyseResultat = {
  kategorier:  BilledeAnalyseKategorier;
  konflikter:  BilledeAnalyseKonflikt[];
  ekstraTags:  string[];
  confidence:  number;
  kilde:       "haiku" | "mock";
};

export const BILLEDE_ANALYSE_VOCAB: Record<keyof BilledeAnalyseKategorier, string[]> = {
  facade:        ["pudset", "tegl", "træbeklædning", "beton", "zink", "fiber-cement", "natursten", "cortenstål", "bindingsværk", "glas-facade"],
  tagform:       ["fladt tag", "sadeltag", "ensidig hældning", "mansardtag", "valmet tag", "tøndetag", "sedum-tag", "taghave"],
  vinduer:       ["store formater", "vinduesbånd", "taglys", "kviste", "franske døre", "hjørnevinduer", "facadeglas", "smalt format", "ovenlys"],
  materialer:    ["beton", "glas", "træ", "stål", "mursten", "zink", "kobber", "keramik", "komposit", "natursten"],
  saerligeTraek: ["integreret carport", "fritstående carport", "overdækket terrasse", "altan", "taghave", "pool", "solceller", "udestue", "anneks", "udvendig trappe", "dobbelthøjt rum", "gennemgående plan"],
  farver:        ["hvid", "sort", "antracit", "mørkegrå", "lysegrå", "beige", "sandfarvet", "terracotta", "mørk træ", "lys træ", "rød tegl", "grøn patina"],
  stil:          ["minimalistisk", "moderne", "skandinavisk", "klassisk", "industriel", "organisk", "rustikt", "bæredygtigt", "nordisk"],
};

const VOCAB_LINES = (
  Object.entries(BILLEDE_ANALYSE_VOCAB) as [keyof BilledeAnalyseKategorier, string[]][]
)
  .map(([k, v]) => `${k}: [${v.join(", ")}]`)
  .join("\n");

export const BILLEDE_ANALYSE_SYSTEM_PROMPT = `Du er arkitektonisk billedanalysatør for et dansk byggesagsystem.

Analyser de vedlagte billeder af boliger og returner præcis dette JSON-format — intet andet:
{
  "kategorier": {
    "facade":        [...],
    "tagform":       [...],
    "vinduer":       [...],
    "materialer":    [...],
    "saerligeTraek": [...],
    "farver":        [...],
    "stil":          [...]
  },
  "konflikter": [
    {
      "kategori": "<kategorinavn>",
      "muligheder": [[...], [...]],
      "billedAntal": [n, m]
    }
  ],
  "ekstraTags": [...],
  "confidence": 0-100
}

REGLER:
- Vælg KUN fra nedenstående vocab per kategori
- Tilføj tags til ekstraTags hvis du ser noget der ikke er i vocab
- Angiv konflikt hvis ≥2 billeder klart peger i modstridende retninger inden for en kategori
- Returner kun JSON — ingen forklaringstekst

VOCAB:
${VOCAB_LINES}`;
```

- [ ] **Step 4: Kør test — verificer at de består**

```bash
bun test src/lib/billede-analyse-vocabulary.test.ts
```

Forventet: alle tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/lib/billede-analyse-vocabulary.ts src/lib/billede-analyse-vocabulary.test.ts
git commit -m "feat(ARCH-XXX): billede-analyse typer og vocab-katalog"
```

---

## Task 2: Supabase migration

**Linear:** ARCH-XXX — `feat: billedanalyse kolonne i projects`
**Label:** `codex-safe`
**Depends on:** ingen

**Files:**
- Create: `supabase/migrations/20260516000000_add_billedanalyse.sql`

- [ ] **Step 1: Opret migrationsfil**

```sql
-- supabase/migrations/20260516000000_add_billedanalyse.sql
-- Tilføj billedanalyse JSONB-kolonne til projects.
-- Gemmer AI-analyse af inspirationsbilleder (arkivering, ikke compliance-data).
-- Ingen regel-engine læser direkte fra denne kolonne.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS billedanalyse JSONB;
```

- [ ] **Step 2: Verificer mod eksisterende migrationsformat**

Tjek at filen ligner andre migrationer i mappen:

```bash
ls supabase/migrations/ | head -10
```

Filnavnet skal følge mønsteret `YYYYMMDDHHMMSS_beskrivelse.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516000000_add_billedanalyse.sql
git commit -m "feat(ARCH-XXX): tilføj billedanalyse JSONB kolonne til projects"
```

---

## Task 3: BilledeAnalyseService (Haiku + mock)

**Linear:** ARCH-XXX — `feat: BilledeAnalyseService med Haiku og mock-fallback`
**Label:** `codex-safe`
**Depends on:** Task 1

**Files:**
- Create: `src/integrations/ai/billede-analyse.ts`
- Create: `src/integrations/ai/billede-analyse.test.ts`
- Modify: `src/lib/feature-flags.ts`

- [ ] **Step 1: Tilføj feature flag**

Åbn `src/lib/feature-flags.ts` og tilføj én linje til `FEATURE_FLAGS`-objektet:

```typescript
export const FEATURE_FLAGS = {
  tinglysningMock: true,
  pdfExtractorMock: false,
  husDnaMock: false,
  byggeanalyseMock: false,
  fjernvarmeMock: false,
  billedanalyseMock: false,  // ← tilføj denne
} as const;
```

- [ ] **Step 2: Skriv den fejlende test**

```typescript
// src/integrations/ai/billede-analyse.test.ts
import { describe, test, expect } from "bun:test";
import { BilledeAnalyseService } from "./billede-analyse";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

const KATEGORIER = ["facade", "tagform", "vinduer", "materialer", "saerligeTraek", "farver", "stil"] as const;

describe("BilledeAnalyseService.analyser (mock)", () => {
  test("returnerer mock-resultat uden API-nøgle", async () => {
    const result = await BilledeAnalyseService.analyser(["https://example.com/hus.jpg"]);
    expect(result.kilde).toBe("mock");
  });

  test("mock-resultat har alle 7 kategorier", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    for (const k of KATEGORIER) {
      expect(Array.isArray(result.kategorier[k])).toBe(true);
    }
  });

  test("mock-resultat har ingen konflikter", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(result.konflikter).toEqual([]);
  });

  test("confidence er et tal mellem 0 og 100", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  test("tom URL-array returnerer mock", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(result.kilde).toBe("mock");
  });
});
```

- [ ] **Step 3: Kør test — verificer at de fejler**

```bash
bun test src/integrations/ai/billede-analyse.test.ts
```

Forventet: `Cannot find module './billede-analyse'`

- [ ] **Step 4: Implementér servicen**

```typescript
// src/integrations/ai/billede-analyse.ts
// SERVER-SIDE ONLY — Anthropic API-nøgle må aldrig nå browseren.
// BilledeAnalyseService — analysér inspirationsbilleder for arkitektoniske kendetegn.
// Model: claude-haiku-4-5-20251001 med prompt-caching på system-prompt.
// Fallback til mock-data hvis ANTHROPIC_API_KEY mangler eller kald fejler.

import { z } from "zod";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getEnvOptional } from "@/lib/env";
import {
  type BilledeAnalyseResultat,
  BILLEDE_ANALYSE_SYSTEM_PROMPT,
} from "@/lib/billede-analyse-vocabulary";

const IS_MOCK = FEATURE_FLAGS.billedanalyseMock;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_RESULT: BilledeAnalyseResultat = {
  kategorier: {
    facade:        ["pudset", "hvid"],
    tagform:       ["fladt tag"],
    vinduer:       ["store formater", "vinduesbånd"],
    materialer:    ["beton", "glas"],
    saerligeTraek: ["integreret carport"],
    farver:        ["hvid", "antracit"],
    stil:          ["minimalistisk"],
  },
  konflikter:  [],
  ekstraTags:  ["sydvendt atrium"],
  confidence:  87,
  kilde:       "mock",
};

// ---------------------------------------------------------------------------
// Zod-schema til parsing af API-svar
// ---------------------------------------------------------------------------

const KategorierSchema = z.object({
  facade:        z.array(z.string()).default([]),
  tagform:       z.array(z.string()).default([]),
  vinduer:       z.array(z.string()).default([]),
  materialer:    z.array(z.string()).default([]),
  saerligeTraek: z.array(z.string()).default([]),
  farver:        z.array(z.string()).default([]),
  stil:          z.array(z.string()).default([]),
});

const KonfliktSchema = z.object({
  kategori:    z.enum(["facade", "tagform", "vinduer", "materialer", "saerligeTraek", "farver", "stil"]),
  muligheder:  z.array(z.array(z.string())),
  billedAntal: z.array(z.number()),
});

const ApiResponseSchema = z.object({
  kategorier:  KategorierSchema,
  konflikter:  z.array(KonfliktSchema).default([]),
  ekstraTags:  z.array(z.string()).default([]),
  confidence:  z.number().min(0).max(100).default(70),
});

// ---------------------------------------------------------------------------
// BilledeAnalyseService
// ---------------------------------------------------------------------------

export class BilledeAnalyseService {
  static async analyser(billedUrls: string[]): Promise<BilledeAnalyseResultat> {
    if (IS_MOCK) return { ...MOCK_RESULT };

    const apiKey = getEnvOptional("ANTHROPIC_API_KEY") ?? "";
    if (!apiKey) {
      console.warn("[BilledeAnalyse] ANTHROPIC_API_KEY mangler — returnerer mock");
      return { ...MOCK_RESULT };
    }

    try {
      return await callHaiku(apiKey, billedUrls);
    } catch (e) {
      console.warn("[BilledeAnalyse] Haiku-kald fejlede — returnerer mock:", (e as Error).message);
      return { ...MOCK_RESULT };
    }
  }
}

// ---------------------------------------------------------------------------
// Intern: HTTP-kald til Anthropic Haiku
// ---------------------------------------------------------------------------

async function callHaiku(apiKey: string, billedUrls: string[]): Promise<BilledeAnalyseResultat> {
  const imageBlocks = billedUrls.slice(0, 4).map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  const BACKOFF_MS = [10_000, 20_000, 40_000] as const;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: [
          {
            type: "text",
            text: BILLEDE_ANALYSE_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              { type: "text", text: "Analyser disse billeder og returner JSON som specificeret." },
            ],
          },
        ],
      }),
    });

    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { content: { text: string }[] };
    const raw = json?.content?.[0]?.text ?? "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = ApiResponseSchema.parse(JSON.parse(cleaned));
    return { ...parsed, kilde: "haiku" as const };
  }

  throw new Error("Haiku: max retries exceeded");
}
```

- [ ] **Step 5: Kør test — verificer at de består**

```bash
bun test src/integrations/ai/billede-analyse.test.ts
```

Forventet: alle tests `PASS`

- [ ] **Step 6: Typecheck**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl

- [ ] **Step 7: Commit**

```bash
git add src/integrations/ai/billede-analyse.ts src/integrations/ai/billede-analyse.test.ts src/lib/feature-flags.ts
git commit -m "feat(ARCH-XXX): BilledeAnalyseService — Haiku med mock-fallback og prompt-caching"
```

---

## Task 4: project-store + persistence

**Linear:** ARCH-XXX — `feat: billedanalyse i project-store og persistence`
**Label:** `needs-architecture` *(rører beskyttet fil: project-store.ts)*
**Depends on:** Task 1, Task 2

**Files:**
- Modify: `src/lib/project-store.ts` **(beskyttet)**
- Modify: `src/integrations/supabase/project-persistence.ts`

- [ ] **Step 1: Udvid ProjectState i project-store.ts**

Find blokken med `type State = {` og tilføj `billedanalyse` som sibling til `byggeanalyseResultat`:

```typescript
// Tilføj efter:
// byggeanalyseResultat: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null;
billedanalyse: import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat | null;
```

Find blokken med setters i `type State` og tilføj:

```typescript
// Tilføj efter setByggeanalyseResultat:
setBilledanalyse: (result: import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat | null) => void;
```

Find initialState (den del af `create(set, get) => ({`) og tilføj initialværdien:

```typescript
// Tilføj efter:
// byggeanalyseResultat: null,
billedanalyse: null,
```

Find setter-implementationerne og tilføj:

```typescript
// Tilføj efter setByggeanalyseResultat:
setBilledanalyse: (billedanalyse) => set({ billedanalyse }),
```

- [ ] **Step 2: Udvid ProjectPatch i project-persistence.ts**

Find `export type ProjectPatch = {` og tilføj:

```typescript
// Tilføj som ny linje i ProjectPatch:
billedanalyse?: import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat | null;
```

- [ ] **Step 3: Skriv billedanalyse i saveProject**

Find `saveProject`-funktionen. Find blokken hvor `update`-objektet bygges med JSONB-felter. Tilføj efter eksisterende simple felter (f.eks. `complianceDone`):

```typescript
if (patch.billedanalyse !== undefined) {
  update.billedanalyse = patch.billedanalyse as unknown as Json;
}
```

- [ ] **Step 4: Læs billedanalyse i loadProject**

Find `loadProject`-funktionen. Find den lange `.select(...)` streng og tilføj `billedanalyse` til den:

```typescript
// Find linjen der starter med:
// "id, address_full, address_kommune, ..."
// og tilføj billedanalyse til sidst:
", billedanalyse"
```

Find stedet i `loadProject` hvor den returnerede data mappes til projektstate (eller PersistedProject-typen returneres direkte). Tilsvarende restore-logik i `restoreProject` / `project-sync.ts` skal køre:

```typescript
// I den funktion der kalder setBilledanalyse efter loadProject:
if (data.billedanalyse) {
  useProject.getState().setBilledanalyse(
    data.billedanalyse as import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl relateret til `billedanalyse`

- [ ] **Step 6: Kør alle tests**

```bash
bun test
```

Forventet: ingen failing tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/project-store.ts src/integrations/supabase/project-persistence.ts
git commit -m "feat(ARCH-XXX): billedanalyse felt i project-store og persistence

🔒 Rører beskyttet fil — kræver review"
```

---

## Task 5: Server functions — upload og analyse

**Linear:** ARCH-XXX — `feat: uploadBillede + analyserBilleder server functions`
**Label:** `codex-safe`
**Depends on:** Task 3, Task 4

Server functions der bruges af komponenter skal ligge i en functions-fil (samme mønster som `@/lib/ai-design.functions.ts` brugt af AiDesignHero). Komponenten importerer direkte fra denne fil.

**Files:**
- Create: `src/lib/billede-analyse.functions.ts`

- [ ] **Step 1: Opret functions-filen**

```typescript
// src/lib/billede-analyse.functions.ts
// createServerFns til billedanalyse-feature.
// Mønster: samme som src/lib/ai-design.functions.ts

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BilledeAnalyseService } from "@/integrations/ai/billede-analyse";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

// ---------------------------------------------------------------------------
// uploadBillede — base64 → Supabase Storage → signedUrl
// ---------------------------------------------------------------------------

const uploadBilledeSchema = z.object({
  base64:      z.string().min(1),
  mimeType:    z.enum(["image/jpeg", "image/png"]),
  projektId:   z.string().uuid(),
  accessToken: z.string().min(1),
});

export const uploadBillede = createServerFn({ method: "POST" })
  .validator(uploadBilledeSchema.parse)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { getEnv } = await import("@/lib/env");

    const supabaseAdmin = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Response("Unauthorized", { status: 401 });

    const userId = authData.user.id;
    const ext = data.mimeType === "image/png" ? "png" : "jpg";
    const uuid = crypto.randomUUID();
    const path = `${userId}/${data.projektId}/${uuid}.${ext}`;
    const buffer = Buffer.from(data.base64, "base64");

    const { error: uploadError } = await supabaseAdmin.storage
      .from("inspirationsbilleder")
      .upload(path, buffer, { contentType: data.mimeType });

    if (uploadError) throw new Error(`Upload fejlede: ${uploadError.message}`);

    const { data: urlData } = await supabaseAdmin.storage
      .from("inspirationsbilleder")
      .createSignedUrl(path, 3600);

    if (!urlData?.signedUrl) throw new Error("Kunne ikke generere signed URL");

    return { path, signedUrl: urlData.signedUrl };
  });

// ---------------------------------------------------------------------------
// analyserBillederFn — signedUrls → BilledeAnalyseResultat
// ---------------------------------------------------------------------------

const analyserBilledersSchema = z.object({
  billedUrls: z.array(z.string().url()).min(1).max(4),
});

export const analyserBillederFn = createServerFn({ method: "POST" })
  .validator(analyserBilledersSchema.parse)
  .handler(async ({ data }): Promise<BilledeAnalyseResultat> => {
    return BilledeAnalyseService.analyser(data.billedUrls);
  });
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl

- [ ] **Step 3: Commit**

```bash
git add src/lib/billede-analyse.functions.ts
git commit -m "feat(ARCH-XXX): uploadBillede + analyserBilleder server functions"
```

---

## Task 6: AiDesignHero — Upload og analyse-trigger

**Linear:** ARCH-XXX — `feat: AiDesignHero upload til Supabase + Analyser-knap`
**Label:** `codex-safe`
**Depends on:** Task 5

**Files:**
- Modify: `src/components/cockpit/AiDesignHero.tsx`

- [ ] **Step 1: Tilføj state machine og upload-logik**

Erstat den eksisterende `handleFiles`-funktion og relaterede state med følgende. Bevar alt eksisterende (fritekst, forslag, valgt osv.) — kun upload-logikken og det nye `analyseState` tilføjes:

```typescript
// Ny state øverst i AiDesignHero-funktionen — tilføj efter eksisterende useState-kald:
type AnalyseState = "idle" | "uploading" | "ready" | "analysing" | "conflict" | "validated" | "saved" | "error";
const [analyseState, setAnalyseState] = useState<AnalyseState>(
  useProject.getState().billedanalyse ? "saved" : "idle"
);
const [analyse, setAnalyse] = useState<BilledeAnalyseResultat | null>(
  useProject.getState().billedanalyse ?? null
);
const [uploadError, setUploadError] = useState<string | null>(null);

// Erstat handleFiles:
const handleFiles = async (files: FileList | null) => {
  if (!files?.length) return;
  const projectId = useProject.getState().currentProjectId;
  if (!projectId) {
    setUploadError("Projekt ikke gemt endnu — prøv igen om et øjeblik.");
    return;
  }

  setAnalyseState("uploading");
  setUploadError(null);

  const newSignedUrls: string[] = [];
  const newPaths: string[] = [];

  for (const file of Array.from(files).slice(0, 4 - uploadedImages.length)) {
    // Lokal preview (eksisterende logik)
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Upload til Supabase Storage
    try {
      const base64 = dataUrl.split(",")[1] ?? "";
      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const { getAccessToken } = await import("@/lib/auth");
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Ikke logget ind");

      const { signedUrl, path } = await uploadBillede({
        data: { base64, mimeType, projektId: projectId, accessToken },
      });
      newSignedUrls.push(signedUrl);
      newPaths.push(path);
      setUploadedImages((prev) => [...prev, dataUrl]); // vis lokal preview
    } catch (e) {
      setUploadError("Upload fejlede — prøv igen.");
      setAnalyseState("error");
      return;
    }
  }

  // Gem stier og URLs i store
  const existingPaths = useProject.getState().byggeoenske.inspirationsbilledePaths ?? [];
  const existingUrls  = useProject.getState().byggeoenske.inspirationsbilleder ?? [];
  setByggeoenske({
    inspirationsbilledePaths: [...existingPaths, ...newPaths],
    inspirationsbilleder:     [...existingUrls,  ...newSignedUrls],
  });

  setAnalyseState("ready");
};
```

- [ ] **Step 2: Tilføj `handleAnalyser`-funktion**

```typescript
const handleAnalyser = async () => {
  const signedUrls = useProject.getState().byggeoenske.inspirationsbilleder ?? [];
  if (signedUrls.length === 0) return;

  setAnalyseState("analysing");
  setUploadError(null);

  try {
    const result = await analyserBillederFn({ data: { billedUrls: signedUrls } });
    setAnalyse(result);
    setAnalyseState(result.konflikter.length > 0 ? "conflict" : "validated");
  } catch (e) {
    setUploadError("Analyse fejlede — prøv igen.");
    setAnalyseState("error");
  }
};
```

- [ ] **Step 3: Tilføj "Analyser billeder"-knap i JSX**

Find knap-området i return-blokken (ved siden af upload-knappen) og tilføj:

```tsx
<button
  type="button"
  onClick={handleAnalyser}
  disabled={
    analyseState === "analysing" ||
    analyseState === "uploading" ||
    (useProject.getState().byggeoenske.inspirationsbilleder?.length ?? 0) === 0
  }
  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent/50 transition-colors disabled:opacity-50"
>
  {analyseState === "analysing" ? (
    <><Loader2 size={12} className="animate-spin" /> Analyserer…</>
  ) : (
    <><Sparkles size={12} /> Analyser billeder</>
  )}
</button>
```

- [ ] **Step 4: Typecheck**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl

- [ ] **Step 5: Manuel test i browser**

```bash
bun dev
```

1. Naviger til et projekt → Cockpit
2. Upload ét billede → verificer "Analyser billeder"-knap aktiveres
3. Klik "Analyser billeder" → verificer spinner vises
4. Verificer at mock-resultat returneres (uden API-nøgle)

- [ ] **Step 6: Commit**

```bash
git add src/components/cockpit/AiDesignHero.tsx
git commit -m "feat(ARCH-XXX): AiDesignHero upload til Supabase og analyse-trigger"
```

---

## Task 7: AiDesignHero — Validerings-UI

**Linear:** ARCH-XXX — `feat: AiDesignHero valideringsvisning med tags og konfliktløsning`
**Label:** `codex-safe`
**Depends on:** Task 6

**Files:**
- Modify: `src/components/cockpit/AiDesignHero.tsx`

- [ ] **Step 1: Tilføj hjælpefunktioner til tag-manipulation**

Tilføj disse rene funktioner øverst i filen (udenfor komponenten):

```typescript
import {
  uploadBillede,
  analyserBillederFn,
} from "@/lib/billede-analyse.functions";
import type {
  BilledeAnalyseResultat,
  BilledeAnalyseKategorier,
} from "@/lib/billede-analyse-vocabulary";

function removeTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: current.kategorier[kategori].filter((t) => t !== tag),
    },
  };
}

function addTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  if (current.kategorier[kategori].includes(tag)) return current;
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: [...current.kategorier[kategori], tag],
    },
  };
}

function resolveKonflikt(
  kategori: keyof BilledeAnalyseKategorier,
  valgtetags: string[],
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: [...current.kategorier[kategori], ...valgtetags],
    },
    konflikter: current.konflikter.filter((k) => k.kategori !== kategori),
  };
}
```

- [ ] **Step 2: Tilføj `handleGem`-funktion i komponenten**

```typescript
const handleGem = () => {
  if (!analyse || analyse.konflikter.length > 0) return;
  const { setBilledanalyse } = useProject.getState();
  setBilledanalyse(analyse);
  syncPatch({ billedanalyse: analyse });
  setAnalyseState("saved");
};
```

- [ ] **Step 3: Tilføj valideringsvisning i JSX**

Tilføj følgende blok i return-JSX, efter upload-sektionen og før design-forslagene:

```tsx
{analyse && (analyseState === "conflict" || analyseState === "validated" || analyseState === "saved") && (
  <div className="px-5 pb-2 space-y-4">

    {/* Konflikter */}
    {analyse.konflikter.map((konflikt) => (
      <div key={konflikt.kategori} className="rounded-md border border-warning/40 bg-warning/5 p-4">
        <div className="font-mono text-[10px] text-warning uppercase tracking-wider mb-2">
          Dine billeder trækker i to retninger for{" "}
          <span className="text-foreground">{konflikt.kategori}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {konflikt.muligheder.map((tags, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const updated = resolveKonflikt(konflikt.kategori, tags, analyse);
                setAnalyse(updated);
                setAnalyseState(updated.konflikter.length > 0 ? "conflict" : "validated");
              }}
              className="rounded-md border border-border/60 bg-[#111] p-3 text-left hover:border-accent/50 transition-colors"
            >
              <div className="font-mono text-[11px] text-foreground mb-1">
                Retning {String.fromCharCode(65 + i)}
              </div>
              <div className="text-xs text-muted-foreground">{tags.join(" · ")}</div>
              <div className="font-mono text-[10px] text-muted-foreground/60 mt-1">
                {konflikt.billedAntal[i]} billede{konflikt.billedAntal[i] !== 1 ? "r" : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
    ))}

    {/* Enige tags per kategori */}
    {(Object.entries(analyse.kategorier) as [keyof BilledeAnalyseKategorier, string[]][])
      .filter(([, tags]) => tags.length > 0)
      .map(([kategori, tags]) => (
        <div key={kategori}>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            {kategori}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent"
              >
                {tag}
                {analyseState !== "saved" && (
                  <button
                    type="button"
                    onClick={() => setAnalyse(removeTag(kategori, tag, analyse))}
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Fjern ${tag}`}
                  >
                    <X size={9} />
                  </button>
                )}
              </span>
            ))}
            {analyseState !== "saved" && (
              <input
                type="text"
                placeholder="+ tilføj"
                className="w-20 bg-transparent font-mono text-[11px] text-muted-foreground border-b border-border/40 focus:outline-none focus:border-accent/60 pb-0.5"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = e.currentTarget.value.trim();
                    if (val) {
                      setAnalyse(addTag(kategori, val, analyse));
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      ))}

    {/* ekstraTags */}
    {analyse.ekstraTags.length > 0 && (
      <div>
        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
          Yderligere detaljer
        </div>
        <div className="flex flex-wrap gap-1.5">
          {analyse.ekstraTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-[#111] px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* Gem-knap */}
    {analyseState !== "saved" && (
      <button
        type="button"
        onClick={handleGem}
        disabled={analyse.konflikter.length > 0}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-mono text-[11px] text-accent-foreground hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Check size={12} /> Gem analyse
      </button>
    )}

    {analyseState === "saved" && (
      <div className="font-mono text-[11px] text-accent flex items-center gap-1.5">
        <Check size={12} /> Analyse gemt
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Typecheck**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl

- [ ] **Step 5: Manuel end-to-end test**

```bash
bun dev
```

Gennemgå følgende flow:

1. Upload 1 billede → "Analyser billeder" aktiv → klik → mock-resultat vises med tags
2. Gem-knap aktiv (ingen konflikter i mock) → klik → "Analyse gemt" bekræftelse
3. Reload siden → `billedanalyse` gendannes fra Supabase, "saved"-state vises
4. Verificer at Byggeoenske-felter (arkitektoniskStil, tagform osv.) er uændrede

- [ ] **Step 6: Kør alle tests og typecheck**

```bash
bunx tsc --noEmit && bun test
```

Forventet: ingen fejl, ingen failing tests

- [ ] **Step 7: Commit**

```bash
git add src/components/cockpit/AiDesignHero.tsx
git commit -m "feat(ARCH-XXX): AiDesignHero validerings-UI med tags og konfliktløsning"
```

---

## Linear issues — oversigt

Erstat ARCH-XXX med næste ledige numre. Nedenstående er klar til at oprette:

---

### ARCH-XXX: Billedanalyse — typer og vocab-katalog
**Label:** `codex-safe`
**Estimat:** S

Opret `src/lib/billede-analyse-vocabulary.ts` med `BilledeAnalyseKategorier`, `BilledeAnalyseKonflikt`, `BilledeAnalyseResultat` typer + `BILLEDE_ANALYSE_VOCAB` katalog (~60 termer, 7 kategorier) + `BILLEDE_ANALYSE_SYSTEM_PROMPT` med cache-venlig struktur. Skriv unit tests der verificerer alle kategorier eksisterer og har ≥5 termer. Se `docs/superpowers/plans/2026-05-16-billede-analyse.md` Task 1.

---

### ARCH-XXX: Billedanalyse — Supabase migration
**Label:** `codex-safe`
**Estimat:** XS
**Depends on:** ingen

Opret `supabase/migrations/20260516000000_add_billedanalyse.sql` med `ALTER TABLE projects ADD COLUMN IF NOT EXISTS billedanalyse JSONB`. Se plan Task 2.

---

### ARCH-XXX: BilledeAnalyseService — Haiku med mock-fallback
**Label:** `codex-safe`
**Estimat:** M
**Depends on:** ARCH-XXX (typer)

Opret `src/integrations/ai/billede-analyse.ts` med `BilledeAnalyseService.analyser(billedUrls)`. Bruger `claude-haiku-4-5-20251001`, ét API-kald for alle billeder, billeder sendes som URL-referencer (ikke base64), system-prompt caches med `cache_control: ephemeral`, exponential backoff på 429, mock-fallback uden API-nøgle. Tilføj `billedanalyseMock: false` til `FEATURE_FLAGS`. Se plan Task 3.

---

### ARCH-XXX: Billedanalyse — project-store og persistence
**Label:** `needs-architecture`
**Estimat:** S
**Depends on:** ARCH-XXX (typer), ARCH-XXX (migration)

Tilføj `billedanalyse: BilledeAnalyseResultat | null` og `setBilledanalyse` setter til `project-store.ts`. Tilføj `billedanalyse` til `ProjectPatch` i `project-persistence.ts`, skriv ved `syncPatch`, læs ved `loadProject`. **Rører beskyttet fil — kræver review.** Se plan Task 4.

---

### ARCH-XXX: Billedanalyse — uploadBillede + analyserBilleder server functions
**Label:** `codex-safe`
**Estimat:** M
**Depends on:** ARCH-XXX (service), ARCH-XXX (store)

Opret `src/lib/billede-analyse.functions.ts` med to `createServerFn` (samme mønster som `ai-design.functions.ts`): `uploadBillede` (base64 → Supabase Storage → signedUrl) og `analyserBillederFn` (signedUrls → BilledeAnalyseService). Se plan Task 5.

---

### ARCH-XXX: AiDesignHero — upload til Supabase og analyse-trigger
**Label:** `codex-safe`
**Estimat:** M
**Depends on:** ARCH-XXX (server functions)

Udvid `AiDesignHero.tsx` med state machine (`idle|uploading|ready|analysing|conflict|validated|saved|error`), upload-flow via `uploadBillede` server function, og "Analyser billeder"-knap der kalder `analyserBillederFn`. Gem signedUrls i `byggeoenske.inspirationsbilleder` og paths i `inspirationsbilledePaths`. Se plan Task 6.

---

### ARCH-XXX: AiDesignHero — validerings-UI med tags og konfliktløsning
**Label:** `codex-safe`
**Estimat:** L
**Depends on:** ARCH-XXX (upload og trigger)

Tilføj valideringsvisning i `AiDesignHero.tsx`: tags per kategori som chips med fjern-knap, konflikt-kort (A/B-valg der fletter vinderens tags ind), `ekstraTags` sektion, og "Gem analyse"-knap låst til alle konflikter er løst. Gem via `setBilledanalyse` + `syncPatch`. Byggeoenske røres ikke. Se plan Task 7.
