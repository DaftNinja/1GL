import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CalendarDays, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

interface DayForecast {
  date: string;
  peakMW: number;
  minMW: number;
  avgMW: number;
}

interface Forecast14DayResult {
  days: DayForecast[];
  fetchedAt: string;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatGW(mw: number): string {
  return `${(mw / 1000).toFixed(1)} GW`;
}

export function Forecast14Day() {
  const { data, isLoading, error } = useQuery<Forecast14DayResult>({
    queryKey: ["/api/neso/forecast-14day"],
    queryFn: async () => {
      const res = await fetch("/api/neso/forecast-14day", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 4 * 60 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-forecast14day-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load 14-day demand forecast.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data?.days.map(d => ({
    date: formatDateShort(d.date),
    peak: Math.round(d.peakMW / 100) / 10,
    min: Math.round(d.minMW / 100) / 10,
    avg: Math.round(d.avgMW / 100) / 10,
  })) ?? [];

  const highestPeakDay = data?.days.reduce((max, d) => d.peakMW > max.peakMW ? d : max, data.days[0]);
  const lowestMinDay = data?.days.reduce((min, d) => d.minMW < min.minMW ? d : min, data.days[0]);
  const avgPeak = data ? Math.round(data.days.reduce((s, d) => s + d.peakMW, 0) / data.days.length) : 0;

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-forecast-14day">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-lg">14-Day National Demand Forecast</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: NESO — 2–14 Days Ahead Half-Hourly Forecast, updated twice daily
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-slate-500">Loading 14-day forecast from NESO...</span>
          </div>
        ) : data && chartData.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Highest Peak Day</p>
                <p className="text-base font-bold text-red-600" data-testid="text-14day-peak">
                  {formatGW(highestPeakDay?.peakMW ?? 0)}
                </p>
                <p className="text-xs text-slate-400">{highestPeakDay ? formatDateShort(highestPeakDay.date) : ""}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Lowest Overnight Min</p>
                <p className="text-base font-bold text-green-600" data-testid="text-14day-min">
                  {formatGW(lowestMinDay?.minMW ?? 0)}
                </p>
                <p className="text-xs text-slate-400">{lowestMinDay ? formatDateShort(lowestMinDay.date) : ""}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Average Daily Peak</p>
                <p className="text-base font-bold text-blue-600">{formatGW(avgPeak)}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Forecast Days</p>
                <p className="text-base font-bold text-purple-600">{data.days.length}</p>
              </div>
            </div>

            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={10}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                    interval={0}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v} GW`}
                    domain={["dataMin - 2", "dataMax + 2"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 text-sm">
                          <p className="font-semibold text-slate-800 mb-2">{label}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} style={{ color: p.color }}>
                              {p.name}: {p.value} GW
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" height={30} />
                  <Bar dataKey="peak" name="Daily Peak" fill="#ef4444" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="min" name="Overnight Min" fill="#22c55e" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    name="Daily Average"
                    stroke="#1976D2"
                    strokeWidth={2}
                    dot={{ fill: "#1976D2", r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">Data Centre Insight:</span> Days with a wide gap between peak and overnight min
                  present the best opportunity for demand-side flexibility and off-peak pricing. Grid operators use this
                  forecast to schedule balancing actions — data centres with flexible loads can participate in these markets.
                </p>
              </div>
            </div>

            {data.fetchedAt && (
              <p className="text-xs text-slate-400 mt-2 text-right">
                Updated: {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">No 14-day forecast data available.</p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">Supported by National Energy SO Open Data</p>
      </CardContent>
    </Card>
  );
}
