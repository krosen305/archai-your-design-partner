// SERVER-SIDE ONLY - API key must never reach the browser.
// Shared typed GraphQL transport for all Datafordeler registers.
// Replaces per-client gqlFetch functions in DAR, BBR, MAT and EBR.

import { z } from "zod";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { logServerEvent } from "@/lib/server-logger";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

export type DatafordelerGraphqlOptions = {
  timeoutMs?: number;
  phase?: string;
  metadata?: Record<string, unknown>;
  trace?: AnalysisTraceContext | null;
};

const graphQlErrorSchema = z.object({
  message: z.string(),
});

const graphQlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(graphQlErrorSchema).optional(),
});

export async function datafordelerGraphqlFetch<T>(
  url: URL,
  query: string,
  variables: Record<string, unknown>,
  operation: string,
  dataSchemaOrOptions?: z.ZodType<T> | DatafordelerGraphqlOptions,
  maybeOptions?: DatafordelerGraphqlOptions,
): Promise<T> {
  const dataSchema =
    dataSchemaOrOptions && "safeParse" in dataSchemaOrOptions ? dataSchemaOrOptions : undefined;
  const options =
    dataSchemaOrOptions && "safeParse" in dataSchemaOrOptions ? maybeOptions : dataSchemaOrOptions;

  const module = operation.split("_")[0].toLowerCase() + "/client";
  const service = `Datafordeler ${operation.split("_")[0]}`;

  // Datafordeler GraphQL er sporadisk flaky: identisk query svinger 20ms → 7000ms
  // og enkelte workers hænger til AbortSignal-timeout. Tre tilpasninger:
  //  - timeoutMs 6s (var 12s) — fang hængende workers hurtigere
  //  - retryOnAbort=false — sekventielle retries på timeout forværrer UX uden at hjælpe;
  //    enrichAddressDetails/layer1 har graceful fallback til degraded data
  //  - hedgeAfterMs 2s — efter 2s uden svar fyrer vi parallel duplikat-request;
  //    første successful response vinder. Mod en stuck worker rammer hedge'en
  //    typisk en frisk worker.
  const response = await fetchWithRetry(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    {
      timeoutMs: options?.timeoutMs ?? 6_000,
      retryOnAbort: false,
      hedgeAfterMs: 2_000,
    },
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
        keyHint: `${keyHint}...`,
        body: bodyText.slice(0, 500),
      },
    });
    throw new Error(`Datafordeler ${operation} HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(bodyText);
  } catch (error) {
    logServerEvent({
      module,
      operation: "graphqlFetch",
      severity: "fatal",
      message: "Ugyldig JSON i GraphQL-svar",
      error,
      metadata: { body: bodyText.slice(0, 500) },
    });
    throw new Error(`Datafordeler ${operation} returnerede ugyldig JSON`);
  }

  const parsed = graphQlEnvelopeSchema.parse(rawParsed);

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

  if (dataSchema) {
    return dataSchema.parse(parsed.data);
  }

  return parsed.data as T;
}
