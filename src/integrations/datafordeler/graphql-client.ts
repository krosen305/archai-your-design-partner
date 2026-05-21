// SERVER-SIDE ONLY — API key must never reach the browser.
// Shared typed GraphQL transport for all Datafordeler registers.
// Replaces per-client gqlFetch functions in DAR, BBR, MAT and EBR.

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { logServerEvent } from "@/lib/server-logger";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

export type DatafordelerGraphqlOptions = {
  timeoutMs?: number;
  phase?: string;
  metadata?: Record<string, unknown>;
  trace?: AnalysisTraceContext | null;
};

export async function datafordelerGraphqlFetch<T>(
  url: URL,
  query: string,
  variables: Record<string, unknown>,
  operation: string,
  options?: DatafordelerGraphqlOptions,
): Promise<T> {
  const module = operation.split("_")[0].toLowerCase() + "/client";
  const service = `Datafordeler ${operation.split("_")[0]}`;

  const response = await fetchWithRetry(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    { timeoutMs: options?.timeoutMs ?? 12_000 },
    {
      trace: options?.trace ?? null,
      service,
      operation,
      phase: options?.phase ?? "layer1",
      metadata: options?.metadata,
    },
  );

  const bodyText = await response.text();

  if (!response.ok) {
    const keyHint = url.searchParams.get("apiKey")?.slice(0, 4) ?? "?";
    logServerEvent({
      module,
      operation: "graphqlFetch",
      severity: "fatal",
      message: "HTTP-fejl",
      metadata: {
        status: response.status,
        keyHint: `${keyHint}…`,
        body: bodyText.slice(0, 500),
      },
    });
    throw new Error(`Datafordeler ${operation} HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText) as { data?: T; errors?: { message: string }[] };

  if (parsed.errors?.length) {
    logServerEvent({
      module,
      operation: "graphqlFetch",
      severity: "fatal",
      message: "GraphQL-fejl",
      metadata: { errors: parsed.errors },
    });
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data as T;
}
