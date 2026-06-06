import { z } from "zod";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const bbrBuildingDueDiligenceNodeSchema = z.object({
  id_lokalId: nullableString,
  byg007Bygningsnummer: nullableNumber,
  byg021BygningensAnvendelse: nullableString,
  byg026Opfoerelsesaar: nullableNumber,
  byg027OmTilbygningsaar: nullableNumber,
  byg029DatoForMidlertidigOpfoertBygning: nullableString,
  byg032YdervaeggensMateriale: nullableString,
  byg033Tagdaekningsmateriale: nullableString,
  byg038SamletBygningsareal: nullableNumber,
  byg039BygningensSamledeBoligAreal: nullableNumber,
  byg040BygningensSamledeErhvervsAreal: nullableNumber,
  byg041BebyggetAreal: nullableNumber,
  byg054AntalEtager: nullableNumber,
  byg055AfvigendeEtager: nullableString,
  byg056Varmeinstallation: nullableString,
  byg057Opvarmningsmiddel: nullableString,
  byg058SupplerendeVarme: nullableString,
  byg070Fredning: nullableString,
  byg071BevaringsvaerdighedReference: nullableString,
  byg094Revisionsdato: nullableString,
  status: nullableString,
  registreringTil: nullableString,
  virkningTil: nullableString,
});

export const bbrUnitNodeSchema = z.object({
  id_lokalId: nullableString,
  bygning: nullableString,
  adresseIdentificerer: nullableString,
  enh020EnhedensAnvendelse: nullableString,
  enh026EnhedensSamledeAreal: nullableNumber,
  enh027ArealTilBeboelse: nullableNumber,
  enh031AntalVaerelser: nullableNumber,
  enh032Toiletforhold: nullableString,
  enh033Badeforhold: nullableString,
  enh034Koekkenforhold: nullableString,
  enh065AntalVandskylledeToiletter: nullableNumber,
  enh066AntalBadevaerelser: nullableNumber,
  status: nullableString,
  registreringTil: nullableString,
  virkningTil: nullableString,
});

export const bbrTechnicalInstallationNodeSchema = z.object({
  id_lokalId: nullableString,
  tek007Anlaegsnummer: nullableNumber,
  tek020Klassifikation: nullableString,
  tek024Etableringsaar: nullableNumber,
  tek026StoerrelsesklasseOlietank: nullableString,
  tek027Placering: nullableString,
  tek028SloejfningOlietank: nullableString,
  tek032Stoerrelse: nullableNumber,
  tek034IndholdOlietank: nullableString,
  tek035SloejfningsfristOlietank: nullableString,
  tek042Revisionsdato: nullableString,
  tek101Gyldighedsdato: nullableString,
  tek107PlaceringPaaSoeterritorie: nullableString,
  status: nullableString,
  registreringTil: nullableString,
  virkningTil: nullableString,
});

export const bbrGroundNodeSchema = z.object({
  id_lokalId: nullableString,
  gru009Vandforsyning: nullableString.optional().default(null),
  gru010Afloebsforhold: nullableString.optional().default(null),
  status: nullableString,
  registreringTil: nullableString,
  virkningTil: nullableString,
});

export const bbrBuildingsResponseSchema = z.object({
  BBR_Bygning: z.object({ nodes: z.array(bbrBuildingDueDiligenceNodeSchema) }),
});

export const bbrUnitsResponseSchema = z.object({
  BBR_Enhed: z.object({ nodes: z.array(bbrUnitNodeSchema) }),
});

export const bbrTechnicalInstallationsResponseSchema = z.object({
  BBR_TekniskAnlaeg: z.object({ nodes: z.array(bbrTechnicalInstallationNodeSchema) }),
});

export const bbrGroundResponseSchema = z.object({
  BBR_Grund: z.object({ nodes: z.array(bbrGroundNodeSchema) }),
});

export type BbrBuildingDueDiligenceNode = z.infer<typeof bbrBuildingDueDiligenceNodeSchema>;
export type BbrUnitNode = z.infer<typeof bbrUnitNodeSchema>;
export type BbrTechnicalInstallationNode = z.infer<typeof bbrTechnicalInstallationNodeSchema>;
export type BbrGroundNode = z.infer<typeof bbrGroundNodeSchema>;
