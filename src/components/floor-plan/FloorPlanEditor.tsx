import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FloorPlanCanvas } from "./FloorPlanCanvas";
import { FloorPlanInspector } from "./FloorPlanInspector";
import { FloorPlanToolbar, type FloorPlanTool } from "./FloorPlanToolbar";
import { VerificationPanel } from "./VerificationPanel";
import { FloorPlanComplianceStrip } from "./FloorPlanComplianceStrip";
import { useFloorPlanEditor, type GenerateFloorPlanForm } from "@/hooks/useFloorPlanEditor";
import type { RoomZone } from "@/domain/floor-plan/floor-plan.types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FloorPlanEditorProps = {
  projectId: string | null;
  addressLabel: string | null;
  backTo: string;
};

const ROOM_TYPES: Array<{ value: RoomZone["roomType"]; label: string }> = [
  { value: "entrance", label: "Entré" },
  { value: "living", label: "Stue" },
  { value: "kitchen", label: "Køkken" },
  { value: "bedroom", label: "Værelse" },
  { value: "bathroom", label: "Bad" },
  { value: "utility", label: "Bryggers" },
  { value: "office", label: "Kontor" },
  { value: "technical", label: "Teknik" },
  { value: "other", label: "Andet" },
];

const DEFAULT_ROOMS: GenerateFloorPlanForm["rooms"] = [
  { name: "Entré", roomType: "entrance" },
  { name: "Stue", roomType: "living" },
  { name: "Køkken", roomType: "kitchen" },
  { name: "Soveværelse", roomType: "bedroom" },
  { name: "Bad", roomType: "bathroom" },
  { name: "Bryggers", roomType: "utility" },
];

