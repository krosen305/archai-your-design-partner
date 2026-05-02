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
import { PhaseSidebar } from "@/components/phase-sidebar";
import { useProject, isHusDna, parseComplianceData } from "@/lib/project-store";
import { restoreProject } from "@/lib/project-sync";
import { AuthProvider } from "@/lib/auth-context";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
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
      { title: "ArchAI — Fra tom grund til byggetilladelse" },
      { name: "description", content: "AI-drevet byggerådgivning for private bygherrer." },
      { property: "og:title", content: "ArchAI — Fra tom grund til byggetilladelse" },
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
  const isWelcome = location.pathname === "/";
  const {
    address,
    setAddress,
    setBbrData,
    setComplianceFlags,
    setLokalplaner,
    setComplianceDone,
    setHusDna,
    setKommuneplanramme,
  } = useProject();

  // Gendan projekt-state for indloggede brugere ved første sideopload
  useEffect(() => {
    if (address) return; // State allerede sat — spring over
    restoreProject().then((project) => {
      if (!project) return;
      if (project.address_full && project.address_bbr) {
        setAddress({
          adresseid: project.address_adresseid ?? project.address_bbr,
          adresse: project.address_full,
          postnr: project.address_postnr ?? "",
          postnrnavn: project.address_postnrnavn ?? "",
          kommune: project.address_kommune ?? "",
          kommunekode: "",
          matrikel: project.address_matrikel,
          adgangsadresseid: project.address_bbr,
          koordinater: (project.address_koordinater as { lat: number; lng: number } | null) ?? {
            lat: 0,
            lng: 0,
          },
          bbrId: null,
          ejerlavskode: project.address_ejerlavskode ?? null,
          matrikelnummer: project.address_matrikelnummer ?? null,
        });
      }
      if (isHusDna(project.brief_data)) {
        setHusDna({
          ...project.brief_data,
          kilde: (project.brief_data as { kilde?: "mock" | "anthropic" }).kilde ?? "mock",
        });
      }
      const cd = parseComplianceData(project.compliance_data);
      if (cd) {
        if (cd.bbr) setBbrData(cd.bbr);
        setComplianceFlags(cd.flags);
        setLokalplaner(cd.lokalplaner);
        if (cd.kommuneplanramme) setKommuneplanramme(cd.kommuneplanramme);
        if (project.compliance_done) setComplianceDone(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background">
        {!isWelcome && <TopBar />}
        {isWelcome ? (
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        ) : (
          <div className="flex">
            <PhaseSidebar />
            <main className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                <Outlet key={location.pathname} />
              </AnimatePresence>
            </main>
          </div>
        )}
      </div>
    </AuthProvider>
  );
}
