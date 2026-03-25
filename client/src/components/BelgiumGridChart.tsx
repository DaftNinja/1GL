import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { Zap, Wind, Sun, Activity, TrendingUp, Atom } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  "Nuclear":        "#f59e0b",
  "Natural Gas":    "#6b7280",
  "Wind Offshore":  "#1d4ed8",
  "Wind Onshore":   "#3b82f6",
  "Solar":          "#fbbf24",
  "Biofuels":       "#22c55e",
  "Hydro":          "#06b6d4",
  "Storage":        "#a855f7",
  "Other":          "#94a3b8",
  "Other Fossil":   "#ef4444",
};

const FUEL_ORDER = [
  "Nuclear", "Natural Gas", "Wind Offshore", "Wind Onshore",
  "Solar", "Biofuels", "Hydro", "Storage", "Other", "Other Fossil",
];

const GenTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg max-w-56">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        p.value > 0 && (
          <div key={p.dataKey} className="flex justify-between gap-3">
            <span style={{ color: p.color }}>{p.dataKey}</span>
            <span className="font-mono">{Math.round(p.value).toLocaleString()} MW</span>
          </div>
        )
      ))}
      <div className="border-t border-border mt-1 pt-1 flex justify-between font-bold">
        <span>Total avg</span>
        <span className="font-mono">{Math.round(total).toLocaleString()} MW</span>
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

export default function BelgiumGridChart() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/elia/be"],
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-5 bg-muted rounded w-80 mb-4" />
        <div className="h-52 bg-muted rounded" />
      </div>
    );
  }

  const snap = data?.liveSnapshot ?? null;
  const monthly: any[] = data?.monthly ?? [];
  const capacity: Record<string, number> = data?.installedCapacity ?? {};
  const isLive = data?.live === true;

  if (monthly.length === 0 && !snap) return null;

  // Capacity bar data
  const capData = Object.entries(capacity).map(([fuel, mw]) => ({
    fuel,
    "Installed (MW)": mw,
  }));

  // Summary stats from most recent monthly entry
  const latestMonth = monthly[monthly.length - 1];
  const renewablePct = latestMonth?.renewableSharePct ?? snap?.renewableSharePct;
  const lowCarbonPct = latestMonth?.lowCarbonSharePct ?? snap?.lowCarbonSharePct;

  // Which fuels appear in monthly history
  const activeFuels = FUEL_ORDER.filter(fuel =>
    monthly.some(m => (m[fuel] ?? 0) > 0)
  );

  return (
    <div className="mt-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-amber-500" />
        <div>
          <h3 className="font-semibold text-foreground">Belgium Grid Intelligence Dashboard</h3>
          <p className="text-xs text-muted-foreground">
            Elia opendata.elia.be · 104 public datasets · 15-min resolution · 2019–present
          </p>
        </div>
        {isLive && (
          <span className="ml-auto text-[10px] text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded px-2 py-0.5">
            LIVE
          </span>
        )}
      </div>

      {/* Live snapshot cards */}
      {snap && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Nuclear",        value: snap.byFuel?.["Nuclear"],       icon: Atom,      color: "text-amber-400"   },
            { label: "Wind Offshore",  value: snap.byFuel?.["Wind Offshore"], icon: Wind,      color: "text-blue-500"    },
            { label: "Wind Onshore",   value: snap.byFuel?.["Wind Onshore"],  icon: Wind,      color: "text-blue-400"    },
            { label: "Solar",          value: snap.byFuel?.["Solar"],         icon: Sun,       color: "text-yellow-400"  },
            { label: "Natural Gas",    value: snap.byFuel?.["Natural Gas"],   icon: Zap,       color: "text-gray-400"    },
            { label: "Grid Load",      value: snap.gridLoad,                  icon: Activity,  color: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-[10px] text-muted-foreground truncate">{label}</span>
              </div>
              <p className={`text-lg font-bold font-mono ${color}`}>
                {value != null ? Math.round(value).toLocaleString() : "—"}
                <span className="text-[10px] font-normal text-muted-foreground ml-0.5">MW</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Low-carbon & renewable share */}
      {(renewablePct != null || lowCarbonPct != null) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <p className="text-xs text-muted-foreground">Low-carbon share</p>
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-400">{lowCarbonPct}%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Nuclear + renewables of total generation</p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="h-4 w-4 text-yellow-400" />
              <p className="text-xs text-muted-foreground">Renewable share</p>
            </div>
            <p className="text-2xl font-bold font-mono text-yellow-400">{renewablePct}%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Wind + solar + hydro + biofuels</p>
          </div>
        </div>
      )}

      {/* Monthly generation stacked bar chart */}
      {monthly.length > 0 && activeFuels.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs font-medium text-foreground mb-3">
            Monthly Average Generation by Fuel (MW avg · last 12 months)
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                tickFormatter={(v: string) => {
                  const [y, m] = v.split("-");
                  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
                }}
              />
              <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
              <Tooltip content={<GenTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                formatter={(v) => <span style={{ color: FUEL_COLORS[v] ?? "#94a3b8" }}>{v}</span>}
              />
              {activeFuels.map(fuel => (
                <Bar key={fuel} dataKey={fuel} stackId="gen"
                  fill={FUEL_COLORS[fuel] ?? "#94a3b8"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Installed capacity */}
      {capData.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs font-medium text-foreground mb-3">
            Installed Capacity by Technology (MW · Elia Annual Report 2024)
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={capData} margin={{ top: 0, right: 8, bottom: 30, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="fuel"
                tick={{ fontSize: 8, fill: "#94a3b8" }}
                angle={-35}
                textAnchor="end"
              />
              <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
              <Tooltip content={<CapTooltip />} />
              <Bar dataKey="Installed (MW)" radius={[3, 3, 0, 0]} isAnimationActive>
                {capData.map((entry) => (
                  <Cell key={entry.fuel} fill={FUEL_COLORS[entry.fuel] ?? "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Belgium DC intelligence callouts */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="text-xs font-semibold text-foreground mb-3">Belgium DC Market Intelligence</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          {[
            "Nuclear baseload: Doel 4 + Tihange 3 life-extended to 2055 — 3.9 GW stable low-carbon generation providing DC operators predictable baseload power",
            "Google case study: entered Belgium in 2010, now powers >60% of Belgian total IT capacity — illustrating how a single hyperscale operator can transform a mid-size market",
            "Wind offshore expansion: Belgian North Sea zone (Prinses Elisabethzone) adding 3.5 GW by 2030, tripling offshore capacity from current 2.3 GW — PPA opportunity for DC operators",
            "N-S internal congestion: generation surplus in Flanders (offshore wind, solar) vs. industrial/nuclear loads in Wallonia creates grid pricing differentials — site selection matters",
            "Elia grid: 12,500 km HV network; interconnectors to FR, NL, LU, GB (Nemo Link 1 GW); critical for Belgian DC operators seeking cross-border backup capacity",
            "Solar density: Belgium has world's highest solar penetration per km² — 8.2 GW installed in a 30,500 km² country; midday solar curtailment risk without storage",
          ].map((item, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-amber-500 mt-0.5 shrink-0">▸</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Sources: Elia opendata.elia.be (datasets ods177, ods003, ods086, ods087) · Elia Annual Report 2024 · CREG ·
        15-min resolution data from 2019–present · Fetched {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : "—"}
      </p>
    </div>
  );
}
