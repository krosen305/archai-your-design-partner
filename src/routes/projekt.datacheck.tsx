import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Minus,
  Save,
} from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import {
  DATA_POINT_DEFS,
  SECTIONS,
  getReadinessScores,
  getRiskFlags,
  type DataPointStatus,
  type DataStatusMap,
} from "@/lib/datacheck";

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const loadDatacheckSchema = z.object({
  addressId: z.string().min(1).max(64),
  token: z.string().min(1),
  projectId: z.string().uuid().optional().nullable(),
});

const loadDatacheck = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loadDatacheckSchema.parse(data))
  .handler(async ({ data }): Promise<DataStatusMap> => {
    const { loadProject } = await import("@/integrations/supabase/project-persistence");
    const project = await loadProject(data.token, data.projectId ?? null);
    if (!project?.project_data_status || typeof project.project_data_status !== "object") {
      return {} as DataStatusMap;
    }

    return project.project_data_status as DataStatusMap;
  });

const saveDatacheckSchema = z.object({
  addressId: z.string().min(1).max(64),
  statusMap: z.record(z.string(), z.unknown()),
  token: z.string().min(1),
  projectId: z.string().uuid().optional().nullable(),
});

const saveDatacheck = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveDatacheckSchema.parse(data))
  .handler(async ({ data }): Promise<void> => {
    const { saveProject } = await import("@/integrations/supabase/project-persistence");
    await saveProject(
      data.token,
      { currentStep: "datacheck", projectDataStatus: data.statusMap as Json },
      data.projectId ?? null,
    );
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/projekt/datacheck")({
  component: DatacheckPage,
});

