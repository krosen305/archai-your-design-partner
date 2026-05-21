import { z } from "zod";

export type BbrBuildingNode = {
  id_lokalId: string | null;
  byg007Bygningsnummer: number | null;
  byg021BygningensAnvendelse: string | null;
  byg024AntalLejlighederMedKoekken: number | null;
  byg025AntalLejlighederUdenKoekken: number | null;
  byg026Opfoerelsesaar: number | null;
  byg027OmTilbygningsaar: number | null;
  byg029DatoForMidlertidigOpfoertBygning: string | null;
  byg032YdervaeggensMateriale: string | null;
  byg033Tagdaekningsmateriale: string | null;
  byg038SamletBygningsareal: number | null;
  byg039BygningensSamledeBoligAreal: number | null;
  byg040BygningensSamledeErhvervsAreal: number | null;
  byg041BebyggetAreal: number | null;
  byg054AntalEtager: number | null;
  byg055AfvigendeEtager: string | null;
  byg056Varmeinstallation: string | null;
  byg057Opvarmningsmiddel: string | null;
  byg070Fredning: string | null;
  byg071BevaringsvaerdighedReference: string | null;
  byg094Revisionsdato: string | null;
  status: string | null;
  registreringFra: string | null;
  registreringTil: string | null;
  virkningFra: string | null;
  virkningTil: string | null;
};

const bbrBuildingNodeSchema = z.object({
  id_lokalId: z.string().nullable(),
  byg007Bygningsnummer: z.number().nullable(),
  byg021BygningensAnvendelse: z.string().nullable(),
  byg024AntalLejlighederMedKoekken: z.number().nullable(),
  byg025AntalLejlighederUdenKoekken: z.number().nullable(),
  byg026Opfoerelsesaar: z.number().nullable(),
  byg027OmTilbygningsaar: z.number().nullable(),
  byg029DatoForMidlertidigOpfoertBygning: z.string().nullable(),
  byg032YdervaeggensMateriale: z.string().nullable(),
  byg033Tagdaekningsmateriale: z.string().nullable(),
  byg038SamletBygningsareal: z.number().nullable(),
  byg039BygningensSamledeBoligAreal: z.number().nullable(),
  byg040BygningensSamledeErhvervsAreal: z.number().nullable(),
  byg041BebyggetAreal: z.number().nullable(),
  byg054AntalEtager: z.number().nullable(),
  byg055AfvigendeEtager: z.string().nullable(),
  byg056Varmeinstallation: z.string().nullable(),
  byg057Opvarmningsmiddel: z.string().nullable(),
  byg070Fredning: z.string().nullable(),
  byg071BevaringsvaerdighedReference: z.string().nullable(),
  byg094Revisionsdato: z.string().nullable(),
  status: z.string().nullable(),
  registreringFra: z.string().nullable(),
  registreringTil: z.string().nullable(),
  virkningFra: z.string().nullable(),
  virkningTil: z.string().nullable(),
});

const bbrResponseSchema = z.object({
  BBR_Bygning: z.object({
    nodes: z.array(bbrBuildingNodeSchema),
  }),
});

export function parseBbrBygninger(data: unknown): BbrBuildingNode[] {
  const parsed = bbrResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Ugyldigt BBR GraphQL-response payload");
  }

  return parsed.data.BBR_Bygning.nodes;
}
