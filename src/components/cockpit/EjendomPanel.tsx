import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  XCircle,
  Copy,
  Check,
} from "lucide-react";
import { useProject, type ComplianceFlag } from "@/lib/project-store";
import { Card } from "@/components/wizard-ui";

export function EjendomPanel() {
  const {
    complianceMetrics,
    bbrData,
    vurderingData,
    complianceFlags,
    address,
    adressePreCheck,
    heritage_save_value,
    grundareal_m2,
    bebygget_areal_m2,
    is_fredet,
  } = useProject();
  const [showFlags, setShowFlags] = useState(false);
  const [showDatakilder, setShowDatakilder] = useState(false);

  // adressePreCheck bruges som fallback når compliance-pipeline ikke er kørt endnu
  const k = adressePreCheck?.kontekst;
  const bbr = bbrData ?? adressePreCheck?.bbr ?? null;

  const grundareal = grundareal_m2 ?? complianceMetrics?.grundareal ?? bbrData?.grundareal ?? k?.grundareal ?? null;
  const bebyggetAreal = bebygget_areal_m2 ?? bbr?.bebygget_areal ?? null;
  const remaining = complianceMetrics?.remainingBygningsareal ?? k?.restBygningsareal ?? null;
  const maxBygningsareal = complianceMetrics?.maxBygningsareal ?? null;
  const currentPct =
    complianceMetrics?.currentBebyggelsesprocent ??
    (grundareal && bebyggetAreal ? (bebyggetAreal / grundareal) * 100 : null) ??
    bbrData?.bebyggelsesprocent ??
    k?.bebyggelsesprocent ??
    null;
  const maxPct = complianceMetrics?.maxBebyggelsesprocent ?? k?.maxBebyggelsesprocent ?? null;
  const currentEtager = complianceMetrics?.currentEtager ?? k?.antalEtager ?? null;
  const maxEtager = complianceMetrics?.maxEtager ?? k?.maxEtager ?? null;
  const maxHoejde = complianceMetrics?.maxBygningshoejde ?? k?.maxBygningshoejde ?? null;

  const blockers = complianceFlags.filter((f) => f.status === "blocker");

  const noegletal = [
    {
      label: "GRUNDAREAL",
      value: grundareal != null ? `${grundareal} m²` : "Ikke registreret",
      sub:
        currentPct != null
          ? `Bebygget: ${currentPct}%`
          : "Ikke registreret i BBR/DAWA for denne ejendom",
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

      {is_fredet === true && (
        <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2">
          <AlertTriangle size={13} className="text-danger shrink-0" />
          <div>
            <span className="font-mono text-[10px] tracking-[0.15em] text-danger">FREDET BYGNING</span>
            <span className="ml-2 text-xs text-muted-foreground">— kilde: DAI WFS</span>
          </div>
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

      {/* ARCH-184: Hard stop banner — viser blokerende flags med årsag fra rule-engine */}
      {blockers.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle size={15} className="text-danger shrink-0" />
            <span className="font-mono text-[10px] tracking-[0.15em] text-danger">
              HARD STOP — {blockers.length} BLOKERENDE{" "}
              {blockers.length === 1 ? "FORHOLD" : "FORHOLD"}
            </span>
          </div>
          <ul className="space-y-1.5 pl-1">
            {blockers.map((b) => (
              <li key={b.id} className="text-xs text-foreground">
                <span className="font-medium">{b.label}</span>
                {b.detalje && <span className="text-muted-foreground"> — {b.detalje}</span>}
                {b.dispensationMyndighed && (
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    ({b.dispensationMyndighed})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ARCH-185: Grund & rammer samlet — aktuelle værdier og grænser side om side */}
      <SectionHeader title="Grund & Rammer" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-3">
            EKSISTERENDE BYGNING
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Byggeår" value={bbr?.byggeaar ?? "—"} />
            <Field
              label="Samlet areal"
              value={bbr?.samlet_areal != null ? `${bbr.samlet_areal} m²` : "—"}
            />
            <Field
              label="Bebygget areal"
              value={bbr?.bebygget_areal != null ? `${bbr.bebygget_areal} m²` : "—"}
            />
            <Field label="Etager" value={bbr?.antal_etager != null ? `${bbr.antal_etager}` : "—"} />
            <Field label="Anvendelse" value={bbr?.anvendelse_tekst ?? "—"} />
            <SaveField
              hasFbbRegistration={Boolean(bbr?.fbb_reference)}
              heritageSaveValue={heritage_save_value}
            />
          </div>
        </Card>
        <Card>
          <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-3">
            PLANGRÆNSER
          </div>
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
      </div>

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

      {/* ARCH-186: Datakilder — live/mock/mangler status for rå registerdata */}
      <SectionHeader title="Datakilder" />
      <Card>
        <button
          type="button"
          onClick={() => setShowDatakilder((v) => !v)}
          className="w-full flex items-center justify-between text-sm text-foreground"
        >
          <span>Datakildeoversigt</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${showDatakilder ? "rotate-180" : ""}`}
          />
        </button>
        {showDatakilder && (
          <div className="mt-3 divide-y divide-border">
            <DataRow
              label="Fredet (BBR byg070)"
              value={bbr?.fredet == null ? "—" : bbr.fredet ? "Ja" : "Nej"}
              status={bbr == null ? "mangler" : "live"}
            />
            <DataRow
              label="Strandbeskyttelse (MAT)"
              value={
                bbr?.mat_strandbeskyttelse == null ? "—" : bbr.mat_strandbeskyttelse ? "Ja" : "Nej"
              }
              status={bbr == null ? "mangler" : "live"}
            />
            <DataRow
              label="Fredskov (MAT)"
              value={bbr?.mat_fredskov == null ? "—" : bbr.mat_fredskov ? "Ja" : "Nej"}
              status={bbr == null ? "mangler" : "live"}
            />
            <DataRow
              label="Klitfredning (MAT)"
              value={bbr?.mat_klitfredning == null ? "—" : bbr.mat_klitfredning ? "Ja" : "Nej"}
              status={bbr == null ? "mangler" : "live"}
            />
            <DataRow
              label="FBB-registrering"
              value={bbr?.fbb_reference ? "Registreret" : "—"}
              status={bbr == null ? "mangler" : bbr.fbb_reference ? "live" : "mangler"}
            />
            <DataRow
              label="Ejendomsværdi (VUR)"
              value={
                vurderingData?.ejendomsvaerdi != null
                  ? formatMio(vurderingData.ejendomsvaerdi)
                  : "—"
              }
              status={vurderingData == null ? "mangler" : "live"}
            />
            <DataRow
              label="Grundværdi (VUR)"
              value={
                vurderingData?.grundvaerdi != null ? formatMio(vurderingData.grundvaerdi) : "—"
              }
              status={vurderingData == null ? "mangler" : "live"}
            />
            <DataRow
              label="Vurderingsår"
              value={vurderingData?.vurderingsaar != null ? `${vurderingData.vurderingsaar}` : "—"}
              status={vurderingData == null ? "mangler" : "live"}
            />

          </div>
        )}
      </Card>

      {/* ARCH-183: Tekniske nøgler med copy-to-clipboard */}
      <SectionHeader title="Tekniske nøgler" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CopyField label="ADRESSEID" value={address?.adresseid ?? null} />
        <CopyField label="ADGANGSADRESSEID" value={address?.adgangsadresseid ?? null} />
        <CopyField label="BYGNING UUID" value={address?.bbrId ?? null} />
        <CopyField label="MATRIKELNUMMER" value={address?.matrikelnummer ?? null} />
        <CopyField label="KOMMUNEKODE" value={address?.kommunekode ?? null} />
        <CopyField label="BFE-NUMMER" value={null} placeholder="Hentes via EBR" />
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

function SaveField({
  hasFbbRegistration,
  heritageSaveValue,
}: {
  hasFbbRegistration: boolean;
  heritageSaveValue: number | null;
}) {
  if (!hasFbbRegistration) {
    return <Field label="Bevaringsværdi (FBB)" value="Ikke registreret" />;
  }

  if (heritageSaveValue == null) {
    return <Field label="Bevaringsværdi (FBB)" value="Ikke registreret" />;
  }

  const tone =
    heritageSaveValue <= 4
      ? "text-danger"
      : heritageSaveValue <= 6
        ? "text-warning"
        : "text-emerald-400";

  const konsekvens =
    heritageSaveValue <= 3
      ? "Høj bevaringsværdi - nedrivning/ombygning kræver kommunens tilladelse"
      : heritageSaveValue === 4
        ? "§14-forbud risiko - kommunen kan nedlægge forbud mod nedrivning"
        : heritageSaveValue <= 6
          ? "Middel bevaringsværdi - kommunen bør høres"
          : "Lav bevaringsværdi - ingen særlige krav";

  return (
    <div className="col-span-2 rounded-md border border-border/50 p-2.5">
      <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
        Bevaringsværdi (FBB)
      </div>
      <div className={`mt-1 text-sm font-medium ${tone}`}>SAVE {heritageSaveValue}/9</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{konsekvens}</div>
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

function DataRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "live" | "mock" | "mangler";
}) {
  const badge = {
    live: "text-emerald-400 border-emerald-500/40",
    mock: "text-yellow-400 border-yellow-500/40",
    mangler: "text-muted-foreground border-border",
  }[status];

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="text-foreground">{label}</div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <span className="text-xs text-muted-foreground">{value}</span>
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] ${badge}`}
        >
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  placeholder = "—",
}: {
  label: string;
  value: string | null;
  placeholder?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-start justify-between rounded-md border border-border p-2.5 gap-2">
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-foreground font-mono truncate">
          {value ?? <span className="text-muted-foreground">{placeholder}</span>}
        </div>
      </div>
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          aria-label={`Kopiér ${label}`}
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}
