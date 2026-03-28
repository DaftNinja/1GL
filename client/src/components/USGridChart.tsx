import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import { Zap, AlertTriangle, TrendingUp, Wind, Sun, Factory } from "lucide-react";

// ── Colours ───────────────────────────────────────────────────────────────────

const FUEL_COLORS: Record<string, string> = {
  NG:  "#f97316",  // orange   – Natural Gas
  NUC: "#8b5cf6",  // violet   – Nuclear
  WND: "#22c55e",  // green    – Wind
  SUN: "#facc15",  // yellow   – Solar
  COW: "#78716c",  // stone    – Coal
  WAT: "#3b82f6",  // blue     – Hydro
  PS:  "#06b6d4",  // cyan     – Pumped Storage
  OIL: "#dc2626",  // red      – Oil
  GEO: "#10b981",  // emerald  – Geothermal
  BIO: "#84cc16",  // lime     – Biomass
  OTH: "#94a3b8",  // slate    – Other
};

const SECTOR_COLORS: Record<string, string> = {
  residential: "#3b82f6",
  commercial:  "#f97316",
  industrial:  "#8b5cf6",
};

const BA_LABELS: Record<string, string> = {
  ERCO:  "ERCOT",
  CISO:  "CAISO",
  PJM:   "PJM",
  MISO:  "MISO",
  NYISO: "NYISO",
  ISNE:  "ISO-NE",
  SPP:   "SPP",
};

