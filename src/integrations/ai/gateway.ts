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
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "document"; source: Record<string, unknown>; title?: string; citations?: Record<string, unknown> }
  | { type: string; [key: string]: unknown };

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
  const apiKey = runtimeConfig.ai.anthropicApiKey;
  if (!apiKey) {
    throw new Error(
      `AI gateway: ANTHROPIC_API_KEY er ikke sat (operation: ${req.operation})`,
    );
  }

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
