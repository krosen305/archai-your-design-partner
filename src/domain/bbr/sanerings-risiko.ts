// Pure heuristic for demolition/renovation contamination risk.
// Based on building year and raw BBR cladding codes.
//
// Danish asbest/PCB bans:
//   Asbestcement in buildings: widespread until ~1984 (official ban 1986)
//   PCB in building materials (caulk, paint): banned 1978
//   Lead paint: common pre-1960, declining through 1970s
//
// "hoej"   = asbest, PCB and lead all plausible → environmental survey required before demolition
// "moderat" = PCB or asbestcement plausible → investigation recommended
// "lav"    = post-ban materials, low risk

export type SaneringsRisiko = "hoej" | "moderat" | "lav";

// BBR byg032 kode 5 = "Eternit/fibercement" — asbestcement risk until 1984
const ETERNIT_YDERVAEG_KODE = "5";
// BBR byg033 kode 2 = "Eternit/fibercement" — note: different code from ydervæg
const ETERNIT_TAG_KODE = "2";

export function deriveSaneringsRisiko(
  byggeaar: number | null,
  ydervaegKode: string | null,
  tagKode: string | null,
): SaneringsRisiko | null {
  if (byggeaar === null) return null;
  // Pre-1950: asbest, PCB, bly, tjære all plausible
  if (byggeaar < 1950) return "hoej";
  // 1950-1979: PCB possible (banned 1978), asbestcement still common
  if (byggeaar < 1980) return "moderat";
  // Post-1979: check for eternit/fibercement materials (asbestcement used until ~1984)
  if (byggeaar < 1985) {
    if (ydervaegKode === ETERNIT_YDERVAEG_KODE || tagKode === ETERNIT_TAG_KODE) {
      return "moderat";
    }
  }
  return "lav";
}
