import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
} from "recharts";
import { Zap, Sun, Wind, Database, Radio, Thermometer } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Natural Gas":     "#f97316",
  "Solar":           "#fbbf24",
  "Hydro":           "#06b6d4",
  "Wind":            "#3b82f6",
  "Geothermal":      "#a855f7",
  "Biomass & Waste": "#22c55e",
  "Coal":            "#374151",
  "Pumped Storage":  "#64748b",
};

const CHART_FUELS = ["Natural Gas", "Solar", "Hydro", "Wind", "Geothermal", "Biomass & Waste", "Coal", "Pumped Storage"];

export default function ItalyGridChart() {
  const { data: ternaData, isLoading } = useQuery<any>({
    queryKey: ["/api/terna/it"],
    staleTime: 12 * 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-5 bg-muted rounded w-72 mb-4" />
        <div className="h-52 bg-muted rounded" />
      </div>
    );
  }

  const monthly: any[] = ternaData?.monthly ?? [];
  const annualData: any[] = ternaData?.annual ?? [];
  const latestMonth = ternaData?.latestMonth;

  const monthlyTrend = monthly.slice(-12).map((m: any) => ({
    label: m.month.slice(2),
    ...m.fuels,
    renewablePct: m.renewablePct ?? 0,
    gasPct: m.gasPct ?? 0,
  }));

  const latestRenewablePct = latestMonth?.renewablePct ?? 41;
  const latestGasPct = latestMonth?.gasPct ?? 43;
  const latestSolar = latestMonth?.fuels?.Solar ?? 900;
  const latestWind = latestMonth?.fuels?.Wind ?? 5500;

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
    <div className="mt-8 space-y-6" data-testid="italy-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Italy Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              Terna Dati Statistici 2024 · GSE Annual Report · ENTSO-E Transparency Platform
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400">
          <Radio className="w-3 h-3" /> Reference Data
        </div>
      </div>

      {/* Data source note */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Data source:</strong> Terna (Italy's TSO) delivers real-time data via embedded Power BI dashboards at{" "}
        <span className="font-mono text-foreground">dati.terna.it</span> — no public JSON REST API is available without a commercial subscription.
        Data shown is from Terna's published statistical yearbook and GSE's annual renewable energy report, both publicly released.
        Live API integration available once ENTSO-E API key is approved (ENTSOE_API_KEY pending).
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4" data-testid="it-kpi-gas">
          <p className="text-xs text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-1">Gas Share</p>
          <p className="text-2xl font-bold text-orange-500">{latestGasPct}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Italy's largest generation source · gas import dependency ~87%</p>
        </div>

        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4" data-testid="it-kpi-solar">
          <p className="text-xs text-yellow-600 dark:text-yellow-400 uppercase tracking-wide mb-1">Solar Output</p>
          <p className="text-2xl font-bold text-yellow-500">{latestSolar.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">~35 GW installed · 3rd in EU · summer peaks {">"}20 GW</p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4" data-testid="it-kpi-wind">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Wind Output</p>
          <p className="text-2xl font-bold text-blue-500">{latestWind.toLocaleString()} MW</p>
          <p className="text-xs text-muted-foreground mt-0.5">~12 GW onshore + 0 offshore · 50 GW offshore pipeline (Adriatic)</p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4" data-testid="it-kpi-renewables">
          <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Renewable Share</p>
          <p className="text-2xl font-bold text-green-500">{latestRenewablePct}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">Solar + Wind + Hydro + Geothermal · EU 2030 target: 55%</p>
        </div>
      </div>

      {/* Annual generation mix */}
      {annualData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="it-annual-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">Annual Generation Mix — Italy</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Average MW by fuel type · gas dominates but solar + renewables growing · no nuclear since 1987 referendum
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

      {/* Monthly solar + renewable seasonality */}
      {monthlyTrend.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5" data-testid="it-solar-seasonal">
            <h3 className="text-sm font-semibold text-foreground mb-1">Solar & Wind — Seasonal Profile (2024)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Italy's solar peaks June–August, wind peaks Dec–Feb — natural complementarity
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={monthlyTrend} margin={{ left: 0, right: 20, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="itSolarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="itWindGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`${Math.round(v).toLocaleString()} MW`]} />
                <Area type="monotone" dataKey="Solar" stroke="#fbbf24"
                  fill="url(#itSolarGrad)" strokeWidth={2} dot={false} name="Solar (MW)" />
                <Area type="monotone" dataKey="Wind" stroke="#3b82f6"
                  fill="url(#itWindGrad)" strokeWidth={2} dot={false} name="Wind (MW)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-5" data-testid="it-gas-seasonal">
            <h3 className="text-sm font-semibold text-foreground mb-1">Gas & Renewable Share — Monthly</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Renewable share peaks in summer (solar) — gas fills the residual load year-round
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={monthlyTrend} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 80]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`]} />
                <Line type="monotone" dataKey="gasPct" stroke="#f97316" strokeWidth={2}
                  dot={{ r: 3 }} name="Gas %" />
                <Line type="monotone" dataKey="renewablePct" stroke="#22c55e" strokeWidth={2}
                  dot={{ r: 3 }} name="Renewable %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* DC market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-green-600" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Milan DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~900 MW</p>
          <p className="text-xs text-muted-foreground">
            Milan (MXP) is Southern Europe's largest data-centre market. Equinix MX1–MX11,
            Digital Realty, Aruba, NTT. Connected to DE-CIX Frankfurt + Marseille cable landing stations.
            ~50 MW+ hyperscale campuses in Settala and Roasio.
          </p>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sun className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">PPA Market</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">Active renewable PPA market</p>
          <p className="text-xs text-muted-foreground">
            Italy has Europe's most active solar PPA market. Amazon, Google, Microsoft all signed
            Italian solar/wind PPAs at €40–55/MWh (2023–2024). Puglia and Sardinia have surplus
            renewable capacity enabling green DCs.
            GSE CER (energy communities) framework lowers local renewable procurement costs.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Grid Constraints</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">North–South congestion</p>
          <p className="text-xs text-muted-foreground">
            Italy's North–South 380 kV backbone is chronically congested: southern renewables
            cannot always reach northern load centres. Terna plans €8B grid investment (2024–2033)
            including Tyrrhenian Link (submarine HVDC) connecting Sicily → mainland.
            DC sites in the North (Milan area) benefit from import capacity from Austria/Switzerland.
          </p>
        </div>
      </div>

      {/* Grid note */}
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Grid & permitting:</strong> Terna manages Italy's 380/220 kV transmission network. Data-centre connection applications
          processed under the PNIEC (National Energy and Climate Plan). Italy's <em>Piano di Sviluppo</em> 2024–2033 identifies priority reinforcement zones.
          HV connection timeline: 18–36 months typical; fast-track for industrial customers &gt;10 MW.
          Electricity market: IPEX (Italian Power Exchange, GME). Day-ahead prices historically 10–20% above German baseload due to net import dependency.
          Carbon intensity ~220 gCO₂/kWh (national average); clean-energy PPAs in South Italy can achieve &lt;10 gCO₂/kWh scope 2.
          Source: Terna Dati Statistici 2024 · GSE Rapporto Annuale 2023 · ENTSO-E Transparency Platform (area code IT).
        </p>
      </div>
    </div>
  );
}
