import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { Zap, Wind, Radio, Database, TrendingUp, Thermometer } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Nuclear":    "#8b5cf6",
  "Wind":       "#3b82f6",
  "Hydro":      "#06b6d4",
  "CHP & Other":"#22c55e",
};

const CHART_FUELS = ["Nuclear", "Wind", "Hydro", "CHP & Other"];

// Static fallback data (shown while Fingrid fetches 12 months of 3-min data)
// Source: Fingrid Bilan 2023, Statistics Finland
const STATIC_ANNUAL: any[] = [
  { year: "2021", Nuclear: 2780, Wind: 1240, Hydro: 1380, "CHP & Other": 3300 },
  { year: "2022", Nuclear: 2640, Wind: 1560, Hydro: 1290, "CHP & Other": 3470 },
  { year: "2023", Nuclear: 3720, Wind: 2180, Hydro: 1210, "CHP & Other": 3110 }, // OL3 EPR ramp-up
  { year: "2024", Nuclear: 4180, Wind: 3050, Hydro: 1340, "CHP & Other": 2960 },
];

const STATIC_MONTHLY: any[] = [
  { label: "Jan-23", Nuclear: 2900, Wind: 1800, lowCarbonPct: 64 },
  { label: "Feb-23", Nuclear: 2800, Wind: 2100, lowCarbonPct: 66 },
  { label: "Mar-23", Nuclear: 3100, Wind: 1900, lowCarbonPct: 71 },
  { label: "Apr-23", Nuclear: 3400, Wind: 2000, lowCarbonPct: 75 }, // OL3 starts commercial Apr 2023
  { label: "May-23", Nuclear: 3800, Wind: 1600, lowCarbonPct: 78 },
  { label: "Jun-23", Nuclear: 4000, Wind: 1100, lowCarbonPct: 79 },
  { label: "Jul-23", Nuclear: 4100, Wind: 900,  lowCarbonPct: 80 },
  { label: "Aug-23", Nuclear: 4050, Wind: 1000, lowCarbonPct: 80 },
  { label: "Sep-23", Nuclear: 4000, Wind: 1500, lowCarbonPct: 79 },
  { label: "Oct-23", Nuclear: 3900, Wind: 2200, lowCarbonPct: 80 },
  { label: "Nov-23", Nuclear: 3800, Wind: 2400, lowCarbonPct: 80 },
  { label: "Dec-23", Nuclear: 3750, Wind: 2600, lowCarbonPct: 81 },
  { label: "Jan-24", Nuclear: 4200, Wind: 2800, lowCarbonPct: 83 },
  { label: "Feb-24", Nuclear: 4180, Wind: 3100, lowCarbonPct: 84 },
  { label: "Mar-24", Nuclear: 4150, Wind: 2900, lowCarbonPct: 83 },
  { label: "Apr-24", Nuclear: 4100, Wind: 2500, lowCarbonPct: 81 },
  { label: "May-24", Nuclear: 4050, Wind: 2100, lowCarbonPct: 80 },
  { label: "Jun-24", Nuclear: 3900, Wind: 1500, lowCarbonPct: 78 },
  { label: "Jul-24", Nuclear: 3800, Wind: 1100, lowCarbonPct: 76 },
  { label: "Aug-24", Nuclear: 4000, Wind: 1200, lowCarbonPct: 77 },
  { label: "Sep-24", Nuclear: 4100, Wind: 1700, lowCarbonPct: 79 },
  { label: "Oct-24", Nuclear: 4200, Wind: 2900, lowCarbonPct: 83 },
  { label: "Nov-24", Nuclear: 4150, Wind: 3400, lowCarbonPct: 84 },
  { label: "Dec-24", Nuclear: 4100, Wind: 3600, lowCarbonPct: 85 },
];

