import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area, ReferenceLine,
} from "recharts";
import { Zap, Wind, Sun, Radio, AlertTriangle, Database, TrendingUp } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Wind Onshore":  "#3b82f6",
  "Wind Offshore": "#06b6d4",
  "Solar":         "#f59e0b",
  "Nuclear":       "#8b5cf6",
  "Fossil Gas":    "#ef4444",
  "Hard Coal":     "#64748b",
  "Biomass":       "#22c55e",
};

const KEY_FUELS = ["Wind Onshore", "Wind Offshore", "Solar", "Nuclear", "Fossil Gas", "Hard Coal", "Biomass"];

export default function NetherlandsGridChart() {
  const { data: nedData, isLoading } = useQuery<any>({
    queryKey: ["/api/ned/nl"],
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

  const monthly: any[] = nedData?.monthly || [];
  if (monthly.length === 0) return null;

  const latestMonth = nedData?.latestMonth;
  const borssele = nedData?.borsseleStatus;
  const offshoreGw = nedData?.offshoreCapacityGw;

  // Annual averages from monthly data
  const byYear: Record<string, any[]> = {};
  for (const m of monthly) {
    const yr = m.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  }

  const annualData = Object.entries(byYear)
    .filter(([, months]) => months.length >= 6)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, months]) => {
      const avg: Record<string, number> = {};
      for (const fuel of KEY_FUELS) {
        const vals = months.map((m) => m.fuels[fuel] ?? 0);
        avg[fuel] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
      const renewablePct = Math.round(months.reduce((s, m) => s + m.renewableSharePct, 0) / months.length);
      return { year, ...avg, renewablePct };
    });

  // Last 24 months for trajectory
  const recentMonthly = monthly.slice(-24).map((m: any) => ({
    label: m.month.slice(2),
    month: m.month,
    ...Object.fromEntries(KEY_FUELS.map((f) => [f, m.fuels[f] ?? 0])),
    renewablePct: m.renewableSharePct,
    carbonIntensity: m.carbonIntensityGco2Kwh,
  }));

  const latestYear = annualData[annualData.length - 1];

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
    <div className="mt-8 space-y-6" data-testid="netherlands-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Wind className="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Netherlands Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">Nationaal Energie Dashboard (NED) · Live generation data</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400">
          <Radio className="w-3 h-3" /> Live
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4" data-testid="nl-kpi-renewable">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Renewable Share</p>
          <p className="text-2xl font-bold text-green-500">{latestMonth?.renewableSharePct ?? latestYear?.renewablePct ?? "—"}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">{latestMonth?.month || "latest"}</p>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4" data-testid="nl-kpi-offshore">
          <p className="text-xs text-cyan-600 dark:text-cyan-400 uppercase tracking-wide mb-1">Wind Offshore</p>
          <p className="text-2xl font-bold text-cyan-500">
            {offshoreGw !== null ? `${offshoreGw} GW` : `${(latestMonth?.fuels?.["Wind Offshore"] ?? 0).toLocaleString()} MW`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">avg generation · Borssele 1-4 + Hollandse Kust</p>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4" data-testid="nl-kpi-nuclear">
          <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Borssele Nuclear</p>
          <p className="text-2xl font-bold text-purple-500">
            {borssele ? `${borssele.avgMw.toLocaleString()} MW` : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {borssele?.month || ""} · 515 MW installed
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" data-testid="nl-kpi-solar">
          <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Solar</p>
          <p className="text-2xl font-bold text-amber-500">
            {(latestMonth?.fuels?.["Solar"] ?? 0).toLocaleString()} MW
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{latestMonth?.month || "latest"} avg</p>
        </div>
      </div>

      {/* Annual generation mix */}
      {annualData.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="nl-annual-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — Netherlands</h3>
          <p className="text-xs text-muted-foreground mb-4">Average MW by fuel type · NED actual generation data</p>
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
      )}

      {/* Monthly renewable share trend */}
      {recentMonthly.length > 3 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="nl-renewable-trend">
          <h3 className="text-sm font-semibold text-foreground mb-1">Monthly Renewable Share — Last 24 Months</h3>
          <p className="text-xs text-muted-foreground mb-4">% of generation from wind + solar + biomass</p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={recentMonthly} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="nlRenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }}
                interval={Math.max(1, Math.floor(recentMonthly.length / 8))} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Renewable share"]} />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: "50%", fontSize: 10, fill: "#94a3b8" }} />
              <Area type="monotone" dataKey="renewablePct" stroke="#06b6d4"
                fill="url(#nlRenGrad)" strokeWidth={2} dot={false} name="Renewable %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Borssele nuclear monthly tracker */}
      {recentMonthly.length > 3 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="nl-nuclear-tracker">
          <h3 className="text-sm font-semibold text-foreground mb-1">Borssele Nuclear Plant — Monthly Output</h3>
          <p className="text-xs text-muted-foreground mb-4">515 MW installed · outages visible as dips · zero-carbon baseload · NED actual generation</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={recentMonthly} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }}
                interval={Math.max(1, Math.floor(recentMonthly.length / 8))} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 600]}
                label={{ value: "MW", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip formatter={(v: number) => [`${Math.round(v)} MW`, "Borssele nuclear"]} />
              <ReferenceLine y={515} stroke="#8b5cf6" strokeDasharray="4 4"
                label={{ value: "515 MW installed", fontSize: 10, fill: "#8b5cf6", position: "right" }} />
              <Line type="monotone" dataKey="Nuclear" stroke="#8b5cf6" strokeWidth={2}
                dot={{ r: 3 }} activeDot={{ r: 5 }} name="Borssele (MW)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Amsterdam DC market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Amsterdam DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~1.5 GW</p>
          <p className="text-xs text-muted-foreground">Connected DC load — AMS is Europe's #2 hub after London. Equinix, Digital Realty, NTT major operators.</p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Grid Congestion</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">Noord-Holland constrained</p>
          <p className="text-xs text-muted-foreground">Amsterdam had a DC moratorium 2019–2021 due to grid saturation. Province still applies strict power allocation — operators moving to Flevoland and Groningen.</p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">Nuclear Expansion</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">2 new reactors planned</p>
          <p className="text-xs text-muted-foreground">Dutch government approved 2 new 1 GW+ reactors at Borssele (Zeeland) site. Tender expected 2025, online ~2035. Adds 2 GW firm zero-carbon baseload.</p>
        </div>
      </div>

      {/* AMS-IX connectivity note */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">AMS-IX connectivity:</strong> Amsterdam Internet Exchange handles ~15 Tbps peak traffic — the largest in Europe. DC operators in AMS-IX connected facilities benefit from ultra-low latency to 900+ connected networks.
          Power from the Dutch grid has an average carbon intensity of ~{latestMonth?.carbonIntensityGco2Kwh?.toFixed(0) ?? 190} gCO₂/kWh (NED {latestMonth?.month || "latest"}),
          significantly lower than the EU average (~300 gCO₂/kWh). Strong offshore wind growth means this figure continues to fall.
          Source: Nationaal Energie Dashboard (NED) · ned.nl · CC BY 4.0.
        </p>
      </div>
    </div>
  );
}
