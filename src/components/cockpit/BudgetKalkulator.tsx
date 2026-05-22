import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useProject } from "@/lib/project-store";
import { Card } from "@/components/wizard-ui";
import {
  beregnBudget,
  type GeoteknikKategori,
  type BudgetInput,
} from "@/lib/budget-calculator";
import { useBudgetSync } from "@/hooks/useBudgetSync";

// ---------------------------------------------------------------------------
// Formatering
// ---------------------------------------------------------------------------

function fmtDKK(v: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} mio.`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

const KATEGORI_LABELS: Record<GeoteknikKategori, string> = {
  1: "Kat. 1 — god grund (0–50k)",
  2: "Kat. 2 — variabel (50–200k)",
  3: "Kat. 3 — dårlig/pæl (200k–500k+)",
};

export function BudgetKalkulator() {
  const { bbrData, byggeoenske, vurderingData, bebygget_areal_m2 } = useProject();

  const [geoteknikKat, setGeoteknikKat] = useState<GeoteknikKategori>(1);
  const [arealOverride, setArealOverride] = useState<string>("");

  const bebyggetAreal = bebygget_areal_m2 ?? bbrData?.bebygget_areal ?? null;
  const oensketAreal =
    arealOverride !== "" ? parseInt(arealOverride) : (byggeoenske?.oensketAreal ?? null);
  const naturgas = bbrData?.opvarmningsmiddel?.toLowerCase().includes("naturgas") ?? false;
  const harKaelder = false;

  const input: BudgetInput = {
    bebyggetArealM2: bebyggetAreal,
    byggeaar: bbrData?.byggeaar ?? null,
    oensketArealM2: typeof oensketAreal === "number" && oensketAreal > 0 ? oensketAreal : null,
    energiklasse: byggeoenske?.energiklasse ?? null,
    harKaelder,
    geoteknikKategori: geoteknikKat,
    naturgas,
  };

  const resultat = useMemo(
    () => beregnBudget(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.bebyggetArealM2,
      input.byggeaar,
      input.oensketArealM2,
      input.energiklasse,
      input.harKaelder,
      input.geoteknikKategori,
      input.naturgas,
    ],
  );

  // Sync totalTypisk til Supabase (debounced 800ms) så restore-stien har en værdi
  useBudgetSync(resultat.totalTypisk);

  const chartData = [
    {
      name: "Nedrivning",
      min: resultat.nedrivning.min,
      max: resultat.nedrivning.max,
      note: resultat.nedrivning.note,
    },
    { name: "Forsyning", min: resultat.forsyning.min, max: resultat.forsyning.max },
    {
      name: "Geoteknik",
      min: resultat.geoteknik.min,
      max: resultat.geoteknik.max,
      note: resultat.geoteknik.note,
    },
    { name: "Nybyg", min: resultat.nybyg.min, max: resultat.nybyg.max, note: resultat.nybyg.note },
  ];

  const ejendomsvaerdi = vurderingData?.ejendomsvaerdi ?? null;
  const overEjendomsvaerdi = ejendomsvaerdi != null && resultat.totalTypisk > ejendomsvaerdi;

  return (
    <Card>
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-4">
        PROJEKTKALKULATOR
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground block mb-1">
            ØNSKET AREAL (m²)
          </label>
          <input
            type="number"
            min={0}
            max={2000}
            value={arealOverride !== "" ? arealOverride : (byggeoenske?.oensketAreal ?? "")}
            onChange={(e) => setArealOverride(e.target.value)}
            placeholder={String(byggeoenske?.oensketAreal ?? "—")}
            className="w-full rounded-md border border-border bg-[#111] px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground block mb-1">
            GEOTEKNIK
          </label>
          <select
            value={geoteknikKat}
            onChange={(e) => setGeoteknikKat(Number(e.target.value) as GeoteknikKategori)}
            className="w-full rounded-md border border-border bg-[#111] px-3 py-1.5 text-sm text-foreground"
          >
            {([1, 2, 3] as GeoteknikKategori[]).map((k) => (
              <option key={k} value={k}>
                {KATEGORI_LABELS[k]}
              </option>
            ))}
          </select>
          <div className="mt-1 font-mono text-[9px] text-muted-foreground">
            Eksempeldata (GEUS-integration ikke aktiv)
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tickFormatter={fmtShort}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => fmtDKK(value)}
            contentStyle={{
              background: "#111",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 11,
            }}
          />
          <Bar dataKey="min" name="Min" stackId="a" fill="transparent" />
          <Bar dataKey="max" name="Max" stackId="a" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill="hsl(var(--accent))" opacity={0.7 + i * 0.075} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 rounded-md border border-border bg-[#111] p-4">
        <div className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground mb-2">
          TOTAL ESTIMAT
        </div>
        <div className="text-2xl font-medium text-foreground">{fmtDKK(resultat.totalTypisk)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {fmtDKK(resultat.totalMin)} – {fmtDKK(resultat.totalMax)}
        </div>
        {ejendomsvaerdi != null && (
          <div
            className={`mt-2 text-xs ${overEjendomsvaerdi ? "text-warning" : "text-muted-foreground"}`}
          >
            {overEjendomsvaerdi
              ? `Advarsel: estimat overstiger ejendomsværdien (${((resultat.totalTypisk / ejendomsvaerdi) * 100).toFixed(0)}%)`
              : `Estimeret til ${((resultat.totalTypisk / ejendomsvaerdi) * 100).toFixed(0)}% af ejendomsværdien`}
          </div>
        )}
      </div>

      {chartData.some((d) => d.note) && (
        <ul className="mt-3 space-y-1">
          {chartData
            .filter((d) => d.note)
            .map((d) => (
              <li key={d.name} className="text-xs text-muted-foreground">
                <span className="font-medium">{d.name}:</span> {d.note}
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
