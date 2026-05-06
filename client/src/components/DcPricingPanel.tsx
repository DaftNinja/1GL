import { useState, useEffect } from "react";
import { ComposedChart, Line, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import type { DataCentrePricing } from "@shared/dcPricing";

interface MonthlyPrice {
  year: number;
  month: number;
  avgEurMwh: number;
}

interface DcPricingPanelProps {
  country: string;
  gridPriceMwh?: number;
  priceTrendMonthly?: MonthlyPrice[];
}

export function DcPricingPanel({ country, gridPriceMwh, priceTrendMonthly }: DcPricingPanelProps) {
  const [dcPricing, setDcPricing] = useState<DataCentrePricing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/data-centre-sites/dc-pricing/${encodeURIComponent(country)}`);
        if (!res.ok) throw new Error("Failed to fetch DC pricing");
        const data = await res.json();
        setDcPricing(data.available ? data.entries : null);
      } catch (err) {
        console.error("DC pricing fetch error:", err);
        setError(err instanceof Error ? err.message : "Error loading pricing data");
      } finally {
        setLoading(false);
      }
    };

    fetchPricing();
  }, [country]);

  if (loading) {
    return (
      <div className="bg-slate-50 rounded border border-slate-200 p-3 text-xs text-slate-500">
        Loading DC pricing data...
      </div>
    );
  }

  if (error || !dcPricing || dcPricing.length === 0) {
    return null; // Silently hide if no data — grid price trend still visible
  }

  const regionalAvg = dcPricing.find((p) => p.operator === null);
  if (!regionalAvg) return null;

  // Convert DC price from EUR/kWh to EUR/MWh for comparison
  const dcPriceMwh = regionalAvg.pricePerKwh * 1000;
  const gridPriceMwhForCalc = gridPriceMwh || regionalAvg.gridPricePerKwh * 1000;
  const premium = regionalAvg.premiumPercent;

  // Determine premium colour
  const premiumColor =
    premium < 30 ? "text-emerald-600" :
    premium < 60 ? "text-amber-600" :
    "text-red-600";

  const premiumBgColor =
    premium < 30 ? "bg-emerald-50" :
    premium < 60 ? "bg-amber-50" :
    "bg-red-50";

  // Prepare chart data: interleave monthly grid prices with DC band
  const chartData = priceTrendMonthly?.map((p) => ({
    month: `${p.year}-${String(p.month).padStart(2, "0")}`,
    gridPrice: p.avgEurMwh,
    dcMin: dcPriceMwh * 0.95, // ±5% band for provider variation
    dcMax: dcPriceMwh * 1.05,
  })) ?? [];

  // Get operator callouts (exclude the regional average)
  const operatorCallouts = dcPricing.filter((p) => p.operator !== null).slice(0, 3);

  return (
    <div className={`rounded border ${premiumBgColor} p-3 space-y-3`}>
      <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
        <AlertCircle className="w-3.5 h-3.5" /> Electricity Costs
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-slate-500">Grid (ENTSO-E live)</p>
          <p className="text-sm font-mono font-bold text-slate-800">€{gridPriceMwhForCalc.toFixed(0)}/MWh</p>
        </div>
        <div>
          <p className="text-slate-500">Typical DC provider</p>
          <p className="text-sm font-mono font-bold text-slate-800">
            €{regionalAvg.pricePerKwh.toFixed(2)}/kWh<br/>
            <span className="text-xs text-slate-600">({dcPriceMwh.toFixed(0)}/MWh)</span>
          </p>
        </div>
      </div>

      <div className={`rounded p-2 ${premiumColor}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Premium over grid</span>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold">+{premium.toFixed(0)}%</span>
            {premium > 60 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : premium > 30 ? (
              <div className="text-xs">→</div>
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded p-2">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(chartData.length / 6))}
              />
              <YAxis tick={{ fontSize: 10 }} domain="dataMin - 5" />
              <Tooltip
                contentStyle={{ fontSize: "11px", borderRadius: "4px" }}
                formatter={(value: any) => `€${value.toFixed(0)}/MWh`}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              <ReferenceArea
                dataKey="dcMin"
                shape="dcMax"
                fill="#dbeafe"
                fillOpacity={0.3}
                name="DC provider band"
              />
              <Line
                type="monotone"
                dataKey="gridPrice"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={1.5}
                name="Grid price"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-500 mt-1">
            12-month rolling average (EUR/MWh)
          </p>
        </div>
      )}

      <div className="text-[10px] text-slate-600 space-y-1">
        <p>
          <span className="font-semibold">Source:</span> {regionalAvg.source}
        </p>
        <p>
          <span className="font-semibold">Vintage:</span> {regionalAvg.vintage} ·
          <span className={`ml-1 ${regionalAvg.confidence === "high" ? "text-emerald-600" : regionalAvg.confidence === "medium" ? "text-amber-600" : "text-red-600"}`}>
            {regionalAvg.confidence} confidence
          </span>
        </p>

        {operatorCallouts.length > 0 && (
          <div className="pt-1 border-t border-slate-300">
            <p className="font-semibold mb-1">Operator pricing (where published):</p>
            <div className="flex flex-wrap gap-1">
              {operatorCallouts.map((op) => (
                <span
                  key={`${op.operator}-${op.region}`}
                  className="bg-white rounded px-1.5 py-0.5 text-[9px] font-mono"
                >
                  {op.operator}: €{op.pricePerKwh.toFixed(2)}/kWh
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
