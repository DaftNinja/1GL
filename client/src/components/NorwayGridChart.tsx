import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { Droplets, Wind, Zap, TrendingUp, Activity, MapPin } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Hydro":   "#06b6d4",
  "Wind":    "#3b82f6",
  "Thermal": "#ef4444",
  "Solar":   "#f59e0b",
};

const ZONE_COLOR: Record<string, string> = {
  "High":          "text-emerald-400",
  "Medium":        "text-yellow-400",
  "Low–Medium":    "text-orange-400",
  "Low":           "text-red-400",
};
const ZONE_BG: Record<string, string> = {
  "High":          "bg-emerald-900/30 border-emerald-700/40",
  "Medium":        "bg-yellow-900/30 border-yellow-700/40",
  "Low–Medium":    "bg-orange-900/30 border-orange-700/40",
  "Low":           "bg-slate-800/40 border-slate-700/40",
};

function dcRelevanceKey(val: string): string {
  if (val.startsWith("High")) return "High";
  if (val.startsWith("Medium")) return "Medium";
  if (val.startsWith("Low–Medium")) return "Low–Medium";
  return "Low";
}

const GenTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg max-w-52">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono">{p.value?.toLocaleString()} GWh</span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1 flex justify-between font-bold">
        <span>Total</span>
        <span className="font-mono">{total.toLocaleString()} GWh</span>
      </div>
    </div>
  );
};

const CapTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono">{((p.value ?? 0) / 1000).toFixed(1)} GW</span>
        </div>
      ))}
    </div>
  );
};