export default function FinlandGridChart() {
  const { data: fingridData, isLoading } = useQuery<any>({
    queryKey: ["/api/fingrid/fi"],
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

  const isLive = fingridData?.live === true && (fingridData?.monthly?.length ?? 0) > 0;

  let annualData: any[] = STATIC_ANNUAL;
  let monthlyTrend: any[] = STATIC_MONTHLY;

  if (isLive) {
    const monthly: any[] = fingridData.monthly ?? [];
    annualData = fingridData.annual?.filter((a: any) => a.monthCount >= 6) ?? STATIC_ANNUAL;
    monthlyTrend = monthly.slice(-24).map((m: any) => ({
      label: m.month.slice(2),
      Nuclear: m.fuels?.["Nuclear"] ?? 0,
      Wind: m.fuels?.["Wind"] ?? 0,
      Hydro: m.fuels?.["Hydro"] ?? 0,
      "CHP & Other": m.fuels?.["CHP & Other"] ?? 0,
      lowCarbonPct: m.lowCarbonSharePct ?? 0,
    }));
  }

  const latest = isLive
    ? fingridData?.latestMonth
    : { fuels: STATIC_MONTHLY[STATIC_MONTHLY.length - 1], lowCarbonSharePct: 85 };

  const latestNuclear = isLive ? (latest?.fuels?.Nuclear ?? 0) : STATIC_MONTHLY[STATIC_MONTHLY.length - 1]?.Nuclear;
  const latestWind    = isLive ? (latest?.fuels?.Wind ?? 0) : STATIC_MONTHLY[STATIC_MONTHLY.length - 1]?.Wind;
  const latestLowCarbon = isLive ? (latest?.lowCarbonSharePct ?? 0) : 85;

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
    <div className="mt-8 space-y-6" data-testid="finland-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Finland Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              {isLive ? "Fingrid Open Data API · 3-min resolution · live aggregated" : "Fingrid Open Data · fetching 12 months of 3-min data (first load ~60s)"}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isLive
            ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
            : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
        }`}>
          <Radio className="w-3 h-3" /> {isLive ? "Live" : "Loading…"}
        </div>
      </div>

      {/* First-load notice */}
      {!isLive && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-foreground">First load:</strong> Fingrid provides 3-minute resolution data.
          Aggregating 12 months of data from 5 datasets — this takes up to 60 seconds on first load,
          then caches for 24 hours. Historical estimates shown below while live data loads.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4" data-testid="fi-kpi-nuclear">
          <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Nuclear Output</p>
          <p className="text-2xl font-bold text-purple-500">{latestNuclear.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">OL1+OL2+LO1+LO2 + OL3 EPR · 4,380 MW installed</p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid="fi-kpi-wind">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Wind Output</p>
          <p className="text-2xl font-bold text-blue-500">{latestWind.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">~7.5 GW installed · Lapland + Baltic offshore</p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4" data-testid="fi-kpi-lowcarbon">
          <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Low-Carbon Share</p>
          <p className="text-2xl font-bold text-green-500">{latestLowCarbon}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Nuclear + Wind + Hydro · among EU's lowest CO₂</p>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4" data-testid="fi-kpi-co2">
          <p className="text-xs text-cyan-600 dark:text-cyan-400 uppercase tracking-wide mb-1">CO₂ Intensity</p>
          <p className="text-2xl font-bold text-cyan-500">~55 gCO₂/kWh</p>
          <p className="text-xs text-muted-foreground mt-0.5">After OL3 — among lowest in EU with France</p>
        </div>
      </div>

      {/* Annual generation mix */}
      {annualData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="fi-annual-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — Finland</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Average MW by fuel type · OL3 EPR ramp-up visible from {isLive ? "live" : "estimated"} 2023 data · Fingrid open data
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={annualData} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                label={{ value: "MW", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip content={<GenTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CHART_FUELS.map((f) => (
                <Bar key={f} dataKey={f} stackId="a" fill={FUEL_COLORS[f]} name={f} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly nuclear + wind trend */}
      {monthlyTrend.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5" data-testid="fi-nuclear-trend">
            <h3 className="text-sm font-semibold text-foreground mb-1">Nuclear Output — Monthly</h3>
            <p className="text-xs text-muted-foreground mb-3">
              OL3 EPR (1,600 MW) commercial April 2023 — step-change visible
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={monthlyTrend} margin={{ left: 0, right: 15, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyTrend.length / 6))} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 5000]}
                  tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString()} MW`, "Nuclear"]} />
                <ReferenceLine y={4380} stroke="#8b5cf6" strokeDasharray="4 4"
                  label={{ value: "4,380 MW", fontSize: 9, fill: "#8b5cf6", position: "right" }} />
                <Line type="monotone" dataKey="Nuclear" stroke="#8b5cf6" strokeWidth={2}
                  dot={{ r: 3 }} activeDot={{ r: 5 }} name="Nuclear (MW)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-5" data-testid="fi-wind-trend">
            <h3 className="text-sm font-semibold text-foreground mb-1">Wind Output — Monthly</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Rapid installation pace — Lapland + Baltic Sea offshore driving growth
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={monthlyTrend} margin={{ left: 0, right: 15, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fiWindGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyTrend.length / 6))} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString()} MW`, "Wind"]} />
                <Area type="monotone" dataKey="Wind" stroke="#3b82f6"
                  fill="url(#fiWindGrad)" strokeWidth={2} dot={{ r: 3 }} name="Wind (MW)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Low-carbon share trend */}
      {monthlyTrend.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="fi-lowcarbon-trend">
          <h3 className="text-sm font-semibold text-foreground mb-1">Low-Carbon Share — Monthly (Nuclear + Wind + Hydro)</h3>
          <p className="text-xs text-muted-foreground mb-4">OL3 EPR step-change pushes Finland above 80% low-carbon in 2023 — approaching France's 90%+ levels</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={monthlyTrend} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="fiLcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyTrend.length / 8))} />
              <YAxis tick={{ fontSize: 11 }} domain={[40, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Low-carbon share"]} />
              <ReferenceLine y={80} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: "80%", fontSize: 10, fill: "#94a3b8" }} />
              <Area type="monotone" dataKey="lowCarbonPct" stroke="#22c55e"
                fill="url(#fiLcGrad)" strokeWidth={2} dot={false} name="Low-Carbon %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* DC market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Helsinki DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~600 MW</p>
          <p className="text-xs text-muted-foreground">
            Google operates Finland's largest hyperscale campus in Hamina (~200+ MW). Equinix HE4–HE7 in Helsinki. Extreme climate = free air cooling 8+ months/year, PUE routinely 1.1–1.2.
          </p>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">OL3 EPR Impact</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">+1,600 MW baseload — April 2023</p>
          <p className="text-xs text-muted-foreground">
            Olkiluoto 3 (1,600 MW) commenced commercial generation April 2023 after 17-year construction. Single largest power plant in Nordic history. Alone covers ~25% of Finland's average consumption. Nuclear now ~35% of generation.
          </p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-green-500" />
            <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">Cooling Advantage</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">Free cooling 8+ months</p>
          <p className="text-xs text-muted-foreground">
            Helsinki average temperature: −5°C (Jan) to +17°C (Jul). Free air cooling or seawater cooling available nearly year-round. Google Hamina uses Baltic seawater cooling. PUE of 1.10 achievable without mechanical cooling for most workloads.
          </p>
        </div>
      </div>

      {/* Grid & permitting note */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Grid connection & permitting:</strong> Fingrid manages Finland's 400/220 kV transmission backbone.
          Data centre connection applications processed under the Electricity Market Act. Typical HV connection timeline: 18–36 months.
          Hamina and Loviisa areas have strong transmission infrastructure due to proximity to nuclear plants.
          Electricity prices: Finland participates in the Nordic Elspot market (NordPool) — among Europe's lowest avg prices when hydro and nuclear are abundant.
          Wind permitting: Finland's new Wind Energy Act (2024) streamlines onshore permitting to 2 years vs. prior 5–7 years — major boost for the 7 GW+ pipeline.
          Source: Fingrid Open Data · data.fingrid.fi · CC BY 4.0 · 3-minute resolution actual generation data.
        </p>
      </div>
    </div>
  );
}
