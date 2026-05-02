import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, X } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition, StepHeader, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";

export const Route = createFileRoute("/projekt/beskrivelse")({
  component: DescriptionStep,
});

const INITIAL_IMAGES = [
  "https://picsum.photos/seed/arch1/300/200",
  "https://picsum.photos/seed/arch2/300/200",
  "https://picsum.photos/seed/arch3/300/200",
];

function DescriptionStep() {
  const navigate = useNavigate();
  const { project, setProject } = useProject();
  const [area, setArea] = useState(project.area ?? "");
  const [floors, setFloors] = useState(project.floors ?? "2");
  const [budget, setBudget] = useState(project.budget ?? "3-5M");
  const [timeline, setTimeline] = useState(project.timeline ?? "1-2");
  const [description, setDescription] = useState(project.description ?? "");
  const [images, setImages] = useState<string[]>(project.inspirations ?? INITIAL_IMAGES);

  const submit = () => {
    setProject({ area, floors, budget, timeline, description, inspirations: images });
    navigate({ to: "/projekt/brief" });
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/byggeanalyse" />
        </div>
        <StepHeader
          step={3}
          title="Beskriv dit projekt"
          subtitle="Jo mere du fortæller, desto bedre et design-brief."
        />

        <Card className="space-y-8">
          {/* Section 1 */}
          <section>
            <SectionLabel>PROJEKTDATA</SectionLabel>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ønsket boligareal">
                <div className="relative">
                  <input
                    type="number"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="165"
                    className={inputCls + " pr-10"}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                    m²
                  </span>
                </div>
              </Field>
              <Field label="Antal etager">
                <select
                  value={floors}
                  onChange={(e) => setFloors(e.target.value)}
                  className={inputCls}
                >
                  {["1", "1.5", "2", "2.5", "3"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Budget">
                <select
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={inputCls}
                >
                  <option value="<3M">Under 3M</option>
                  <option value="3-5M">3-5M kr.</option>
                  <option value="5-8M">5-8M kr.</option>
                  <option value=">8M">Over 8M kr.</option>
                </select>
              </Field>
              <Field label="Tidshorisont">
                <select
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  className={inputCls}
                >
                  <option value="<1">Under 1 år</option>
                  <option value="1-2">1-2 år</option>
                  <option value="flex">Fleksibel</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Section 2 */}
          <section>
            <SectionLabel>SÆRLIGE ØNSKER</SectionLabel>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv dit drømmehus... Hvad er vigtigst for dig? F.eks. stor have-forbindelse, hjemmekontor, garage, åben planløsning, stor tagterrasse..."
              className={inputCls + " resize-none leading-relaxed"}
            />
          </section>

          {/* Section 3 */}
          <section>
            <SectionLabel>INSPIRATION (VALGFRIT)</SectionLabel>
            <button
              type="button"
              onClick={() => {
                if (images.length >= 8) return;
                setImages([
                  ...images,
                  `https://picsum.photos/seed/arch${Math.floor(Math.random() * 1000)}/300/200`,
                ]);
              }}
              className="w-full rounded-md border border-dashed border-[#333] bg-[#111] py-8 text-center hover:border-accent/40 hover:bg-[#161616] transition-colors"
            >
              <Upload size={24} className="mx-auto text-muted-foreground" />
              <div className="mt-2 text-sm text-foreground">
                Træk billeder hertil eller klik for at vælge
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                PNG, JPG op til 5MB · Maks 8 billeder
              </div>
            </button>

            {images.length > 0 && (
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((src, i) => (
                  <div
                    key={i}
                    className="relative group aspect-[3/2] rounded-md overflow-hidden border border-border"
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => setImages(images.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger"
                      aria-label="Fjern"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <button
            onClick={submit}
            className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
          >
            Generér design brief →
          </button>
        </Card>
      </div>
    </PageTransition>
  );
}

const inputCls =
  "w-full rounded-sm border border-[#333333] bg-[#111111] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
