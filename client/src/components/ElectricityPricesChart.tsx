import { useQuery } from "@tanstack/react-query";
import { DataSourceStatus } from "./DataSourceStatus";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Zap, TrendingDown, TrendingUp, AlertTriangle, Info, Radio, Clock } from "lucide-react";

const COUNTRY_TO_CODE: Record<string, string> = {
  "United Kingdom": "UK",
  "Germany": "DE",
  "Ireland": "IE",
  "Italy": "IT",
  "Denmark": "DK",
  "Sweden": "SE",
  "Norway": "NO",
  "France": "FR",
  "Belgium": "BE",
  "Spain": "ES",
  "Netherlands": "NL",
  "Poland": "PL",
  "Finland": "FI",
};

const CODE_COLORS: Record<string, string> = {
  DE: "#3b82f6", UK: "#ef4444", IE: "#10b981", IT: "#f59e0b",
  DK: "#8b5cf6", SE: "#ec4899", NO: "#06b6d4", FR: "#6366f1",
  BE: "#f97316", ES: "#84cc16", NL: "#14b8a6", PL: "#a78bfa", FI: "#fb7185",
};

interface ElectricityPricesChartProps {
  country: string;
}

export default function ElectricityPricesChart({ country }: ElectricityPricesChartProps) {
  const countryCode = COUNTRY_TO_CODE[country];

  // Check if ENTSO-E is configured + health status for banners
  const { data: entsoeStatus } = useQuery<{
    configured: boolean;
    apiReachable: boolean;
    consecutiveFailures: number;
    lastSuccessfulFetch: string | null;
    staleCacheAge: number | null;
    lastError: string | null;
  }>({
    queryKey: ["/api/entsoe/status"],
    staleTime: 5 * 60 * 1000,
  });

  const isLive = entsoeStatus?.configured === true;
  const entsoeUnavailable = isLive && (entsoeStatus?.consecutiveFailures ?? 0) > 0;
  const entsoeMeta = entsoeUnavailable ? {
    source: "stale_cache" as const,
    dataAge: entsoeStatus?.staleCacheAge != null
      ? `${Math.floor(entsoeStatus.staleCacheAge / 60)}h ${entsoeStatus.staleCacheAge % 60}m`
      : null,
    apiStatus: "unavailable" as const,
    lastSuccessfulFetch: entsoeStatus?.lastSuccessfulFetch ?? null,
    message: "ENTSO-E API is temporarily unavailable. Showing last available data.",
  } : null;

  // ENTSO-E live data (when configured)
  const { data: liveData, isLoading: isLoadingLive } = useQuery<any>({
    queryKey: ["/api/entsoe/prices", country],
    queryFn: () => fetch(`/api/entsoe/prices?country=${encodeURIComponent(country)}`).then((r) => r.json()),
    enabled: isLive && !!countryCode,
    staleTime: 60 * 60 * 1000,
  });

  // Fallback: static Kaggle data
  const { data: staticData, isLoading: isLoadingStatic } = useQuery<any>({
    queryKey: ["/api/electricity-prices"],
    enabled: !isLive,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const isLoading = isLoadingLive || isLoadingStatic;

  if (isLoading) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-72 mb-4" />
        <div className="h-48 bg-muted rounded" />
      </div>
    );
  }

  // ─── Build unified display data from either source ────────────────────────

  let annual: Record<string, number> = {};
  let monthly: Record<string, number> = {};
  let latestPrice: number | null = null;
  let latestYear = "";
  let latestDayAvg: number | null = null;
  let latestDayDate: string | null = null;
  let currency = "EUR";
  let genMix: Record<string, Record<string, number>> = {};
  let dataFetchedAt: string | null = null;
  let hasData = false;

  if (isLive && liveData && !liveData.message) {
    // ENTSO-E live format
    annual = liveData.annualAvg || {};
    const months: { key: string; avg: number }[] = (liveData.monthly || []).map((m: any) => ({
      key: `${m.year}-${String(m.month).padStart(2, "0")}`,
      avg: m.avgEurMwh,
    }));
    monthly = Object.fromEntries(months.map((m) => [m.key, m.avg]));
    latestDayAvg = liveData.latestDayAvg;
    latestDayDate = liveData.latestDayDate;
    currency = liveData.currency || "EUR";
    dataFetchedAt = liveData.fetchedAt;
    hasData = Object.keys(annual).length > 0;
  } else if (!isLive && staticData?.countries?.[countryCode ?? ""]) {
    // Static Kaggle fallback
    const entry = staticData.countries[countryCode!];
    annual = entry.annual || {};
    monthly = entry.monthly || {};
    genMix = entry.gen_mix_annual || {};
    hasData = true;
  }

  if (!hasData) return null;

  const sortedYears = Object.keys(annual).sort();
  const hasMultiYear = sortedYears.length > 1;

  if (sortedYears.length > 0) {
    latestYear = sortedYears[sortedYears.length - 1];
    latestPrice = latestDayAvg ?? annual[latestYear];
  }

  const prevYear = sortedYears.length >= 2 ? sortedYears[sortedYears.length - 2] : null;
  const prevPrice = prevYear ? annual[prevYear] : null;
  const trend = prevPrice && latestPrice ? ((latestPrice - prevPrice) / prevPrice) * 100 : null;

  const annualChartData = sortedYears.map((yr) => ({ year: yr, [countryCode!]: annual[yr] }));

  const sortedMonths = Object.keys(monthly).sort().slice(-36);
  const monthlyChartData = sortedMonths.map((ym) => ({
    month: ym,
    label: ym.slice(2),
    price: monthly[ym],
  }));

  // 2022 comparison — use static data regardless (ENTSO-E only has last year)
  const staticCountries = staticData?.countries || {};
  const crisis2022 = Object.entries(staticCountries)
    .filter(([, d]: [string, any]) => d.annual?.["2022"])
    .map(([code, d]: [string, any]) => ({
      country: (d as any).name,
      code,
      price: (d as any).annual["2022"],
    }))
    .sort((a, b) => b.price - a.price);

  const euAvg2022 = crisis2022.length > 0
    ? crisis2022.reduce((s, c) => s + c.price, 0) / crisis2022.length
    : null;

  // Estimated DC power cost
  const latestForCost = latestDayAvg ?? (latestYear ? annual[latestYear] : null);
  const annualCostPerMwEur = latestForCost ? Math.round(latestForCost * 8760 * 1.4 / 1000) : null;

  const formatEur = (v: number) => `€${v.toFixed(0)}`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-sm shadow-lg">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: <strong>€{Number(p.value).toFixed(1)}/MWh</strong>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-8 space-y-6" data-testid="electricity-prices-section">

      <DataSourceStatus
        meta={entsoeMeta}
        sourceName="ENTSO-E"
        hasData={hasData}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Electricity Price Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              {isLive ? "ENTSO-E Transparency Platform — live day-ahead market" : "ENTSO-E Transparency Platform via Open Power System Data"}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isLive
            ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
            : "bg-muted border-border text-muted-foreground"
        }`}>
          {isLive ? (
            <><Radio className="w-3 h-3" /> Live data</>
          ) : (
            <><Clock className="w-3 h-3" /> Historical snapshot</>
          )}
        </div>
      </div>

      {/* Live day badge */}
      {isLive && latestDayAvg !== null && latestDayDate && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-2.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-sm text-foreground">
            <strong>Today's day-ahead price ({latestDayDate}):</strong>{" "}
            <span className="font-bold text-green-600 dark:text-green-400">€{latestDayAvg.toFixed(2)}/MWh</span>
            {" "}<span className="text-muted-foreground text-xs">({currency}/MWh · ENTSO-E spot market)</span>
          </p>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4" data-testid="price-kpi-latest">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {isLive && latestDayDate ? `Today (${latestDayDate})` : `${latestYear} Avg`}
          </p>
          <p className="text-2xl font-bold text-foreground">
            €{(isLive && latestDayAvg !== null ? latestDayAvg : (latestYear ? annual[latestYear] : 0))?.toFixed(0)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">per MWh</p>
          {trend !== null && !isLive && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend > 0 ? "text-red-500" : "text-green-500"}`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}% vs {prevYear}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4" data-testid="price-kpi-annual">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {isLive ? `${latestYear} Annual Avg` : "2022 Crisis Peak"}
          </p>
          {isLive ? (
            <>
              <p className="text-2xl font-bold text-foreground">€{annual[latestYear]?.toFixed(0) ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">per MWh</p>
              {trend !== null && (
                <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend > 0 ? "text-red-500" : "text-green-500"}`}>
                  {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(trend).toFixed(1)}% vs {prevYear}
                </div>
              )}
            </>
          ) : annual["2022"] ? (
            <>
              <p className="text-2xl font-bold text-red-500">€{annual["2022"].toFixed(0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">per MWh (annual avg)</p>
              <p className="text-xs text-amber-500 mt-2 font-medium">
                {((annual["2022"] / (annual["2020"] || annual["2019"] || 1) - 1) * 100).toFixed(0)}% above pre-crisis
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Data not available</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4" data-testid="price-kpi-baseline">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {isLive ? "12-Month Low" : "Pre-Crisis Baseline"}
          </p>
          {isLive ? (
            <>
              {(() => {
                const monthPrices = Object.values(monthly);
                const minPrice = monthPrices.length > 0 ? Math.min(...monthPrices) : null;
                return minPrice !== null ? (
                  <>
                    <p className="text-2xl font-bold text-green-500">€{minPrice.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">per MWh (monthly avg)</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">—</p>;
              })()}
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-green-500">€{(annual["2020"] || annual["2019"] || 0).toFixed(0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">per MWh (2020)</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4" data-testid="price-kpi-dc-cost">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Est. DC Power Cost</p>
          {annualCostPerMwEur !== null ? (
            <>
              <p className="text-2xl font-bold text-foreground">€{(annualCostPerMwEur / 1000).toFixed(1)}M</p>
              <p className="text-xs text-muted-foreground mt-0.5">per MW IT / year (PUE 1.4)</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isLive && latestDayDate ? `Based on today's price` : `${latestYear} pricing`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Not available</p>
          )}
        </div>
      </div>

      {/* Annual trend chart */}
      {hasMultiYear && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="price-annual-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {country} — Annual Average Day-Ahead Price
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {isLive ? "ENTSO-E live · " : "ENTSO-E via Open Power System Data · "}EUR/MWh
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={annualChartData} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatEur} domain={[0, "dataMax + 20"]} />
              <Tooltip content={<CustomTooltip />} />
              {annual["2022"] && (
                <ReferenceLine x="2022" stroke="#ef4444" strokeDasharray="4 4"
                  label={{ value: "Crisis peak", fontSize: 10, fill: "#ef4444" }} />
              )}
              <Line
                type="monotone" dataKey={countryCode} name={`${country} (€/MWh)`}
                stroke={CODE_COLORS[countryCode!] || "#3b82f6"} strokeWidth={2.5}
                dot={{ r: 4, fill: CODE_COLORS[countryCode!] || "#3b82f6" }} activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly price trajectory */}
      {monthlyChartData.length > 3 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="price-monthly-chart">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {country} — Monthly Price Trajectory
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {monthlyChartData[0]?.month} → {monthlyChartData[monthlyChartData.length - 1]?.month} · €/MWh
            {isLive && <span className="ml-2 text-green-600 dark:text-green-400 font-medium">· Live ENTSO-E data</span>}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={monthlyChartData} margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(monthlyChartData.length / 12))} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatEur} domain={[0, "dataMax + 20"]} />
              <Tooltip formatter={(v: number) => [`€${v.toFixed(1)}/MWh`]} labelFormatter={(l) => `${l}`} />
              <Line
                type="monotone" dataKey="price" name="€/MWh"
                stroke={CODE_COLORS[countryCode!] || "#3b82f6"} strokeWidth={2}
                dot={false} activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 2022 crisis comparison */}
      {crisis2022.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="price-crisis-chart">
          <div className="flex items-start gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">2022 European Energy Crisis — Country Comparison</h3>
              <p className="text-xs text-muted-foreground">Annual avg day-ahead price · Higher = more expensive DC power opex</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={crisis2022} layout="vertical" margin={{ left: 10, right: 50, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} domain={[0, "dataMax + 20"]} />
              <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={120} />
              <Tooltip formatter={(v: number) => [`€${v.toFixed(1)}/MWh`]} />
              {euAvg2022 && (
                <ReferenceLine x={euAvg2022} stroke="#94a3b8" strokeDasharray="4 4"
                  label={{ value: `avg €${euAvg2022.toFixed(0)}`, fontSize: 10, fill: "#94a3b8", position: "top" }} />
              )}
              <Bar dataKey="price" name="2022 Avg (€/MWh)" radius={[0, 4, 4, 0]}
                fill="#3b82f6"
                label={{ position: "right", formatter: (v: number) => `€${v.toFixed(0)}`, fontSize: 10, fill: "var(--foreground)" }}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Spain benefited from high solar penetration, moderating the crisis impact. Italy highest — predominantly gas-indexed market.
            Germany and Nordics partially insulated via long-term PPA contracts. Source: ENTSO-E 2022 hourly data.
          </p>
        </div>
      )}

      {/* Germany generation mix table (static data only) */}
      {!isLive && countryCode === "DE" && Object.keys(genMix).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="de-genmix-table">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Germany Generation Mix (hourly avg MW)</h3>
              <p className="text-xs text-muted-foreground">Nuclear exit April 2023 — visible in 2024/2025 data · Source: DE-LU Electricity Market dataset</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 pr-4 text-muted-foreground font-medium">Fuel</th>
                  {Object.keys(genMix).sort().map((y) => (
                    <th key={y} className="text-right py-1.5 px-2 text-muted-foreground font-medium">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: "wind_onshore", label: "Wind Onshore", color: "text-blue-500" },
                  { key: "wind_offshore", label: "Wind Offshore", color: "text-cyan-500" },
                  { key: "solar", label: "Solar PV", color: "text-amber-500" },
                  { key: "nuclear", label: "Nuclear", color: "text-purple-500" },
                  { key: "lignite", label: "Lignite", color: "text-orange-600" },
                  { key: "hard_coal", label: "Hard Coal", color: "text-slate-500" },
                  { key: "gas", label: "Gas", color: "text-red-400" },
                ].map(({ key, label, color }) => (
                  <tr key={key} className="border-b border-border/50 hover:bg-muted/30">
                    <td className={`py-1.5 pr-4 font-medium ${color}`}>{label}</td>
                    {Object.keys(genMix).sort().map((y) => (
                      <td key={y} className="text-right py-1.5 px-2 text-foreground tabular-nums">
                        {genMix[y]?.[key] != null ? `${Number(genMix[y][key]).toLocaleString()} MW` : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Data centre power opex context:</strong> Electricity typically represents 40–60% of total DC opex.
          At a typical 10 MW IT load with PUE 1.4, each €10/MWh change in electricity price shifts annual power spend by approximately
          <strong className="text-foreground"> €1.2M/year</strong>.
          The Aug 2022 energy crisis peak in Germany reached €465/MWh day-ahead — most operators hold structured PPAs
          providing 30–40% discount to spot market.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {isLive
            ? `Source: ENTSO-E Transparency Platform REST API · Data fetched: ${dataFetchedAt ? new Date(dataFetchedAt).toLocaleString("en-GB") : "today"} · 24-hour cache.`
            : "Sources: ENTSO-E Transparency Platform via Open Power System Data (Kaggle); DE-LU Electricity Market 2019–2025 (williamdennis, updated 11 Mar 2026)."}
        </p>
      </div>
    </div>
  );
}
