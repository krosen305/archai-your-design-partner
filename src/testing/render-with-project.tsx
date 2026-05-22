import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { useProject } from "@/lib/project-store";

/**
 * Reset the real Zustand project store to its initial state.
 * Call this in beforeEach to isolate tests.
 * NEVER mock @/lib/project-store — use the real store.
 */
export function resetProjectStore() {
  useProject.getState().reset();
}

/**
 * Render a component after resetting the project store.
 * Returns all @testing-library/react utilities.
 */
export function renderWithProject(ui: ReactElement) {
  resetProjectStore();
  return render(ui);
}