const FUEL_LABELS: Record<string, string> = {
  NG:  "Nat. Gas",
  NUC: "Nuclear",
  WND: "Wind",
  SUN: "Solar",
  COW: "Coal",
  WAT: "Hydro",
  PS:  "Pumped Storage",
  OIL: "Oil",
  GEO: "Geothermal",
  BIO: "Biomass",
  OTH: "Other",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMW(mwh: number): string {
  if (mwh >= 1_000) return `${(mwh / 1_000).toFixed(1)} GW`;
  return `${Math.round(mwh).toLocaleString()} MW`;
}

function fmtPeriod(period: string): string {
  // period format: "2024-01-15T18"
  if (!period) return "";
  const [datePart, hourPart] = period.split("T");
  if (!datePart) return period;
  const [, month, day] = datePart.split("-");
  return `${month}/${day} ${hourPart ?? ""}:00 UTC`;
}

function ErrorBadge({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-amber-600 text-sm py-2">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function USGridChart() {
  const { data: genData, isLoading: genLoading, error: genError } =
    useQuery<any>({
      queryKey: ["/api/eia/generation"],
      queryFn: () => fetch("/api/eia/generation", { credentials: "include" }).then(r => r.json()),
      staleTime: 60 * 60 * 1000,
      retry: 1,
    });

  const { data: demandData, isLoading: demandLoading, error: demandError } =
    useQuery<any>({
      queryKey: ["/api/eia/demand"],
      queryFn: () => fetch("/api/eia/demand", { credentials: "include" }).then(r => r.json()),
      staleTime: 60 * 60 * 1000,
      retry: 1,
    });

  const { data: pricesData, isLoading: pricesLoading, error: pricesError } =
    useQuery<any>({
      queryKey: ["/api/eia/prices"],
      queryFn: () => fetch("/api/eia/prices", { credentials: "include" }).then(r => r.json()),
      staleTime: 24 * 60 * 60 * 1000,
      retry: 1,
    });

  const apiKeyMissing = (err: unknown) =>
    err instanceof Error
      ? err.message.includes("not configured")
      : String(err).includes("not configured");

  if (apiKeyMissing(genError) || apiKeyMissing(demandError)) {
    return (
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent className="p-6">
          <ErrorBadge message="EIA_API_KEY not configured. Add your key from api.eia.gov to enable US grid data." />
        </CardContent>
      </Card>
    );
  }

  // ── Build generation-mix chart data ─────────────────────────────────────────
  const byBA: Record<string, Record<string, number>> = genData?.byBA ?? {};
  const allFuels = Array.from(
    new Set(Object.values(byBA).flatMap(f => Object.keys(f)))
  ).sort();

  const genChartData = Object.entries(byBA).map(([ba, fuels]) => ({
    ba: BA_LABELS[ba] ?? ba,
    ...Object.fromEntries(
      allFuels.map(f => [f, Math.round((fuels[f] ?? 0))])
    ),
  }));

  // ── Build demand chart data ──────────────────────────────────────────────────
  const latestDemand: Record<string, number> = demandData?.latestDemandMWh ?? {};
  const demandChartData = Object.entries(latestDemand)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([ba, mwh]) => ({
      ba: BA_LABELS[ba] ?? ba,
      demand: Math.round(mwh),
    }));

  const totalDemandMW = Object.values(latestDemand).reduce((a, b) => a + b, 0);

  // ── Build prices chart data ──────────────────────────────────────────────────
  const nationalAvg: Record<string, number> = pricesData?.nationalAvgCents ?? {};
  const pricesChartData = Object.entries(nationalAvg).map(([sector, cents]) => ({
    sector: sector.charAt(0).toUpperCase() + sector.slice(1),
    sectorKey: sector,
    priceCents: cents,
  }));

  const renewablesMW = Object.values(byBA).reduce((total, fuels) => {
    return total + (fuels.WND ?? 0) + (fuels.SUN ?? 0) + (fuels.WAT ?? 0) + (fuels.GEO ?? 0);
  }, 0);
  const totalGenMW = Object.values(byBA).reduce((total, fuels) => {
    return total + Object.values(fuels).reduce((a, b) => a + b, 0);
  }, 0);
  const renewablesPct = totalGenMW > 0 ? Math.round((renewablesMW / totalGenMW) * 100) : null;

  return (
    <div className="space-y-6 mb-8">
      {/* ── Metric summary row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-none shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total RTO Demand</p>
                <p className="text-xl font-bold text-slate-900">
                  {demandLoading ? "—" : totalDemandMW > 0 ? fmtMW(totalDemandMW) : "No data"}
                </p>
                {demandData?.latestPeriod && (
                  <p className="text-xs text-slate-400">{fmtPeriod(demandData.latestPeriod)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-50">
                <Wind className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Renewables Share</p>
                <p className="text-xl font-bold text-slate-900">
                  {genLoading ? "—" : renewablesPct !== null ? `${renewablesPct}%` : "No data"}
                </p>
                <p className="text-xs text-slate-400">Wind + Solar + Hydro + Geo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-orange-50">
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Residential Price</p>
                <p className="text-xl font-bold text-slate-900">
                  {pricesLoading
                    ? "—"
                    : nationalAvg.residential
                      ? `${nationalAvg.residential.toFixed(1)}¢/kWh`
                      : "No data"}
                </p>
                <p className="text-xs text-slate-400">National avg · {pricesData?.latestPeriod ?? ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Generation by fuel type ─────────────────────────────────────────── */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Factory className="w-4 h-4 text-slate-500" />
              Generation by Fuel Type — Major RTOs
            </CardTitle>
            {genData?.latestPeriod && (
              <Badge variant="outline" className="text-xs font-normal">
                {fmtPeriod(genData.latestPeriod)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {genLoading && (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              Loading EIA generation data…
            </div>
          )}
          {genError && !apiKeyMissing(genError) && (
            <ErrorBadge message="Unable to load generation data. EIA API may be temporarily unavailable." />
          )}
          {!genLoading && !genError && genChartData.length === 0 && (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              No generation data available.
            </div>
          )}
          {!genLoading && genChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={genChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="ba" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}GW` : `${v}`}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    fmtMW(value),
                    FUEL_LABELS[name] ?? name,
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend
                  formatter={name => FUEL_LABELS[name] ?? name}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {allFuels.map(fuel => (
                  <Bar
                    key={fuel}
                    dataKey={fuel}
                    stackId="gen"
                    fill={FUEL_COLORS[fuel] ?? "#94a3b8"}
                    name={fuel}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Grid demand by region ───────────────────────────────────────────── */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-slate-500" />
              Grid Demand by ISO/RTO Region
            </CardTitle>
            {demandData?.latestPeriod && (
              <Badge variant="outline" className="text-xs font-normal">
                {fmtPeriod(demandData.latestPeriod)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {demandLoading && (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              Loading demand data…
            </div>
          )}
          {demandError && !apiKeyMissing(demandError) && (
            <ErrorBadge message="Unable to load demand data." />
          )}
          {!demandLoading && !demandError && demandChartData.length === 0 && (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              No demand data available.
            </div>
          )}
          {!demandLoading && demandChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={demandChartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={v => `${(v / 1000).toFixed(0)}GW`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis dataKey="ba" type="category" tick={{ fontSize: 11 }} width={52} />
                <Tooltip
                  formatter={(v: number) => [fmtMW(v), "Demand"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="demand" radius={[0, 4, 4, 0]}>
                  {demandChartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={["#3b82f6","#6366f1","#8b5cf6","#0ea5e9","#14b8a6","#22c55e","#f97316"][i % 7]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Retail electricity prices ───────────────────────────────────────── */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Sun className="w-4 h-4 text-slate-500" />
              US Retail Electricity Prices — National Average
            </CardTitle>
            {pricesData?.latestPeriod && (
              <Badge variant="outline" className="text-xs font-normal">
                {pricesData.latestPeriod}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {pricesLoading && (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              Loading price data…
            </div>
          )}
          {pricesError && (
            <ErrorBadge message="Unable to load retail price data." />
          )}
          {!pricesLoading && !pricesError && pricesChartData.length === 0 && (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              No price data available.
            </div>
          )}
          {!pricesLoading && pricesChartData.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-4">
              {pricesChartData.map(({ sector, sectorKey, priceCents }) => (
                <div
                  key={sectorKey}
                  className="flex-1 rounded-xl p-4 text-white text-center"
                  style={{ background: SECTOR_COLORS[sectorKey] ?? "#64748b" }}
                >
                  <p className="text-xs uppercase tracking-wide opacity-80 mb-1">{sector}</p>
                  <p className="text-2xl font-bold">{priceCents.toFixed(1)}¢</p>
                  <p className="text-xs opacity-70 mt-0.5">per kWh</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">
            Source: US Energy Information Administration (EIA) · Retail Sales of Electricity
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
