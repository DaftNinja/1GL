import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { Zap, Flame, Wind, Radio, Database } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Hard Coal":    "#374151",
  "Lignite":      "#78350f",
  "Natural Gas":  "#f97316",
  "Wind Onshore": "#3b82f6",
  "Solar":        "#fbbf24",
  "Biomass":      "#22c55e",
  "Hydro":        "#06b6d4",
  "Other":        "#94a3b8",
};

const CHART_FUELS = ["Hard Coal", "Lignite", "Natural Gas", "Wind Onshore", "Solar", "Biomass", "Hydro", "Other"];

// Static fallback while first load completes
const STATIC_ANNUAL: any[] = [
  { year: "2021", "Hard Coal": 10300, Lignite: 5800, "Natural Gas": 2200, "Wind Onshore": 1900, Solar: 700,  Biomass: 380, Hydro: 200, Other: 900, coalPct: 72, renewablePct: 15 },
  { year: "2022", "Hard Coal": 9800,  Lignite: 5600, "Natural Gas": 2600, "Wind Onshore": 2500, Solar: 1000, Biomass: 400, Hydro: 190, Other: 950, coalPct: 69, renewablePct: 18 },
  { year: "2023", "Hard Coal": 9200,  Lignite: 5100, "Natural Gas": 3000, "Wind Onshore": 3200, Solar: 1900, Biomass: 420, Hydro: 210, Other: 850, coalPct: 65, renewablePct: 23 },
  { year: "2024", "Hard Coal": 8800,  Lignite: 4900, "Natural Gas": 3200, "Wind Onshore": 4100, Solar: 2800, Biomass: 440, Hydro: 220, Other: 800, coalPct: 61, renewablePct: 27 },
];

const STATIC_MONTHLY: any[] = [
  { label: "Jan-24", "Hard Coal": 9500, "Wind Onshore": 3200, Solar:  400, coalPct: 65, renewablePct: 22 },
  { label: "Feb-24", "Hard Coal": 9200, "Wind Onshore": 3800, Solar:  800, coalPct: 64, renewablePct: 24 },
  { label: "Mar-24", "Hard Coal": 8800, "Wind Onshore": 3100, Solar: 2200, coalPct: 60, renewablePct: 27 },
  { label: "Apr-24", "Hard Coal": 8200, "Wind Onshore": 2800, Solar: 3800, coalPct: 57, renewablePct: 31 },
  { label: "May-24", "Hard Coal": 7900, "Wind Onshore": 2400, Solar: 4900, coalPct: 54, renewablePct: 34 },
  { label: "Jun-24", "Hard Coal": 8100, "Wind Onshore": 1900, Solar: 5200, coalPct: 56, renewablePct: 33 },
  { label: "Jul-24", "Hard Coal": 8400, "Wind Onshore": 1800, Solar: 5100, coalPct: 59, renewablePct: 31 },
  { label: "Aug-24", "Hard Coal": 8600, "Wind Onshore": 1700, Solar: 4800, coalPct: 60, renewablePct: 30 },
  { label: "Sep-24", "Hard Coal": 8900, "Wind Onshore": 2100, Solar: 3200, coalPct: 61, renewablePct: 27 },
  { label: "Oct-24", "Hard Coal": 9100, "Wind Onshore": 3400, Solar: 1400, coalPct: 63, renewablePct: 24 },
  { label: "Nov-24", "Hard Coal": 9400, "Wind Onshore": 4100, Solar:  600, coalPct: 65, renewablePct: 23 },
  { label: "Dec-24", "Hard Coal": 9700, "Wind Onshore": 4500, Solar:  200, coalPct: 67, renewablePct: 22 },
];

