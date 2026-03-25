import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const COUNTRY_TO_EC_CODE: Record<string, string> = {
  "United Kingdom": "uk", "Germany": "de", "France": "fr",
  "Netherlands": "nl", "Belgium": "be", "Ireland": "ie",
  "Spain": "es", "Italy": "it", "Poland": "pl", "Denmark": "dk",
  "Sweden": "se", "Norway": "no", "Finland": "fi",
  "Switzerland": "ch", "Portugal": "pt",
};

const FUEL_COLORS: Record<string, string> = {
  "Nuclear":           "#8b5cf6",
  "Wind Offshore":     "#06b6d4",
  "Wind Onshore":      "#22c55e",
  "Solar":             "#eab308",
  "Hydro Reservoir":   "#3b82f6",
  "Hydro Run-of-River":"#60a5fa",
  "Hydro Pumped":      "#93c5fd",
  "Biomass":           "#84cc16",
  "Gas":               "#f97316",
  "Lignite":           "#78350f",
  "Hard Coal":         "#374151",
  "Oil":               "#9ca3af",
  "Peat":              "#a16207",
  "Geothermal":        "#10b981",
  "Marine":            "#0891b2",
  "Others":            "#d1d5db",
  "Waste":             "#6b7280",
};

const RENEWABLE_FUELS = new Set(["Wind Offshore", "Wind Onshore", "Solar", "Hydro Reservoir", "Hydro Run-of-River", "Hydro Pumped", "Biomass", "Geothermal", "Marine"]);
const FOSSIL_FUELS = new Set(["Gas", "Lignite", "Hard Coal", "Oil", "Peat"]);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p: any) => p.value > 0);
  const totalGW = entries.reduce((s: number, p: any) => s + p.value, 0);
  const renewGW = entries.filter((p: any) => RENEWABLE_FUELS.has(p.dataKey)).reduce((s: number, p: any) => s + p.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-[220px]">
      <p className="font-semibold text-slate-900 mb-1 text-sm">{label}</p>
      <p className="text-slate-500 mb-2">Total: {totalGW.toFixed(1)} GW · Renewables: {totalGW > 0 ? Math.round(renewGW / totalGW * 100) : 0}%</p>
      {entries.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.fill }}>{p.dataKey}</span>
          <span className="font-medium">{p.value.toFixed(1)} GW</span>
        </div>
      ))}
    </div>
  );
};

export default function InstalledPowerChart({ country }: { country: string }) {
  const code = COUNTRY_TO_EC_CODE[country];

  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/energy-charts/installed-power?country=${code}`],
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (!code) return null;

  if (isLoading) {
    return (
      <Card className="border-none shadow-md mb-8">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-slate-500 text-sm">Loading installed capacity data…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.fuels?.length) {
    return (
      <Card className="border-none shadow-md mb-8">
        <CardContent className="flex items-center justify-center py-10">
          <span className="text-slate-400 text-sm">Installed capacity data unavailable for {country}</span>
        </CardContent>
      </Card>
    );
  }

  // Build chart rows — years from 2010 onwards
  const startIdx = data.years.findIndex((y: string) => parseInt(y) >= 2010);
  const years: string[] = data.years.slice(startIdx);
  const fuels: Array<{ name: string; data: (number | null)[] }> = data.fuels.map((f: any) => ({
    ...f,
    data: f.data.slice(startIdx),
  }));

  const chartData = years.map((year: string, i: number) => {
    const row: Record<string, any> = { year };
    for (const f of fuels) {
      const v = f.data[i];
      row[f.name] = v != null ? Math.round(v * 10) / 10 : null;
    }
    return row;
  });

  const currentYear = data.currentYear;
  const renewFuels = fuels.filter(f => RENEWABLE_FUELS.has(f.name));
  const nuclearFuels = fuels.filter(f => f.name === "Nuclear");
  const fossilFuels = fuels.filter(f => FOSSIL_FUELS.has(f.name));
  const orderedFuels = [...fossilFuels, ...nuclearFuels, ...renewFuels];

  // Latest actual year total
  const latestActualIdx = years.findLastIndex((y: string) => parseInt(y) <= currentYear);
  const latestTotals = latestActualIdx >= 0
    ? fuels.reduce((s, f) => s + (f.data[latestActualIdx] ?? 0), 0)
    : 0;
  const latestRenew = latestActualIdx >= 0
    ? renewFuels.reduce((s, f) => s + (f.data[latestActualIdx] ?? 0), 0)
    : 0;

  return (
    <Card className="border-none shadow-md mb-8">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" />
            Installed Power Capacity
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
              {Math.round(latestRenew / latestTotals * 100)}% Renewable capacity
            </Badge>
            <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
              {latestTotals.toFixed(0)} GW total
            </Badge>
            <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50">
              Incl. 2030 projections
            </Badge>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Annual installed generation capacity in GW · Source: Fraunhofer ISE Energy Charts
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}GW`} width={48} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              x={String(currentYear)}
              stroke="#94a3b8"
              strokeDasharray="4 2"
              label={{ value: "Now", position: "top", fontSize: 10, fill: "#94a3b8" }}
            />
            {orderedFuels.map(f => (
              <Area
                key={f.name}
                type="monotone"
                dataKey={f.name}
                stackId="1"
                stroke={FUEL_COLORS[f.name] ?? "#9ca3af"}
                fill={FUEL_COLORS[f.name] ?? "#9ca3af"}
                fillOpacity={0.85}
                strokeWidth={0}
                connectNulls
                dot={false}
                activeDot={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2 text-right">
          Data after {currentYear} are national energy plan projections · CC BY 4.0 Fraunhofer ISE
        </p>
      </CardContent>
    </Card>
  );
}
