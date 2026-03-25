import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Leaf, TrendingDown, TrendingUp } from "lucide-react";
import {
  ComposedChart,
  AreaChart,
  Area,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const SOURCE_COLORS: Record<string, string> = {
  Wind:              "#22c55e",
  Solar:             "#eab308",
  Hydro:             "#3b82f6",
  Bioenergy:         "#84cc16",
  "Other renewables":"#06b6d4",
  Nuclear:           "#8b5cf6",
  Gas:               "#f97316",
  Coal:              "#374151",
  "Other fossil":    "#9ca3af",
};

const RENEWABLE_SOURCES = ["Wind", "Solar", "Hydro", "Bioenergy", "Other renewables"];
const LOW_CARBON_SOURCES = ["Nuclear"];
const FOSSIL_SOURCES = ["Gas", "Coal", "Other fossil"];
const ALL_CHART_SOURCES = [...RENEWABLE_SOURCES, ...LOW_CARBON_SOURCES, ...FOSSIL_SOURCES];

function round1(v: number) { return Math.round(v * 10) / 10; }

const CustomGenTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p: any) => p.value > 0);
  const renewables = entries.filter((p: any) => RENEWABLE_SOURCES.includes(p.dataKey));
  const lowCarbon = entries.filter((p: any) => LOW_CARBON_SOURCES.includes(p.dataKey));
  const fossil = entries.filter((p: any) => FOSSIL_SOURCES.includes(p.dataKey));
  const renewTotal = renewables.reduce((s: number, p: any) => s + p.value, 0);
  const fossilTotal = fossil.reduce((s: number, p: any) => s + p.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-[220px]">
      <p className="font-semibold text-slate-900 mb-2 text-sm">{label}</p>
      {renewables.length > 0 && (
        <div className="mb-2">
          <p className="text-green-600 font-medium mb-1">Renewables ({round1(renewTotal)}%)</p>
          {renewables.map((p: any) => (
            <div key={p.dataKey} className="flex justify-between gap-3">
              <span style={{ color: p.fill }}>{p.dataKey}</span>
              <span className="font-medium">{round1(p.value)}%</span>
            </div>
          ))}
        </div>
      )}
      {lowCarbon.length > 0 && (
        <div className="mb-2">
          <p className="text-purple-600 font-medium mb-1">Low-carbon</p>
          {lowCarbon.map((p: any) => (
            <div key={p.dataKey} className="flex justify-between gap-3">
              <span style={{ color: p.fill }}>{p.dataKey}</span>
              <span className="font-medium">{round1(p.value)}%</span>
            </div>
          ))}
        </div>
      )}
      {fossil.length > 0 && (
        <div>
          <p className="text-orange-600 font-medium mb-1">Fossil ({round1(fossilTotal)}%)</p>
          {fossil.map((p: any) => (
            <div key={p.dataKey} className="flex justify-between gap-3">
              <span style={{ color: p.fill }}>{p.dataKey}</span>
              <span className="font-medium">{round1(p.value)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CustomCITooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="text-blue-600 mt-1">
        Carbon intensity: <span className="font-bold">{payload[0]?.value} gCO₂/kWh</span>
      </p>
    </div>
  );
};

interface Props {
  country: string;
}

export default function EmberEnergyChart({ country }: Props) {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/ember/country-energy", country],
    queryFn: async () => {
      const res = await fetch(`/api/ember/country-energy?country=${encodeURIComponent(country)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch Ember data");
      return res.json();
    },
    enabled: !!country,
    staleTime: 1000 * 60 * 60,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading Ember energy data...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-500 text-center">
        Ember energy data not available for this country.
      </div>
    );
  }

  const ciChange = data.carbonIntensityChange5yr;
  const ciChangeIsGood = ciChange < 0;

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-green-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide flex items-center gap-1">
              <Leaf className="w-3 h-3" /> Renewables Share
            </p>
            <p className="text-2xl font-bold text-green-800 mt-1">{data.latestRenewablesPct}%</p>
            <p className="text-xs text-green-600 mt-0.5">{data.latestYear} generation mix</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide flex items-center gap-1">
              <Zap className="w-3 h-3" /> Carbon Intensity
            </p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{data.latestCarbonIntensity}</p>
            <p className="text-xs text-blue-600 mt-0.5">gCO₂/kWh ({data.latestYear})</p>
          </CardContent>
        </Card>
        <Card className={`border-none shadow-sm ${ciChangeIsGood ? "bg-emerald-50" : "bg-amber-50"}`}>
          <CardContent className="pt-4 pb-3">
            <p className={`text-xs font-medium uppercase tracking-wide flex items-center gap-1 ${ciChangeIsGood ? "text-emerald-600" : "text-amber-600"}`}>
              {ciChangeIsGood ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              5-Year CI Change
            </p>
            <p className={`text-2xl font-bold mt-1 ${ciChangeIsGood ? "text-emerald-800" : "text-amber-800"}`}>
              {ciChange > 0 ? "+" : ""}{ciChange}
            </p>
            <p className={`text-xs mt-0.5 ${ciChangeIsGood ? "text-emerald-600" : "text-amber-600"}`}>
              gCO₂/kWh vs 5 years ago
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-slate-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-600 font-medium uppercase tracking-wide">Data Source</p>
            <p className="text-sm font-bold text-slate-800 mt-1">Ember Energy</p>
            <p className="text-xs text-slate-500 mt-0.5">api.ember-energy.org</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Electricity Generation Mix — {country}
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Annual share of generation by source (%) — 2010 to {data.latestYear}
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">Ember Energy</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={data.generation} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={1} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                label={{ value: "% of generation", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10, fill: "#64748b" } }}
              />
              <Tooltip content={<CustomGenTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: SOURCE_COLORS[value] || "#64748b" }}>{value}</span>}
              />
              {ALL_CHART_SOURCES.map((src) => (
                <Area
                  key={src}
                  type="monotone"
                  dataKey={src}
                  stackId="1"
                  stroke={SOURCE_COLORS[src]}
                  fill={SOURCE_COLORS[src]}
                  fillOpacity={0.85}
                  strokeWidth={0}
                  name={src}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-slate-400 mt-2">
            Supported by Ember Energy Open Data — api.ember-energy.org
          </p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Grid Carbon Intensity — {country}
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Annual emissions intensity in gCO₂/kWh — 2010 to {data.latestYear}
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">Ember Energy</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.carbonIntensity} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={1} />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{ value: "gCO₂/kWh", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10, fill: "#64748b" } }}
              />
              <Tooltip content={<CustomCITooltip />} />
              <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "100 gCO₂/kWh", fill: "#22c55e", fontSize: 10, position: "right" }} />
              <Line
                type="monotone"
                dataKey="gco2PerKwh"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#2563eb" }}
                activeDot={{ r: 5 }}
                name="Carbon intensity"
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-slate-400 mt-2">
            Supported by Ember Energy Open Data — api.ember-energy.org
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
