import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, LineChart, Line, ReferenceLine, AreaChart, Area,
} from "recharts";
import { Wind, Sun, Factory, Database, AlertTriangle, TrendingUp, Zap, Radio } from "lucide-react";

const BL_SHORT: Record<string, string> = {
  "Niedersachsen": "NI", "Schleswig-Holstein": "SH", "Brandenburg": "BB",
  "Nordrhein-Westfalen": "NW", "Sachsen-Anhalt": "ST", "Bayern": "BY",
  "Baden-Württemberg": "BW", "Rheinland-Pfalz": "RP", "Hessen": "HE",
  "Mecklenburg-Vorpommern": "MV", "Thüringen": "TH", "Sachsen": "SN",
  "Saarland": "SL", "Berlin": "BE", "Hamburg": "HH", "Bremen": "HB",
  "AWZ/Offshore": "AWZ"
};

const TSO: Record<string, { name: string; color: string }> = {
  "Niedersachsen":          { name: "TenneT",         color: "#2563eb" },
  "Schleswig-Holstein":     { name: "TenneT",         color: "#2563eb" },
  "AWZ/Offshore":           { name: "TenneT",         color: "#2563eb" },
  "Bayern":                 { name: "TenneT/Amprion", color: "#7c3aed" },
  "Nordrhein-Westfalen":    { name: "Amprion",        color: "#dc2626" },
  "Rheinland-Pfalz":        { name: "Amprion",        color: "#dc2626" },
  "Hessen":                 { name: "Amprion/TenneT", color: "#9f1239" },
  "Baden-Württemberg":      { name: "TransnetBW",     color: "#059669" },
  "Brandenburg":            { name: "50Hertz",        color: "#d97706" },
  "Berlin":                 { name: "50Hertz",        color: "#d97706" },
  "Sachsen":                { name: "50Hertz",        color: "#d97706" },
  "Sachsen-Anhalt":         { name: "50Hertz",        color: "#d97706" },
  "Mecklenburg-Vorpommern": { name: "50Hertz",        color: "#d97706" },
  "Thüringen":              { name: "50Hertz",        color: "#d97706" },
  "Saarland":               { name: "Amprion",        color: "#dc2626" },
  "Hamburg":                { name: "TenneT",         color: "#2563eb" },
  "Bremen":                 { name: "TenneT",         color: "#2563eb" },
};

const WIND_DATA: Record<string, number> = {
  "Niedersachsen": 14.44, "Schleswig-Holstein": 9.70, "Brandenburg": 9.56,
  "AWZ/Offshore": 9.55, "Nordrhein-Westfalen": 9.30, "Sachsen-Anhalt": 5.75,
  "Rheinland-Pfalz": 4.33, "Mecklenburg-Vorpommern": 4.27, "Hessen": 2.82,
  "Bayern": 2.77, "Baden-Württemberg": 2.11, "Thüringen": 1.91,
  "Sachsen": 1.43, "Saarland": 0.56, "Bremen": 0.19, "Hamburg": 0.12, "Berlin": 0.02
};
const SOLAR_DATA: Record<string, number> = {
  "Bayern": 24.5, "Baden-Württemberg": 12.6, "Nordrhein-Westfalen": 11.0,
  "Niedersachsen": 10.4, "Brandenburg": 7.5, "Sachsen-Anhalt": 5.0,
  "Rheinland-Pfalz": 4.5, "Hessen": 4.5, "Sachsen": 4.0,
  "Mecklenburg-Vorpommern": 4.0, "Thüringen": 3.0, "Schleswig-Holstein": 3.5,
  "Saarland": 1.1, "Hamburg": 0.6, "Berlin": 0.5, "Bremen": 0.2
};
const CONSUMERS_DATA: Record<string, number> = {
  "Nordrhein-Westfalen": 187, "Niedersachsen": 64, "Bayern": 59,
  "Baden-Württemberg": 53, "Brandenburg": 43, "Hessen": 34,
  "Rheinland-Pfalz": 25, "Sachsen": 22, "Saarland": 16, "Berlin": 13,
  "Sachsen-Anhalt": 12, "Hamburg": 11, "Schleswig-Holstein": 6,
  "Mecklenburg-Vorpommern": 5, "Thüringen": 4
};

