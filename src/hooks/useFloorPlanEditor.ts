import { useCallback, useEffect, useMemo, useState } from "react";
import { applyCommand } from "@/domain/floor-plan/apply-command";
import type { LiveFinding } from "@/domain/floor-plan/apply-command";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";
import type { FloorPlanDocument, RoomZone } from "@/domain/floor-plan/floor-plan.types";
import {
  exportFloorPlanFn,
  generateFloorPlanFn,
  loadActiveFloorPlanFn,
  applyFloorPlanCommandFn,
  verifyFloorPlanFn,
} from "@/lib/floor-plan/floor-plan.functions";
import { runVerification, type VerificationFinding } from "@/domain/floor-plan/verification-engine";
import type { ExportFloorPlanResult } from "@/services/floor-plan/export-floor-plan.service";
import type { FloorPlanVerificationResult } from "@/services/floor-plan/verify-floor-plan.service";

export type FloorPlanSelection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "fixture"; id: string }
  | { kind: "room"; id: string };

export type FloorPlanBusyState =
  | "idle"
  | "loading"
  | "generating"
  | "applying"
  | "verifying"
  | "exporting";

export type GenerateFloorPlanForm = {
  targetAreaM2: number;
  footprint?: { widthM: number; depthM: number };
  rooms: Array<{ name: string; roomType: RoomZone["roomType"] }>;
};

export type UseFloorPlanEditorOptions = {
  projectId: string | null;
};

export type UseFloorPlanEditorResult = {
  projectId: string | null;
  document: FloorPlanDocument | null;
  floorPlanIterationId: string | null;
  activeLevelId: string | null;
  selectedElement: FloorPlanSelection | null;
  busyState: FloorPlanBusyState;
  error: string | null;
  blockers: string[];
  liveFindings: LiveFinding[];
  localFindings: VerificationFinding[];
  formalVerification: FloorPlanVerificationResult | null;
  exportResult: ExportFloorPlanResult | null;
  canUndo: boolean;
  canRedo: boolean;
  loadActive: () => Promise<void>;
  generate: (form: GenerateFloorPlanForm) => Promise<boolean>;
  previewCommand: (command: FloorPlanCommand, baseDocument?: FloorPlanDocument) => boolean;
  resetPreview: (baseDocument: FloorPlanDocument) => void;
  commitCommand: (
    command: FloorPlanCommand,
    baseDocument?: FloorPlanDocument,
    source?: "drag" | "keyboard" | "ai" | "system",
  ) => Promise<boolean>;
  verify: () => Promise<void>;
  exportPlan: () => Promise<void>;
  selectElement: (selection: FloorPlanSelection | null) => void;
  selectLevel: (levelId: string) => void;
  undo: () => void;
  redo: () => void;
};

const MAX_SNAPSHOTS = 20;

