import type { RuleEngineBbrData } from "@/domain/contracts/rule-engine.types";

export function genererBbrVurdering(data: RuleEngineBbrData, adresse: string): string {
  if (!data.beregning_mulig) {
    return `Vi fandt en registrering på ${adresse}, men kunne ikke beregne alle compliance-parametre. ${data.fejl ?? ""} Vi anbefaler at kontakte din kommune for en præcis byggesagsvurdering.`;
  }

  const parts: string[] = [];

  if (data.bebyggelsesprocent !== null && data.grundareal !== null) {
    parts.push(
      `Nuværende bebyggelsesprocent er ${data.bebyggelsesprocent}% på en grund af ${data.grundareal} m².`,
    );
  }

  if (data.bebygget_areal !== null) {
    parts.push(`Det bebyggede areal udgør ${data.bebygget_areal} m².`);
  }

  if (data.antal_etager !== null) {
    parts.push(
      data.antal_etager <= 1
        ? "Eksisterende bebyggelse er i ét plan."
        : `Bygningen har ${data.antal_etager} etager.`,
    );
  }

  if (data.anvendelseskode && ["321", "322"].includes(data.anvendelseskode)) {
    parts.push(
      "Ejendommen er registreret til liberalt erhverv, hvilket muliggør en kombineret bolig/klinik-løsning.",
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : `Bygningsdata hentet for ${adresse}. Kontakt din kommune for fuld byggesagsvurdering.`;
}
