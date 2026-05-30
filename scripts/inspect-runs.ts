// Quick one-off: inspect a list of analysis_runs by id, with their events.
// Run with: bun scripts/inspect-runs.ts <runId> [<runId> ...]
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mangler SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY i env");
  process.exit(1);
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Brug: bun scripts/inspect-runs.ts <runId> [<runId> ...]");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

for (const id of ids) {
  console.log("\n=========================================");
  console.log("RUN", id);
  console.log("=========================================");
  const { data: run, error: runErr } = await supabase
    .from("analysis_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (runErr) {
    console.error("run-fejl:", runErr.message);
    continue;
  }
  if (!run) {
    console.log("(ingen række fundet)");
    continue;
  }
  console.log(JSON.stringify(run, null, 2));

  const { data: events, error: evErr } = await supabase
    .from("analysis_events")
    .select(
      "id, event_type, phase, service, operation, status, cache_hit, attempt, http_status, duration_ms, error_message, input_summary, output_summary, decision_summary, created_at",
    )
    .eq("run_id", id)
    .order("created_at", { ascending: true });
  if (evErr) {
    console.error("events-fejl:", evErr.message);
    continue;
  }
  console.log(`\nEVENTS (${events?.length ?? 0}):`);
  for (const ev of events ?? []) {
    const ts = new Date(ev.created_at).toISOString();
    const dur = ev.duration_ms != null ? `${ev.duration_ms}ms` : "-";
    const status =
      ev.status === "ok" ? "OK" : ev.status === "error" ? "ERR" : (ev.status?.toUpperCase() ?? "?");
    console.log(
      `  [${ts}] ${status.padEnd(4)} ${(ev.phase ?? "-").padEnd(20)} ${ev.service}.${ev.operation} dur=${dur} attempt=${ev.attempt ?? "-"}${
        ev.http_status != null ? ` http=${ev.http_status}` : ""
      }${ev.cache_hit != null ? ` cache=${ev.cache_hit}` : ""}`,
    );
    if (ev.input_summary) console.log(`    in:  ${ev.input_summary}`);
    if (ev.output_summary) console.log(`    out: ${ev.output_summary}`);
    if (ev.decision_summary) console.log(`    dec: ${ev.decision_summary}`);
    if (ev.error_message) console.log(`    err: ${ev.error_message}`);
  }
}
