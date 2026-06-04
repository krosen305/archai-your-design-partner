import {
  DoorOpen,
  Hand,
  Magnet,
  MousePointer2,
  Redo2,
  Ruler,
  Square,
  Undo2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type FloorPlanTool = "select" | "pan" | "draw_wall" | "add_opening";

type FloorPlanToolbarProps = {
  activeTool: FloorPlanTool;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: FloorPlanTool) => void;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function FloorPlanToolbar({
  activeTool,
  snapEnabled,
  canUndo,
  canRedo,
  onToolChange,
  onToggleSnap,
  onUndo,
  onRedo,
}: FloorPlanToolbarProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-stone-200 bg-white px-2 py-3">
        <ToolButton
          label="Vælg og træk"
          active={activeTool === "select"}
          onClick={() => onToolChange("select")}
        >
          <MousePointer2 />
        </ToolButton>
        <ToolButton
          label="Panorer"
          active={activeTool === "pan"}
          onClick={() => onToolChange("pan")}
        >
          <Hand />
        </ToolButton>

        <div className="my-1 h-px w-8 bg-stone-200" />

        <ToolButton label="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 />
        </ToolButton>
        <ToolButton label="Redo" disabled={!canRedo} onClick={onRedo}>
          <Redo2 />
        </ToolButton>

        <div className="my-1 h-px w-8 bg-stone-200" />

        <ToolButton label="Snap" active={snapEnabled} onClick={onToggleSnap}>
          <Magnet />
        </ToolButton>

        <div className="my-1 h-px w-8 bg-stone-200" />

        <ToolButton
          label="Tegn væg"
          active={activeTool === "draw_wall"}
          onClick={() => onToolChange("draw_wall")}
        >
          <Ruler />
        </ToolButton>
        <ToolButton
          label="Tilføj dør/vindue"
          active={activeTool === "add_opening"}
          onClick={() => onToolChange("add_opening")}
        >
          <DoorOpen />
        </ToolButton>
        <ToolButton label="Fixture-oprettelse kommer senere" disabled>
          <Square />
        </ToolButton>

        <div className="mt-auto">
          <ToolButton label="Præcisionsværktøjer kommer senere" disabled>
            <Wrench />
          </ToolButton>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className={cn(
            "h-9 w-9 rounded-md border border-transparent text-stone-600",
            active && "border-stone-900 bg-stone-900 text-white hover:bg-stone-800",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
