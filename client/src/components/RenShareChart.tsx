import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const COUNTRY_TO_EC_CODE: Record<string, string> = {
  "United Kingdom": "uk", "Germany": "de", "France": "fr",
  "Netherlands": "nl", "Belgium": "be", "Ireland": "ie",
  "Spain": "es", "Italy": "it", "Poland": "pl", "Denmark": "dk",
  "Sweden": "se", "Norway": "no", "Finland": "fi",
  "Switzerland": "ch", "Portugal": "pt",
};

// dd.mm.yyyy → display as "D Mon"
function parseDay(s: string) {
  const [d, m, y] = s.split(".");
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function RenShareChart({ country }: { country: string }) {
  const code = COUNTRY_TO_EC_CODE[country];

  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/energy-charts/ren-share?country=${code}`],
    enabled: !!code,
    staleTime: 15 * 60 * 1000,
  });

  if (!code) return null;

  if (isLoading) {
    return (
      <Card className="border-none shadow-md">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
          <span className="text-slate-500 text-sm">Loading renewable share trend…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.days?.length) {
    return (
      <Card className="border-none shadow-md">
        <CardContent className="flex items-center justify-center py-10">
          <span className="text-slate-400 text-sm">Renewable trend data unavailable for {country}</span>
        </CardContent>
      </Card>
    );
  }

  const days: string[] = data.days;
  const vals: number[] = data.data;
  const avg90: number = data.avg90;
  const avg365: number = data.avg365;

  // Show last 90 days, decimated to every 3rd for performance
  const last90 = days.slice(-90).map((d: string, i: number) => ({
    day: parseDay(d),
    share: vals[vals.length - 90 + i] ?? null,
  })).filter(r => r.share != null);

  // Trend: compare last 30 days avg vs prior 30 days
  const last30 = vals.slice(-30).filter(v => v != null);
  const prior30 = vals.slice(-60, -30).filter(v => v != null);
  const last30avg = last30.length ? last30.reduce((a, b) => a + b, 0) / last30.length : 0;
  const prior30avg = prior30.length ? prior30.reduce((a, b) => a + b, 0) / prior30.length : 0;
  const trend = last30avg - prior30avg;
  const trendLabel = Math.abs(trend) < 1 ? "Stable" : trend > 0 ? `+${trend.toFixed(1)}pp vs prior 30d` : `${trend.toFixed(1)}pp vs prior 30d`;
  const trendColor = Math.abs(trend) < 1 ? "text-slate-500" : trend > 0 ? "text-green-600" : "text-red-500";

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" /> Renewable Share Trend
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
              90-day avg: {avg90}%
            </Badge>
            <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
              12-month avg: {avg365}%
            </Badge>
            <span className={`text-xs font-medium ${trendColor}`}>{trendLabel}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Daily average renewable share of electricity load — last 90 days · Fraunhofer ISE
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={last90} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="renGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10 }}
              interval={Math.floor(last90.length / 6)}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} width={36} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(1)}%`, "Renewable share"]}
              contentStyle={{ fontSize: 11 }}
            />
            <ReferenceLine
              y={avg90}
              stroke="#22c55e"
              strokeDasharray="4 2"
              label={{ value: `90d avg ${avg90}%`, position: "insideTopLeft", fontSize: 10, fill: "#16a34a" }}
            />
            <Area
              type="monotone"
              dataKey="share"
              stroke="#22c55e"
              strokeWidth={1.5}
              fill="url(#renGrad)"
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2 text-right">
          CC BY 4.0 Fraunhofer ISE Energy Charts
        </p>
      </CardContent>
    </Card>
  );
}
