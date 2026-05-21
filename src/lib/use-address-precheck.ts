// src/lib/use-address-precheck.ts
import { useState } from "react";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import type { Address } from "@/types/project-state";
import { fetchAddressDetails } from "./adresse.functions";
import { preCheckAdresse } from "./pre-check-adresse";
import { syncPatch } from "./project-sync";
import { useProject } from "./project-store";
import { logger } from "./logger";
import { kommunenavnFraKode } from "./kommuner";

export function useAddressSelectionPrecheck() {
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const {
    setAddress,
    setBbrData,
    setKommuneplanramme,
    setLokalplaner,
    setComplianceFlags,
    setVurderingData,
    setComplianceMetrics,
    setComplianceDone,
    setAdressePreCheck,
  } = useProject();

  async function handleSelectSuggestion(s: GsearchSuggestion): Promise<Address> {
    setAdressePreCheck(null);
    setBbrData(null);
    setComplianceDone(false);

    const immediateAddress: Address = {
      adresseid: s.adresseid,
      adresse: s.tekst,
      postnr: s.postnr,
      postnrnavn: s.postnrnavn,
      kommune: s.kommunekode,
      kommunekode: s.kommunekode,
      matrikel: null,
      adgangsadresseid: s.adgangsadresseid,
      koordinater: s.koordinater,
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
      grundareal: null,
    };
    setAddress(immediateAddress);
    setIsCheckingCompliance(true);

    let fullAddress = immediateAddress;
    try {
      const details = await fetchAddressDetails({ data: { adresseid: s.adresseid } });
      fullAddress = {
        ...immediateAddress,
        adresse: details.adresse || s.tekst,
        postnr: details.postnr || s.postnr,
        postnrnavn: details.postnrnavn || s.postnrnavn,
        kommunekode: details.kommunekode || s.kommunekode,
        kommune: details.kommunenavn || kommunenavnFraKode(details.kommunekode || s.kommunekode),
        matrikel: details.matrikel,
        adgangsadresseid: details.adgangsadresseid || s.adgangsadresseid,
        koordinater: details.koordinater || s.koordinater,
        ejerlavskode: details.ejerlavskode,
        matrikelnummer: details.matrikelnummer,
        grundareal: details.grundareal ?? null,
      };
      setAddress(fullAddress);
      syncPatch({ address: fullAddress, complianceDone: false, currentStep: "boligoenske" });
    } catch (err) {
      logger.error("[Adresse] getAddressDetails fejlede (ikke kritisk):", err);
      syncPatch({ address: immediateAddress, complianceDone: false, currentStep: "boligoenske" });
    }

    try {
      const vejnavn = fullAddress.adresse?.split(",")[0]?.trim() ?? null;
      const preCheck = await preCheckAdresse({
        data: {
          adgangsadresseid: fullAddress.adgangsadresseid,
          adresseid: s.adresseid,
          ejerlavskode: fullAddress.ejerlavskode,
          matrikelnummer: fullAddress.matrikelnummer,
          koordinater: fullAddress.koordinater,
          grundareal: fullAddress.grundareal,
          vejnavn,
          kommunenavn: fullAddress.kommune ?? null,
        },
      });
      setAdressePreCheck(preCheck);
      if (preCheck.bbr) setBbrData(preCheck.bbr);
      setKommuneplanramme(preCheck.kommuneplanramme);
      setLokalplaner(preCheck.lokalplaner);
      setComplianceFlags([...preCheck.blockers, ...preCheck.advarsler]);
      if (preCheck.vurderingData) setVurderingData(preCheck.vurderingData);
      if (preCheck.complianceMetrics) setComplianceMetrics(preCheck.complianceMetrics);
    } catch (err) {
      logger.error("[Adresse] preCheckAdresse fejlede:", err);
    } finally {
      setIsCheckingCompliance(false);
    }

    return fullAddress;
  }

  return { handleSelectSuggestion, isCheckingCompliance };
}
