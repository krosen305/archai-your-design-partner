// src/integrations/stoej/mst-noise.ts
// SERVER-SIDE ONLY.
//
// MST Støjkortlægning — screener parcel mod nationale støjkort.
//
// STATUS: IS_MOCK=true. MST leverer støjkort som WMS (billedlag).
// WFS/feature-adgang er ikke bekræftet (Task 0 step 6).
// Hvis WFS-adgang opnås: implementer live-stien og sæt IS_MOCK=false.
// Hvis kun WMS: behold IS_MOCK=true og returnér coverage="source_unavailable".
// Undlad ALDRIG at udlede dB-værdier fra WMS-billedfarver.
//
// Vejledende dB-grænseværdier (Miljøstyrelsen, boligområder):
//   Vejstøj:  Lden 58 dB
//   Togstøj:  Lden 64 dB
//   Flystøj:  Lden 55 dB
//   Virksomhed: ingen absolut grænse — altid review_required

import { makeMockResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NoiseScreeningResult } from "@/domain/contracts/noise.types";

const IS_MOCK = true;
const SOURCE_URL =
  "https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej";

export class MstNoiseService {
  static async getNoiseForParcel(
    addressId: string,
    _bbox25832: [number, number, number, number],
  ): Promise<SourceResult<NoiseScreeningResult>> {
    if (IS_MOCK) {
      const mockResult: NoiseScreeningResult = {
        addressId,
        parcelIntersectionUsed: false,
        metrics: [
          {
            source: "road",
            ldenDb: null,
            lnightDb: null,
            heightM: null,
            model: "unknown",
            year: null,
            coverage: "source_unavailable",
          },
          {
            source: "rail",
            ldenDb: null,
            lnightDb: null,
            heightM: null,
            model: "unknown",
            year: null,
            coverage: "source_unavailable",
          },
          {
            source: "air",
            ldenDb: null,
            lnightDb: null,
            heightM: null,
            model: "unknown",
            year: null,
            coverage: "source_unavailable",
          },
        ],
        highestRisk: "unknown",
        requiresAcousticReview: null,
        sourceUrl: SOURCE_URL,
        fetchedAt: new Date().toISOString(),
      };

      return makeMockResult<NoiseScreeningResult>(mockResult, {
        kilde: "mst_noise",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
      });
    }

    throw new Error("MstNoiseService: live-sti ikke implementeret — IS_MOCK skal være true");
  }
}
