// SERVER-SIDE ONLY — never import from browser code.
//
// EMOData integration — Energistyrelsen energimærkningsdata (ARCH-248).
//
// API: WCF/SOAP service på emoweb.dk (ikke REST/JSON).
// WSDL: http://emoweb.dk/emodata/EMOData.svc?wsdl
// Auth: Kræver registrering hos Energistyrelsen — skriv til emo-info@ens.dk.
//   Brug env vars: EMODATA_USERNAME + EMODATA_PASSWORD (begge valgfri).
//   Hvis mangler → returnerer makeSkippedResult (fail-open, aldrig false).
//
// Operation: SearchEnergyLabelBBR(bbrBygningId) — input er BBR bygning UUID
//   fra BbrKompliantData.bygning_lokal_id (tilgængeligt efter Layer 1).

import {
  makeOkResult,
  makeErrorResult,
  makeSkippedResult,
  type SourceResult,
} from "@/lib/source-result";
import { logServerEvent } from "@/lib/server-logger";
import { getEnvOptional } from "@/lib/env";

const EMODATA_ENDPOINT = "https://emoweb.dk/EMOData/EMOData.svc";
const SOAP_ACTION = "http://emoweb.dk/EMOData/IDIADEMService/SearchEnergyLabelBBR";
const KILDE = "emodata";

export type EnergyLabelData = {
  // Energimærke klasse: A2020, A2015, A2010, B, C, D, E, F, G
  energimaerke_klasse: string | null;
  // Dato rapporten er gyldigt til
  gyldig_til: string | null;
  // Er rapporten udløbet?
  er_udloebet: boolean | null;
  // Rapportdato (hvornår mærket blev udstedt)
  rapportdato: string | null;
  // Link til rapport PDF (kildehenvisning)
  rapport_url: string | null;
  // Intern rapport-ID i EMOData
  rapport_id: string | null;
  match_type: "bbr_id" | "no_hit" | "skipped";
  kilde: "emodata";
};

function buildSoapEnvelope(bbrBygningId: string, username: string, password: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://emoweb.dk/EMOData">
  <soap:Header>
    <tns:EMODataServiceHeader>
      <tns:UserName>${escapeXml(username)}</tns:UserName>
      <tns:Password>${escapeXml(password)}</tns:Password>
    </tns:EMODataServiceHeader>
  </soap:Header>
  <soap:Body>
    <tns:SearchEnergyLabelBBR>
      <tns:bbrBygningId>${escapeXml(bbrBygningId)}</tns:bbrBygningId>
    </tns:SearchEnergyLabelBBR>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractXmlValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<[^>]*${tag}[^>]*>([^<]*)</[^>]*${tag}[^>]*>`, "i");
  const match = xml.match(re);
  return match?.[1]?.trim() || null;
}

function isExpired(gyldigTil: string | null): boolean | null {
  if (!gyldigTil) return null;
  try {
    return new Date(gyldigTil) < new Date();
  } catch {
    return null;
  }
}

function parseResponse(xml: string): EnergyLabelData {
  // Energiklasse: A2020, B, C, D...
  const klasse =
    extractXmlValue(xml, "EnergimaerkeKlasse") ??
    extractXmlValue(xml, "EnergyLabelClassification") ??
    extractXmlValue(xml, "Klassificering");

  const gyldigTil = extractXmlValue(xml, "GyldigTil") ?? extractXmlValue(xml, "ExpirationDate");

  const rapportdato =
    extractXmlValue(xml, "Faerdiggoerelsesdato") ?? extractXmlValue(xml, "CompletionDate");

  const rapportUrl = extractXmlValue(xml, "RapportUrl") ?? extractXmlValue(xml, "ReportUrl");

  const rapportId = extractXmlValue(xml, "RapportId") ?? extractXmlValue(xml, "ReportId");

  // No hit detection: if Fault or empty result
  const isFault = xml.includes("soap:Fault") || xml.includes("s:Fault");
  const isEmpty = !klasse && !gyldigTil && !rapportId;

  if (isFault || isEmpty) {
    return {
      energimaerke_klasse: null,
      gyldig_til: null,
      er_udloebet: null,
      rapportdato: null,
      rapport_url: null,
      rapport_id: null,
      match_type: "no_hit",
      kilde: "emodata",
    };
  }

  return {
    energimaerke_klasse: klasse,
    gyldig_til: gyldigTil,
    er_udloebet: isExpired(gyldigTil),
    rapportdato,
    rapport_url: rapportUrl,
    rapport_id: rapportId,
    match_type: "bbr_id",
    kilde: "emodata",
  };
}

export class EnergyLabelService {
  /**
   * Henter energimærke via EMOData SearchEnergyLabelBBR operation.
   * @param bbrBygningId  BBR bygning UUID fra BbrKompliantData.bygning_lokal_id
   */
  static async getLabel(bbrBygningId: string): Promise<SourceResult<EnergyLabelData>> {
    const username = getEnvOptional("EMODATA_USERNAME");
    const password = getEnvOptional("EMODATA_PASSWORD");

    if (!username || !password) {
      return makeSkippedResult<EnergyLabelData>({
        kilde: KILDE,
        sourceUrl: EMODATA_ENDPOINT,
      });
    }

    try {
      const envelope = buildSoapEnvelope(bbrBygningId, username, password);

      const response = await fetch(EMODATA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: SOAP_ACTION,
        },
        body: envelope,
      });

      if (!response.ok && response.status !== 500) {
        throw new Error(`EMOData HTTP ${response.status}`);
      }

      const xml = await response.text();
      const data = parseResponse(xml);

      if (data.match_type === "no_hit") {
        return makeOkResult<EnergyLabelData>(data, {
          kilde: KILDE,
          sourceUrl: EMODATA_ENDPOINT,
          rawFeatureCount: 0,
          confidence: "missing",
        });
      }

      return makeOkResult<EnergyLabelData>(data, {
        kilde: KILDE,
        sourceUrl: EMODATA_ENDPOINT,
        rawFeatureCount: 1,
        confidence: "confirmed",
      });
    } catch (e) {
      logServerEvent({
        module: "energimaerke/client",
        operation: "getLabel",
        severity: "degraded",
        message: "EMOData SOAP fejl",
        error: e,
      });
      return makeErrorResult<EnergyLabelData>(e, { kilde: KILDE, sourceUrl: EMODATA_ENDPOINT });
    }
  }
}
