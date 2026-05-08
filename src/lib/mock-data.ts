// Centralt mock-datasæt til dev-bypass på alle projektsider (ARCH-85).
//
// Importeres KUN i DEV-kontekst — tree-shaking via import.meta.env.DEV guards
// i de enkelte route-filer sikrer at dette aldrig inkluderes i production build.
//
// Alle mock-data afspejler Hasselvej 48, 2830 Virum (Lyngby-Taarbæk kommune).

import type { Address, Byggeoenske } from "@/lib/project-store";
import type { BbrKompliantData } from "@/integrations/bbr/client";

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

export const MOCK_ADRESSE: Address = {
  adresseid: "0a3f50a8-471d-32b8-e044-0003ba298018",
  adresse: "Hasselvej 48, 2830 Virum",
  postnr: "2830",
  postnrnavn: "Virum",
  kommune: "Lyngby-Taarbæk",
  kommunekode: "0173",
  matrikel: "8a Virum By, Virum",
  adgangsadresseid: "0a3f5081-d7e2-32b8-e044-0003ba298018",
  koordinater: { lat: 55.7989, lng: 12.4769 },
  bbrId: null,
  ejerlavskode: 173551,
  matrikelnummer: "8a",
  grundareal: 829,
};

// ---------------------------------------------------------------------------
// BBR (BbrKompliantData)
// ---------------------------------------------------------------------------

export const MOCK_BBR: BbrKompliantData = {
  beregning_mulig: true,
  grundareal: 829,
  bebygget_areal: 121,
  samlet_areal: 129,
  bebyggelsesprocent: 15,
  antal_etager: 1,
  byggeaar: "1937",
  anvendelseskode: "120",
  anvendelse_tekst: "Fritliggende enfamilieshus",
  fejl: null,
  varmeinstallation: "Fjernvarme/blokvarme",
  opvarmningsmiddel: "Fjernvarme",
  ydervaegs_materiale: "Mursten/tegl",
  tagdaekning: "Tagsten (tegl/beton)",
  fredet: null,
  mat_strandbeskyttelse: null,
  mat_fredskov: null,
  mat_klitfredning: null,
};

// ---------------------------------------------------------------------------
// Byggeønske
// ---------------------------------------------------------------------------

export const MOCK_BYGGEOENSKE: Byggeoenske = {
  byggetype: "nybyg",
  husstandsstoerrelse: 4,
  voksne: 2,
  boern: 2,
  livsfase: "etableret",
  oensketAreal: 180,
  antalEtager: 2,
  antalSovevaerelser: 4,
  antalBadevaerelser: 2,
  hjemmekontor: true,
  arkitektoniskStil: "skandinavisk",
  tagform: "saddeltag",
  facademateriale: "trae",
  vinduesandel: "stor",
  udeomraade: "terrasse",
  energiklasse: "lavenergi",
  varmekilde: "varmepumpe",
  solceller: true,
  ventilation: "balanceret",
  ladestander: true,
  budget: "5-8",
  inspirationsbilleder: [],
};

// ---------------------------------------------------------------------------
// Byggeanalyse-resultat (AI output mock)
// ---------------------------------------------------------------------------

export const MOCK_BYGGEANALYSE_RESULTAT = {
  tilladt: [
    { emne: "Etager", begrundelse: "Lokalplanen tillader op til 1½ etage i delområde B." },
    { emne: "Facade", begrundelse: "Træbeklædning er tilladt og opfordret til i lokalplanen." },
  ],
  kraever_dispensation: [
    {
      emne: "Bebyggelsesprocent",
      begrundelse:
        "Ønsket areal (180 m²) giver 22% — under max 30% — ingen dispensation nødvendig.",
    },
  ],
  konflikt: [],
  mangler_data: [
    { emne: "Tagmateriale", hvad_mangler: "Lokalplanen specificerer ikke tagmateriale eksplicit." },
  ],
  stilOpsummering:
    "Et skandinavisk nybyg på 180 m² er godt inden for lokalplanens rammer. Træfacade og stort glasparti mod syd er tilladt.",
  kilde: "mock" as const,
};
