import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Activity, Zap, TrendingDown, AlertTriangle } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

interface DemandForecastData {
  targetDate: string;
  peakDemandMW: number;
  minDemandMW: number;
  demandCurve: { time: string; demandMW: number; label: string }[];
  fetchedAt: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMW(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} GW`;
  return `${value.toLocaleString()} MW`;
}

export function DemandForecast() {
  const { data, isLoading, error } = useQuery<DemandForecastData>({
    queryKey: ["/api/neso/demand-forecast"],
    queryFn: async () => {
      const res = await fetch("/api/neso/demand-forecast", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 4 * 60 * 60 * 1000,
  });

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-demand-forecast-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load demand forecast data. The data will be available when the NESO source is reachable.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-demand-forecast">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">UK National Demand Forecast (1-Day Ahead)</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Source: National Energy System Operator (NESO) — Cardinal Point Forecast
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-slate-500">Loading demand forecast from NESO...</span>
          </div>
        ) : data ? (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Forecast for <span className="font-semibold text-slate-800">{formatDate(data.targetDate)}</span>
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Evening Peak</p>
                <p className="text-lg font-bold text-red-600" data-testid="text-peak-demand">
                  {formatMW(data.peakDemandMW)}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Overnight Min</p>
                <p className="text-lg font-bold text-green-600" data-testid="text-min-demand">
                  {formatMW(data.minDemandMW)}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Demand Range</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatMW(data.peakDemandMW - data.minDemandMW)}
                </p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Peak/Min Ratio</p>
                <p className="text-lg font-bold text-amber-600">
                  {(data.peakDemandMW / data.minDemandMW).toFixed(2)}x
                </p>
              </div>
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.demandCurve} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1976D2" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1976D2" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    fontSize={11}
                    tickMargin={8}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)} GW`}
                    domain={["dataMin - 2000", "dataMax + 2000"]}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 text-sm">
                          <p className="font-semibold text-slate-800 mb-1">{d.label}</p>
                          <p className="text-slate-500">Time: {d.time}</p>
                          <p className="text-blue-600 font-bold">{formatMW(d.demandMW)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={data.peakDemandMW}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: "Peak", position: "right", fill: "#ef4444", fontSize: 11 }}
                  />
                  <ReferenceLine
                    y={data.minDemandMW}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                    label={{ value: "Min", position: "right", fill: "#22c55e", fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="demandMW"
                    stroke="#1976D2"
                    strokeWidth={3}
                    fill="url(#demandGrad)"
                    dot={{ fill: "#1976D2", r: 5, stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: "#1565C0" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <span className="font-semibold">Data Centre Insight:</span> The {formatMW(data.peakDemandMW - data.minDemandMW)} demand
                    swing between overnight minimum and evening peak represents significant grid stress.
                    Data centres with flexible load shifting or on-site generation can capitalise on lower off-peak pricing.
                  </p>
                  <p>
                    <span className="font-semibold">Peak demand ({formatMW(data.peakDemandMW)})</span> at 17:00–19:30 coincides with highest grid
                    tariffs — battery storage and demand response programmes offer strategic advantage.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {data?.fetchedAt && (
          <p className="text-xs text-slate-400 mt-2 text-right">
            Data fetched: {new Date(data.fetchedAt).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">Supported by National Energy SO Open Data</p>
      </CardContent>
    </Card>
  );
}
