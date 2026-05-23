import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import { logger } from "@/lib/logger";
import {
  isRemoteImageUrl,
  addTag,
  removeTag,
  resolveKonflikt,
  removeExtraTag,
} from "@/lib/billedanalyse-tags";
import {
  uploadInspirationImages,
  analyseInspirationImages,
  generateDesignProposalsService,
} from "@/lib/services/ai-design-workflow.service";
import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";
import type { Byggeoenske } from "@/types/project-state";

export type AnalyseState =
  | "idle"
  | "uploading"
  | "ready"
  | "analysing"
  | "conflict"
  | "validated"
  | "saved"
  | "error";

export type AiDesignWorkflowState = {
  droem: string;
  uploadedImages: string[];
  analyseState: AnalyseState;
  analyse: BilledeAnalyseResultat | null;
  forslag: string[];
  valgt: string | null;
  uploadError: string | null;
  error: string | null;
  loading: boolean;
  hasHardStop: boolean;
  analyseableImageCount: number;
};

export type AiDesignWorkflowActions = {
  setDroem: (v: string) => void;
  handleFiles: (files: FileList | null) => Promise<void>;
  removeUpload: (index: number) => void;
  handleAnalyser: () => Promise<void>;
  handleGem: () => void;
  handleGenerate: () => Promise<void>;
  handleSelect: (url: string) => void;
  resolveKonfliktAction: (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => void;
  addTagAction: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  removeTagAction: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  removeExtraTagAction: (tag: string) => void;
};

function getUploadMimeType(file: File): "image/jpeg" | "image/png" | null {
  if (file.type === "image/jpeg" || file.type === "image/png") return file.type;
  return null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useAiDesignWorkflow(): AiDesignWorkflowState & AiDesignWorkflowActions {
  const {
    byggeoenske,
    setByggeoenske,
    complianceFlags,
    billedanalyse,
    setBilledanalyse,
    address,
    currentProjectId,
  } = useProject();

  const hasHardStop = complianceFlags.some((f) => f.status === "blocker");
  const analyseableImageCount = (byggeoenske.inspirationsbilleder ?? []).filter(
    isRemoteImageUrl,
  ).length;

  const [droem, setDroem] = useState(byggeoenske.designDroem ?? "");
  const [forslag, setForslag] = useState<string[]>(byggeoenske.genererededDesignforslag ?? []);
  const [valgt, setValgt] = useState<string | null>(byggeoenske.valgteDesignforslag ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>(
    byggeoenske.inspirationsbilleder ?? [],
  );
  const [analyseState, setAnalyseState] = useState<AnalyseState>(
    billedanalyse ? "saved" : analyseableImageCount > 0 ? "ready" : "idle",
  );
  const [analyse, setAnalyse] = useState<BilledeAnalyseResultat | null>(billedanalyse);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!billedanalyse) return;
    setAnalyse(billedanalyse);
    setAnalyseState("saved");
  }, [billedanalyse]);

  const commitByggeoenskePatch = (patch: Partial<Byggeoenske>) => {
    const next = { ...useProject.getState().byggeoenske, ...patch };
    setByggeoenske(patch);
    void syncPatch({ byggeoenske: next });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const availableSlots = Math.max(0, 4 - uploadedImages.length);
    if (availableSlots === 0) return;

    const projectId = useProject.getState().currentProjectId;
    if (!projectId) {
      setUploadError("Projektet er ikke klar til upload endnu. Prøv igen om et øjeblik.");
      setAnalyseState("error");
      return;
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots);
    const unsupportedFile = selectedFiles.find((f) => !getUploadMimeType(f));
    if (unsupportedFile) {
      setUploadError("Upload kun JPG- eller PNG-billeder.");
      setAnalyseState("error");
      return;
    }

    const session = await getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setUploadError("Du skal være logget ind for at uploade inspirationsbilleder.");
      setAnalyseState("error");
      return;
    }

    setAnalyse(null);
    setError(null);
    setUploadError(null);
    setAnalyseState("uploading");

    const startCount = uploadedImages.length;

    try {
      const filePayloads: Array<{ base64: string; mimeType: "image/jpeg" | "image/png" }> = [];

      for (const file of selectedFiles) {
        const mimeType = getUploadMimeType(file);
        if (!mimeType) continue;
        const dataUrl = await fileToDataUrl(file);
        setUploadedImages((prev) => [...prev, dataUrl]);
        filePayloads.push({ base64: dataUrl.split(",")[1] ?? "", mimeType });
      }

      if (filePayloads.length === 0) {
        setAnalyseState(analyseableImageCount > 0 ? "ready" : "idle");
        return;
      }

      const { signedUrls, paths } = await uploadInspirationImages({
        files: filePayloads,
        projectId,
        accessToken,
      });

      const current = useProject.getState().byggeoenske;
      commitByggeoenskePatch({
        inspirationsbilleder: [...(current.inspirationsbilleder ?? []), ...signedUrls],
        inspirationsbilledePaths: [...(current.inspirationsbilledePaths ?? []), ...paths],
      });
      setAnalyseState("ready");
    } catch (e) {
      logger.warn("[useAiDesignWorkflow] upload failed:", e);
      setUploadedImages((prev) => prev.slice(0, startCount));
      setUploadError("Upload fejlede. Prøv igen.");
      setAnalyseState("error");
    }
  };

  const removeUpload = (index: number) => {
    const nextImages = uploadedImages.filter((_, idx) => idx !== index);
    const current = useProject.getState().byggeoenske;
    const nextUrls = (current.inspirationsbilleder ?? []).filter((_, idx) => idx !== index);
    const nextPaths = (current.inspirationsbilledePaths ?? []).filter((_, idx) => idx !== index);

    setUploadedImages(nextImages);
    setAnalyse(null);
    setUploadError(null);
    commitByggeoenskePatch({
      inspirationsbilleder: nextUrls,
      inspirationsbilledePaths: nextPaths,
    });
    setAnalyseState(nextUrls.filter(isRemoteImageUrl).length > 0 ? "ready" : "idle");
  };

  const handleAnalyser = async () => {
    const signedUrls = (useProject.getState().byggeoenske.inspirationsbilleder ?? [])
      .filter(isRemoteImageUrl)
      .slice(0, 4);
    if (signedUrls.length === 0) return;

    setAnalyseState("analysing");
    setUploadError(null);

    try {
      const result = await analyseInspirationImages({ signedUrls });
      setAnalyse(result);
      setAnalyseState(result.konflikter.length > 0 ? "conflict" : "validated");
    } catch (e) {
      logger.warn("[useAiDesignWorkflow] billedanalyse failed:", e);
      setUploadError("Analyse fejlede. Prøv igen.");
      setAnalyseState("error");
    }
  };

  const handleGem = () => {
    if (!analyse || analyse.konflikter.length > 0) return;
    setBilledanalyse(analyse);
    void syncPatch({ billedanalyse: analyse });
    setAnalyseState("saved");
  };

  const handleGenerate = async () => {
    if (!droem.trim() && uploadedImages.length === 0) {
      setError("Beskriv dit drømmehus eller upload mindst ét inspirationsbillede.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const remoteImages = (useProject.getState().byggeoenske.inspirationsbilleder ?? []).filter(
        isRemoteImageUrl,
      );
      const result = await generateDesignProposalsService({
        prompt: droem.trim() || "Moderne dansk enfamiliehus",
        inspirationsUrls: (remoteImages.length > 0 ? remoteImages : uploadedImages).slice(0, 4),
        stil: byggeoenske.arkitektoniskStil,
        facademateriale: byggeoenske.facademateriale,
        projectId: currentProjectId ?? undefined,
        addressId: address?.adresseid ?? undefined,
      });
      setForslag(result.images);
      commitByggeoenskePatch({
        designDroem: droem,
        genererededDesignforslag: result.images,
      });
    } catch (e) {
      logger.warn("[useAiDesignWorkflow] generation failed:", e);
      setError("Kunne ikke generere forslag. Prøv igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (url: string) => {
    setValgt(url);
    commitByggeoenskePatch({ valgteDesignforslag: url });
  };

  const resolveKonfliktAction = (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => {
    if (!analyse) return;
    const updated = resolveKonflikt(kategori, tags, analyse);
    setAnalyse(updated);
    setAnalyseState(updated.konflikter.length > 0 ? "conflict" : "validated");
  };

  const addTagAction = (kategori: keyof BilledeAnalyseKategorier, tag: string) => {
    if (!analyse) return;
    setAnalyse(addTag(kategori, tag, analyse));
  };

  const removeTagAction = (kategori: keyof BilledeAnalyseKategorier, tag: string) => {
    if (!analyse) return;
    setAnalyse(removeTag(kategori, tag, analyse));
  };

  const removeExtraTagAction = (tag: string) => {
    if (!analyse) return;
    setAnalyse(removeExtraTag(tag, analyse));
  };

  return {
    droem,
    uploadedImages,
    analyseState,
    analyse,
    forslag,
    valgt,
    uploadError,
    error,
    loading,
    hasHardStop,
    analyseableImageCount,
    setDroem,
    handleFiles,
    removeUpload,
    handleAnalyser,
    handleGem,
    handleGenerate,
    handleSelect,
    resolveKonfliktAction,
    addTagAction,
    removeTagAction,
    removeExtraTagAction,
  };
}
