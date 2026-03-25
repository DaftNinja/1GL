import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { Sun, Wind, Zap, Database, Radio, TrendingUp } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Wind":             "#3b82f6",
  "Solar PV":         "#f59e0b",
  "Solar CSP":        "#f97316",
  "Nuclear":          "#8b5cf6",
  "Hydro":            "#06b6d4",
  "CCGT Gas":         "#ef4444",
  "Cogeneration":     "#84cc16",
  "Hard Coal":        "#64748b",
  "Other Renewables": "#22c55e",
  "Biomass/Waste":    "#10b981",
  "Non-Ren Waste":    "#a1a1aa",
  "Gas Turbine":      "#f43f5e",
  "Diesel":           "#78716c",
};

const CHART_FUELS = ["Wind", "Solar PV", "Solar CSP", "Nuclear", "Hydro", "CCGT Gas", "Cogeneration", "Hard Coal", "Other Renewables", "Biomass/Waste"];

export default function SpainGridChart() {
  const { data: reeData, isLoading } = useQuery<any>({
    queryKey: ["/api/ree/es"],
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

  const monthly: any[] = reeData?.monthly ?? [];
  const annual: any[] = reeData?.annual ?? [];
  const capacities: Record<string, number> = reeData?.capacities ?? {};
  const latestMonth = reeData?.latestMonth;

  if (monthly.length === 0) return null;

  const recentMonthly = monthly.slice(-24).map((m: any) => ({
    label: m.month.slice(2),
    ...Object.fromEntries(CHART_FUELS.map((f) => [f, m.fuels[f] ?? 0])),
    renewableSharePct: m.renewableSharePct,
    lowCarbonSharePct: m.lowCarbonSharePct,
  }));

  const GenTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg max-w-52">
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

  const latestRenewable = latestMonth?.renewableSharePct ?? 0;
  const latestLowCarbon = latestMonth?.lowCarbonSharePct ?? 0;
  const latestWind = latestMonth?.fuels?.["Wind"] ?? 0;
  const latestSolar = (latestMonth?.fuels?.["Solar PV"] ?? 0) + (latestMonth?.fuels?.["Solar CSP"] ?? 0);

  return (
    <div className="mt-8 space-y-6" data-testid="spain-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Sun className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Spain Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">REE — Red Eléctrica de España · Live generation data</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400">
          <Radio className="w-3 h-3" /> Live
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4" data-testid="es-kpi-renewable">
          <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Renewable Share</p>
          <p className="text-2xl font-bold text-green-500">{latestRenewable}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">{latestMonth?.month || "latest"} actual generation</p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid="es-kpi-wind">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Wind</p>
          <p className="text-2xl font-bold text-blue-500">{latestWind.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">avg · 32 GW installed · EU #2 fleet</p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" data-testid="es-kpi-solar">
          <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Solar (PV + CSP)</p>
          <p className="text-2xl font-bold text-amber-500">{latestSolar.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">39.5 GW PV + 2.3 GW CSP · EU largest</p>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4" data-testid="es-kpi-lowcarbon">
          <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Low-Carbon Share</p>
          <p className="text-2xl font-bold text-purple-500">{latestLowCarbon}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Renewables + nuclear · {latestMonth?.month || "latest"}</p>
        </div>
      </div>

      {/* Installed capacity bar */}
      {Object.keys(capacities).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="es-capacity-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Installed Capacity — Spain 2024</h3>
          <p className="text-xs text-muted-foreground mb-4">MW by technology · Solar PV is EU's largest fleet</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { fuel: "Solar PV",  cap: capacities["Solar PV"]  ?? 39500, color: "#f59e0b" },
              { fuel: "Wind",      cap: capacities["Wind"]      ?? 32100, color: "#3b82f6" },
              { fuel: "CCGT Gas",  cap: capacities["CCGT Gas"]  ?? 26300, color: "#ef4444" },
              { fuel: "Hydro",     cap: capacities["Hydro"]     ?? 17100, color: "#06b6d4" },
              { fuel: "Nuclear",   cap: capacities["Nuclear"]   ?? 7100,  color: "#8b5cf6" },
              { fuel: "Cogeneration", cap: capacities["Cogeneration"] ?? 5600, color: "#84cc16" },
              { fuel: "Solar CSP", cap: capacities["Solar CSP"] ?? 2300,  color: "#f97316" },
              { fuel: "Hard Coal", cap: capacities["Hard Coal"] ?? 2100,  color: "#64748b" },
            ].map(({ fuel, cap, color }) => (
              <div key={fuel} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <p className="text-xs text-muted-foreground">{fuel}</p>
                </div>
                <p className="text-base font-bold text-foreground">{(cap / 1000).toFixed(1)} GW</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Annual generation mix chart */}
      {annual.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="es-annual-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — Spain</h3>
          <p className="text-xs text-muted-foreground mb-4">Average MW by fuel type · REE actual generation data · apidatos.ree.es</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={annual} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
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

      {/* Monthly renewable + low-carbon share */}
      {recentMonthly.length > 3 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="es-renewable-trend">
          <h3 className="text-sm font-semibold text-foreground mb-1">Monthly Renewable & Low-Carbon Share — Last 24 Months</h3>
          <p className="text-xs text-muted-foreground mb-4">Renewable = wind + solar + hydro + biomass · Low-Carbon adds nuclear</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={recentMonthly} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="esRenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="esLcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(recentMonthly.length / 8))} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
              <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="4 4"
                label={{ value: "100%", fontSize: 10, fill: "#22c55e", position: "right" }} />
              <Area type="monotone" dataKey="lowCarbonSharePct" stroke="#8b5cf6"
                fill="url(#esLcGrad)" strokeWidth={1.5} dot={false} name="Low-Carbon %" />
              <Area type="monotone" dataKey="renewableSharePct" stroke="#22c55e"
                fill="url(#esRenGrad)" strokeWidth={2} dot={false} name="Renewable %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly wind vs solar stack */}
      {recentMonthly.length > 3 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="es-wind-solar-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Wind vs Solar — Monthly Seasonal Pattern</h3>
          <p className="text-xs text-muted-foreground mb-4">Spain's complementary wind (winter) and solar (summer) peaks create near-year-round renewable dominance</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={recentMonthly} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(recentMonthly.length / 8))} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                label={{ value: "MW", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip formatter={(v: number, name: string) => [`${Math.round(v).toLocaleString()} MW`, name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Wind" stackId="a" fill="#3b82f6" name="Wind" />
              <Bar dataKey="Solar PV" stackId="a" fill="#f59e0b" name="Solar PV" />
              <Bar dataKey="Solar CSP" stackId="a" fill="#f97316" name="Solar CSP" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* DC market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Madrid DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~500 MW</p>
          <p className="text-xs text-muted-foreground">
            Madrid is Spain's primary DC hub — Equinix MD campus, Interxion/Digital Realty, NTT. Growing hyperscaler demand from Google, Microsoft (MAD-01), and Amazon. Strong renewable grid (70%+ renewable hours in 2024).
          </p>
        </div>

        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wind className="w-4 h-4 text-orange-500" />
            <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">Solar-First Policy</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">100% renewable target 2030</p>
          <p className="text-xs text-muted-foreground">
            Spain targets 81% renewable generation by 2030 (PNIEC). Solar PV additions running at 8–10 GW/year. Some months already hitting 100% renewable hours. Nuclear phase-out 2027–2035 (staggered closure of 7 GW).
          </p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">Grid Expansion</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">REE €7B grid investment plan</p>
          <p className="text-xs text-muted-foreground">
            REE investing €7B to 2030 to reinforce the grid for renewables. Spain–France interconnection doubling to 5 GW by 2030. Grid connection queue: 180+ GW renewables awaiting connection — queue managed under REPER decree.
          </p>
        </div>
      </div>

      {/* Grid & permitting note */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Grid connection & permitting:</strong> REE manages Spain's 400 kV backbone.
          Data centres classified as large consumers under Ley del Sector Eléctrico. Grid access via Acceso y Conexión procedure — Madrid region is moderately constrained (12–24 months for &gt;10 MW).
          Zaragoza and Aragon increasingly attractive: abundant solar + good rail/road links + less constrained grid. 
          Electricity price: ~€75–120/MWh for large industrial consumers (volatile due to high CCGT exposure during low-renewable periods).
          Spain's CSP (thermal solar) fleet provides 2.3 GW of dispatchable renewable generation — unique in Europe.
          Source: REE Red Eléctrica de España · apidatos.ree.es · Open Data CC BY 4.0.
        </p>
      </div>
    </div>
  );
}
