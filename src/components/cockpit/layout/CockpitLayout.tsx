import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { CockpitHeader } from "./CockpitHeader";
import { CockpitSidebar, type SidebarSection, SIDEBAR_ITEMS } from "./CockpitSidebar";
import { useProject } from "@/lib/project-store";

type CockpitLayoutProps = {
  adresse: string;
  adresseId: string;
  projectId: string | undefined;
  children: (
    scrollTo: (id: SidebarSection) => void,
    registerSection: (id: SidebarSection, el: HTMLElement | null) => void,
  ) => ReactNode;
};

export function CockpitLayout({ adresse, adresseId, projectId, children }: CockpitLayoutProps) {
  const [active, setActive] = useState<SidebarSection>("verdict");
  const sectionRefs = useRef<Map<SidebarSection, HTMLElement>>(new Map());
  const dataStatus = useProject((s) => s.dataStatus);

  const registerSection = useCallback((id: SidebarSection, el: HTMLElement | null) => {
    if (el) {
      el.setAttribute("data-section", id);
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  const scrollTo = useCallback((id: SidebarSection) => {
    const el = sectionRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-section") as SidebarSection | null;
            if (id) setActive(id);
          }
        }
      },
      { threshold: [0.1, 0.3], rootMargin: "-10% 0px -60% 0px" },
    );
    const refs = sectionRefs.current;
    for (const [, el] of refs) obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <CockpitHeader
        adresse={adresse}
        adresseId={adresseId}
        projectId={projectId}
        dataStatus={dataStatus}
      />
      <div className="flex flex-1 overflow-hidden">
        <CockpitSidebar active={active} onNavigate={scrollTo} />
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
          {children(scrollTo, registerSection)}
        </main>
      </div>
    </div>
  );
}

export type { SidebarSection };
export { SIDEBAR_ITEMS };
