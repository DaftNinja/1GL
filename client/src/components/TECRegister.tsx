import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface TECSummary {
  technology: string;
  totalMW: number;
  count: number;
}

interface TECStatusSummary {
  status: string;
  totalMW: number;
  count: number;
}

interface TECHostSummary {
  host: string;
  totalMW: number;
  count: number;
}

interface TECProject {
  name: string;
  customer: string;
  site: string;
  mw: number;
  status: string;
  technology: string;
  host: string;
  effectiveFrom: string | null;
}

interface TECResult {
  totalProjects: number;
  totalPipelineMW: number;
  builtMW: number;
  inProgressMW: number;
  byTechnology: TECSummary[];
  byStatus: TECStatusSummary[];
  byHost: TECHostSummary[];
  topProjects: TECProject[];
  fetchedAt: string;
}

const TECH_COLOURS: Record<string, string> = {
  "BESS":           "#1565C0",
  "Offshore Wind":  "#1976D2",
  "Onshore Wind":   "#2196F3",
  "Gas (CCGT)":     "#F97316",
  "Nuclear":        "#8B5CF6",
  "Pumped Hydro":   "#06B6D4",
  "Solar PV":       "#F59E0B",
  "Hydro":          "#10B981",
  "Demand":         "#64748B",
  "Reactive Comp.": "#94A3B8",
  "Other":          "#CBD5E1",
};

const STATUS_COLOURS: Record<string, string> = {
  "Built":                          "#10B981",
  "Under Construction/Commissioning": "#1976D2",
  "Consents Approved":              "#42A5F5",
  "Awaiting Consents":              "#F59E0B",
  "Scoping":                        "#CBD5E1",
};

const HOST_COLOURS: Record<string, string> = {
  "NGET":  "#1565C0",
  "SPT":   "#2196F3",
  "SHET":  "#42A5F5",
  "OFTO":  "#90CAF9",
};

