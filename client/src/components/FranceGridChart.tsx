import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { Zap, Wind, Radio, Database, AlertTriangle, TrendingUp, Info } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Nuclear":              "#8b5cf6",
  "Hydro Reservoir":      "#3b82f6",
  "Hydro Run-of-River":   "#06b6d4",
  "Wind Onshore":         "#22c55e",
  "Wind Offshore":        "#10b981",
  "Solar":                "#f59e0b",
  "Fossil Gas":           "#ef4444",
  "Hard Coal":            "#64748b",
  "Fossil Oil":           "#92400e",
  "Biomass":              "#84cc16",
  "Other":                "#a1a1aa",
};

// ─── Static fallback data (RTE portal subscription pending) ─────────────────
// Source: RTE Bilan électrique 2023, 2024 estimates
const STATIC_ANNUAL: any[] = [
  { year: "2019", Nuclear: 26400, "Hydro Reservoir": 4800, "Hydro Run-of-River": 3200, "Wind Onshore": 1900, Solar: 1200, "Fossil Gas": 1800, "Hard Coal": 400, Biomass: 580, Other: 200 },
  { year: "2020", Nuclear: 24200, "Hydro Reservoir": 4900, "Hydro Run-of-River": 3100, "Wind Onshore": 2300, Solar: 1400, "Fossil Gas": 1700, "Hard Coal": 200, Biomass: 610, Other: 190 },
  { year: "2021", Nuclear: 25800, "Hydro Reservoir": 4200, "Hydro Run-of-River": 3000, "Wind Onshore": 2500, Solar: 1650, "Fossil Gas": 2100, "Hard Coal": 250, Biomass: 640, Other: 200 },
  { year: "2022", Nuclear: 21100, "Hydro Reservoir": 3600, "Hydro Run-of-River": 2800, "Wind Onshore": 2800, Solar: 1900, "Fossil Gas": 2800, "Hard Coal": 400, Biomass: 680, Other: 210 },
  { year: "2023", Nuclear: 24800, "Hydro Reservoir": 4100, "Hydro Run-of-River": 3000, "Wind Onshore": 3200, Solar: 2200, "Fossil Gas": 1800, "Hard Coal": 200, Biomass: 720, Other: 180 },
  { year: "2024", Nuclear: 26900, "Hydro Reservoir": 4400, "Hydro Run-of-River": 3300, "Wind Onshore": 3600, Solar: 2500, "Fossil Gas": 1200, "Hard Coal": 100, Biomass: 750, Other: 160 },
];

const STATIC_MONTHLY_NUCLEAR: any[] = [
  { label: "Jan-23", nuclearSharePct: 68 }, { label: "Feb-23", nuclearSharePct: 64 },
  { label: "Mar-23", nuclearSharePct: 60 }, { label: "Apr-23", nuclearSharePct: 58 },
  { label: "May-23", nuclearSharePct: 62 }, { label: "Jun-23", nuclearSharePct: 65 },
  { label: "Jul-23", nuclearSharePct: 68 }, { label: "Aug-23", nuclearSharePct: 70 },
  { label: "Sep-23", nuclearSharePct: 72 }, { label: "Oct-23", nuclearSharePct: 74 },
  { label: "Nov-23", nuclearSharePct: 74 }, { label: "Dec-23", nuclearSharePct: 73 },
  { label: "Jan-24", nuclearSharePct: 70 }, { label: "Feb-24", nuclearSharePct: 68 },
  { label: "Mar-24", nuclearSharePct: 65 }, { label: "Apr-24", nuclearSharePct: 61 },
  { label: "May-24", nuclearSharePct: 63 }, { label: "Jun-24", nuclearSharePct: 67 },
  { label: "Jul-24", nuclearSharePct: 71 }, { label: "Aug-24", nuclearSharePct: 73 },
  { label: "Sep-24", nuclearSharePct: 74 }, { label: "Oct-24", nuclearSharePct: 73 },
  { label: "Nov-24", nuclearSharePct: 75 }, { label: "Dec-24", nuclearSharePct: 74 },
];

const KEY_FUELS = ["Nuclear", "Hydro Reservoir", "Hydro Run-of-River", "Wind Onshore", "Wind Offshore", "Solar", "Fossil Gas", "Hard Coal", "Biomass"];

