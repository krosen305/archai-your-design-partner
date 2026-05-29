// Shared contract for all data source service return values.
// Import this in every new integration service.

export type SourceStatus = "ok" | "error" | "skipped" | "mock";

export type SourceConfidence =
  | "confirmed" // value read directly from a typed register (BBR, MAT, WFS feature)
  | "estimated" // value extracted from JSONB/PDF; may have parsing errors
  | "missing" // source returned null/empty; constraint falls back to BR18 default
  | "unknown"; // API error or timeout; do not interpret as "clean" or "absent"

/**
 * Struktureret fejl-information når status="error". P0/P1 #7 fra Hasselvej 48
 * dataflow-audit: gem kind/httpStatus/contentType så trace-summary kan skelne
 * "endpoint nede" fra "forkert schema" fra "forkert input".
 */
export type SourceErrorDetails = {
  /** Bred kategori — fx "http", "timeout", "schema", "input", "network". */
  kind?: string;
  /** HTTP-statuskode hvis fejlen kom fra et HTTP-svar. */
  httpStatus?: number;
  /** Content-Type fra svaret når relevant (fx "text/html" ved HTML-fejlside). */
  contentType?: string;
  /** Schema-validation-kode hvis Zod fejlede (fx zod-issue path). */
  schemaCode?: string;
  /** Kort fejlbesked til operatør-debug. */
  message?: string;
};

export type SourceResult<T> = {
  /** Normalized, typed payload. null on error/skipped. */
  data: T | null;
  /** Call outcome — never map API errors to "ok" with empty data. */
  status: SourceStatus;
  /** Data confidence level within the payload. */
  confidence: SourceConfidence;
  /** Which register/service — matches ComplianceFlag.kilde values. */
  kilde: string;
  /** ISO timestamp when this result was produced. */
  fetchedAt: string;
  /** WFS endpoint URL, typename, or layer name(s) used. null for DB sources. */
  sourceUrl: string | null;
  /** Number of WFS features returned. null for non-WFS sources. */
  rawFeatureCount: number | null;
  /** True when IS_MOCK=true was active. Suppresses "live data" UI indicators. */
  isMock: boolean;
  /** Struktureret fejl-info når status="error". Bevares så trace/UI ikke
   *  behøver at fortolke fri-tekst-fejl. */
  errorDetails?: SourceErrorDetails;
};

type OkMeta = {
  kilde: string;
  sourceUrl: string | null;
  rawFeatureCount: number | null;
  confidence?: SourceConfidence;
};

type ErrorMeta = {
  kilde: string;
  sourceUrl: string | null;
};

export function makeOkResult<T>(data: T, meta: OkMeta): SourceResult<T> {
  return {
    data,
    status: "ok",
    confidence: meta.confidence ?? "confirmed",
    kilde: meta.kilde,
    fetchedAt: new Date().toISOString(),
    sourceUrl: meta.sourceUrl,
    rawFeatureCount: meta.rawFeatureCount,
    isMock: false,
  };
}

export function makeErrorResult<T>(
  error: unknown,
  meta: ErrorMeta,
  errorDetails?: SourceErrorDetails,
): SourceResult<T> {
  const fallbackMessage = error instanceof Error ? error.message : String(error);
  return {
    data: null,
    status: "error",
    confidence: "unknown",
    kilde: meta.kilde,
    fetchedAt: new Date().toISOString(),
    sourceUrl: meta.sourceUrl,
    rawFeatureCount: null,
    isMock: false,
    errorDetails: { message: fallbackMessage, ...errorDetails },
  };
}

export function makeMockResult<T>(data: T, meta: OkMeta): SourceResult<T> {
  return {
    data,
    status: "mock",
    confidence: meta.confidence ?? "estimated",
    kilde: meta.kilde,
    fetchedAt: new Date().toISOString(),
    sourceUrl: meta.sourceUrl,
    rawFeatureCount: meta.rawFeatureCount,
    isMock: true,
  };
}

export function makeSkippedResult<T>(meta: ErrorMeta): SourceResult<T> {
  return {
    data: null,
    status: "skipped",
    confidence: "unknown",
    kilde: meta.kilde,
    fetchedAt: new Date().toISOString(),
    sourceUrl: meta.sourceUrl,
    rawFeatureCount: null,
    isMock: false,
  };
}

/**
 * Formats a SourceResult for analysis_events.output_summary.
 * dataFields callback receives result.data and should return key=value pairs.
 * Returns string like: "status=ok confidence=confirmed features=3 v1=false v2=null"
 */
export function summarizeSourceResult<T>(
  result: SourceResult<T>,
  dataFields?: (data: T) => string,
): string {
  const parts = [
    `status=${result.status}`,
    `confidence=${result.confidence}`,
    `features=${result.rawFeatureCount ?? "null"}`,
  ];
  if (result.isMock) parts.push("mock=true");
  if (result.errorDetails) {
    const { kind, httpStatus, contentType } = result.errorDetails;
    if (kind) parts.push(`error_kind=${kind}`);
    if (httpStatus !== undefined) parts.push(`http=${httpStatus}`);
    if (contentType) parts.push(`content_type=${contentType}`);
  }
  if (dataFields && result.data !== null) parts.push(dataFields(result.data));
  return parts.join(" ");
}