const ALL_STATES = [
  "Niedersachsen","Schleswig-Holstein","Brandenburg","Nordrhein-Westfalen",
  "Sachsen-Anhalt","Bayern","Baden-Württemberg","Rheinland-Pfalz","Hessen",
  "Mecklenburg-Vorpommern","Thüringen","Sachsen","Saarland"
];

const renewableChartData = ALL_STATES.map(st => ({
  state: BL_SHORT[st] || st,
  fullName: st,
  wind: +(WIND_DATA[st] || 0).toFixed(2),
  solar: +(SOLAR_DATA[st] || 0).toFixed(1),
  total: +((WIND_DATA[st] || 0) + (SOLAR_DATA[st] || 0)).toFixed(2),
  consumers: CONSUMERS_DATA[st] || 0,
  tso: TSO[st]?.name || "",
})).sort((a, b) => b.total - a.total);

const consumerChartData = Object.entries(CONSUMERS_DATA)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([st, cnt]) => ({ state: BL_SHORT[st] || st, fullName: st, consumers: cnt, tso: TSO[st]?.name || "" }));

const DC_INSIGHTS = [
  {
    region: "Brandenburg/Berlin", tso: "50Hertz", rating: "Best", color: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-800",
    points: [
      "17.06 GW combined renewables (wind+solar) — only 43+13 large consumers registered",
      "50Hertz actively seeks anchor loads to absorb renewable surplus; fastest connection lead times",
      "Germany's 2nd largest DC cluster (NTT, Vantage, VIRTUS, Prea); 40% CAGR 2020–2023",
      "PPA prices ~€45-60/MWh; land significantly cheaper than Frankfurt",
      "Municipalities in BB/BE receive 100-200 DC operator enquiries per month (SDI Alliance)"
    ]
  },
  {
    region: "Niedersachsen", tso: "TenneT", rating: "Strong", color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-800",
    points: [
      "24.84 GW renewables (Germany's highest combined wind+solar per state)",
      "64 large consumers — moderate load density; significant grid headroom vs NRW",
      "TenneT grid investment active; Hannover corridor serves transit connectivity well",
      "Emerging DC market; lower land/construction costs than Frankfurt or Munich"
    ]
  },
  {
    region: "NRW — Frankfurt Corridor", tso: "Amprion", rating: "Connectivity", color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-800",
    points: [
      "187 large consumers (34% national total); most congested grid in Germany",
      "Frankfurt: DCs = 40% of city power demand; grid connections fully allocated for years",
      "Pro-rata allocation >3.5 MW since 2020; NRM gets 5-10 DC requests/year, all oversubscribed",
      "CyrusOne FRA7 expanding to 126 MW using on-site gas — 'not an isolated case' (BfE)",
      "Best for latency-critical/DE-CIX-connected workloads; 24-48 months lead time for >50 MW"
    ]
  },
  {
    region: "Schleswig-Holstein", tso: "TenneT", rating: "Caution", color: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-800",
    points: [
      "19.25 GW wind (onshore + AWZ offshore) — abundant but transmission south severely constrained",
      "SuedLink HVDC now postponed to 2029 (previously 2028); congestion relief delayed",
      "NOT recommended for very large new loads pre-2029",
      "Grid congestion costs are already highest in Europe for northern German states"
    ]
  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-bold text-slate-900 mb-1">{payload[0]?.payload?.fullName}</p>
      <p className="text-slate-500 text-xs mb-2">TSO: {payload[0]?.payload?.tso}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.fill || p.color }}>{p.name}</span>
          <span className="font-medium">{p.value} GW</span>
        </div>
      ))}
      <div className="border-t border-slate-100 mt-1 pt-1">
        <div className="flex justify-between gap-4 font-bold">
          <span>Total renewables</span>
          <span>{(payload.reduce((s: number, p: any) => s + (p.value || 0), 0)).toFixed(1)} GW</span>
        </div>
      </div>
    </div>
  );
};

