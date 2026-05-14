import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, CheckCircle2, AlertTriangle, HelpCircle, ChevronDown } from "lucide-react";
import { useProject, type ComplianceFlag } from "@/lib/project-store";
import { Card } from "@/components/wizard-ui";

export function EjendomPanel() {
  const { complianceMetrics, bbrData, vurderingData, complianceFlags, address } = useProject();
  const [showFlags, setShowFlags] = useState(false);

  const grundareal = complianceMetrics?.grundareal ?? null;
  const remaining = complianceMetrics?.remainingBygningsareal ?? null;
  const maxBygningsareal = complianceMetrics?.maxBygningsareal ?? null;
  const currentPct = complianceMetrics?.currentBebyggelsesprocent ?? null;
  const maxPct = complianceMetrics?.maxBebyggelsesprocent ?? null;
  const currentEtager = complianceMetrics?.currentEtager ?? null;
  const maxEtager = complianceMetrics?.maxEtager ?? null;
  const maxHoejde = complianceMetrics?.maxBygningshoejde ?? null;

  const noegletal = [
    {
      label: "GRUNDAREAL",
      value: grundareal != null ? `${grundareal} m²` : "—",
      sub: currentPct != null ? `Bebygget: ${currentPct}%` : "—",
    },
    {
      label: "BYGGEPOTENTIALE",
      value: remaining != null ? `${remaining} m²` : "—",
      sub: maxBygningsareal != null ? `Max ${maxBygningsareal} m² tilladt` : "Ingen ramme",
    },
    {
      label: "EJENDOMSVÆRDI",
      value: formatMio(vurderingData?.ejendomsvaerdi),
      sub:
        vurderingData?.vurderingsaar != null
          ? `Vurderet ${vurderingData.vurderingsaar}`
          : "Ingen vurdering",
    },
  ];

  return (
    <div className="space-y-6">
      {address && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin size={13} />
          <span>{address.adresse}</span>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {noegletal.map((n, i) => (
          <motion.div
            key={n.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card>
              <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                {n.label}
              </div>
              <div className="mt-1.5 text-2xl text-foreground">{n.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{n.sub}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <SectionHeader title="Eksisterende bygning" />
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Byggeår" value={bbrData?.byggeaar ?? "—"} />
          <Field
            label="Samlet areal"
            value={bbrData?.bebygget_areal != null ? `${bbrData.bebygget_areal} m²` : "—"}
          />
          <Field
            label="Bebygget"
            value={bbrData?.bebygget_areal != null ? `${bbrData.bebygget_areal} m²` : "—"}
          />
          <Field
            label="Etager"
            value={bbrData?.antal_etager != null ? `${bbrData.antal_etager}` : "—"}
          />
          <Field label="Anvendelse" value={bbrData?.anvendelse_tekst ?? "—"} />
        </div>
      </Card>

      <SectionHeader title="Plangrænser" />
      <Card>
        <div className="divide-y divide-border">
          <PlanRow
            label="Bebyggelsesprocent"
            tilladt={maxPct != null ? `${maxPct}%` : "—"}
            nuvaerende={currentPct != null ? `${currentPct}%` : "—"}
            ok={maxPct != null && currentPct != null ? currentPct <= maxPct : null}
          />
          <PlanRow
            label="Antal etager"
            tilladt={maxEtager != null ? `${maxEtager}` : "—"}
            nuvaerende={currentEtager != null ? `${currentEtager}` : "—"}
            ok={maxEtager != null && currentEtager != null ? currentEtager <= maxEtager : null}
          />
          <PlanRow
            label="Bygningshøjde"
            tilladt={maxHoejde != null ? `${maxHoejde} m` : "Ikke defineret"}
            nuvaerende="—"
            ok={null}
          />
        </div>
      </Card>

      {complianceFlags.length > 0 && (
        <>
          <SectionHeader title="Kendte begrænsninger" />
          <Card>
            <button
              type="button"
              onClick={() => setShowFlags((v) => !v)}
              className="w-full flex items-center justify-between text-sm text-foreground"
            >
              <span>{complianceFlags.length} forhold registreret på grunden</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${showFlags ? "rotate-180" : ""}`}
              />
            </button>
            {showFlags && (
              <ul className="mt-3 divide-y divide-border">
                {complianceFlags.map((f) => (
                  <FlagRow key={f.id} flag={f} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground font-mono">
        <div>
          <span className="text-[10px] tracking-[0.15em]">MATRIKEL</span>
          <div className="text-foreground mt-0.5">{address?.matrikel ?? "—"}</div>
        </div>
        <div>
          <span className="text-[10px] tracking-[0.15em]">GRUNDVÆRDI</span>
          <div className="text-foreground mt-0.5">{formatMio(vurderingData?.grundvaerdi)}</div>
        </div>
        <div>
          <span className="text-[10px] tracking-[0.15em]">ADGANGSADRESSE</span>
          <div className="text-foreground mt-0.5 truncate">
            {address?.adgangsadresseid ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMio(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v / 1_000_000).toFixed(2).replace(".", ",")} mio. kr.`;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
      {title.toUpperCase()}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
        {label.toUpperCase()}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{String(value)}</div>
    </div>
  );
}

function PlanRow({
  label,
  tilladt,
  nuvaerende,
  ok,
}: {
  label: string;
  tilladt: string;
  nuvaerende: string;
  ok: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <div className="text-foreground">{label}</div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">Tilladt: {tilladt}</span>
        <span className="text-muted-foreground">Nu: {nuvaerende}</span>
        {ok === true && <CheckCircle2 size={14} className="text-emerald-400" />}
        {ok === false && <AlertTriangle size={14} className="text-danger" />}
      </div>
    </div>
  );
}

function FlagRow({ flag }: { flag: ComplianceFlag }) {
  const cfg = {
    ok: { Icon: CheckCircle2, color: "text-emerald-400 border-emerald-500/40", text: "OK" },
    advarsel: {
      Icon: AlertTriangle,
      color: "text-yellow-400 border-yellow-500/40",
      text: "ADVARSEL",
    },
    blocker: { Icon: AlertTriangle, color: "text-danger border-danger/40", text: "BLOCKER" },
  }[flag.status] ?? {
    Icon: HelpCircle,
    color: "text-muted-foreground border-border",
    text: "—",
  };
  return (
    <li className="flex items-center justify-between py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{flag.label}</div>
        {flag.detalje && (
          <div className="text-xs text-muted-foreground truncate">{flag.detalje}</div>
        )}
      </div>
      <div
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 shrink-0 ml-3 ${cfg.color}`}
      >
        <cfg.Icon size={12} />
        <span className="font-mono text-[10px] tracking-[0.1em]">{cfg.text}</span>
      </div>
    </li>
  );
}
