import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Sun, Wind, Zap, Database, Radio, TrendingUp, ArrowUpDown } from "lucide-react";

const FLOW_COLORS: Record<string, string> = {
  albania: "#f59e0b",
  fyrom:   "#8b5cf6",
  bulgaria: "#3b82f6",
  turkey:  "#ef4444",
  italy:   "#10b981",
};

const FLOW_LABELS: Record<string, string> = {
  albania:  "Albania",
  fyrom:    "N.Macedonia",
  bulgaria: "Bulgaria",
  turkey:   "Turkey",
  italy:    "Italy",
};

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-xl border ${color} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const HourTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-bold text-foreground mb-1">Hour {label}:00</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color || p.fill }}>{p.name}</span>
          <span className="font-medium">{Math.round(p.value).toLocaleString()} MWh</span>
        </div>
      ))}
    </div>
  );
};

const FlowTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-bold text-foreground mb-1">Hour {label}:00</p>
      {payload.filter((p: any) => p.value !== 0).map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.fill }}>{FLOW_LABELS[p.dataKey] ?? p.dataKey}</span>
          <span className={`font-medium ${p.value > 0 ? "text-green-500" : "text-red-500"}`}>
            {p.value > 0 ? "+" : ""}{Math.round(p.value).toLocaleString()} MWh
          </span>
        </div>
      ))}
      <p className="text-muted-foreground mt-1 pt-1 border-t border-border text-[10px]">
        + = import to GR · – = export from GR
      </p>
    </div>
  );
};