const FUEL_COLORS: Record<string, string> = {
  "Nuclear": "#8b5cf6",
  "Wind Onshore": "#3b82f6",
  "Wind Offshore": "#06b6d4",
  "Solar": "#f59e0b",
  "Lignite": "#92400e",
  "Hard Coal": "#64748b",
  "Gas": "#ef4444",
  "Biomass": "#22c55e",
  "Hydro Run-of-River": "#0891b2",
  "Hydro Reservoir": "#0e7490",
  "Oil": "#78716c",
  "Waste": "#a3a3a3",
  "Others": "#d1d5db",
};

const KEY_FUELS = ["Nuclear", "Wind Onshore", "Wind Offshore", "Solar", "Lignite", "Hard Coal", "Gas", "Biomass"];

export default function GermanyGridChart() {
  const { data: genData, isLoading: genLoading } = useQuery<any>({
    queryKey: ["/api/energy-charts/de"],
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Build annual chart data from Energy Charts
  const annualChartData = (genData?.annual || []).map((yr: any) => ({
    year: yr.year,
    ...Object.fromEntries(KEY_FUELS.map((f) => [f, yr.fuels[f] ?? 0])),
    renewablePct: yr.renewableSharePct,
  }));

  // Build monthly chart data (last 24 months)
  const allMonthly: any[] = genData?.monthly || [];
  const recentMonthly = allMonthly.slice(-24).map((m: any) => ({
    label: m.month.slice(2),
    month: m.month,
    ...Object.fromEntries(KEY_FUELS.map((f) => [f, m.fuels[f] ?? 0])),
    renewablePct: m.renewableSharePct,
  }));

  // Current mix stats
  const currentMix: Record<string, number> = genData?.currentMix || {};
  const latestAnnual = annualChartData[annualChartData.length - 1];

  const GenTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg max-w-xs">
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
    <div className="space-y-6 mb-8">

      {/* Live generation data from Energy Charts */}
      {!genLoading && annualChartData.length > 0 && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Germany Actual Grid Generation</h3>
                <p className="text-xs text-muted-foreground">Fraunhofer ISE Energy-Charts · 15-min resolution · monthly averages</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400">
              <Radio className="w-3 h-3" /> Live
            </div>
          </div>

          {/* KPIs */}
          {latestAnnual && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Renewable Share</p>
                <p className="text-2xl font-bold text-green-500">{latestAnnual.renewablePct}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">{latestAnnual.year} annual avg</p>
              </div>
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Nuclear (post-exit)</p>
                <p className="text-2xl font-bold text-purple-500">{latestAnnual["Nuclear"]} MW</p>
                <p className="text-xs text-muted-foreground mt-0.5">Exit completed 15 Apr 2023</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Wind (avg MW)</p>
                <p className="text-2xl font-bold text-blue-500">
                  {((latestAnnual["Wind Onshore"] || 0) + (latestAnnual["Wind Offshore"] || 0)).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{latestAnnual.year} annual avg</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Solar (avg MW)</p>
                <p className="text-2xl font-bold text-amber-500">{(latestAnnual["Solar"] || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{latestAnnual.year} annual avg</p>
              </div>
            </div>
          )}

          {/* Annual generation chart */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h4 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — 2019 to Present</h4>
            <p className="text-xs text-muted-foreground mb-4">Average MW by fuel type · Nuclear exit April 2023 visible</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={annualChartData} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                  label={{ value: "MW", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                <Tooltip content={<GenTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {KEY_FUELS.map((f) => (
                  <Bar key={f} dataKey={f} stackId="a" fill={FUEL_COLORS[f]} name={f} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly renewable share trend */}
          {recentMonthly.length > 3 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="text-sm font-semibold text-foreground mb-1">Monthly Renewable Share — Last 24 Months</h4>
              <p className="text-xs text-muted-foreground mb-4">% of total generation from renewables (wind + solar + hydro + biomass)</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={recentMonthly} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="renGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }}
                    interval={Math.max(1, Math.floor(recentMonthly.length / 8))} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Renewable share"]} />
                  <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4"
                    label={{ value: "50%", fontSize: 10, fill: "#94a3b8" }} />
                  <Area type="monotone" dataKey="renewablePct" stroke="#22c55e"
                    fill="url(#renGrad)" strokeWidth={2} dot={false} name="Renewable %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Germany nuclear exit (15 April 2023):</strong> The final three reactors
              (Emsland, Isar 2, Neckarwestheim 2 — combined ~3,747 MW) were shut down simultaneously.
              Nuclear generation dropped from ~2,460 MW average in Q1 2023 to zero in May 2023.
              The generation gap has been partially filled by Wind Onshore (+~4 GW year-on-year by 2025)
              and Solar growth, with Gas generation peaking in winter months to compensate.
              Source: Fraunhofer ISE Energy-Charts · actual 15-min ENTSO-E generation data.
            </p>
          </div>
        </>
      )}

      {genLoading && (
        <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
          <div className="h-4 bg-muted rounded w-64 mb-3" />
          <div className="h-48 bg-muted rounded" />
        </div>
      )}

      {/* Frankfurt saturation alert */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-800">
          <span className="font-bold">Frankfurt grid fully allocated.</span> Data centres now account for up to 40% of Frankfurt's total power demand. Grid connections are oversubscribed for the coming years — NRM receives 5-10 large DC connection requests per year with no headroom. CyrusOne and others have turned to on-site gas generation. New DC entrants are moving to Brandenburg, Sachsen-Anhalt, Niedersachsen, and NRW Rhineland, where municipalities receive 100-200 operator enquiries per month.
        </div>
      </div>

      {/* Market KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-slate-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1">
              <Database className="w-3 h-3" /> Germany DC Load
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">4.26 GW</p>
            <p className="text-xs text-slate-400 mt-0.5">#1 in Europe — S&P/451 Research 2025</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-slate-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1">
              <Zap className="w-3 h-3" /> DC Consumption
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">21 TWh</p>
            <p className="text-xs text-slate-400 mt-0.5">4% of Germany's power — ICIS 2024</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide flex items-center gap-1">
              <Wind className="w-3 h-3" /> Total Wind
            </p>
            <p className="text-2xl font-bold text-blue-800 mt-1">88.8 GW</p>
            <p className="text-xs text-blue-600 mt-0.5">31,986 turbines — MaStR 12-Mar-2026</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-yellow-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-yellow-600 font-medium uppercase tracking-wide flex items-center gap-1">
              <Sun className="w-3 h-3" /> Total Solar
            </p>
            <p className="text-2xl font-bold text-yellow-800 mt-1">93.5 GW</p>
            <p className="text-xs text-yellow-600 mt-0.5">BNetzA Q4-2024</p>
          </CardContent>
        </Card>
      </div>

      {/* Market outlook strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-lg px-4 py-3 text-white">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> E.ON 2030 Target
          </p>
          <p className="text-lg font-bold">6 GW connected</p>
          <p className="text-xs text-slate-300 mt-0.5">DC grid connections in Germany by 2030; mostly Frankfurt area</p>
        </div>
        <div className="bg-slate-800 rounded-lg px-4 py-3 text-white">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Database className="w-3 h-3" /> Largest Planned Campus
          </p>
          <p className="text-lg font-bold">480 MW — NTT</p>
          <p className="text-xs text-slate-300 mt-0.5">Nierstein campus, construction from 2026; equivalent to 500k households</p>
        </div>
        <div className="bg-slate-800 rounded-lg px-4 py-3 text-white">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Growth Forecast
          </p>
          <p className="text-lg font-bold">~10% by 2037</p>
          <p className="text-xs text-slate-300 mt-0.5">Share of Germany power demand from DCs — Federal Network Agency</p>
        </div>
      </div>

      {/* Renewable capacity chart */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Renewable Energy Capacity by State
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Installed wind (GW) + solar (GW) by Bundesland — MaStR 12-Mar-2026 + BNetzA Q4-2024
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">MaStR + BNetzA</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={renewableChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="state" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: "GW", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10, fill: "#64748b" } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="wind" name="Wind" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="solar" name="Solar" stackId="a" fill="#eab308" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-slate-400 mt-2">
            Source: Marktstammdatenregister (MaStR) Gesamtdatenexport 12-Mar-2026 · Bundesnetzagentur Q4-2024
          </p>
        </CardContent>
      </Card>

      {/* Large consumers chart */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Large Electricity Consumers by State
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                High-voltage connection registrations — 554 total across Germany (MaStR 2026). Colour = TSO zone.
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">MaStR 2026</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={consumerChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="state" type="category" width={28} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, "Large consumers"]} labelFormatter={(l, p) => p[0]?.payload?.fullName || l} />
              <Bar dataKey="consumers" name="Large consumers" radius={[0, 3, 3, 0]}>
                {consumerChartData.map((entry, i) => {
                  const colors: Record<string, string> = {
                    "Amprion": "#dc2626", "TenneT": "#2563eb",
                    "50Hertz": "#d97706", "TransnetBW": "#059669",
                    "TenneT/Amprion": "#7c3aed", "Amprion/TenneT": "#9f1239"
                  };
                  return <Cell key={i} fill={colors[entry.tso] || "#94a3b8"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {[["Amprion", "#dc2626"], ["TenneT", "#2563eb"], ["50Hertz", "#d97706"], ["TransnetBW", "#059669"]].map(([n, c]) => (
              <span key={n} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: c }} />
                {n}
              </span>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            Source: Marktstammdatenregister (MaStR) Gesamtdatenexport 12-Mar-2026
          </p>
        </CardContent>
      </Card>

      {/* DC site siting cards */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
          DC Power Siting — State-by-State Assessment
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DC_INSIGHTS.map((insight) => (
            <Card key={insight.region} className={`border ${insight.color} shadow-sm`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-bold text-slate-900 text-sm">{insight.region}</p>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${insight.badge}`}>{insight.rating}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">{insight.tso}</span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {insight.points.map((pt, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                      <span className="text-slate-400 mt-0.5 shrink-0">·</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Regulatory quick-reference */}
      <Card className="border-none shadow-sm bg-slate-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-900">German Energy Efficiency Act (EnEfG) — DC Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-700 mb-1">PUE Mandates</p>
              <ul className="space-y-1 text-xs text-slate-600">
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>New DCs from 2026: PUE ≤ 1.2</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Existing DCs by July 2027: PUE ≤ 1.5</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Existing DCs by 2030: PUE ≤ 1.3</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>European avg PUE: 1.6 (2023); new builds typically 1.3</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 mb-1">Renewable Obligations</p>
              <ul className="space-y-1 text-xs text-slate-600">
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Facilities &gt;300 kWp: 50% renewable now</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>100% renewable required by 2027</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Waste heat reuse mandatory; integration into district heating encouraged</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Data Centre Register: annual energy consumption reporting required</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 mb-1">Permitting Thresholds</p>
              <ul className="space-y-1 text-xs text-slate-600">
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Backup generators &gt;20 MW: immission permit required</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>Facilities &gt;50 MW: full public consultation required</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>BauGB "privileged" DC classification: proposed but NOT enacted</li>
                <li className="flex items-start gap-1.5"><span className="text-slate-400 shrink-0">·</span>SuedLink HVDC: postponed to 2029</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Sources: AlgorithmWatch (2025) · Addleshaws Germany DC Guide (2025) · S&P Global/451 Research (2025) · ICIS European DC Forecast (2025) · Reuters (Mar 2026) · MaStR (Mar 2026) · BNetzA (Q4-2024)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
