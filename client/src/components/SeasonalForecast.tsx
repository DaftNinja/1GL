import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart2, AlertTriangle } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

interface WeekForecast {
  weekNum: number;
  dateOfPeak: string;
  peakMW: number;
  minMW: number;
}

interface Forecast52WeekResult {
  weeks: WeekForecast[];
  fetchedAt: string;
}

function formatWeekDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatGW(mw: number): string {
  return `${(mw / 1000).toFixed(1)} GW`;
}

const SEASON_COLOURS: Record<string, string> = {
  Winter: "#1976D2",
  Spring: "#4caf50",
  Summer: "#ff9800",
  Autumn: "#795548",
};

function getSeason(dateStr: string): string {
  const month = new Date(dateStr).getMonth();
  if (month >= 2 && month <= 4) return "Spring";
  if (month >= 5 && month <= 7) return "Summer";
  if (month >= 8 && month <= 10) return "Autumn";
  return "Winter";
}

export function SeasonalForecast() {
  const { data, isLoading, error } = useQuery<Forecast52WeekResult>({
    queryKey: ["/api/neso/forecast-52week"],
    queryFn: async () => {
      const res = await fetch("/api/neso/forecast-52week", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-seasonal-forecast-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load seasonal demand outlook.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data?.weeks.map(w => ({
    date: formatWeekDate(w.dateOfPeak),
    peak: Math.round(w.peakMW / 100) / 10,
    min: Math.round(w.minMW / 100) / 10,
    season: getSeason(w.dateOfPeak),
    fullDate: w.dateOfPeak,
  })) ?? [];

  const maxWeek = data?.weeks.reduce((m, w) => w.peakMW > m.peakMW ? w : m, data.weeks[0]);
  const minWeek = data?.weeks.reduce((m, w) => w.peakMW < m.peakMW ? w : m, data.weeks[0]);
  const avgPeak = data ? Math.round(data.weeks.reduce((s, w) => s + w.peakMW, 0) / data.weeks.length) : 0;

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-seasonal-forecast">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Seasonal Demand Outlook (52 Weeks)</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: NESO — Long-Term 2–52 Weeks Ahead National Demand Forecast
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500 mr-2" />
            <span className="text-sm text-slate-500">Loading seasonal forecast from NESO...</span>
          </div>
        ) : data && chartData.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Peak Demand Week</p>
                <p className="text-base font-bold text-red-600" data-testid="text-peak-week">
                  {formatGW(maxWeek?.peakMW ?? 0)}
                </p>
                <p className="text-xs text-slate-400">{maxWeek ? formatWeekDate(maxWeek.dateOfPeak) : ""}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Lowest Demand Week</p>
                <p className="text-base font-bold text-green-600" data-testid="text-min-week">
                  {formatGW(minWeek?.peakMW ?? 0)}
                </p>
                <p className="text-xs text-slate-400">{minWeek ? formatWeekDate(minWeek.dateOfPeak) : ""}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">52-Week Avg Peak</p>
                <p className="text-base font-bold text-blue-600">{formatGW(avgPeak)}</p>
              </div>
            </div>

            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="peakGrad52" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="minGrad52" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={10}
                    interval={Math.floor(chartData.length / 8)}
                    tickMargin={6}
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
                      const item = payload[0]?.payload;
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 text-sm">
                          <p className="font-semibold text-slate-800 mb-1">w/c {label}</p>
                          <p className="text-xs text-slate-400 mb-1">{item?.season}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} style={{ color: p.color }}>
                              {p.name}: {p.value} GW
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={avgPeak / 1000}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: "Avg", position: "right", fill: "#94a3b8", fontSize: 10 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="peak"
                    name="Weekly Peak"
                    stroke="#f97316"
                    strokeWidth={2}
                    fill="url(#peakGrad52)"
                  />
                  <Area
                    type="monotone"
                    dataKey="min"
                    name="Weekly Min"
                    stroke="#22c55e"
                    strokeWidth={1.5}
                    fill="url(#minGrad52)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
              <span className="font-semibold">Data Centre Insight:</span> The summer trough (typically July–August) represents
              the lowest grid stress period — ideal for planned maintenance, equipment upgrades, or PPA renegotiation.
              Winter peaks drive constraint costs; data centres with on-site generation or demand-side response contracts
              can monetise flexibility during these windows.
            </div>

            {data.fetchedAt && (
              <p className="text-xs text-slate-400 mt-2 text-right">
                Updated: {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">No seasonal forecast data available.</p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">Supported by National Energy SO Open Data</p>
      </CardContent>
    </Card>
  );
}
