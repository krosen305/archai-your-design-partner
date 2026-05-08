import { createFileRoute } from "@tanstack/react-router";
import { useProject } from "@/lib/project-store";
import { BackLink } from "@/components/wizard-chrome";
import { PageTransition, Card } from "@/components/wizard-ui";
import { Building2, TrendingUp, AreaChart, Clock } from "lucide-react";

export const Route = createFileRoute("/projekt/oekonomi")({
  component: OekonomiPage,
});

function formatKr(beloeb: number | null): string {
  if (beloeb === null) return "–";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(beloeb);
}

function OekonomiPage() {
  const { vurderingData, bbrData, address } = useProject();

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <BackLink to="/projekt/byggeanalyse" />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Økonomi & Forsikring</h1>
          <p className="text-gray-500 mt-1">
            Finansieringsgrundlag baseret på officielle ejendomsvurderinger fra Datafordeler.
          </p>
        </div>

        {/* VUR-data */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Ejendomsvurdering (SKAT/VUR)</h2>

          {vurderingData && !vurderingData.fejl ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-700 mb-1">
                    <Building2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Ejendomsværdi</span>
                  </div>
                  <p className="text-xl font-bold text-blue-900">
                    {formatKr(vurderingData.ejendomsvaerdi)}
                  </p>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-medium">Grundværdi</span>
                  </div>
                  <p className="text-xl font-bold text-green-900">
                    {formatKr(vurderingData.grundvaerdi)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {vurderingData.vurderetAreal !== null && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <AreaChart className="h-4 w-4 shrink-0" />
                    <span className="text-sm">
                      Vurderet areal: <strong>{vurderingData.vurderetAreal} m²</strong>
                    </span>
                  </div>
                )}
                {vurderingData.vurderingsaar !== null && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span className="text-sm">
                      Vurderingsår: <strong>{vurderingData.vurderingsaar}</strong>
                    </span>
                  </div>
                )}
              </div>

              {bbrData?.grundareal && vurderingData.grundvaerdi !== null && (
                <div className="text-xs text-gray-400 border-t pt-3">
                  Grundværdi pr. m²:{" "}
                  <strong>
                    {formatKr(Math.round(vurderingData.grundvaerdi / bbrData.grundareal))}/m²
                  </strong>
                  {address?.adresse && ` · ${address.adresse}`}
                </div>
              )}
            </div>
          ) : vurderingData?.fejl ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded p-3">
              Ejendomsvurdering ikke tilgængelig: {vurderingData.fejl}
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Ejendomsvurdering hentes automatisk under byggeanalysen. Gå tilbage og kør
              analysen for at se data her.
            </p>
          )}
        </Card>

        {/* Coming soon */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Finansiering & Lånedokumentation
          </h2>
          <p className="text-sm text-gray-500">
            Vi genererer automatisk bank-klar lånedokumentation og indhenter tilbud på
            entrepriseforsikring baseret på dit byggeønske og ejendomsvurdering.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-400 list-disc list-inside">
            <li>Omkostningsestimering baseret på dit byggeønske</li>
            <li>Bank-ready lånedokumentation</li>
            <li>Udbud på entrepriseforsikring</li>
          </ul>
          <p className="mt-4 text-xs font-medium text-indigo-600 uppercase tracking-wide">
            Kommer snart
          </p>
        </Card>
      </div>
    </PageTransition>
  );
}