export function useFloorPlanEditor({
  projectId,
}: UseFloorPlanEditorOptions): UseFloorPlanEditorResult {
  const [document, setDocument] = useState<FloorPlanDocument | null>(null);
  const [floorPlanIterationId, setFloorPlanIterationId] = useState<string | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<FloorPlanSelection | null>(null);
  const [busyState, setBusyState] = useState<FloorPlanBusyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [liveFindings, setLiveFindings] = useState<LiveFinding[]>([]);
  const [formalVerification, setFormalVerification] = useState<FloorPlanVerificationResult | null>(
    null,
  );
  const [exportResult, setExportResult] = useState<ExportFloorPlanResult | null>(null);
  const [undoStack, setUndoStack] = useState<FloorPlanDocument[]>([]);
  const [redoStack, setRedoStack] = useState<FloorPlanDocument[]>([]);

  const localFindings = useMemo(
    () => (document ? runVerification(document).findings : []),
    [document],
  );

  const applyLoadedPlan = useCallback(
    (next: { iterationId: string; document: FloorPlanDocument }) => {
      setFloorPlanIterationId(next.iterationId);
      setDocument(next.document);
      setActiveLevelId((current) =>
        current && next.document.levels.some((level) => level.id === current)
          ? current
          : (next.document.levels[0]?.id ?? null),
      );
      setSelectedElement(null);
      setLiveFindings(runVerification(next.document).findings);
      setFormalVerification(null);
      setExportResult(null);
    },
    [],
  );

  const readToken = useCallback(async (): Promise<string | null> => {
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    return session?.access_token ?? null;
  }, []);

  const loadActive = useCallback(async () => {
    if (!projectId) return;
    setBusyState("loading");
    setError(null);
    setBlockers([]);

    try {
      const token = await readToken();
      if (!token) {
        setError("Log ind for at hente plantegningen.");
        return;
      }

      const active = await loadActiveFloorPlanFn({ data: { projectId, token } });
      // Guard against an unexpected/malformed response (e.g. a non-null error
      // payload): only adopt it when it actually carries a document, otherwise
      // fall back to the empty state instead of crashing the editor.
      if (active?.document) {
        applyLoadedPlan(active);
      } else {
        setDocument(null);
        setFloorPlanIterationId(null);
        setActiveLevelId(null);
        setSelectedElement(null);
      }
      setUndoStack([]);
      setRedoStack([]);
    } catch (err) {
      setError(messageFrom(err, "Plantegningen kunne ikke hentes."));
    } finally {
      setBusyState("idle");
    }
  }, [applyLoadedPlan, projectId, readToken]);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

  const generate = useCallback(
    async (form: GenerateFloorPlanForm): Promise<boolean> => {
      if (!projectId) {
        setError("Projektet mangler en gemt projekt-id.");
        return false;
      }

      const rooms = form.rooms.filter((room) => room.name.trim().length > 0);
      if (rooms.length === 0) {
        setError("Tilføj mindst ét rum før generering.");
        return false;
      }

      setBusyState("generating");
      setError(null);
      setBlockers([]);

      try {
        const token = await readToken();
        if (!token) {
          setError("Log ind for at generere en plantegning.");
          return false;
        }

        const result = await generateFloorPlanFn({
          data: {
            projectId,
            designIterationId: null,
            targetAreaM2: form.targetAreaM2,
            footprint: form.footprint,
            rooms,
            token,
          },
        });

        if (!result.generated) {
          setBlockers(result.blockers ?? []);
          setError(result.blockers?.[0] ?? "Plantegningen blev ikke genereret.");
          return false;
        }

        applyLoadedPlan({
          iterationId: result.floorPlanIterationId,
          document: result.document,
        });
        setUndoStack([]);
        setRedoStack([]);
        return true;
      } catch (err) {
        setError(messageFrom(err, "Plantegningen kunne ikke genereres."));
        return false;
      } finally {
        setBusyState("idle");
      }
    },
    [applyLoadedPlan, projectId, readToken],
  );

  const previewCommand = useCallback(
    (command: FloorPlanCommand, baseDocument = document): boolean => {
      if (!baseDocument) return false;
      const outcome = applyCommand(baseDocument, command);

      if (!outcome.accepted) {
        setError(outcome.message);
        setLiveFindings([]);
        return false;
      }

      setError(null);
      setDocument(outcome.document);
      setLiveFindings(outcome.liveFindings);
      return true;
    },
    [document],
  );

  const resetPreview = useCallback((baseDocument: FloorPlanDocument) => {
    setDocument(baseDocument);
    setLiveFindings(runVerification(baseDocument).findings);
    setError(null);
  }, []);

  const commitCommand = useCallback(
    async (
      command: FloorPlanCommand,
      baseDocument = document,
      source: "drag" | "keyboard" | "ai" | "system" = "drag",
    ): Promise<boolean> => {
      if (!projectId || !floorPlanIterationId || !baseDocument) return false;

      const localOutcome = applyCommand(baseDocument, command);
      if (!localOutcome.accepted) {
        setDocument(baseDocument);
        setError(localOutcome.message);
        setLiveFindings([]);
        return false;
      }

      setBusyState("applying");
      setError(null);
      setDocument(localOutcome.document);
      setLiveFindings(localOutcome.liveFindings);

      try {
        const token = await readToken();
        if (!token) {
          setDocument(baseDocument);
          setError("Log ind for at gemme ændringen.");
          return false;
        }

        const result = await applyFloorPlanCommandFn({
          data: { projectId, floorPlanIterationId, command, source, token },
        });

        if (!result.accepted) {
          setDocument(baseDocument);
          setError(result.message);
          setLiveFindings([]);
          return false;
        }

        setUndoStack((current) => [...current.slice(-(MAX_SNAPSHOTS - 1)), baseDocument]);
        setRedoStack([]);
        setFloorPlanIterationId(result.floorPlanIterationId);
        setLiveFindings(result.liveFindings);

        const active = await loadActiveFloorPlanFn({ data: { projectId, token } });
        if (active) {
          applyLoadedPlan(active);
        }

        return true;
      } catch (err) {
        setDocument(baseDocument);
        setError(messageFrom(err, "Ændringen kunne ikke gemmes."));
        return false;
      } finally {
        setBusyState("idle");
      }
    },
    [applyLoadedPlan, document, floorPlanIterationId, projectId, readToken],
  );

  const verify = useCallback(async () => {
    if (!projectId || !floorPlanIterationId) return;
    setBusyState("verifying");
    setError(null);

    try {
      const token = await readToken();
      if (!token) {
        setError("Log ind for at verificere plantegningen.");
        return;
      }

      const result = await verifyFloorPlanFn({
        data: { projectId, floorPlanIterationId, token },
      });
      setFormalVerification(result);
      setLiveFindings(
        result.findings.map((finding) => ({
          severity: finding.severity,
          category: finding.category,
          message: finding.nextAction
            ? `${finding.message} ${finding.nextAction}`
            : finding.message,
        })),
      );
    } catch (err) {
      setError(messageFrom(err, "Verifikationen kunne ikke gennemføres."));
    } finally {
      setBusyState("idle");
    }
  }, [floorPlanIterationId, projectId, readToken]);

  const exportPlan = useCallback(async () => {
    if (!projectId || !floorPlanIterationId) return;
    setBusyState("exporting");
    setError(null);

    try {
      const token = await readToken();
      if (!token) {
        setError("Log ind for at eksportere plantegningen.");
        return;
      }

      const result = await exportFloorPlanFn({
        data: {
          projectId,
          floorPlanIterationId,
          levelId: activeLevelId ?? undefined,
          token,
        },
      });
      setExportResult(result);
    } catch (err) {
      setError(messageFrom(err, "Eksporten kunne ikke gennemføres."));
    } finally {
      setBusyState("idle");
    }
  }, [activeLevelId, floorPlanIterationId, projectId, readToken]);

  const selectLevel = useCallback(
    (levelId: string) => {
      if (!document?.levels.some((level) => level.id === levelId)) return;
      setActiveLevelId(levelId);
      setSelectedElement(null);
    },
    [document],
  );

  const undo = useCallback(() => {
    if (!document || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1]!;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((current) => [document, ...current].slice(0, MAX_SNAPSHOTS));
    setDocument(previous);
    setLiveFindings(runVerification(previous).findings);
    setFormalVerification(null);
    setExportResult(null);
  }, [document, undoStack]);

  const redo = useCallback(() => {
    if (!document || redoStack.length === 0) return;
    const next = redoStack[0]!;
    setRedoStack(redoStack.slice(1));
    setUndoStack((current) => [...current.slice(-(MAX_SNAPSHOTS - 1)), document]);
    setDocument(next);
    setLiveFindings(runVerification(next).findings);
    setFormalVerification(null);
    setExportResult(null);
  }, [document, redoStack]);

  return {
    projectId,
    document,
    floorPlanIterationId,
    activeLevelId,
    selectedElement,
    busyState,
    error,
    blockers,
    liveFindings,
    localFindings,
    formalVerification,
    exportResult,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    loadActive,
    generate,
    previewCommand,
    resetPreview,
    commitCommand,
    verify,
    exportPlan,
    selectElement: setSelectedElement,
    selectLevel,
    undo,
    redo,
  };
}

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