function formatMW(mw: number): string {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${mw.toLocaleString()} MW`;
}

export function TECRegister() {
  const { data, isLoading, error } = useQuery<TECResult>({
    queryKey: ["/api/neso/tec-register"],
    queryFn: async () => {
      const res = await fetch("/api/neso/tec-register", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-tec-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load TEC Register data.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-tec-register">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Transmission Entry Capacity (TEC) Register</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: NESO — GB grid connection pipeline, updated twice weekly
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-slate-500">Loading TEC Register from NESO...</span>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Total Pipeline</p>
                <p className="text-sm font-bold text-blue-700" data-testid="text-tec-pipeline">
                  {formatMW(data.totalPipelineMW)}
                </p>
                <p className="text-xs text-blue-500 mt-0.5">{data.totalProjects.toLocaleString()} projects</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Built / Connected</p>
                <p className="text-sm font-bold text-green-700" data-testid="text-tec-built">
                  {formatMW(data.builtMW)}
                </p>
                <p className="text-xs text-green-500 mt-0.5">
                  {data.byStatus.find(s => s.status === "Built")?.count ?? 0} projects
                </p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">In Construction / Consents</p>
                <p className="text-sm font-bold text-indigo-700" data-testid="text-tec-inprogress">
                  {formatMW(data.inProgressMW)}
                </p>
                <p className="text-xs text-indigo-500 mt-0.5">
                  {((data.byStatus.find(s => s.status === "Under Construction/Commissioning")?.count ?? 0) +
                    (data.byStatus.find(s => s.status === "Consents Approved")?.count ?? 0)).toLocaleString()} projects
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">In Scoping</p>
                <p className="text-sm font-bold text-slate-700" data-testid="text-tec-scoping">
                  {formatMW(data.byStatus.find(s => s.status === "Scoping")?.totalMW ?? 0)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {data.byStatus.find(s => s.status === "Scoping")?.count ?? 0} projects
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Pipeline MW by Technology</p>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.byTechnology.slice(0, 9)}
                      layout="vertical"
                      margin={{ top: 0, right: 70, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        fontSize={10}
                        stroke="#64748b"
                        tickFormatter={(v) => formatMW(v)}
                      />
                      <YAxis
                        type="category"
                        dataKey="technology"
                        fontSize={10}
                        stroke="#64748b"
                        width={100}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as TECSummary;
                          return (
                            <div className="bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-sm">
                              <p className="font-semibold text-slate-800">{d.technology}</p>
                              <p className="text-blue-600 font-bold">{formatMW(d.totalMW)}</p>
                              <p className="text-slate-500 text-xs">{d.count} projects</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="totalMW" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 9, formatter: (v: number) => formatMW(v) }}>
                        {data.byTechnology.slice(0, 9).map((entry) => (
                          <Cell key={entry.technology} fill={TECH_COLOURS[entry.technology] ?? "#90CAF9"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Pipeline MW by Project Status</p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.byStatus}
                      layout="vertical"
                      margin={{ top: 0, right: 70, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        fontSize={10}
                        stroke="#64748b"
                        tickFormatter={(v) => formatMW(v)}
                      />
                      <YAxis
                        type="category"
                        dataKey="status"
                        fontSize={9}
                        stroke="#64748b"
                        width={150}
                        tickFormatter={(v: string) =>
                          v === "Under Construction/Commissioning" ? "Under Construction" : v
                        }
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as TECStatusSummary;
                          return (
                            <div className="bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-sm">
                              <p className="font-semibold text-slate-800">{d.status}</p>
                              <p className="text-blue-600 font-bold">{formatMW(d.totalMW)}</p>
                              <p className="text-slate-500 text-xs">{d.count} projects</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="totalMW" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 9, formatter: (v: number) => formatMW(v) }}>
                        {data.byStatus.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLOURS[entry.status] ?? "#CBD5E1"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-sm font-semibold text-slate-700 mb-3 mt-4">MW by Transmission Operator</p>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.byHost.filter(h => h.host !== "Unknown")}
                      layout="vertical"
                      margin={{ top: 0, right: 70, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        fontSize={10}
                        stroke="#64748b"
                        tickFormatter={(v) => formatMW(v)}
                      />
                      <YAxis type="category" dataKey="host" fontSize={10} stroke="#64748b" width={40} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as TECHostSummary;
                          return (
                            <div className="bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-sm">
                              <p className="font-semibold text-slate-800">{d.host}</p>
                              <p className="text-blue-600 font-bold">{formatMW(d.totalMW)}</p>
                              <p className="text-slate-500 text-xs">{d.count} projects</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="totalMW" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 9, formatter: (v: number) => formatMW(v) }}>
                        {data.byHost.filter(h => h.host !== "Unknown").map((entry) => (
                          <Cell key={entry.host} fill={HOST_COLOURS[entry.host] ?? "#90CAF9"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Top 25 Projects by Capacity</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px] text-slate-600">
                {[
                  { label: "Built",                        desc: "Operational",                      color: "#10B981" },
                  { label: "Under Construction",           desc: "Being built / commissioning",      color: "#1976D2" },
                  { label: "Consents Approved",            desc: "Planning approved, not yet built", color: "#42A5F5" },
                  { label: "Awaiting Consents",            desc: "Planning application in progress", color: "#F59E0B" },
                  { label: "Scoping",                      desc: "Early-stage feasibility",          color: "#CBD5E1" },
                ].map(({ label, desc, color }) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span><span className="font-medium">{label}</span> — {desc}</span>
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-tec-top-projects">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-3 font-semibold text-slate-600">Project</th>
                      <th className="text-left py-2 pr-3 font-semibold text-slate-600">Site</th>
                      <th className="text-left py-2 pr-3 font-semibold text-slate-600">Technology</th>
                      <th className="text-right py-2 pr-3 font-semibold text-slate-600">Capacity</th>
                      <th className="text-left py-2 pr-3 font-semibold text-slate-600">Status</th>
                      <th className="text-left py-2 font-semibold text-slate-600">Host</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProjects.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 pr-3 text-slate-800 max-w-[180px] truncate" title={p.name}>{p.name}</td>
                        <td className="py-1.5 pr-3 text-slate-600 max-w-[140px] truncate" title={p.site}>{p.site}</td>
                        <td className="py-1.5 pr-3">
                          <span
                            className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                            style={{ backgroundColor: TECH_COLOURS[p.technology] ?? "#90CAF9" }}
                          >
                            {p.technology}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-bold text-blue-700">{formatMW(p.mw)}</td>
                        <td className="py-1.5 pr-3 text-slate-600">{p.status === "Under Construction/Commissioning" ? "Under Construction" : p.status}</td>
                        <td className="py-1.5 text-slate-600">{p.host}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
              <span className="font-semibold">Data Centre Insight:</span> The TEC pipeline shows
              the scale of new generation connecting to the GB transmission network. BESS dominates
              the queue, reflecting grid flexibility needs as renewables grow. Offshore wind projects
              often offer co-location opportunities near coastal substations. NGET hosts the majority
              of the pipeline (England &amp; Wales), while SHET and SPT cover Scotland — where
              available grid capacity and renewable-rich sites make attractive data centre locations.
            </div>

            {data.fetchedAt && (
              <p className="text-xs text-slate-400 mt-2 text-right">
                Updated: {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">No TEC Register data available.</p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">Supported by National Energy SO Open Data</p>
      </CardContent>
    </Card>
  );
}
