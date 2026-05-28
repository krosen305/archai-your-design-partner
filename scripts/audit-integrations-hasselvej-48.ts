/**
 * Integration audit for Hasselvej 48, 2830 Virum.
 *
 * Run:
 *   bun --env-file=.env.local scripts/audit-integrations-hasselvej-48.ts
 *   bun --env-file=.env.local scripts/audit-integrations-hasselvej-48.ts --write docs/integration-audit-hasselvej-48.json
 *
 * Purpose:
 *   Call the current integration adapters directly and capture:
 *   - exact input per call
 *   - normalized output per call
 *   - whether the service behaved as live/mock/skipped/error
 *   - duration and thrown error text
 */

import { writeFile } from "node:fs/promises";
import { inspect } from "node:util";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { runtimeConfig } from "@/lib/runtime-config";
import { MOCK_ADRESSE } from "@/lib/mock-data";
import type { SourceResult } from "@/lib/source-result";
import { GsearchService } from "@/integrations/gsearch/client";
import { DarService } from "@/integrations/dar/client";
import { BbrService } from "@/integrations/bbr/client";
import { MatService } from "@/integrations/mat/client";
import { MatGeometryService } from "@/integrations/mat/geometry";
import { GrundarealResolver } from "@/integrations/mat/grundareal-resolver";
import { EbrService } from "@/integrations/ebr/client";
import { VurService } from "@/integrations/vur/client";
import { FbbService } from "@/integrations/fbb/client";
import { PlandataService } from "@/integrations/plandata/client";
import { FjernvarmeService } from "@/integrations/plandata/fjernvarme";
import { NaturbeskyttelseService } from "@/integrations/sdfi/naturbeskyttelse";
import { GeusService } from "@/integrations/geus/client";
import { bboxFromPoint, DhmService } from "@/integrations/sdfi/dhm-client";
import { DkJordService } from "@/integrations/miljoe/dkjord";
import { TinglysningService } from "@/integrations/tinglysning/client";
import { GeoDanmarkNaboService } from "@/integrations/geodanmark/client";
import { PlandataSurroundingsService } from "@/integrations/plandata/surroundings";
import { MatNeighborParcelService } from "@/integrations/mat/neighbor-parcels";
import { MstNoiseService } from "@/integrations/stoej/mst-noise";
import { TjekditnetService } from "@/integrations/tjekditnet/client";
import { EnergyLabelService } from "@/integrations/energimaerke/client";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type AuditStatus = "live" | "mock" | "skipped" | "error";

type AuditStep = {
  id: string;
  category: string;
  description: string;
  input: JsonValue;
  status: AuditStatus;
  isMock: boolean;
  durationMs: number;
  output: JsonValue | null;
  error: string | null;
  rawCalls: JsonValue[];
};

type HttpTrace = {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseBodyInfo: string | null;
  error: string | null;
};

class FetchTraceError extends Error {
  rawCalls: HttpTrace[];
  causeValue: unknown;

  constructor(message: string, rawCalls: HttpTrace[], causeValue: unknown) {
    super(message);
    this.name = "FetchTraceError";
    this.rawCalls = rawCalls;
    this.causeValue = causeValue;
  }
}

type AuditContext = {
  address: typeof MOCK_ADRESSE;
  gsearch: Awaited<ReturnType<typeof GsearchService.getSuggestions>> | null;
  dar: Awaited<ReturnType<typeof DarService.getAddressDetails>> | null;
  mat: Awaited<ReturnType<typeof MatService.getGrundareal>> | null;
  bbr: Awaited<ReturnType<typeof BbrService.getKompliantData>> | null;
  geometry: Awaited<ReturnType<typeof MatGeometryService.getParcelGeometry>> | null;
  ebr: Awaited<ReturnType<typeof EbrService.getBfeNr>> | null;
  resolver: Awaited<ReturnType<typeof GrundarealResolver.resolve>> | null;
  plandataLokalplaner: Awaited<
    ReturnType<typeof PlandataService.getLokalplanerForKoordinat>
  > | null;
  plandataRamme: Awaited<ReturnType<typeof PlandataService.getKommuneplanrammeForKoordinat>> | null;
};

