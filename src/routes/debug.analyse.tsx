import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import type { AnalysisEventRow, AnalysisRunView } from "@/lib/debug-analysis";

const getAnalysisRunsSchema = z.object({
  addressId: z.string().nullable(),
  projectId: z.string().nullable(),
  token: z.string().min(1),
});

const getAnalysisRuns = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => getAnalysisRunsSchema.parse(d))
  .handler(async ({ data }): Promise<AnalysisRunView[]> => {
    const { loadDebugAnalysisRuns } = await import("@/lib/debug-analysis");
    return loadDebugAnalysisRuns(data);
  });

export const Route = createFileRoute("/debug/analyse")({
  component: DebugAnalysePage,
});

function formatRunDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} ${time}`;
}

function DebugAnalysePage() {
  const [addressId, setAddressId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [runs, setRuns] = useState<AnalysisRunView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
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
  }, [addressId, projectId]);

  useEffect(() => {
    handleSearch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-sm tracking-widest text-foreground font-mono">DEBUG / ANALYSE LOG</h1>
        <p className="mt-1 text-xs text-muted-foreground">
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
    <div className="space-y-2 rounded border border-border p-4" data-testid="debug-run-card">
      <button type="button" onClick={onToggle} className="w-full space-y-1 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono">
            {run.run_kind}
          </span>
          <span className={`text-[10px] tracking-widest font-mono ${statusColor}`}>
            {run.status.toUpperCase()}
          </span>
        </div>
        <div className="text-xs text-foreground font-mono">{run.id}</div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {run.address_id && <span>adresse: {run.address_id.slice(0, 16)}...</span>}
          <span>{run.events.length} steps</span>
          {run.duration_ms != null && <span>{run.duration_ms}ms</span>}
          <span>{formatRunDate(run.started_at)}</span>
        </div>
        {run.error_message && <div className="text-xs text-danger">{run.error_message}</div>}
      </button>

      {expanded && (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          {run.events.map((event) => (
            <EventRow key={event.id} event={event} />
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
      <span className="truncate text-muted-foreground font-mono">{event.service}</span>
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
          {event.phase && `${event.phase} | `}
          {event.duration_ms != null && `${event.duration_ms}ms`}
          {event.cache_hit === true && " | cache-hit"}
        </div>
      </div>
    </div>
  );
}