export default function GreeceGridChart() {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/admie/grid"],
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-pulse" data-testid="greece-grid-loading">
        <div className="h-5 bg-muted rounded w-72 mb-4" />
        <div className="h-52 bg-muted rounded" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3" data-testid="greece-grid-error">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">ADMIE data unavailable</strong> — Greek grid data could not be loaded at this time.
        </p>
      </div>
    );
  }

  const { date, systemLoad = [], res = [], flows = [], summary } = data;
  const displayDate = date
    ? new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  // Combine load + RES into a single series for the area chart
  const loadResData = systemLoad.map((h: any, i: number) => ({
    hour: h.hour,
    "System Load": h.mwh,
    "RES":         res[i]?.mwh ?? 0,
    "Conventional": Math.max(0, h.mwh - (res[i]?.mwh ?? 0)),
  }));

  // Available flow countries
  const flowCountries = Object.keys(FLOW_LABELS).filter(k =>
    flows.some((h: any) => h[k] && h[k] !== 0)
  );

  // Net balance per country for the summary bar chart
  const netData = Object.entries(summary?.netByCountry ?? {})
    .map(([k, v]) => ({ country: FLOW_LABELS[k.toLowerCase()] ?? k, net: v as number, key: k.toLowerCase() }))
    .sort((a, b) => (b.net as number) - (a.net as number));

  const resShare = summary?.resSharePct ?? 0;

  return (
    <div className="mt-8 space-y-6" data-testid="greece-grid-section">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Greece Grid Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              ADMIE / IPTO — Independent Power Transmission Operator · SCADA data {displayDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
          <Radio className="w-3 h-3" /> Daily SCADA
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={<Zap className="w-4 h-4 text-blue-500" />}
          label="Peak Load"
          value={`${(summary?.peakLoad ?? 0).toLocaleString()} MWh`}
          sub="Highest single-hour system load"
          color="border-border bg-card"
        />
        <StatCard
          icon={<Sun className="w-4 h-4 text-emerald-500" />}
          label="RES Share"
          value={`${resShare}%`}
          sub={`Avg ${(summary?.avgRes ?? 0).toLocaleString()} MWh/h from renewables`}
          color={resShare >= 60 ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card"}
        />
        <StatCard
          icon={<Wind className="w-4 h-4 text-sky-500" />}
          label="Avg System Load"
          value={`${(summary?.avgLoad ?? 0).toLocaleString()} MWh`}
          sub="Hourly average across the day"
          color="border-border bg-card"
        />
        <StatCard
          icon={<ArrowUpDown className="w-4 h-4 text-violet-500" />}
          label="Net Interconnection"
          value={`${(summary?.totalNetImportMwh ?? 0) > 0 ? "+" : ""}${(summary?.totalNetImportMwh ?? 0).toLocaleString()} MWh`}
          sub={(summary?.totalNetImportMwh ?? 0) >= 0 ? "Net importer on this day" : "Net exporter on this day"}
          color={(summary?.totalNetImportMwh ?? 0) >= 0
            ? "border-violet-500/20 bg-violet-500/5"
            : "border-amber-500/20 bg-amber-500/5"}
        />
      </div>

      {/* System Load vs RES area chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">
          Hourly System Load vs RES Injections (MWh)
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={loadResData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grLoadGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="grResGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}h`}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
              width={40}
            />
            <Tooltip content={<HourTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="System Load"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#grLoadGrad)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="RES"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#grResGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Cross-border flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Hourly flows by country */}
        {flowCountries.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground mb-4">
              Hourly Cross-Border Flows (MWh) <span className="font-normal text-muted-foreground">+ = import · – = export</span>
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={flows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 9, fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}h`}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v > 0 ? "+" : ""}${Math.round(v / 100) / 10}k`}
                  width={36}
                />
                <Tooltip content={<FlowTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
                {flowCountries.map(k => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={FLOW_LABELS[k]}
                    stackId="flows"
                    fill={FLOW_COLORS[k] ?? "#94a3b8"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Net daily balance by neighbour */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">
            Daily Net Balance by Neighbour (MWh)
          </p>
          <div className="space-y-3">
            {netData.map(({ country, net, key }) => {
              const abs = Math.abs(net);
              const maxAbs = Math.max(...netData.map(d => Math.abs(d.net as number)), 1);
              const pct = (abs / maxAbs) * 100;
              const isImport = net >= 0;
              const color = FLOW_COLORS[key] ?? "#94a3b8";
              return (
                <div key={country} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{country}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <span
                      className="text-xs font-semibold w-20 text-right"
                      style={{ color: isImport ? "#10b981" : "#f43f5e" }}
                    >
                      {isImport ? "+" : ""}{net.toLocaleString()} MWh
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-4">
            Green = net import to Greece · Red = net export from Greece
          </p>
        </div>
      </div>

      {/* DC Market Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Athens DC Hub</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-1">~80 MW</p>
          <p className="text-xs text-muted-foreground">
            Greece's data centre market is nascent but growing. Key operators include Lamda Hellix (Athens), Digital Realty and Equinix studying entry. Strong submarine cable connectivity (SEA-ME-WE, OTEGLOBE) positions Athens as a Southern European hub candidate.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sun className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Solar Advantage</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">80%+ renewable target 2030</p>
          <p className="text-xs text-muted-foreground">
            Greece achieved 50%+ renewable generation in 2023. Abundant solar (~2,700 sun-hours/year), growing wind (3+ GW offshore pipeline). Government targets 80% RES by 2030 and net-zero by 2050. RES PPAS increasingly available at €55–80/MWh.
          </p>
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Interconnections</p>
          </div>
          <p className="text-sm font-bold text-foreground mb-1">EU–Balkans energy bridge</p>
          <p className="text-xs text-muted-foreground">
            Greece interconnects with Albania, N.Macedonia, Bulgaria, Turkey and Italy. The planned Great Sea Interconnector (Greece–Cyprus–Israel, 2,000 MW HVDC) will expand import/export capacity significantly. ADMIE investing €5B in grid upgrades 2024–2030.
          </p>
        </div>
      </div>

      {/* Attribution */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Grid connection & permitting:</strong> ADMIE (IPTO) operates Greece's 400/150 kV transmission network.
          Large consumers (&gt;1 MW) connect via ADMIE grid access study. Athens region grid capacity is moderate — up to 50 MW connections feasible within 18–24 months.
          Electricity price for large industrial consumers: ~€80–130/MWh (volatile due to gas dependency residual).
          Corporate PPAs available in the 50–80 €/MWh range for multi-year solar agreements.
          Source: ADMIE / IPTO · admie.gr · Open Data
        </p>
      </div>
    </div>
  );
}
