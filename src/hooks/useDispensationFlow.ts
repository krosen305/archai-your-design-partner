import { useState } from "react";
import { useProject } from "@/lib/project-store";

export function useDispensationFlow(): {
  dispensationFor: "etager" | "areal" | null;
  open: (type: "etager" | "areal") => void;
  acknowledge: (type: "etager" | "areal") => void;
  close: () => void;
} {
  const [dispensationFor, setDispensationFor] = useState<"etager" | "areal" | null>(null);
  const { boligoenskeValidering, setBoligoenskeValidering } = useProject();

  const open = (type: "etager" | "areal") => setDispensationFor(type);
  const close = () => setDispensationFor(null);

  const acknowledge = (type: "etager" | "areal") => {
    if (!boligoenskeValidering) {
      close();
      return;
    }
    setBoligoenskeValidering({
      ...boligoenskeValidering,
      etagerDispensationAcknowledged:
        type === "etager" ? true : boligoenskeValidering.etagerDispensationAcknowledged,
      arealDispensationAcknowledged:
        type === "areal" ? true : boligoenskeValidering.arealDispensationAcknowledged,
    });
    close();
  };

  return { dispensationFor, open, acknowledge, close };
}