export default function NorwayGridChart() {
  const { data: norwayData, isLoading } = useQuery<any>({
    queryKey: ["/api/statnett/no"],
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-5 bg-muted rounded w-72 mb-4" />
        <div className="h-52 bg-muted rounded" />
      </div>
    );
  }

  const annual: any[] = norwayData?.annual ?? [];
  const last24: any[] = norwayData?.last24Months ?? [];
  const capacity: Record<string, number> = norwayData?.capacity ?? {};
  const priceZones: any[] = norwayData?.priceZones ?? [];
  const snap = norwayData?.liveSnapshot ?? null;

  if (annual.length === 0) return null;

  const capData = Object.entries(capacity).map(([fuel, mw]) => ({
    fuel,
    "Capacity (MW)": mw,
    color: FUEL_COLORS[fuel] ?? "#64748b",
  }));

  const latestAnnual = annual[annual.length - 1];
  const totalGWhLatest = latestAnnual?.totalGWh ?? 0;
  const renewablePctLatest = latestAnnual?.renewablePct ?? 0;

  return (
    <div className="mt-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-cyan-500" />
        <div>
          <h3 className="font-semibold text-foreground">Norway Grid Intelligence Dashboard</h3>
          <p className="text-xs text-muted-foreground">
            Live: Statnett driftsdata API · Historical: NVE Electricity Statistics 2024 · Geographic: NoreGeo (IEEE 2026)
          </p>
        </div>
        {snap && (
          <span className="ml-auto text-[10px] text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded px-2 py-0.5">
            LIVE
          </span>
        )}
      </div>

      {/* Live snapshot cards */}
      {snap && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Hydro",       value: snap.hydroMW,      icon: Droplets, color: "text-cyan-400",    unit: "MW" },
            { label: "Wind",        value: snap.windMW,       icon: Wind,     color: "text-blue-400",    unit: "MW" },
            { label: "Thermal",     value: snap.thermalMW,    icon: Zap,      color: "text-red-400",     unit: "MW" },
            { label: "Total Prod",  value: snap.totalProdMW,  icon: Activity, color: "text-emerald-400", unit: "MW" },
          ].map(({ label, value, icon: Icon, color, unit }) => (
            <div key={label} className="rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
              <p className={`text-xl font-bold font-mono ${color}`}>
                {value != null ? value.toLocaleString() : "—"}
                <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Consumption vs Production */}
      {snap && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card/50 p-3">
            <p className="text-[11px] text-muted-foreground mb-1">Consumption (live)</p>
            <p className="text-lg font-bold font-mono text-foreground">
              {snap.consumptionMW != null ? snap.consumptionMW.toLocaleString() : "—"}
              <span className="text-xs font-normal text-muted-foreground ml-1">MW</span>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-3">
            <p className="text-[11px] text-muted-foreground mb-1">
              Net Exchange ({snap.netExchangeMW != null && snap.netExchangeMW > 0 ? "Importing" : "Exporting"})
            </p>
            <p className={`text-lg font-bold font-mono ${snap.netExchangeMW != null && snap.netExchangeMW > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {snap.netExchangeMW != null ? Math.abs(snap.netExchangeMW).toLocaleString() : "—"}
              <span className="text-xs font-normal text-muted-foreground ml-1">MW</span>
            </p>
          </div>
        </div>
      )}

      {/* Annual generation chart */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Annual Generation by Source</p>
            <p className="text-xs text-muted-foreground">GWh/year · NVE Electricity Statistics</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-cyan-400">{(totalGWhLatest / 1000).toFixed(1)} TWh</p>
            <p className="text-[11px] text-muted-foreground">{renewablePctLatest}% renewable</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={annual} barSize={28} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<GenTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {["Hydro", "Wind", "Thermal", "Solar"].map((fuel) => (
              <Bar key={fuel} dataKey={fuel} stackId="a" fill={FUEL_COLORS[fuel]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly generation (last 24 months) */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground">Monthly Generation Trend</p>
          <p className="text-xs text-muted-foreground">Last 24 months · Seasonal hydro and wind pattern (NVE estimated)</p>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={last24} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <defs>
              {Object.entries(FUEL_COLORS).map(([fuel, color]) => (
                <linearGradient key={fuel} id={`grad-no-${fuel}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={5} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<GenTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {["Hydro", "Wind", "Thermal", "Solar"].map((fuel) => (
              <Area
                key={fuel}
                type="monotone"
                dataKey={fuel}
                stackId="1"
                stroke={FUEL_COLORS[fuel]}
                fill={`url(#grad-no-${fuel})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Installed capacity */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground">Installed Generation Capacity</p>
          <p className="text-xs text-muted-foreground">NVE Annual Report 2024 · Total ~{(Object.values(capacity).reduce((s, v) => s + v, 0) / 1000).toFixed(1)} GW</p>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={capData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)} GW`} />
            <YAxis type="category" dataKey="fuel" tick={{ fontSize: 11, fill: "#94a3b8" }} width={56} />
            <Tooltip content={<CapTooltip />} />
            <Bar dataKey="Capacity (MW)" radius={[0, 4, 4, 0]}>
              {capData.map((entry) => (
                <rect key={entry.fuel} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {capData.map(({ fuel, color }) => {
            const mw = capacity[fuel] ?? 0;
            return (
              <div key={fuel} className="text-center">
                <p className="text-xs text-muted-foreground">{fuel}</p>
                <p className="text-sm font-bold font-mono" style={{ color }}>
                  {(mw / 1000).toFixed(1)} GW
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price bidding zones */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">Norway Electricity Price Zones (NO1–NO5)</p>
            <p className="text-xs text-muted-foreground">Critical for DC site selection · 2024 indicative spot prices via Nord Pool</p>
          </div>
        </div>
        <div className="space-y-3">
          {priceZones.map((zone) => {
            const key = dcRelevanceKey(zone.dcRelevance);
            return (
              <div
                key={zone.zone}
                className={`rounded-xl border p-3 ${ZONE_BG[key] ?? "bg-card/40 border-border"}`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-foreground bg-slate-700 px-1.5 py-0.5 rounded">
                      {zone.zone}
                    </span>
                    <span className="text-xs font-semibold text-foreground">{zone.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-bold text-foreground">~€{zone.avgPrice2024EUR}/MWh</p>
                    <p className={`text-[10px] font-semibold ${ZONE_COLOR[key] ?? "text-muted-foreground"}`}>
                      DC: {zone.dcRelevance}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{zone.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* DC market insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: TrendingUp,
            color: "text-emerald-400",
            title: "Hydro Dominance",
            body: "~88% of electricity generated from hydro in 2024. Among Europe's cleanest grids. Critical: production varies ±15% year-on-year with precipitation. 2023 drought reduced output to 128.7 TWh from 2021 peak of 156.2 TWh.",
          },
          {
            icon: Wind,
            color: "text-blue-400",
            title: "Wind Expansion",
            body: "Onshore wind grew from 5.5 TWh (2019) to 20.5 TWh (2024) — nearly 4× in 5 years. Total 6.2 GW installed. Wind is increasingly complementing hydro in price zone balancing, improving PPA stability for DC operators.",
          },
          {
            icon: Zap,
            color: "text-cyan-400",
            title: "Interconnectors",
            body: "NordLink to Germany (1.4 GW) and NSL to UK (1.4 GW) both operational. Moyle cable to NI (500 MW). These create price linkage between Norway's cheap hydro and European market prices — raising NO1/NO2 prices in tight European market conditions.",
          },
        ].map(({ icon: Icon, color, title, body }) => (
          <div key={title} className="rounded-xl border border-border bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <p className="text-xs font-semibold text-foreground">{title}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        Live data: Statnett driftsdata API · History: NVE 2024 · Geography: NoreGeo (IEEE Data Descriptions 2026, doi:10.1109/IEEEDATA.2026.3658039) · Zones: Nord Pool
      </p>
    </div>
  );
}