export function FloorPlanEditor({ projectId, addressLabel, backTo }: FloorPlanEditorProps) {
  const editor = useFloorPlanEditor({ projectId });
  const [tool, setTool] = useState<FloorPlanTool>("select");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [targetAreaM2, setTargetAreaM2] = useState("120");
  const [footprintWidthM, setFootprintWidthM] = useState("");
  const [footprintDepthM, setFootprintDepthM] = useState("");
  const [rooms, setRooms] = useState(DEFAULT_ROOMS);

  const activeLevelId = editor.activeLevelId ?? editor.document?.levels[0]?.id ?? null;
  const busy = editor.busyState !== "idle";
  const statusMessage = editor.error ?? editor.liveFindings[0]?.message ?? null;
  const totalNetArea = useMemo(
    () =>
      editor.document?.levels
        .flatMap((level) => level.rooms)
        .reduce((sum, room) => sum + room.netAreaM2, 0) ?? 0,
    [editor.document],
  );

  async function handleGenerate() {
    const target = Number.parseFloat(targetAreaM2);
    const width = Number.parseFloat(footprintWidthM);
    const depth = Number.parseFloat(footprintDepthM);
    await editor.generate({
      targetAreaM2: Number.isFinite(target) && target > 0 ? target : 120,
      rooms,
      footprint:
        Number.isFinite(width) && width > 0 && Number.isFinite(depth) && depth > 0
          ? { widthM: width, depthM: depth }
          : undefined,
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-surface px-5">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" asChild aria-label="Tilbage">
            <Link to={backTo}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Plantegning</h1>
            <p className="text-xs text-muted-foreground">{addressLabel ?? "Projekt uden adresse"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !projectId}
            onClick={() => void editor.loadActive()}
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
            Hent aktiv
          </Button>
        </div>
      </header>

      {!projectId && (
        <div className="mx-auto mt-10 max-w-xl rounded-md border border-amber-200 bg-amber-50 p-5 text-amber-900">
          Plantegningen kræver et gemt projekt-id. Åbn den fra et eksisterende cockpit eller fortsæt
          adresseanalysen først.
        </div>
      )}

      {projectId && !editor.document && (
        <main className="mx-auto max-w-5xl px-5 py-8">
          <section className="grid gap-5 rounded-xl border border-border/40 bg-surface p-6 lg:grid-cols-[320px_1fr]">
            <div>
              <h2 className="text-base font-semibold text-foreground">Opret plantegning</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Den første model genereres deterministisk fra areal, footprint og rumprogram.
              </p>
            </div>
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium text-stone-700">
                  Areal m²
                  <input
                    type="number"
                    min={20}
                    step={1}
                    value={targetAreaM2}
                    onChange={(event) => setTargetAreaM2(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
                  />
                </label>
                <label className="text-sm font-medium text-stone-700">
                  Bredde m
                  <input
                    type="number"
                    min={1}
                    step={0.1}
                    value={footprintWidthM}
                    onChange={(event) => setFootprintWidthM(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
                  />
                </label>
                <label className="text-sm font-medium text-stone-700">
                  Dybde m
                  <input
                    type="number"
                    min={1}
                    step={0.1}
                    value={footprintDepthM}
                    onChange={(event) => setFootprintDepthM(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
                  />
                </label>
              </div>

              <div className="space-y-2">
                {rooms.map((room, index) => (
                  <div
                    key={`${room.roomType}-${index}`}
                    className="grid gap-2 sm:grid-cols-[1fr_160px_40px]"
                  >
                    <input
                      value={room.name}
                      onChange={(event) =>
                        setRooms((current) =>
                          current.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, name: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                      className="rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
                    />
                    <select
                      value={room.roomType}
                      onChange={(event) =>
                        setRooms((current) =>
                          current.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  roomType: event.target.value as RoomZone["roomType"],
                                }
                              : candidate,
                          ),
                        )
                      }
                      className="rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
                    >
                      {ROOM_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Fjern rum"
                      disabled={rooms.length <= 1}
                      onClick={() =>
                        setRooms((current) =>
                          current.filter((_, candidateIndex) => candidateIndex !== index),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setRooms((current) => [...current, { name: "Nyt rum", roomType: "other" }])
                  }
                >
                  <Plus />
                  Tilføj rum
                </Button>
                <Button type="button" disabled={busy} onClick={() => void handleGenerate()}>
                  {editor.busyState === "generating" && <RefreshCw className="animate-spin" />}
                  Generer plantegning
                </Button>
              </div>

              {editor.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  {editor.error}
                </div>
              )}
              {editor.blockers.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {editor.blockers.map((blocker) => (
                    <p key={blocker}>{blocker}</p>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {editor.document && activeLevelId && (
        <main className="flex min-h-[calc(100vh-65px)] flex-col">
          <div className="flex items-center gap-2 border-b border-border/40 bg-surface px-4 py-2">
            {editor.document.levels.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => editor.selectLevel(level.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeLevelId === level.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-surface-elevated",
                )}
              >
                {level.name}
              </button>
            ))}
          </div>

          <FloorPlanComplianceStrip
            totalNetAreaM2={totalNetArea}
            targetAreaM2={Number.parseFloat(targetAreaM2) || 120}
          />

          <div className="flex flex-1 flex-col lg:flex-row">
            <FloorPlanToolbar
              activeTool={tool}
              snapEnabled={snapEnabled}
              canUndo={editor.canUndo}
              canRedo={editor.canRedo}
              onToolChange={setTool}
              onToggleSnap={() => setSnapEnabled((value) => !value)}
              onUndo={editor.undo}
              onRedo={editor.redo}
            />
            <FloorPlanCanvas
              document={editor.document}
              levelId={activeLevelId}
              selectedElement={editor.selectedElement}
              activeTool={tool}
              snapEnabled={snapEnabled}
              statusMessage={statusMessage}
              findings={editor.localFindings}
              onSelectElement={editor.selectElement}
              onPreviewCommand={editor.previewCommand}
              onResetPreview={editor.resetPreview}
              onCommitCommand={(command, baseDocument) =>
                editor.commitCommand(command, baseDocument, "drag")
              }
            />
            <div className="flex w-full flex-col lg:w-[340px]">
              <FloorPlanInspector
                document={editor.document}
                levelId={activeLevelId}
                selectedElement={editor.selectedElement}
                onCommitCommand={editor.commitCommand}
              />
              <VerificationPanel
                busy={busy}
                localFindings={editor.localFindings}
                liveFindings={editor.liveFindings}
                formalVerification={editor.formalVerification}
                exportResult={editor.exportResult}
                onVerify={editor.verify}
                onExport={editor.exportPlan}
              />
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-surface px-5 py-2 text-xs text-muted-foreground">
            <div className="flex gap-4">
              <span>{editor.document.levels.length} etage{editor.document.levels.length !== 1 ? "r" : ""}</span>
              <span>{totalNetArea.toFixed(1)} m² netto</span>
            </div>
            <div
              className="font-mono opacity-30"
              data-testid="floor-plan-version"
              title={editor.floorPlanIterationId ?? "ingen version"}
            >
              v{editor.floorPlanIterationId ? editor.floorPlanIterationId.slice(0, 6) : "—"}
            </div>
          </footer>
        </main>
      )}
    </div>
  );
}
