import { useEffect, useState, useCallback } from "react";

export type CockpitMode = "due-diligence" | "design";

const STORAGE_KEY = "projectMode";
const EVENT_NAME = "cockpit-mode-change";

function readMode(): CockpitMode {
  if (typeof sessionStorage === "undefined") return "design";
  return sessionStorage.getItem(STORAGE_KEY) === "due-diligence" ? "due-diligence" : "design";
}

/**
 * Reactive hook for cockpit mode (due-diligence vs design).
 * Synkroniseres på tværs af komponenter via custom event.
 */
export function useCockpitMode(): [CockpitMode, (m: CockpitMode) => void] {
  const [mode, setModeState] = useState<CockpitMode>(readMode);

  useEffect(() => {
    const handler = () => setModeState(readMode());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setMode = useCallback((m: CockpitMode) => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, m);
    }
    setModeState(m);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENT_NAME));
    }
  }, []);

  return [mode, setMode];
}
