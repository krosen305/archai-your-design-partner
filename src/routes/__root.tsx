import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { TopBar } from "@/components/wizard-chrome";
import { decodeWithSchema } from "@/hooks/cockpit-restore-utils";
import { useProject } from "@/lib/project-store";
import { parseComplianceData } from "@/types/project-state";
// Protected restore path; keep logic thin and deterministic.
import { restoreProject } from "@/lib/project-sync";
import { AuthProvider } from "@/lib/auth-context";
import {
  addressKoordinaterSchema,
  billedeAnalyseResultatSchema,
  byggeoenskeSchema,
  designPlacementSchema,
  husDnaSchema,
} from "@/types/project-restore.schemas";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ArchAI - Fra tom grund til byggetilladelse" },
      { name: "description", content: "AI-drevet byggerådgivning for private bygherrer." },
      { property: "og:title", content: "ArchAI - Fra tom grund til byggetilladelse" },
      { property: "og:description", content: "AI-drevet byggerådgivning for private bygherrer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const location = useLocation();
  const isWelcome = location.pathname === "/" || location.pathname === "/projekt/start";
  const {
    address,
    setAddress,
    setBbrData,
    setComplianceFlags,
    setLokalplaner,
    setComplianceDone,
    setHusDna,
    setKommuneplanramme,
    setByggeoenske,
    resetByggeoenske,
    setDesignPlacement,
    setByggeanalyseResultat,
    setBilledanalyse,
    setVurderingData,
    setCurrentProjectId,
    setHeritageSaveValue,
    setIsFredet,
    setGrundareal,
    setBebyggetAreal,
    setHardStop,
    setBudgetEstimate,
    setBfeNr,
  } = useProject();

  useEffect(() => {
    if (address) return;

    const selectedProjectId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("projectId")
        : null;
    const selectedAddressId =
      typeof window !== "undefined"
        ? window.location.pathname.match(/^\/projekt\/([^/]+)\/cockpit$/)?.[1]
        : null;
    const restoreAddressId =
      selectedAddressId && selectedAddressId !== "frit" ? selectedAddressId : null;

    if (selectedProjectId) {
      setCurrentProjectId(selectedProjectId);
    }

    restoreProject(selectedProjectId, restoreAddressId).then((project) => {
      if (!project) return;

      setCurrentProjectId(project.id);
      if (project.address_full && (project.address_adresseid || project.address_bbr)) {
        const resolvedAdresseid = project.address_adresseid ?? project.address_bbr!;
        const resolvedAdgangsadresseid = project.address_bbr ?? project.address_adresseid!;
        setAddress({
          adresseid: resolvedAdresseid,
          adresse: project.address_full,
          postnr: project.address_postnr ?? "",
          postnrnavn: project.address_postnrnavn ?? "",
          kommune: project.address_kommune ?? "",
          kommunekode: "",
          matrikel: project.address_matrikel,
          adgangsadresseid: resolvedAdgangsadresseid,
          grundareal: null,
          koordinater: decodeWithSchema(project.address_koordinater, addressKoordinaterSchema) ?? {
            lat: 0,
            lng: 0,
          },
          bbrId: null,
          ejerlavskode: project.address_ejerlavskode ?? null,
          matrikelnummer: project.address_matrikelnummer ?? null,
        });
      }

      resetByggeoenske();
      const byggeoenske = decodeWithSchema(project.design_byggeoenske, byggeoenskeSchema);
      if (byggeoenske) {
        setByggeoenske(byggeoenske);
      }

      const husDna = decodeWithSchema(project.design_hus_dna, husDnaSchema);
      setHusDna(husDna);

      setDesignPlacement(decodeWithSchema(project.design_placement, designPlacementSchema));

      const cd = parseComplianceData(project.compliance_data);
      if (cd) {
        if (cd.bbr) setBbrData(cd.bbr);
        setComplianceFlags(cd.flags);
        setLokalplaner(cd.lokalplaner);
        if (cd.kommuneplanramme) setKommuneplanramme(cd.kommuneplanramme);
        if (cd.byggeanalyseResultat) setByggeanalyseResultat(cd.byggeanalyseResultat);
        if (cd.vurderingData) setVurderingData(cd.vurderingData);
        if (project.compliance_done) setComplianceDone(true);
      }

      const billedanalyse = decodeWithSchema(project.billedanalyse, billedeAnalyseResultatSchema);
      if (billedanalyse) {
        setBilledanalyse(billedanalyse);
      }

      if (project.heritage_save_value != null) setHeritageSaveValue(project.heritage_save_value);
      if (project.is_fredet != null) setIsFredet(project.is_fredet);
      if (project.grundareal_m2 != null) setGrundareal(project.grundareal_m2);
      if (project.bebygget_areal_m2 != null) setBebyggetAreal(project.bebygget_areal_m2);
      setHardStop(project.hard_stop ?? false, project.hard_stop_reason ?? null);
      if (project.budget_estimate != null) setBudgetEstimate(project.budget_estimate);
      setBfeNr(project.bfe_nr ?? null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthProvider>
      <div className="min-h-screen bg-background">
        {!isWelcome && <TopBar />}
        <main className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <Outlet />
          </AnimatePresence>
        </main>
      </div>
    </AuthProvider>
  );
}
