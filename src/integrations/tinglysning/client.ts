// SERVER-SIDE ONLY – credentials must never be exposed to the browser.
// Tinglysning – servitutter og andre tinglyste rettigheder.
//
// ⚠️  SKELETON med IS_MOCK guard — Tinglysning API-adgang er ikke afklaret.
//     Se ARCH-30 for API-research (official API, partner access, scraping).
//
// Når live API er klar:
//   - Erstat IS_MOCK-guard med rigtigt HTTP-kald
//   - Opdater output-typen med verificerede feltnavne
//   - Se ARCH-26 for fuld implementation spec

// ---------------------------------------------------------------------------
// Mock flag — sæt til false når live API er implementeret
// ---------------------------------------------------------------------------

import { FEATURE_FLAGS } from "@/lib/feature-flags";
const IS_MOCK = FEATURE_FLAGS.tinglysningMock;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type ServitutResult = {
  tekster: string[]; // alle servitut-tekster for adressen
  kritiske: string[]; // servitutter der direkte påvirker byggeri
  kilde: "mock" | "live";
};

// ---------------------------------------------------------------------------
// Mock data — deterministisk testdata for lokal udvikling
// ---------------------------------------------------------------------------

const MOCK_SERVITUTTER: ServitutResult = {
  tekster: [
    "Deklaration om fælles vej og parkering, lyst 15.04.1987",
    "Byggeservitut: Ingen bebyggelse inden for 3m fra skel mod nabo, lyst 22.09.1994",
    "Kloakservitut: Fælles kloakledning over ejendommen, lyst 01.03.2001",
  ],
  kritiske: ["Byggeservitut: Ingen bebyggelse inden for 3m fra skel mod nabo, lyst 22.09.1994"],
  kilde: "mock",
};

// ---------------------------------------------------------------------------
// TinglysningService
// ---------------------------------------------------------------------------

export class TinglysningService {
  /**
   * Henter servitutter for en adresse.
   *
   * @param addressId  DAWA/DAR adresseid — bruges som opslags-nøgle
   *
   * IS_MOCK = true: returnerer deterministiske mock-data uden netværkskald.
   * IS_MOCK = false: kræver Tinglysning API-adgang (ikke implementeret endnu).
   */
  static async getServitutter(addressId: string): Promise<ServitutResult> {
    if (!addressId) {
      return { tekster: [], kritiske: [], kilde: "mock" };
    }

    if (IS_MOCK) {
      return MOCK_SERVITUTTER;
    }

    // TODO (ARCH-26): Implementér live Tinglysning API-kald
    // Options: https://api.tinglysning.dk / partneradgang / controlled scraping
    throw new Error("TinglysningService: live API ikke implementeret endnu (IS_MOCK = false)");
  }
}
