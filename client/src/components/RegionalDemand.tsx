import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface RegionDemand {
  region: string;
  totalGWh: number;
  year: number;
}

interface TRESPRegionsResult {
  regions: RegionDemand[];
  pathway: string;
  year: number;
  fetchedAt: string;
}

const REGION_COLOURS = [
  "#1565C0", "#1976D2", "#1E88E5", "#2196F3",
  "#42A5F5", "#64B5F6", "#90CAF9", "#BBDEFB",
  "#E3F2FD", "#F3F8FF", "#FAFCFF", "#FFFFFF",
];

function formatGWh(gwh: number): string {
  if (gwh >= 1000) return `${(gwh / 1000).toFixed(1)} TWh`;
  return `${gwh.toLocaleString()} GWh`;
}

function formatRegionLabel(region: string): string {
  if (region.length > 20) {
    return region.replace("North East and Yorkshire", "NE & Yorkshire")
      .replace("Greater London", "London");
  }
  return region;
}

export function RegionalDemand() {
  const { data, isLoading, error } = useQuery<TRESPRegionsResult>({
    queryKey: ["/api/neso/tresp-regions"],
    queryFn: async () => {
      const res = await fetch("/api/neso/tresp-regions", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-regional-demand-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load regional demand data.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data?.regions.map((r, i) => ({
    region: formatRegionLabel(r.region),
    fullRegion: r.region,
    gwh: r.totalGWh,
    colorIdx: i,
  })) ?? [];

  const total = data?.regions.reduce((s, r) => s + r.totalGWh, 0) ?? 0;
  const topRegion = data?.regions[0];
  const bottomRegion = data?.regions[data.regions.length - 1];

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-regional-demand">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <MapPin className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Regional Energy Demand by RESP Area</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: NESO — tRESP Demand Pathways by RESP Nation and Region ({data?.year ?? "—"}){data?.pathway ? ` · ${data.pathway}` : ""}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mr-2" />
            <span className="text-sm text-slate-500">Loading regional demand from NESO...</span>
          </div>
        ) : data && chartData.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Highest Demand Region</p>
                <p className="text-sm font-bold text-blue-700 leading-tight" data-testid="text-top-region">
                  {topRegion?.region}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">{topRegion ? formatGWh(topRegion.totalGWh) : ""}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Lowest Demand Region</p>
                <p className="text-sm font-bold text-green-700 leading-tight">
                  {bottomRegion?.region}
                </p>
                <p className="text-xs text-green-600 mt-0.5">{bottomRegion ? formatGWh(bottomRegion.totalGWh) : ""}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">GB Total ({data.year})</p>
                <p className="text-sm font-bold text-slate-700">{formatGWh(total)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{data.regions.length} regions</p>
              </div>
            </div>

            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={10}
                    tickFormatter={(v) => formatGWh(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="region"
                    stroke="#64748b"
                    fontSize={10}
                    width={130}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      const pct = total > 0 ? ((d.gwh / total) * 100).toFixed(1) : "0";
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 text-sm">
                          <p className="font-semibold text-slate-800 mb-1">{d.fullRegion}</p>
                          <p className="text-blue-600 font-bold">{formatGWh(d.gwh)}</p>
                          <p className="text-slate-500 text-xs">{pct}% of GB total</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="gwh" name="Annual Demand" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={REGION_COLOURS[Math.min(index, REGION_COLOURS.length - 1)]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
              <span className="font-semibold">Data Centre Insight:</span> High-demand regions (Greater London,
              North West, North East and Yorkshire) have well-developed grid infrastructure but face
              increasing constraint costs. Lower-demand regions (Wales, North Scotland) often have
              available grid headroom and proximity to renewable generation — key factors for
              greenfield data centre site selection and securing affordable grid connections.
            </div>

            {data.fetchedAt && (
              <p className="text-xs text-slate-400 mt-2 text-right">
                Updated: {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">No regional demand data available.</p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">Supported by National Energy SO Open Data</p>
      </CardContent>
    </Card>
  );
}