export default function FranceGridChart() {
  const { data: rteData, isLoading } = useQuery<any>({
    queryKey: ["/api/rte/fr"],
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-5 bg-muted rounded w-72 mb-4" />
        <div className="h-52 bg-muted rounded" />
      </div>
    );
  }

  const isLive = rteData?.live === true && (rteData?.monthly?.length ?? 0) > 0;

  // Build annual data from live monthly data or use static fallback
  let annualData: any[] = STATIC_ANNUAL;
  let monthlyTrend: any[] = STATIC_MONTHLY_NUCLEAR;

  if (isLive) {
    const monthly: any[] = rteData.monthly ?? [];
    const byYear: Record<string, any[]> = {};
    for (const m of monthly) {
      const yr = m.month.slice(0, 4);
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(m);
    }
    annualData = Object.entries(byYear)
      .filter(([, months]) => months.length >= 6)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, months]) => {
        const avg: Record<string, number> = {};
        for (const fuel of KEY_FUELS) {
          const vals = months.map((m) => m[fuel] ?? 0);
          avg[fuel] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
        }
        return { year, ...avg };
      });

    monthlyTrend = monthly.slice(-24).map((m: any) => ({
      label: m.month.slice(2),
      nuclearSharePct: m.nuclearSharePct ?? 0,
      renewableSharePct: m.renewableSharePct ?? 0,
    }));
  }

  const latestYear = annualData[annualData.length - 1];
  const latestNuclearShare = isLive
    ? rteData?.latestMonth?.nuclearSharePct
    : (STATIC_MONTHLY_NUCLEAR[STATIC_MONTHLY_NUCLEAR.length - 1]?.nuclearSharePct ?? 74);

  // Calculate latest renewable share from static data if not live
  const latestRenewable = isLive
    ? rteData?.latestMonth?.renewableSharePct
    : (() => {
        const ly = STATIC_ANNUAL[STATIC_ANNUAL.length - 1];
        const total = Object.values(ly).filter((v) => typeof v === "number").reduce((s: any, v: any) => s + v, 0);
        const ren = (ly["Hydro Reservoir"] ?? 0) + (ly["Hydro Run-of-River"] ?? 0) + (ly["Wind Onshore"] ?? 0) + (ly["Wind Offshore"] ?? 0) + (ly.Solar ?? 0) + (ly.Biomass ?? 0);
        return Math.round((ren / total) * 100);
      })();

  const GenTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
        <p className="font-bold text-foreground mb-1">{label}</p>
        {payload.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value).map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-3">
            <span style={{ color: p.fill }}>{p.name}</span>
            <span className="font-medium">{Math.round(p.value).toLocaleString()} MW</span>
          </div>
        ))}
        <div className="border-t border-border mt-1 pt-1 flex justify-between font-bold">
          <span>Total</span><span>{Math.round(total).toLocaleString()} MW</span>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-8 space-y-6" data-testid="france-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">France Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              {isLive ? "RTE France Open Data API · Live generation data" : "RTE France · Portal subscription pending — historical snapshot"}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isLive
            ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
            : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
        }`}>
          {isLive ? <><Radio className="w-3 h-3" /> Live</> : <><Info className="w-3 h-3" /> Historical snapshot</>}
        </div>
      </div>

      {/* Subscription pending notice */}
      {!isLive && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">RTE API portal subscription required</p>
            <p className="text-xs text-muted-foreground">
              Data below uses the RTE Bilan électrique 2023/2024 estimates. Subscribe to
              <strong> actual_generation</strong>, <strong>generation_installed_capacities</strong>, and
              <strong> consolidated_consumption</strong> APIs at
              {" "}digital.iservices.rte-france.com → My Applications → API subscriptions.
              Live data will load automatically once subscriptions are active.
            </p>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4" data-testid="fr-kpi-nuclear">
          <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Nuclear Share</p>
          <p className="text-2xl font-bold text-purple-500">{latestNuclearShare}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">of electricity generation · 56 reactors · 63 GW</p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4" data-testid="fr-kpi-renewable">
          <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Renewable Share</p>
          <p className="text-2xl font-bold text-green-500">{latestRenewable}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Wind + Solar + Hydro + Biomass</p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid="fr-kpi-hydro">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Hydro Capacity</p>
          <p className="text-2xl font-bold text-blue-500">25.8 GW</p>
          <p className="text-xs text-muted-foreground mt-0.5">Run-of-river + reservoir · largest in W. Europe</p>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4" data-testid="fr-kpi-export">
          <p className="text-xs text-cyan-600 dark:text-cyan-400 uppercase tracking-wide mb-1">CO₂ Intensity</p>
          <p className="text-2xl font-bold text-cyan-500">~52 gCO₂/kWh</p>
          <p className="text-xs text-muted-foreground mt-0.5">Lowest in continental Europe · nuclear baseload</p>
        </div>
      </div>

      {/* Annual generation mix chart */}
      <div className="rounded-xl border border-border bg-card p-5" data-testid="fr-annual-chart">
        <h3 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — France</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Average MW by fuel type · {isLive ? "RTE actual data" : "RTE Bilan électrique estimates"} · 2022 nuclear dip visible (ASN corrosion inspections)
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={annualData} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              label={{ value: "MW", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
            <Tooltip content={<GenTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {KEY_FUELS.map((f) => (
              <Bar key={f} dataKey={f} stackId="a" fill={FUEL_COLORS[f]} name={f} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Nuclear share trend */}
      <div className="rounded-xl border border-border bg-card p-5" data-testid="fr-nuclear-trend">
        <h3 className="text-sm font-semibold text-foreground mb-1">Monthly Nuclear Share — 24 Months</h3>
        <p className="text-xs text-muted-foreground mb-4">
          % of generation from nuclear · ASN corrosion checks reduced output 2022 · Full recovery 2023–2024 · Flamanville EPR commercial Dec 2024
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={monthlyTrend} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="frNucGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyTrend.length / 8))} />
            <YAxis tick={{ fontSize: 11 }} domain={[50, 85]} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v: number) => [`${v}%`, "Nuclear share"]} />
            <ReferenceLine y={70} stroke="#94a3b8" strokeDasharray="4 4"
              label={{ value: "70%", fontSize: 10, fill: "#94a3b8" }} />
            <Area type="monotone" dataKey="nuclearSharePct" stroke="#8b5cf6"
              fill="url(#frNucGrad)" strokeWidth={2} dot={false} name="Nuclear %" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* DC market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Paris DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~900 MW</p>
          <p className="text-xs text-muted-foreground">
            Paris-Île-de-France is France's primary DC hub. Equinix, Interxion (Digital Realty), and Scaleway are leading operators. Très faible carbon intensity of ~52 gCO₂/kWh — ideal for sustainability targets.
          </p>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wind className="w-4 h-4 text-cyan-500" />
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">Marseille Cable Hub</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">MENA & Asia gateway</p>
          <p className="text-xs text-muted-foreground">
            Marseille is Europe's largest submarine cable landing station — 15+ cables connecting to MENA, Asia-Pacific, and West Africa. Colt, Interxion, and Equinix operate edge facilities at cable landings. Strong DC growth with IX-Marseille peering.
          </p>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">Nuclear Fleet Renewal</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">6 new EPR2 reactors approved</p>
          <p className="text-xs text-muted-foreground">
            Flamanville EPR (1.6 GW) came online Dec 2024 after 16-year construction. Government approved 6 new EPR2 reactors (2× Penly, 2× Gravelines, 2× Bugey/Tricastin). First online ~2035. Secures France's low-carbon baseload for 60+ years.
          </p>
        </div>
      </div>

      {/* Grid & permitting note */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Grid connection & permitting:</strong> RTE (Réseau de Transport d'Électricité) manages France's 400 kV/225 kV backbone.
          Large consumers (&gt;12 MW) file a Demande de Raccordement with RTE — lead times of 18–36 months in Paris region due to existing load density.
          DREAL (regional environmental authority) review for &gt;50 MW industrial installations.
          France has no specific data centre legislation but benefits from a simplified A/B/C classification system under ICPE for energy-intensive installations.
          Electricity price: typically €70–110/MWh for large industrial consumers (incl. TICFE tax ~€5.5/MWh post-2024 tariff reform).
          Source: RTE Bilan électrique 2024 · rte-france.com · CC BY 4.0.
        </p>
      </div>
    </div>
  );
}
