import type { BbrKompliantData } from "@/integrations/bbr/client";

/**
 * Checks if a property has hard-stop conditions that make expensive layer-4 analysis unnecessary.
 *
 * Hard stops are non-negotiable blocking conditions:
 * - fredet (listed building)
 * - mat_strandbeskyttelse (beach protection)
 * - mat_fredskov (protected forest)
 * - mat_klitfredning (dune protection)
 *
 * If any hard stop is present, layer-4 services (GEUS, DHM, DkJord, TingService)
 * can be skipped because the design intent is already blocked.
 *
 * @param bbr BBR data with compliance flags, or null if not available
 * @returns true if any hard stop is detected, false otherwise
 */
export function shouldSkipExpensiveLayer4(bbr: BbrKompliantData | null): boolean {
  if (!bbr) return false;
  return (
    bbr.fredet === true ||
    bbr.mat_strandbeskyttelse === true ||
    bbr.mat_fredskov === true ||
    bbr.mat_klitfredning === true
  );
}
