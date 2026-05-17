import { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import { Card } from "@/components/wizard-ui";

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type GeoteknikKategori = 1 | 2 | 3;

export type BudgetInput = {
  bebyggetArealM2: number | null;
  byggeaar: string | null;
  oensketArealM2: number | null;
  energiklasse: string | null;
  harKaelder: boolean;
  geoteknikKategori: GeoteknikKategori;
  naturgas: boolean;
};

export type BudgetKategori = {
  label: string;
  min: number;
  max: number;
  note?: string;
};

export type BudgetResultat = {
  nedrivning: BudgetKategori;
  forsyning: BudgetKategori;
  geoteknik: BudgetKategori;
  nybyg: BudgetKategori;
  totalMin: number;
  totalMax: number;
  totalTypisk: number;
};

// ---------------------------------------------------------------------------
// Beregningsfunktioner (pure — eksporteres til test)
// ---------------------------------------------------------------------------

export function beregnNedrivning(
  bebyggetArealM2: number | null,
  byggeaar: string | null,
): BudgetKategori {
  if (!bebyggetArealM2) {
    return { label: "Nedrivning", min: 0, max: 0, note: "Intet registreret bebygget areal" };
  }
  const asbestRisiko = parseInt(byggeaar ?? "0") < 1978;
  const minSats = asbestRisiko ? 1_000 : 800;
  const maxSats = asbestRisiko ? 1_400 : 1_200;
  return {
    label: "Nedrivning",
    min: Math.round(bebyggetArealM2 * minSats),
    max: Math.round(bebyggetArealM2 * maxSats),
    note: asbestRisiko ? "Tillæg for asbestrisiko (byggeår < 1978)" : undefined,
  };
}

export function beregnForsyning(naturgas: boolean): BudgetKategori {
  const gasMin = naturgas ? 10_000 : 0;
  const gasMax = naturgas ? 15_000 : 0;
  return {
    label: "Forsyningsafkobling",
    min: 55_000 + gasMin,
    max: 110_000 + gasMax,
  };
}

export function beregnGeoteknik(kategori: GeoteknikKategori): BudgetKategori {
  const ranges: Record<GeoteknikKategori, [number, number]> = {
    1: [0, 50_000],
    2: [50_000, 200_000],
    3: [200_000, 500_000],
  };
  const [min, max] = ranges[kategori];
  const labels: Record<GeoteknikKategori, string> = {
    1: "Kategori 1 — god grund",
    2: "Kategori 2 — variabel",
    3: "Kategori 3 — dårlig / pæl",
  };
  return { label: "Geoteknik", min, max, note: labels[kategori] };
}

export function beregnNybyg(
  arealM2: number | null,
  energiklasse: string | null,
  harKaelder: boolean,
): BudgetKategori {
  if (!arealM2) {
    return { label: "Nybyg", min: 0, max: 0, note: "Intet ønsket areal angivet" };
  }
  const lavenergitillæg =
    energiklasse &&
    (energiklasse.toLowerCase().includes("lavenergi") || energiklasse.startsWith("A"))
      ? 2_000
      : 0;
  const kaeldertillæg = harKaelder ? 5_000 : 0;
  const baseSatsMin = 22_000 + lavenergitillæg + kaeldertillæg;
  const baseSatsMax = baseSatsMin + 4_000;
  return {
    label: "Nybyg",
    min: Math.round(arealM2 * baseSatsMin),
    max: Math.round(arealM2 * baseSatsMax),
  };
}

export function beregnBudget(input: BudgetInput): BudgetResultat {
  const nedrivning = beregnNedrivning(input.bebyggetArealM2, input.byggeaar);
  const forsyning = beregnForsyning(input.naturgas);
  const geoteknik = beregnGeoteknik(input.geoteknikKategori);
  const nybyg = beregnNybyg(input.oensketArealM2, input.energiklasse, input.harKaelder);
  const totalMin = nedrivning.min + forsyning.min + geoteknik.min + nybyg.min;
  const totalMax = nedrivning.max + forsyning.max + geoteknik.max + nybyg.max;
  return {
    nedrivning,
    forsyning,
    geoteknik,
    nybyg,
    totalMin,
    totalMax,
    totalTypisk: Math.round((totalMin + totalMax) / 2),
  };
}

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void syncPatch({ budget_estimate: resultat.totalTypisk });
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [resultat.totalTypisk]);

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
              ? `Projektet estimeres til ${((resultat.totalTypisk / ejendomsvaerdi) * 100).toFixed(0)}% af ejendomsværdien`
              : `Projektet estimeres til ${((resultat.totalTypisk / ejendomsvaerdi) * 100).toFixed(0)}% af ejendomsværdien`}
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