export default function PolandGridChart() {
  const { data: pseData, isLoading } = useQuery<any>({
    queryKey: ["/api/pse/pl"],
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

  const isLive = pseData?.live === true && (pseData?.monthly?.length ?? 0) > 0;

  let annualData: any[] = STATIC_ANNUAL;
  let monthlyTrend: any[] = STATIC_MONTHLY;
  let latestCoalPct = 67;
  let latestRenewablePct = 22;
  let latestWind = 4500;
  let latestSolar = 200;

  if (isLive) {
    const monthly: any[] = pseData.monthly ?? [];
    annualData = pseData.annual?.filter((a: any) => a.monthCount >= 3) ?? STATIC_ANNUAL;
    monthlyTrend = monthly.slice(-12).map((m: any) => ({
      label: m.month.slice(2),
      ...m.fuels,
      coalPct: m.coalPct ?? 0,
      renewablePct: m.renewablePct ?? 0,
    }));
    const last = monthly[monthly.length - 1];
    if (last) {
      latestCoalPct = last.coalPct ?? 67;
      latestRenewablePct = last.renewablePct ?? 22;
      latestWind = last.fuels?.["Wind Onshore"] ?? 4500;
      latestSolar = last.fuels?.["Solar"] ?? 200;
    }
  }

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
    <div className="mt-8 space-y-6" data-testid="poland-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Poland Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              {isLive
                ? "PSE SA Open Data API · api.raporty.pse.pl · 15-min actual generation"
                : "PSE SA Open Data · api.raporty.pse.pl · loading live data…"}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isLive
            ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
            : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
        }`}>
          <Radio className="w-3 h-3" /> {isLive ? "Live" : "Estimated"}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-500/20 bg-zinc-500/5 p-4" data-testid="pl-kpi-coal">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Coal Share</p>
          <p className="text-2xl font-bold text-zinc-400">{latestCoalPct}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Hard coal + lignite · EU's largest coal fleet · declining from ~85% (2015)</p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid="pl-kpi-wind">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Wind Output</p>
          <p className="text-2xl font-bold text-blue-500">{latestWind.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">~15 GW installed · Baltic offshore pipeline (11 GW by 2035)</p>
        </div>

        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4" data-testid="pl-kpi-solar">
          <p className="text-xs text-yellow-600 dark:text-yellow-400 uppercase tracking-wide mb-1">Solar Output</p>
          <p className="text-2xl font-bold text-yellow-500">{latestSolar.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">~22 GW installed · prosumer rooftop boom since 2020</p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4" data-testid="pl-kpi-renewables">
          <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Renewable Share</p>
          <p className="text-2xl font-bold text-green-500">{latestRenewablePct}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">vs. EU target 42.5% by 2030 · significant catch-up needed</p>
        </div>
      </div>

      {/* Annual generation mix */}
      {annualData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="pl-annual-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — Poland</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Average MW by fuel type · coal declining, wind + solar growing rapidly · PSE SA open data
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

      {/* Monthly trends */}
      {monthlyTrend.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Coal share declining trend */}
          <div className="rounded-xl border border-border bg-card p-5" data-testid="pl-coal-trend">
            <h3 className="text-sm font-semibold text-foreground mb-1">Coal Share — Monthly</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Hard coal + lignite share — EU's highest-coal electricity system (2015: ~85%)
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={monthlyTrend} margin={{ left: 0, right: 20, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="plCoalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#374151" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#374151" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyTrend.length / 6))} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Coal share"]} />
                <ReferenceLine y={55} stroke="#ef4444" strokeDasharray="4 4"
                  label={{ value: "2030 target ~55%", fontSize: 9, fill: "#ef4444" }} />
                <Area type="monotone" dataKey="coalPct" stroke="#374151"
                  fill="url(#plCoalGrad)" strokeWidth={2} dot={{ r: 3 }} name="Coal %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Wind + Solar growth */}
          <div className="rounded-xl border border-border bg-card p-5" data-testid="pl-wind-solar-trend">
            <h3 className="text-sm font-semibold text-foreground mb-1">Wind & Solar Output — Monthly</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Solar: strong seasonal swing. Wind: growing, Baltic offshore 11 GW pipeline
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={monthlyTrend} margin={{ left: 0, right: 15, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyTrend.length / 6))} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString()} MW`]} />
                <Line type="monotone" dataKey="Wind Onshore" stroke="#3b82f6" strokeWidth={2}
                  dot={{ r: 3 }} name="Wind Onshore" />
                <Line type="monotone" dataKey="Solar" stroke="#fbbf24" strokeWidth={2}
                  dot={{ r: 3 }} name="Solar" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* DC Market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-red-500" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Warsaw DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~200 MW</p>
          <p className="text-xs text-muted-foreground">
            Emerging EU hyperscale market. Equinix WA1/WA2, Beyond.pl, Atman (Orange Group).
            Warsaw 1st-tier for Eastern EU connectivity — CEE internet exchange hub.
            EU digital sovereignty tailwind post-2024 cloud acts.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Carbon Risk</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">~350 gCO₂/kWh · EU's highest</p>
          <p className="text-xs text-muted-foreground">
            Poland is Europe's largest coal consumer. Grid carbon intensity ~350 gCO₂/kWh vs EU avg 230 gCO₂/kWh.
            ETS carbon cost (~€60/tonne) makes coal uneconomic by 2030.
            Hyperscalers negotiating long-term PPAs for Baltic offshore wind to offset scope 2.
          </p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wind className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Nuclear Coming</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">6–9 GW by 2040</p>
          <p className="text-xs text-muted-foreground">
            Poland contracted Westinghouse AP1000 (Choczewo, ~3.75 GW, 6 units) — first power 2036.
            Second programme under evaluation (Korean KHNP APR1400 vs. NuScale SMR).
            Nuclear + offshore wind = credible decarbonisation pathway enabling data-centre PPAs.
          </p>
        </div>
      </div>

      {/* Grid & permitting note */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Grid & permitting:</strong> PSE SA (Polskie Sieci Elektroenergetyczne) manages Poland's 400/220 kV transmission network.
          HV connection applications face long queues — grid reinforcement investment plans through 2032 address ~€8B upgrade backlog.
          Wind permitting: liberalised 2023 (10× rule repealed → 500m setback) — ~30 GW onshore pipeline now progressing.
          Electricity prices: Poland participates in EPEX SPOT / TGE (Polish Power Exchange); recent volatility driven by coal export arbitrage and EU ETS pass-through.
          Source: PSE SA Open Data API (api.raporty.pse.pl) · 15-minute resolution actual generation · ENTSO-E fuel type classification.
        </p>
      </div>
    </div>
  );
}