function DatacheckPage() {
  const { address, currentProjectId } = useProject();
  const [statusMap, setStatusMap] = useState<DataStatusMap>({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(SECTIONS.map((s) => s.nr)),
  );
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<DataStatusMap | null>(null);

  useEffect(() => {
    if (!address?.adresseid) return;
    (async () => {
      try {
        const { getSession } = await import("@/lib/auth");
        const session = await getSession();
        if (!session) return;
        const map = await loadDatacheck({
          data: {
            addressId: address.adresseid,
            token: session.access_token,
            projectId: currentProjectId,
          },
        });
        setStatusMap(map);
      } catch {
        // fortsæt med tomt map
      } finally {
        setLoaded(true);
      }
    })();
  }, [address?.adresseid, currentProjectId]);

  async function persistMap(map: DataStatusMap) {
    if (!address?.adresseid) return;
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (!session) return;
      await saveDatacheck({
        data: {
          addressId: address.adresseid,
          statusMap: map,
          token: session.access_token,
          projectId: currentProjectId,
        },
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }

  function scheduleSave(map: DataStatusMap) {
    pendingSaveRef.current = map;
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current) persistMap(pendingSaveRef.current);
    }, 600);
  }

  function handleStatus(fieldId: string, status: DataPointStatus) {
    const now = new Date().toISOString();
    const updated: DataStatusMap = {
      ...statusMap,
      [fieldId]: { fieldId, status, note: statusMap[fieldId]?.note, updatedAt: now },
    };
    setStatusMap(updated);
    scheduleSave(updated);
  }

  function handleNote(fieldId: string, note: string) {
    const now = new Date().toISOString();
    const existing = statusMap[fieldId];
    const updated: DataStatusMap = {
      ...statusMap,
      [fieldId]: {
        fieldId,
        status: existing?.status ?? "not_started",
        note,
        updatedAt: now,
      },
    };
    setStatusMap(updated);
    scheduleSave(updated);
  }

  const scores = getReadinessScores(statusMap);
  const risks = getRiskFlags(statusMap);

  const toggleSection = (nr: number) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(nr)) next.delete(nr);
      else next.add(nr);
      return next;
    });

  const toggleNote = (id: string) =>
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!address) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[720px] px-6 py-16 text-center">
          <div className="font-mono text-xs text-muted-foreground">
            Ingen adresse valgt — gå tilbage og vælg en adresse.
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[800px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>

        <div className="mb-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
          {address.adresse}
        </div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-mono text-2xl text-foreground">Projektparathed</h1>
          <SaveIndicator state={saveState} />
        </div>

        {/* Readiness scores */}
        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          {scores.map((s) => (
            <ReadinessCard key={s.phase} score={s} />
          ))}
        </div>

        {/* Risk flags */}
        {loaded && risks.length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-2">
              RISICI
            </div>
            {risks.map((r) => (
              <div
                key={r.fieldId}
                className={`flex items-start gap-3 rounded-md border p-3 ${
                  r.severity === "high"
                    ? "border-danger/40 bg-danger/5"
                    : "border-warning/40 bg-warning/5"
                }`}
              >
                <AlertTriangle
                  size={14}
                  className={`shrink-0 mt-0.5 ${r.severity === "high" ? "text-danger" : "text-warning"}`}
                />
                <div>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.1em] ${r.severity === "high" ? "text-danger" : "text-warning"}`}
                  >
                    {r.severity === "high" ? "høj risiko" : "medium risiko"}
                  </span>
                  <p className="text-sm text-foreground mt-0.5">{r.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-3">
          {SECTIONS.map((sec) => {
            const fields = DATA_POINT_DEFS.filter((d) => d.section === sec.nr);
            const doneCount = fields.filter((d) => {
              const s = statusMap[d.id]?.status;
              return s === "done" || s === "not_applicable";
            }).length;
            const isExpanded = expandedSections.has(sec.nr);

            return (
              <Card key={sec.nr} className="p-0 overflow-hidden">
                <button
                  onClick={() => toggleSection(sec.nr)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground" />
                    )}
                    <span className="font-mono text-[11px] tracking-[0.12em] text-foreground">
                      {sec.nr}. {sec.label.toUpperCase()}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {doneCount}/{fields.length}
                  </span>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className="border-t border-border/40"
                  >
                    {fields.map((def, i) => {
                      const entry = statusMap[def.id];
                      const status = entry?.status ?? "not_started";
                      const noteOpen = expandedNotes.has(def.id);

                      return (
                        <div
                          key={def.id}
                          className={`px-4 py-3 ${i < fields.length - 1 ? "border-b border-border/30" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-foreground font-medium">
                                  {def.label}
                                </span>
                                {def.kritisk && (
                                  <span className="font-mono text-[9px] text-accent border border-accent/40 rounded px-1">
                                    KRITISK
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {def.description}
                              </p>
                              {noteOpen && (
                                <textarea
                                  className="mt-2 w-full rounded border border-border/60 bg-[#111] px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-accent/60 resize-none"
                                  rows={2}
                                  placeholder="Tilføj note..."
                                  defaultValue={entry?.note ?? ""}
                                  onChange={(e) => handleNote(def.id, e.target.value)}
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <StatusButtons
                                value={status}
                                onChange={(s) => handleStatus(def.id, s)}
                              />
                              <button
                                onClick={() => toggleNote(def.id)}
                                className={`ml-1 rounded p-1 font-mono text-[10px] transition-colors ${
                                  noteOpen || entry?.note
                                    ? "text-accent"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                                title="Note"
                              >
                                ≡
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReadinessCard({ score }: { score: ReturnType<typeof getReadinessScores>[number] }) {
  const color =
    score.pct >= 80 ? "text-success" : score.pct >= 40 ? "text-warning" : "text-muted-foreground";

  return (
    <Card>
      <div className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground mb-2">
        {score.label.toUpperCase()}
      </div>
      <div className={`font-mono text-3xl ${color}`}>{score.pct}%</div>
      <div className="text-xs text-muted-foreground mt-1">
        {score.done}/{score.total} kritiske felter
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#222]">
        <div
          className={`h-full transition-all duration-500 ${
            score.pct >= 80 ? "bg-success" : score.pct >= 40 ? "bg-warning" : "bg-[#444]"
          }`}
          style={{ width: `${score.pct}%` }}
        />
      </div>
    </Card>
  );
}

type StatusButtonsProps = {
  value: DataPointStatus;
  onChange: (s: DataPointStatus) => void;
};

const STATUS_OPTIONS: {
  value: DataPointStatus;
  icon: typeof CheckCircle2;
  label: string;
  active: string;
  inactive: string;
}[] = [
  {
    value: "not_started",
    icon: Minus,
    label: "Ikke startet",
    active: "text-muted-foreground border-border bg-[#222]",
    inactive: "text-[#444] border-[#333] hover:border-border",
  },
  {
    value: "in_progress",
    icon: Clock,
    label: "Igangsat",
    active: "text-warning border-warning/60 bg-warning/10",
    inactive: "text-[#444] border-[#333] hover:border-border",
  },
  {
    value: "done",
    icon: CheckCircle2,
    label: "Udført",
    active: "text-success border-success/60 bg-success/10",
    inactive: "text-[#444] border-[#333] hover:border-border",
  },
  {
    value: "not_applicable",
    icon: Minus,
    label: "N/A",
    active: "text-muted-foreground border-border bg-[#1a1a1a] line-through",
    inactive: "text-[#444] border-[#333] hover:border-border",
  },
];

function StatusButtons({ value, onChange }: StatusButtonsProps) {
  return (
    <div className="flex gap-0.5">
      {STATUS_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.label}
            className={`rounded border px-1.5 py-1 font-mono text-[9px] tracking-[0.05em] transition-all ${
              isActive ? opt.active : opt.inactive
            }`}
          >
            <Icon size={10} />
          </button>
        );
      })}
    </div>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
      {state === "saving" ? (
        <>
          <Save size={10} className="animate-pulse" /> Gemmer...
        </>
      ) : (
        <>
          <CheckCircle2 size={10} className="text-success" /> Gemt
        </>
      )}
    </div>
  );
}
