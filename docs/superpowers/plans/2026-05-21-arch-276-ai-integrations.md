# ARCH-276: ai-integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared typed AI gateway (`src/integrations/ai/gateway.ts`) for all Anthropic API calls, with a reusable `extractStructuredOutput<T>()` helper, and migrate `byggeanalyse.ts`, `hus-dna-generator.ts`, and `pdf-extractor.ts` to use it.

**Architecture:** `gateway.ts` owns the bare Anthropic fetch (using `fetchWithRetry`), message construction, retry logic, timeout, logging, and error normalization. `extractStructuredOutput<T>(schema, text)` extracts and Zod-validates JSON from a Claude response. Each AI service calls the gateway instead of implementing its own fetch loop. `billede-analyse.ts` already uses a different pattern (multipart upload) and is out of scope for the gateway transport.

**Tech Stack:** TypeScript, Zod (already in project), `fetchWithRetry`, `logServerEvent`, `runtimeConfig`, Bun test.

---

## File Map

| Action | File                                       |
| ------ | ------------------------------------------ |
| Create | `src/integrations/ai/gateway.ts`           |
| Create | `src/integrations/ai/gateway.test.ts`      |
| Modify | `src/integrations/ai/byggeanalyse.ts`      |
| Modify | `src/integrations/ai/pdf-extractor.ts`     |
| Modify | `src/integrations/ai/hus-dna-generator.ts` |

---

### Task 1: Create `gateway.ts` with tests

**Files:**

- Create: `src/integrations/ai/gateway.ts`
- Create: `src/integrations/ai/gateway.test.ts`

- [ ] **Step 1: Write failing tests**

````typescript
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
````

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/integrations/ai/gateway.test.ts
```

Expected: `Cannot find module './gateway'`

- [ ] **Step 3: Create `gateway.ts`**

````typescript
// src/integrations/ai/gateway.ts
// SERVER-SIDE ONLY — Anthropic API key must never reach the browser.
// Shared typed AI gateway for all Claude prompt executions.

import { z } from "zod";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { logServerEvent } from "@/lib/server-logger";
import { runtimeConfig } from "@/lib/runtime-config";

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type GatewayRequest = {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens: number;
  operation: string;
};

export type GatewayResponse = {
  content: Array<{ type: string; text?: string }>;
};

export async function callAnthropicGateway(req: GatewayRequest): Promise<GatewayResponse> {
  const apiKey = runtimeConfig.anthropicApiKey;
  if (!apiKey)
    throw new Error(`AI gateway: ANTHROPIC_API_KEY er ikke sat (operation: ${req.operation})`);

  const body = {
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
  };

  const response = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: 60_000, retries: 2, retryDelayBaseMs: 10_000, retryOnStatuses: [429, 529] },
    { service: "Anthropic", operation: req.operation, phase: "ai_generation" },
  );

  const bodyText = await response.text();

  if (!response.ok) {
    logServerEvent({
      module: "ai/gateway",
      operation: req.operation,
      severity: "fatal",
      message: `Anthropic HTTP ${response.status}`,
      metadata: { status: response.status, body: bodyText.slice(0, 300) },
    });
    throw new Error(
      `Anthropic API fejl ${response.status} (${req.operation}): ${bodyText.slice(0, 200)}`,
    );
  }

  return JSON.parse(bodyText) as GatewayResponse;
}

export function extractStructuredOutput<T>(schema: z.ZodType<T>, text: string): T {
  // Strip markdown code fence if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1].trim() : text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI output er ikke valid JSON. Modtaget: ${raw.slice(0, 200)}`);
  }

  return schema.parse(parsed);
}
````

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/integrations/ai/gateway.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/ai/gateway.ts src/integrations/ai/gateway.test.ts
git commit -m "feat(arch-276): create shared typed Anthropic AI gateway with extractStructuredOutput"
```

---

### Task 2: Migrate `byggeanalyse.ts` to use gateway

**Files:**

- Modify: `src/integrations/ai/byggeanalyse.ts`

- [ ] **Step 1: Replace inline fetch with `callAnthropicGateway`**

Add import:

```typescript
import { callAnthropicGateway, extractStructuredOutput } from "./gateway";
```

Locate the live Anthropic fetch logic (the `for (let attempt = 0; ...)` retry loop and the `fetch("https://api.anthropic.com/v1/messages", ...)` call). Replace the entire retry loop with:

```typescript
const gatewayResponse = await callAnthropicGateway({
  model: runtimeConfig.defaultModel ?? "claude-sonnet-4-6",
  system: systemPrompt,
  messages: [{ role: "user", content: userMessage }],
  maxTokens: 2000,
  operation: "byggeanalyse",
});

const textBlock = gatewayResponse.content.find((b) => b.type === "text");
if (!textBlock?.text) throw new Error("Anthropic returnerede ingen tekst i byggeanalyse");

const validated = extractStructuredOutput(ByggeanalyseSchema, textBlock.text);
```

Remove the `ContentBlock` inline type definition and the inline retry constants (`10_000 * Math.pow(2, attempt)`).

- [ ] **Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/ai/byggeanalyse.ts
git commit -m "refactor(arch-276): byggeanalyse uses callAnthropicGateway"
```

---

### Task 3: Migrate `pdf-extractor.ts` to use gateway

**Files:**

- Modify: `src/integrations/ai/pdf-extractor.ts`

- [ ] **Step 1: Read the file to understand current structure**

```bash
# In Claude Code session:
# Read src/integrations/ai/pdf-extractor.ts and identify:
# 1. The fetch call to Anthropic
# 2. The JSON parsing logic
# 3. The Zod schema (if any)
```

- [ ] **Step 2: Add import and replace fetch**

Add:

```typescript
import { callAnthropicGateway, extractStructuredOutput } from "./gateway";
```

Replace the inline Anthropic fetch with `callAnthropicGateway(...)` and JSON parsing with `extractStructuredOutput(PdfExtractSchema, textBlock.text)` using the existing Zod schema (or create one if missing).

- [ ] **Step 3: Run type check and existing tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/ai/pdf-extractor.ts
git commit -m "refactor(arch-276): pdf-extractor uses callAnthropicGateway"
```

---

### Task 4: Migrate `hus-dna-generator.ts` to use gateway

**Files:**

- Modify: `src/integrations/ai/hus-dna-generator.ts`

- [ ] **Step 1: Add import and replace fetch**

Add:

```typescript
import { callAnthropicGateway, extractStructuredOutput } from "./gateway";
```

Replace the inline Anthropic fetch with `callAnthropicGateway(...)` and JSON parsing with `extractStructuredOutput(HusDnaSchema, textBlock.text)` using the existing Zod schema.

- [ ] **Step 2: Run type check and tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/ai/hus-dna-generator.ts
git commit -m "refactor(arch-276): hus-dna-generator uses callAnthropicGateway"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Verify no bare `fetch` to Anthropic**

```bash
grep -r "api.anthropic.com" src/integrations/ai/ --include="*.ts" --exclude="gateway.ts"
```

Expected: No matches (all Anthropic calls go through the gateway).
