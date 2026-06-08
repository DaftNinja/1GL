import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Leaf, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

const COUNTRY_TO_EC_CODE: Record<string, string> = {
  "United Kingdom": "uk", "Germany": "de", "France": "fr",
  "Netherlands": "nl", "Belgium": "be", "Ireland": "ie",
  "Spain": "es", "Italy": "it", "Poland": "pl", "Denmark": "dk",
  "Sweden": "se", "Norway": "no", "Finland": "fi",
  "Switzerland": "ch", "Portugal": "pt",
};

function shareColor(share: number): { bg: string; text: string; label: string; ring: string } {
  if (share >= 65) return { bg: "#dcfce7", text: "#16a34a", label: "Green", ring: "#22c55e" };
  if (share >= 40) return { bg: "#fef9c3", text: "#ca8a04", label: "Amber", ring: "#eab308" };
  return { bg: "#fee2e2", text: "#dc2626", label: "Red", ring: "#ef4444" };
}

function formatHour(ts: number) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function GridSignalWidget({ country }: { country: string }) {
  const code = COUNTRY_TO_EC_CODE[country];

  const { data, isLoading, error, dataUpdatedAt } = useQuery<any>({
    queryKey: [`/api/energy-charts/signal?country=${code}`],
    enabled: !!code,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (!code) return null;

  if (isLoading) {
    return (
      <Card className="border-none shadow-md">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
          <span className="text-slate-500 text-sm">Loading live grid signal…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.hasData) {
    return (
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Leaf className="w-4 h-4 text-green-600" /> Live Grid Signal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm text-center py-4">
            Live signal not available for {country}
          </p>
        </CardContent>
      </Card>
    );
  }

  const share = data.currentShare ?? 0;
  const colors = shareColor(share);
  const ts = data.timeseries as Array<{ ts: number; share: number; signal: number }>;

  // Downsample to last 24h, showing every 30-min point
  const cutoff = Date.now() / 1000 - 24 * 3600;
  const chartData = ts
    .filter(p => p.ts >= cutoff)
    .filter((_, i) => i % 2 === 0)
    .map(p => ({ time: formatHour(p.ts), share: Math.round(p.share), ts: p.ts }));

  const updatedTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Leaf className="w-4 h-4 text-green-600" /> Live Grid Signal
          </CardTitle>
          {updatedTime && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> {updatedTime}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">Real-time renewable share of generation · Fraunhofer ISE</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 mb-4">
          {/* Traffic light circle */}
          <div
            className="flex-shrink-0 w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-inner"
            style={{ backgroundColor: colors.bg, boxShadow: `0 0 0 4px ${colors.ring}40, inset 0 2px 6px rgba(0,0,0,0.06)` }}
          >
            <span className="text-2xl font-bold" style={{ color: colors.text }}>{Math.round(share)}%</span>
            <span className="text-xs font-semibold" style={{ color: colors.text }}>Renewable</span>
          </div>
          {/* Status text */}
          <div className="flex-1">
            <Badge
              className="mb-2 text-xs px-2 py-0.5"
              style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.ring}60` }}
            >
              {colors.label} Signal
            </Badge>
            <p className="text-sm text-slate-700">
              {share >= 65
                ? `${country}'s grid is running on mostly renewable energy right now — a good window for high-compute workloads.`
                : share >= 40
                ? `Mixed generation — renewables and fossil fuels both contributing significantly.`
                : `Grid is currently running on predominantly fossil fuel generation.`}
            </p>
            <p className="text-xs text-slate-400 mt-1">Updates every 15 minutes · CC BY 4.0</p>
          </div>
        </div>

        {chartData.length > 0 && (
          <>
            <p className="text-xs font-medium text-slate-600 mb-1">Last 24 hours — Renewable share of generation (%)</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={5} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} width={28} unit="%" />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "Renewable share"]}
                  labelFormatter={(l: string) => `Time: ${l}`}
                  contentStyle={{ fontSize: 11 }}
                />
                <ReferenceLine y={65} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "65%", fontSize: 9, fill: "#22c55e" }} />
                <ReferenceLine y={40} stroke="#eab308" strokeDasharray="4 2" label={{ value: "40%", fontSize: 9, fill: "#eab308" }} />
                <Bar dataKey="share" radius={[1, 1, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.share >= 65 ? "#22c55e" : entry.share >= 40 ? "#eab308" : "#ef4444"} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