type AuditReport = {
  generatedAt: string;
  address: JsonValue;
  featureFlags: JsonValue;
  runtime: JsonValue;
  summary: {
    live: number;
    mock: number;
    skipped: number;
    error: number;
    total: number;
  };
  steps: AuditStep[];
};

const WRITE_FLAG = "--write";

function getWritePath(): string | null {
  const index = process.argv.indexOf(WRITE_FLAG);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const out: Record<string, JsonValue> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (typeof inner === "function") continue;
      out[key] = toJsonValue(inner, seen);
    }
    return out;
  }
  return String(value);
}

function trimText(input: string, max = 600): string {
  return input.length > max ? `${input.slice(0, max)}...` : input;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function requestBodyToString(body: BodyInit | null | undefined): string | null {
  if (!body) return null;
  if (typeof body === "string") return trimText(body, 4000);
  if (body instanceof URLSearchParams) return trimText(body.toString(), 4000);
  if (body instanceof FormData) {
    const pairs: string[] = [];
    body.forEach((value, key) => {
      pairs.push(`${key}=${typeof value === "string" ? value : "[Blob]"}`);
    });
    return trimText(pairs.join("&"), 4000);
  }
  if (body instanceof Blob) {
    return `[Blob size=${body.size} type=${body.type || "unknown"}]`;
  }
  if (body instanceof ArrayBuffer) {
    return `[ArrayBuffer bytes=${body.byteLength}]`;
  }
  if (ArrayBuffer.isView(body)) {
    return `[TypedArray bytes=${body.byteLength}]`;
  }
  if (typeof body === "object" && "toString" in body) {
    return trimText(String(body), 4000);
  }
  return null;
}

async function responsePreview(
  response: Response,
): Promise<{ body: string | null; info: string | null }> {
  const contentType = response.headers.get("content-type") ?? "";
  const clone = response.clone();

  if (
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("text") ||
    contentType.includes("html")
  ) {
    const text = await clone.text();
    return { body: trimText(text, 8000), info: null };
  }

  const buffer = await clone.arrayBuffer();
  return {
    body: null,
    info: `[binary content-type=${contentType || "unknown"} bytes=${buffer.byteLength}]`,
  };
}

async function withFetchTrace<T>(
  call: () => Promise<T>,
): Promise<{ result: T; rawCalls: HttpTrace[] }> {
  const originalFetch = globalThis.fetch;
  const rawCalls: HttpTrace[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request =
      input instanceof Request
        ? input
        : new Request(typeof input === "string" ? input : input.toString(), init);
    const method = init?.method ?? request.method ?? "GET";
    const requestHeaders = headersToObject(new Headers(init?.headers ?? request.headers));
    const requestBody = requestBodyToString(init?.body);

    const trace: HttpTrace = {
      url: request.url,
      method,
      requestHeaders,
      requestBody,
      responseStatus: null,
      responseHeaders: {},
      responseBody: null,
      responseBodyInfo: null,
      error: null,
    };

    try {
      const response = await originalFetch(input, init);
      trace.responseStatus = response.status;
      trace.responseHeaders = headersToObject(response.headers);
      const preview = await responsePreview(response);
      trace.responseBody = preview.body;
      trace.responseBodyInfo = preview.info;
      rawCalls.push(trace);
      return response;
    } catch (error) {
      trace.error = trimText(error instanceof Error ? error.message : String(error), 2000);
      rawCalls.push(trace);
      throw error;
    }
  }) as typeof globalThis.fetch;

  try {
    try {
      const result = await call();
      return { result, rawCalls };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new FetchTraceError(message, rawCalls, error);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function classifySourceResult<T>(result: SourceResult<T>): AuditStatus {
  if (result.status === "ok") return result.isMock ? "mock" : "live";
  if (result.status === "mock") return "mock";
  if (result.status === "skipped") return "skipped";
  return "error";
}

function classifyPlainResult(
  result: Record<string, unknown> | null | undefined,
  options?: {
    mock?: boolean;
    skippedWhen?: (value: Record<string, unknown>) => boolean;
    errorWhen?: (value: Record<string, unknown>) => boolean;
  },
): AuditStatus {
  if (!result) return "error";
  if (options?.mock) return "mock";
  if (options?.skippedWhen?.(result)) return "skipped";
  if (options?.errorWhen?.(result)) return "error";
  return "live";
}

function deriveDetailMessage(result: unknown, status: AuditStatus): string | null {
  if (!result || typeof result !== "object") {
    return status === "error" ? "Service returned an error-like result without details" : null;
  }

  const record = result as Record<string, unknown>;
  const fejl = typeof record.fejl === "string" && record.fejl.trim() ? record.fejl.trim() : null;
  if (fejl) return trimText(fejl);

  const sourceStatus =
    typeof record.status === "string"
      ? record.status
      : typeof record.kilde === "string"
        ? record.kilde
        : null;

  if (status === "skipped") {
    return sourceStatus ? `Service returned status=${sourceStatus}` : "Service was skipped";
  }

  if (status === "mock") {
    return null;
  }

  if (status === "error") {
    return sourceStatus
      ? `Service returned status=${sourceStatus} without explicit error message`
      : "Service returned an error-like result without explicit error message";
  }

  return null;
}

async function runStep<T>(
  id: string,
  category: string,
  description: string,
  input: unknown,
  call: () => Promise<T>,
  classify: (result: T) => AuditStatus,
  isMock: (result: T, status: AuditStatus) => boolean,
): Promise<{ step: AuditStep; result: T | null }> {
  const start = Date.now();

  try {
    const { result, rawCalls } = await withFetchTrace(call);
    const status = classify(result);
    const durationMs = Date.now() - start;
    const step: AuditStep = {
      id,
      category,
      description,
      input: toJsonValue(input),
      status,
      isMock: isMock(result, status),
      durationMs,
      output: toJsonValue(result),
      error: deriveDetailMessage(result, status),
      rawCalls: toJsonValue(rawCalls) as JsonValue[],
    };
    return { step, result };
  } catch (error) {
    const durationMs = Date.now() - start;
    const rawCalls = error instanceof FetchTraceError ? error.rawCalls : [];
    const causeValue = error instanceof FetchTraceError ? error.causeValue : error;
    const message = causeValue instanceof Error ? causeValue.message : String(causeValue);
    return {
      step: {
        id,
        category,
        description,
        input: toJsonValue(input),
        status: "error",
        isMock: false,
        durationMs,
        output: null,
        error: trimText(message),
        rawCalls: toJsonValue(rawCalls) as JsonValue[],
      },
      result: null,
    };
  }
}

function printStep(step: AuditStep): void {
  const status = step.status.toUpperCase();
  process.stdout.write(`\n[${status}] ${step.id} - ${step.description} (${step.durationMs}ms)\n`);
  process.stdout.write(`input: ${inspect(step.input, { depth: 8, breakLength: 120 })}\n`);
  if (step.error) {
    process.stdout.write(`error: ${step.error}\n`);
  } else {
    process.stdout.write(`output: ${inspect(step.output, { depth: 8, breakLength: 120 })}\n`);
  }
  if (step.rawCalls.length > 0) {
    process.stdout.write(`rawCalls: ${inspect(step.rawCalls, { depth: 8, breakLength: 120 })}\n`);
  }
}

function summarize(steps: AuditStep[]) {
  return {
    live: steps.filter((step) => step.status === "live").length,
    mock: steps.filter((step) => step.status === "mock").length,
    skipped: steps.filter((step) => step.status === "skipped").length,
    error: steps.filter((step) => step.status === "error").length,
    total: steps.length,
  };
}

async function main() {
  FEATURE_FLAGS.geodanmarkMock = false;
  FEATURE_FLAGS.plandataSurroundingsMock = false;
  FEATURE_FLAGS.matNeighborParcelsMock = false;
  FEATURE_FLAGS.geusMock = false;
  FEATURE_FLAGS.dhmMock = false;
  FEATURE_FLAGS.tinglysningMock = false;

  const steps: AuditStep[] = [];
  const ctx: AuditContext = {
    address: MOCK_ADRESSE,
    gsearch: null,
    dar: null,
    mat: null,
    bbr: null,
    geometry: null,
    ebr: null,
    resolver: null,
    plandataLokalplaner: null,
    plandataRamme: null,
  };

  const addressLine = MOCK_ADRESSE.adresse;
  const coords = MOCK_ADRESSE.koordinater;

  const gsearchRun = await runStep(
    "gsearch",
    "address",
    "Address autocomplete via GSearch",
    { query: addressLine },
    () => GsearchService.getSuggestions(addressLine),
    (result) => (result.length > 0 ? "live" : "error"),
    () => false,
  );
  steps.push(gsearchRun.step);
  printStep(gsearchRun.step);
  ctx.gsearch = gsearchRun.result;

  const darRun = await runStep(
    "dar",
    "register",
    "DAR address enrichment",
    { adresseid: MOCK_ADRESSE.adresseid },
    () => DarService.getAddressDetails(MOCK_ADRESSE.adresseid),
    (result) => classifyPlainResult(result, { errorWhen: (value) => !value.adgangsadresseid }),
    () => false,
  );
  steps.push(darRun.step);
  printStep(darRun.step);
  ctx.dar = darRun.result;

  const matRun = await runStep(
    "mat",
    "register",
    "MAT grundareal + hard-stop flags",
    {
      ejerlavskode: MOCK_ADRESSE.ejerlavskode,
      matrikelnummer: MOCK_ADRESSE.matrikelnummer,
    },
    () =>
      MatService.getGrundareal(MOCK_ADRESSE.ejerlavskode ?? 0, MOCK_ADRESSE.matrikelnummer ?? ""),
    (result) => classifyPlainResult(result, { errorWhen: (value) => Boolean(value.fejl) }),
    () => false,
  );
  steps.push(matRun.step);
  printStep(matRun.step);
  ctx.mat = matRun.result;

  const bbrRun = await runStep(
    "bbr",
    "register",
    "BBR compliant building summary",
    {
      adgangsadresseid: MOCK_ADRESSE.adgangsadresseid,
      grundareal: ctx.mat?.registreretAreal ?? ctx.dar?.grundareal ?? MOCK_ADRESSE.grundareal,
    },
    () =>
      BbrService.getKompliantData(
        MOCK_ADRESSE.adgangsadresseid ?? "",
        ctx.mat?.registreretAreal ?? ctx.dar?.grundareal ?? MOCK_ADRESSE.grundareal,
      ),
    (result) =>
      classifyPlainResult(result, {
        errorWhen: (value) => Boolean(value.fejl) && !value.bygning_lokal_id,
      }),
    () => false,
  );
  steps.push(bbrRun.step);
  printStep(bbrRun.step);
  ctx.bbr = bbrRun.result;

  const matGeometryRun = await runStep(
    "mat_geometry",
    "geometry",
    "MAT parcel geometry",
    {
      jordstykkeLokalId: ctx.mat?.jordstykkeLokalId ?? ctx.bbr?.jordstykke_lokal_id,
      registreretArealM2: ctx.mat?.registreretAreal ?? ctx.dar?.grundareal ?? null,
    },
    async () => {
      const jordstykkeLokalId = ctx.mat?.jordstykkeLokalId ?? ctx.bbr?.jordstykke_lokal_id;
      if (!jordstykkeLokalId) {
        throw new Error("Mangler jordstykkeLokalId til MatGeometryService");
      }
      return MatGeometryService.getParcelGeometry(
        jordstykkeLokalId,
        ctx.mat?.registreretAreal ?? ctx.dar?.grundareal ?? null,
      );
    },
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(matGeometryRun.step);
  printStep(matGeometryRun.step);
  ctx.geometry = matGeometryRun.result;

  const resolverRun = await runStep(
    "grundareal_resolver",
    "fallback",
    "GrundarealResolver fallback routes",
    {
      adgangsadresseid: MOCK_ADRESSE.adgangsadresseid,
      adresseid: MOCK_ADRESSE.adresseid,
    },
    () =>
      GrundarealResolver.resolve({
        adgangsadresseid: MOCK_ADRESSE.adgangsadresseid ?? "",
        adresseid: MOCK_ADRESSE.adresseid,
      }),
    (result) => classifyPlainResult(result, { errorWhen: (value) => Boolean(value.fejl) }),
    () => false,
  );
  steps.push(resolverRun.step);
  printStep(resolverRun.step);
  ctx.resolver = resolverRun.result;

  const ebrRun = await runStep(
    "ebr",
    "register",
    "EBR BFE lookup",
    { husnummerLokalId: MOCK_ADRESSE.adgangsadresseid },
    () => EbrService.getBfeNr(MOCK_ADRESSE.adgangsadresseid ?? ""),
    (result) => classifyPlainResult(result, { errorWhen: (value) => Boolean(value.fejl) }),
    () => false,
  );
  steps.push(ebrRun.step);
  printStep(ebrRun.step);
  ctx.ebr = ebrRun.result;

  const vurRun = await runStep(
    "vur",
    "register",
    "VUR property valuation",
    { bfeNr: ctx.ebr?.bfeNr ?? null },
    async () => {
      if (!ctx.ebr?.bfeNr) {
        throw new Error("Mangler BFE-nummer til VUR-opslag");
      }
      return VurService.getVurdering(ctx.ebr.bfeNr);
    },
    (result) => classifyPlainResult(result, { errorWhen: (value) => Boolean(value.fejl) }),
    () => false,
  );
  steps.push(vurRun.step);
  printStep(vurRun.step);

  const fbbRun = await runStep(
    "fbb",
    "register",
    "FBB SAVE lookup",
    {
      bygningIds: ctx.bbr?.alle_bygning_lokal_ids.length
        ? ctx.bbr.alle_bygning_lokal_ids
        : ctx.bbr?.bygning_lokal_id
          ? [ctx.bbr.bygning_lokal_id]
          : [],
    },
    () =>
      FbbService.getSaveData(
        ctx.bbr?.alle_bygning_lokal_ids.length
          ? ctx.bbr.alle_bygning_lokal_ids
          : ctx.bbr?.bygning_lokal_id
            ? [ctx.bbr.bygning_lokal_id]
            : [],
      ),
    (result) => classifyPlainResult(result, { errorWhen: (value) => value.kilde === "fejl" }),
    () => false,
  );
  steps.push(fbbRun.step);
  printStep(fbbRun.step);

  const lokalplanRun = await runStep(
    "plandata_lokalplaner",
    "planning",
    "Plandata lokalplaner for point",
    { lng: coords.lng, lat: coords.lat, includeForslag: true },
    () => PlandataService.getLokalplanerForKoordinat(coords.lng, coords.lat, true),
    (result) =>
      classifyPlainResult(result, {
        errorWhen: (value) => Boolean(value.fejl) && Number(value.rawCount ?? 0) === 0,
      }),
    () => false,
  );
  steps.push(lokalplanRun.step);
  printStep(lokalplanRun.step);
  ctx.plandataLokalplaner = lokalplanRun.result;

  const rammeRun = await runStep(
    "plandata_kommuneplanramme",
    "planning",
    "Plandata kommuneplanramme for point",
    { lng: coords.lng, lat: coords.lat },
    () => PlandataService.getKommuneplanrammeForKoordinat(coords.lng, coords.lat),
    (result) =>
      classifyPlainResult(result, { errorWhen: (value) => Boolean(value.fejl) && !value.ramme }),
    () => false,
  );
  steps.push(rammeRun.step);
  printStep(rammeRun.step);
  ctx.plandataRamme = rammeRun.result;

  const planContextRun = await runStep(
    "plandata_ext",
    "planning",
    "Plandata parcel context",
    {
      koordinat: coords,
      parcelPolygonSource: "not provided in script",
      lokalplanCount: ctx.plandataLokalplaner?.lokalplaner.length ?? 0,
      kommuneplanramme: ctx.plandataRamme?.ramme ?? null,
    },
    () =>
      PlandataService.getPlanContextForParcel({
        koordinat: coords,
        parcelPolygon: null,
        lokalplaner: ctx.plandataLokalplaner?.lokalplaner ?? [],
        kommuneplanramme: ctx.plandataRamme?.ramme ?? null,
      }),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(planContextRun.step);
  printStep(planContextRun.step);

  const fjernvarmeRun = await runStep(
    "fjernvarme",
    "utilities",
    "District heating coverage",
    { koordinat: coords },
    () => FjernvarmeService.getDaekning(coords),
    (result) =>
      classifyPlainResult(result, { mock: false, errorWhen: (value) => Boolean(value.fejl) }),
    () => false,
  );
  steps.push(fjernvarmeRun.step);
  printStep(fjernvarmeRun.step);

  const naturRun = await runStep(
    "naturbeskyttelse",
    "environment",
    "Naturbeskyttelseslinjer",
    { koordinat: coords },
    () => NaturbeskyttelseService.getTilstand(coords),
    () => "live",
    () => false,
  );
  steps.push(naturRun.step);
  printStep(naturRun.step);

  const geusRun = await runStep(
    "geus",
    "environment",
    "GEUS groundwater/radon",
    { lat: coords.lat, lng: coords.lng, featureFlagMock: FEATURE_FLAGS.geusMock },
    () => GeusService.getRiskData(coords.lat, coords.lng),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(geusRun.step);
  printStep(geusRun.step);

  const dhmBbox = bboxFromPoint(coords.lat, coords.lng, MOCK_ADRESSE.grundareal);
  const dhmRun = await runStep(
    "dhm",
    "terrain",
    "DHM terrain model",
    { bbox: dhmBbox, lat: coords.lat, lng: coords.lng, featureFlagMock: FEATURE_FLAGS.dhmMock },
    () => DhmService.getTerrainData(dhmBbox, coords.lat, coords.lng),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(dhmRun.step);
  printStep(dhmRun.step);

  const dkjordRun = await runStep(
    "dkjord",
    "environment",
    "DK-Jord contamination screening",
    { koordinat: coords, parcelPolygon: null },
    () => DkJordService.getTilstand(coords, null),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(dkjordRun.step);
  printStep(dkjordRun.step);

  const tinglysningRun = await runStep(
    "tinglysning",
    "legal",
    "Tinglysning servitutter",
    {
      addressId: MOCK_ADRESSE.adresseid,
      ejerlavskode: MOCK_ADRESSE.ejerlavskode,
      matrikelnummer: MOCK_ADRESSE.matrikelnummer,
      featureFlagMock: FEATURE_FLAGS.tinglysningMock,
    },
    () =>
      TinglysningService.getServitutter(
        MOCK_ADRESSE.adresseid,
        MOCK_ADRESSE.ejerlavskode,
        MOCK_ADRESSE.matrikelnummer,
      ),
    (result) => classifyPlainResult(result, { mock: result.kilde === "mock" }),
    (result) => result.kilde === "mock",
  );
  steps.push(tinglysningRun.step);
  printStep(tinglysningRun.step);

  const geodanmarkRun = await runStep(
    "geodanmark_nabo",
    "surroundings",
    "GeoDanmark neighbor buildings",
    {
      parcelBbox25832: ctx.geometry?.data?.bbox25832 ?? null,
      adresseBbox25832: dhmBbox,
      ownJordstykkeLokalId: ctx.mat?.jordstykkeLokalId ?? null,
    },
    () =>
      GeoDanmarkNaboService.getNabobygninger(
        ctx.geometry?.data?.bbox25832 ?? null,
        [dhmBbox.minX, dhmBbox.minY, dhmBbox.maxX, dhmBbox.maxY],
        ctx.mat?.jordstykkeLokalId ?? null,
      ),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(geodanmarkRun.step);
  printStep(geodanmarkRun.step);

  const surroundingsRun = await runStep(
    "plandata_surroundings",
    "surroundings",
    "Plandata surroundings context",
    { bbox25832: [dhmBbox.minX, dhmBbox.minY, dhmBbox.maxX, dhmBbox.maxY] },
    () =>
      PlandataSurroundingsService.getSurroundings([
        dhmBbox.minX,
        dhmBbox.minY,
        dhmBbox.maxX,
        dhmBbox.maxY,
      ]),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(surroundingsRun.step);
  printStep(surroundingsRun.step);

  const neighborParcelsRun = await runStep(
    "mat_neighbor_parcels",
    "surroundings",
    "MAT neighbor parcels",
    {
      ownJordstykkeId: ctx.mat?.jordstykkeLokalId ?? null,
      bbox25832: [dhmBbox.minX, dhmBbox.minY, dhmBbox.maxX, dhmBbox.maxY],
    },
    async () => {
      if (!ctx.mat?.jordstykkeLokalId) {
        throw new Error("Mangler jordstykkeLokalId til MatNeighborParcelService");
      }
      return MatNeighborParcelService.getNeighborParcels(ctx.mat.jordstykkeLokalId, [
        dhmBbox.minX,
        dhmBbox.minY,
        dhmBbox.maxX,
        dhmBbox.maxY,
      ]);
    },
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(neighborParcelsRun.step);
  printStep(neighborParcelsRun.step);

  const noiseRun = await runStep(
    "mst_noise",
    "surroundings",
    "National noise screening",
    {
      addressId: MOCK_ADRESSE.adresseid,
      bbox25832: [dhmBbox.minX, dhmBbox.minY, dhmBbox.maxX, dhmBbox.maxY],
    },
    () =>
      MstNoiseService.getNoiseForParcel(MOCK_ADRESSE.adresseid, [
        dhmBbox.minX,
        dhmBbox.minY,
        dhmBbox.maxX,
        dhmBbox.maxY,
      ]),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(noiseRun.step);
  printStep(noiseRun.step);

  const broadbandRun = await runStep(
    "tjekditnet",
    "utilities",
    "Broadband coverage from Supabase bulk import",
    { adgangsadresseid: MOCK_ADRESSE.adgangsadresseid },
    () => TjekditnetService.getCoverage(MOCK_ADRESSE.adgangsadresseid ?? ""),
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(broadbandRun.step);
  printStep(broadbandRun.step);

  const energyRun = await runStep(
    "energimaerke",
    "utilities",
    "Energy label via EMOData SOAP",
    { bbrBygningId: ctx.bbr?.bygning_lokal_id ?? null },
    async () => {
      if (!ctx.bbr?.bygning_lokal_id) {
        throw new Error("Mangler canonical BBR bygning_lokal_id til energimaerke-opslag");
      }
      return EnergyLabelService.getLabel(ctx.bbr.bygning_lokal_id);
    },
    classifySourceResult,
    (result) => result.isMock,
  );
  steps.push(energyRun.step);
  printStep(energyRun.step);

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    address: toJsonValue(MOCK_ADRESSE),
    featureFlags: toJsonValue(FEATURE_FLAGS),
    runtime: toJsonValue({
      datafordelerEndpoints: runtimeConfig.integrations.datafordeler,
      gsearchEndpoint: runtimeConfig.integrations.gsearch.endpoint,
      gsearchLimit: runtimeConfig.integrations.gsearch.resultLimit,
    }),
    summary: summarize(steps),
    steps,
  };

  process.stdout.write("\n=== Summary ===\n");
  process.stdout.write(`${inspect(report.summary, { depth: 4, breakLength: 120 })}\n`);

  const writePath = getWritePath();
  if (writePath) {
    await writeFile(writePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`\nWrote report to ${writePath}\n`);
  }
}

await main();
