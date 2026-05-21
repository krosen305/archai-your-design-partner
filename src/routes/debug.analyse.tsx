import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  AnalysisEventRow,
  AnalysisRunRow,
  TracingDatabase,
} from "@/lib/analysis-tracing-types";
import { getEnvOptional } from "@/lib/env";

type AnalysisRunView = AnalysisRunRow & { events: AnalysisEventRow[] };
type AnalysisRunWithRelation = AnalysisRunRow & { analysis_events: AnalysisEventRow[] | null };

const tracingDb = supabaseAdmin as unknown as SupabaseClient<TracingDatabase>;

const getAnalysisRunsSchema = z.object({
  addressId: z.string().nullable(),
  projectId: z.string().nullable(),
  token: z.string().min(1),
});

const getAnalysisRuns = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => getAnalysisRunsSchema.parse(d))
  .handler(async ({ data }): Promise<AnalysisRunView[]> => {
    if (getEnvOptional("ENVIRONMENT") === "production") {
      throw new Error("403: Debug view er ikke tilgaengeligt i produktion");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.token);
    if (authError || !authData.user) throw new Error("401: Ikke autentificeret");

    const role = String(authData.user.app_metadata?.role ?? "");
    if (role !== "admin" && role !== "service_role") {
      throw new Error("403: Kun admin har adgang til debug analyse");
    }

    let query = tracingDb
      .from("analysis_runs")
      .select(
        `id, run_kind, address_id, project_id, user_id, source, status,
         started_at, completed_at, duration_ms, error_message, metadata,
         analysis_events (
           id, run_id, event_type, phase, service, operation, status,
           cache_hit, attempt, http_status, duration_ms, error_message,
           metadata, input_summary, output_summary, decision_summary, created_at
         )`,
      )
      .order("started_at", { ascending: false })
      .limit(20);

    if (data.addressId) query = query.eq("address_id", data.addressId);
    if (data.projectId) query = query.eq("project_id", data.projectId);

    const { data: runs, error } = await query.returns<AnalysisRunWithRelation[]>();
    if (error) throw new Error(`DB fejl: ${error.message}`);

    return (runs ?? []).map((run) => ({
      ...run,
      events: [...(run.analysis_events ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    }));
  });

export const Route = createFileRoute("/debug/analyse")({
  component: DebugAnalysePage,
});

function DebugAnalysePage() {
  const [addressId, setAddressId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [runs, setRuns] = useState<AnalysisRunView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (!session) throw new Error("Ingen session");

      const result = await getAnalysisRuns({
        data: {
          addressId: addressId || null,
          projectId: projectId || null,
          token: session.access_token,
        },
      });
      setRuns(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-mono text-sm tracking-widest text-foreground">DEBUG / ANALYSE LOG</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Intern visning af analysekorsler - kun tilgaengelig i dev/staging.
        </p>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="address_id (Datafordeler adresseid)"
          value={addressId}
          onChange={(e) => setAddressId(e.target.value)}
          className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm font-mono"
          data-testid="debug-address-input"
        />
        <input
          type="text"
          placeholder="project_id (UUID)"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm font-mono"
          data-testid="debug-project-input"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
          data-testid="debug-search-btn"
        >
          {loading ? "Soger..." : "Sog"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-danger" data-testid="debug-error">
          {error}
        </p>
      )}

      {runs.length === 0 && !loading && !error && (
        <p className="text-sm text-muted-foreground">Ingen korsler endnu.</p>
      )}

      <div className="space-y-3" data-testid="debug-runs-list">
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            expanded={expandedRun === run.id}
            onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RunCard({
  run,
  expanded,
  onToggle,
}: {
  run: AnalysisRunView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor =
    run.status === "done"
      ? "text-emerald-400"
      : run.status === "failed"
        ? "text-danger"
        : "text-yellow-400";

  return (
    <div className="rounded border border-border p-4 space-y-2" data-testid="debug-run-card">
      <button type="button" onClick={onToggle} className="w-full text-left space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            {run.run_kind}
          </span>
          <span className={`font-mono text-[10px] tracking-widest ${statusColor}`}>
            {run.status.toUpperCase()}
          </span>
        </div>
        <div className="text-xs text-foreground font-mono">{run.id}</div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {run.address_id && <span>adresse: {run.address_id.slice(0, 16)}...</span>}
          <span>{run.events.length} steps</span>
          {run.duration_ms != null && <span>{run.duration_ms}ms</span>}
          <span>{new Date(run.started_at).toLocaleTimeString("da-DK")}</span>
        </div>
        {run.error_message && <div className="text-xs text-danger">{run.error_message}</div>}
      </button>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3 space-y-1">
          {run.events.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: AnalysisEventRow }) {
  const statusColor =
    event.status === "ok"
      ? "text-emerald-400"
      : event.status === "error"
        ? "text-danger"
        : "text-muted-foreground";

  return (
    <div
      className="grid grid-cols-[80px_100px_1fr] gap-2 py-1 text-xs"
      data-testid="debug-event-row"
    >
      <span className={`font-mono ${statusColor}`}>{event.status.toUpperCase()}</span>
      <span className="text-muted-foreground font-mono truncate">{event.service}</span>
      <div className="space-y-0.5">
        <div className="text-foreground">{event.operation}</div>
        {event.input_summary && (
          <div className="text-muted-foreground">in: {event.input_summary}</div>
        )}
        {event.output_summary && (
          <div className="text-muted-foreground">out: {event.output_summary}</div>
        )}
        {event.decision_summary && (
          <div className="text-yellow-400">decision: {event.decision_summary}</div>
        )}
        {event.error_message && <div className="text-danger">error: {event.error_message}</div>}
        <div className="text-muted-foreground/50">
          {event.phase && `${event.phase} � `}
          {event.duration_ms != null && `${event.duration_ms}ms`}
          {event.cache_hit === true && " � cache-hit"}
        </div>
      </div>
    </div>
  );
}
