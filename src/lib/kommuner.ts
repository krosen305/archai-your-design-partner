/** Komplet map: 4-cifret kommunekode → kommunenavn for alle 98 danske kommuner (2007-reform). */
export const KOMMUNE_MAP: Record<string, string> = {
  // Region Hovedstaden
  "0101": "København",
  "0147": "Frederiksberg",
  "0151": "Ballerup",
  "0153": "Brøndby",
  "0155": "Dragør",
  "0157": "Gentofte",
  "0159": "Gladsaxe",
  "0161": "Glostrup",
  "0163": "Herlev",
  "0165": "Albertslund",
  "0167": "Hvidovre",
  "0169": "Høje-Taastrup",
  "0173": "Lyngby-Taarbæk",
  "0175": "Rødovre",
  "0183": "Ishøj",
  "0185": "Tårnby",
  "0187": "Vallensbæk",
  "0190": "Furesø",
  "0201": "Allerød",
  "0210": "Fredensborg",
  "0217": "Helsingør",
  "0219": "Hillerød",
  "0223": "Hørsholm",
  "0230": "Rudersdal",
  "0240": "Egedal",
  "0250": "Frederikssund",
  "0260": "Halsnæs",
  "0270": "Gribskov",
  "0400": "Bornholm",
  // Region Sjælland
  "0253": "Greve",
  "0259": "Køge",
  "0265": "Roskilde",
  "0269": "Solrød",
  "0306": "Odsherred",
  "0316": "Holbæk",
  "0320": "Faxe",
  "0326": "Kalundborg",
  "0329": "Ringsted",
  "0330": "Slagelse",
  "0336": "Stevns",
  "0340": "Sorø",
  "0350": "Lejre",
  "0360": "Lolland",
  "0370": "Næstved",
  "0376": "Guldborgsund",
  "0390": "Vordingborg",
  // Region Syddanmark
  "0410": "Middelfart",
  "0420": "Assens",
  "0430": "Faaborg-Midtfyn",
  "0440": "Kerteminde",
  "0450": "Langeland",
  "0461": "Odense",
  "0479": "Svendborg",
  "0480": "Nordfyns",
  "0482": "Nyborg",
  "0492": "Ærø",
  "0510": "Haderslev",
  "0530": "Billund",
  "0540": "Sønderborg",
  "0550": "Tønder",
  "0561": "Esbjerg",
  "0563": "Fanø",
  "0573": "Varde",
  "0575": "Vejen",
  "0580": "Aabenraa",
  "0607": "Fredericia",
  "0621": "Kolding",
  "0630": "Vejle",
  // Region Midtjylland
  "0615": "Horsens",
  "0657": "Herning",
  "0661": "Holstebro",
  "0665": "Lemvig",
  "0671": "Struer",
  "0706": "Syddjurs",
  "0707": "Norddjurs",
  "0710": "Favrskov",
  "0727": "Odder",
  "0730": "Randers",
  "0740": "Silkeborg",
  "0741": "Samsø",
  "0746": "Skanderborg",
  "0751": "Aarhus",
  "0756": "Ikast-Brande",
  "0760": "Ringkøbing-Skjern",
  "0766": "Hedensted",
  "0779": "Skive",
  "0791": "Viborg",
  // Region Nordjylland
  "0773": "Morsø",
  "0787": "Thisted",
  "0810": "Brønderslev",
  "0813": "Frederikshavn",
  "0820": "Vesthimmerlands",
  "0825": "Læsø",
  "0840": "Rebild",
  "0846": "Mariagerfjord",
  "0849": "Jammerbugt",
  "0851": "Aalborg",
  "0860": "Hjørring",
};

/** Returnerer kommunenavn for en 4-cifret kommunekode. Falder tilbage til koden hvis ukendt. */
export function kommunenavnFraKode(kode: string): string {
  return KOMMUNE_MAP[kode] ?? kode;
}

/**
 * Udleder kommunekode fra ejerlavskode.
 * Ejerlavskoder følger formatet KKK_NNN (kommunekode × 1000 + ejerlavsnummer),
 * hvor KKK er de første 3 cifre svarende til den 3-cifrede kommunekode (uden leading zero).
 * Eksempel: 173551 → Math.floor(173551/1000) = 173 → "0173" (Lyngby-Taarbæk)
 */
export function kommunekodeFraEjerlavskode(ejerlavskode: number): string {
  return Math.floor(ejerlavskode / 1000)
    .toString()
    .padStart(4, "0");
}
