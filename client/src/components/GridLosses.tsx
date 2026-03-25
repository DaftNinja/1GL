import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

interface MonthlyLoss {
  month: string;
  nget: number;
  spt: number;
  shetl: number;
  gbTotal: number;
}

interface TransmissionLossesResult {
  months: MonthlyLoss[];
  fetchedAt: string;
}

export function GridLosses() {
  const { data, isLoading, error } = useQuery<TransmissionLossesResult>({
    queryKey: ["/api/neso/transmission-losses"],
    queryFn: async () => {
      const res = await fetch("/api/neso/transmission-losses", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-grid-losses-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load transmission losses data.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const latest = data?.months[data.months.length - 1];
  const previous = data?.months[data.months.length - 2];
  const trend = latest && previous
    ? ((latest.gbTotal - previous.gbTotal) / previous.gbTotal) * 100
    : null;

  const avgLoss = data
    ? data.months.reduce((s, m) => s + m.gbTotal, 0) / data.months.length
    : 0;

  const maxLoss = data ? Math.max(...data.months.map(m => m.gbTotal)) : 0;

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-grid-losses">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Transmission Losses</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: NESO — Monthly GB Transmission Losses (NGET, SPT, SHETL networks), TWh
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-500 mr-2" />
            <span className="text-sm text-slate-500">Loading transmission losses from NESO...</span>
          </div>
        ) : data && data.months.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-yellow-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Latest Month</p>
                <p className="text-base font-bold text-yellow-700" data-testid="text-latest-loss">
                  {latest?.gbTotal.toFixed(3)} TWh
                </p>
                <p className="text-xs text-slate-400">{latest?.month}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Monthly Trend</p>
                <p className={`text-base font-bold ${trend !== null && trend < 0 ? "text-green-600" : "text-red-600"}`}>
                  {trend !== null ? `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-slate-400">vs prior month</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">24-Month Average</p>
                <p className="text-base font-bold text-blue-600">{avgLoss.toFixed(3)} TWh</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Period Maximum</p>
                <p className="text-base font-bold text-red-600">{maxLoss.toFixed(3)} TWh</p>
              </div>
            </div>

            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months} margin={{ top: 10, right: 20, left: 10, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    stroke="#64748b"
                    fontSize={9}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={1}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v.toFixed(2)}`}
                    label={{ value: "TWh", angle: -90, position: "insideLeft", offset: -5, fontSize: 10, fill: "#64748b" }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 text-sm">
                          <p className="font-semibold text-slate-800 mb-2">{label}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} style={{ color: p.color }}>
                              {p.name}: {Number(p.value).toFixed(3)} TWh
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" height={28} />
                  <Bar dataKey="nget" name="NGET (England & Wales)" stackId="a" fill="#1976D2" fillOpacity={0.85} />
                  <Bar dataKey="spt" name="SPT (Scotland)" stackId="a" fill="#388e3c" fillOpacity={0.85} />
                  <Bar dataKey="shetl" name="SHETL (North Scotland)" stackId="a" fill="#f57c00" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
              <span className="font-semibold">Data Centre Insight:</span> Transmission losses peak in winter due to higher
              currents through the network. Data centres located close to generation sources (e.g. Scotland for wind,
              or near large solar installations) can reduce their effective carbon intensity by minimising losses
              in the supply chain. SHETL (Northern Scotland) losses are relevant for data centres targeting
              low-cost renewable connection points.
            </div>

            {data.fetchedAt && (
              <p className="text-xs text-slate-400 mt-2 text-right">
                Updated: {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">No transmission losses data available.</p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">Supported by National Energy SO Open Data</p>
      </CardContent>
    </Card>
  );
}
