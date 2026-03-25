import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const ANNUAL_DATA = [
  { year: "2015", total: 24599, dc: 1238, other: 23361, pct: 5.0 },
  { year: "2016", total: 25355, dc: 1480, other: 23875, pct: 5.8 },
  { year: "2017", total: 25726, dc: 1760, other: 23966, pct: 6.8 },
  { year: "2018", total: 26730, dc: 2180, other: 24550, pct: 8.2 },
  { year: "2019", total: 26504, dc: 2488, other: 24016, pct: 9.4 },
  { year: "2020", total: 27056, dc: 3027, other: 24029, pct: 11.2 },
  { year: "2021", total: 28506, dc: 4010, other: 24496, pct: 14.1 },
  { year: "2022", total: 29825, dc: 5271, other: 24554, pct: 17.7 },
  { year: "2023", total: 30581, dc: 6336, other: 24245, pct: 20.7 },
  { year: "2024", total: 31903, dc: 6969, other: 24934, pct: 21.8 },
];

const QUARTERLY_DATA = [
  { q: "Q1 2015", dc: 290, other: 6275, total: 6565 },
  { q: "Q2 2015", dc: 303, other: 5783, total: 6086 },
  { q: "Q3 2015", dc: 316, other: 5468, total: 5783 },
  { q: "Q4 2015", dc: 329, other: 5837, total: 6165 },
  { q: "Q1 2016", dc: 340, other: 6311, total: 6651 },
  { q: "Q2 2016", dc: 360, other: 6111, total: 6471 },
  { q: "Q3 2016", dc: 385, other: 5541, total: 5926 },
  { q: "Q4 2016", dc: 395, other: 5913, total: 6307 },
  { q: "Q1 2017", dc: 406, other: 6461, total: 6867 },
  { q: "Q2 2017", dc: 433, other: 5996, total: 6429 },
  { q: "Q3 2017", dc: 449, other: 5519, total: 5969 },
  { q: "Q4 2017", dc: 472, other: 5989, total: 6461 },
  { q: "Q1 2018", dc: 490, other: 6607, total: 7097 },
  { q: "Q2 2018", dc: 526, other: 6318, total: 6845 },
  { q: "Q3 2018", dc: 573, other: 5614, total: 6187 },
  { q: "Q4 2018", dc: 591, other: 6011, total: 6601 },
  { q: "Q1 2019", dc: 578, other: 6550, total: 7128 },
  { q: "Q2 2019", dc: 600, other: 5749, total: 6349 },
  { q: "Q3 2019", dc: 638, other: 5662, total: 6299 },
  { q: "Q4 2019", dc: 672, other: 6056, total: 6728 },
  { q: "Q1 2020", dc: 690, other: 6708, total: 7399 },
  { q: "Q2 2020", dc: 721, other: 5708, total: 6429 },
  { q: "Q3 2020", dc: 765, other: 5615, total: 6381 },
  { q: "Q4 2020", dc: 851, other: 5996, total: 6847 },
  { q: "Q1 2021", dc: 921, other: 6426, total: 7347 },
  { q: "Q2 2021", dc: 986, other: 6235, total: 7222 },
  { q: "Q3 2021", dc: 1035, other: 5745, total: 6779 },
  { q: "Q4 2021", dc: 1068, other: 6090, total: 7158 },
  { q: "Q1 2022", dc: 1194, other: 6653, total: 7847 },
  { q: "Q2 2022", dc: 1286, other: 6238, total: 7524 },
  { q: "Q3 2022", dc: 1335, other: 5715, total: 7050 },
  { q: "Q4 2022", dc: 1456, other: 5949, total: 7404 },
  { q: "Q1 2023", dc: 1496, other: 6542, total: 8038 },
  { q: "Q2 2023", dc: 1553, other: 6153, total: 7706 },
  { q: "Q3 2023", dc: 1625, other: 5511, total: 7136 },
  { q: "Q4 2023", dc: 1662, other: 6039, total: 7701 },
  { q: "Q1 2024", dc: 1657, other: 6690, total: 8347 },
  { q: "Q2 2024", dc: 1691, other: 6244, total: 7935 },
  { q: "Q3 2024", dc: 1792, other: 5721, total: 7512 },
  { q: "Q4 2024", dc: 1829, other: 6280, total: 8109 },
];

const CustomTooltipAnnual = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dc = payload.find((p: any) => p.dataKey === "dc");
    const other = payload.find((p: any) => p.dataKey === "other");
    const pct = payload.find((p: any) => p.dataKey === "pct");
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-slate-900 mb-2">{label}</p>
        {dc && (
          <p className="text-blue-600">
            Data Centres: <span className="font-bold">{dc.value.toLocaleString()} GWh</span>
          </p>
        )}
        {other && (
          <p className="text-slate-500">
            Other customers: <span className="font-bold">{other.value.toLocaleString()} GWh</span>
          </p>
        )}
        {pct && (
          <p className="text-amber-600 mt-1 pt-1 border-t border-slate-100">
            DC share: <span className="font-bold">{pct.value}%</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

const CustomTooltipQuarterly = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dc = payload.find((p: any) => p.dataKey === "dc");
    const other = payload.find((p: any) => p.dataKey === "other");
    const total = dc && other ? dc.value + other.value : null;
    const pct = total ? ((dc.value / total) * 100).toFixed(1) : null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-slate-900 mb-2">{label}</p>
        {dc && (
          <p className="text-blue-600">
            Data Centres: <span className="font-bold">{dc.value.toLocaleString()} GWh</span>
          </p>
        )}
        {other && (
          <p className="text-slate-500">
            Other customers: <span className="font-bold">{other.value.toLocaleString()} GWh</span>
          </p>
        )}
        {pct && (
          <p className="text-amber-600 mt-1 pt-1 border-t border-slate-100">
            DC share: <span className="font-bold">{pct}%</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

export default function IrelandDCConsumption() {
  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">2024 DC Consumption</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">6,969 GWh</p>
            <p className="text-xs text-blue-600 mt-0.5">+10.0% vs 2023</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-amber-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">DC Share of Grid</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">21.8%</p>
            <p className="text-xs text-amber-600 mt-0.5">Up from 5.0% in 2015</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-emerald-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">9-Year Growth</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">5.6×</p>
            <p className="text-xs text-emerald-600 mt-0.5">21.2% CAGR 2015–2024</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-slate-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-600 font-medium uppercase tracking-wide">Total Metered 2024</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">31,903 GWh</p>
            <p className="text-xs text-slate-600 mt-0.5">+4.3% vs 2023</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Annual Electricity Consumption: Data Centres vs Rest of Ireland
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">GWh per year with data centre share (%) overlay — 2015 to 2024</p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">Annual</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={ANNUAL_DATA} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="gwh"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                label={{ value: "GWh", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11, fill: "#64748b" } }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 30]}
                label={{ value: "DC share (%)", angle: 90, position: "insideRight", offset: 10, style: { fontSize: 11, fill: "#d97706" } }}
              />
              <Tooltip content={<CustomTooltipAnnual />} />
              <Legend
                formatter={(value) =>
                  value === "dc" ? "Data Centres (GWh)" : value === "other" ? "Other Customers (GWh)" : "DC Share (%)"
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              <ReferenceLine
                yAxisId="gwh"
                x="2021"
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: "CRU moratorium", position: "top", fill: "#ef4444", fontSize: 10 }}
              />
              <Bar yAxisId="gwh" dataKey="other" stackId="a" fill="#e2e8f0" name="Other Customers (GWh)" />
              <Bar yAxisId="gwh" dataKey="dc" stackId="a" fill="#2563eb" name="Data Centres (GWh)" radius={[2, 2, 0, 0]} />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="pct"
                stroke="#d97706"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#d97706" }}
                name="DC Share (%)"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-slate-400 mt-2">
            Source: Central Statistics Office (CSO) Ireland — Metered Electricity Consumption MEC02, March 2026
          </p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Quarterly Data Centre Electricity Consumption
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">GWh per quarter — Q1 2015 to Q4 2024</p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">Quarterly</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={QUARTERLY_DATA} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="q"
                tick={{ fontSize: 10 }}
                interval={3}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${v}`}
                label={{ value: "GWh", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11, fill: "#64748b" } }}
              />
              <Tooltip content={<CustomTooltipQuarterly />} />
              <Legend
                formatter={(value) =>
                  value === "dc" ? "Data Centres (GWh)" : "Other Customers (GWh)"
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="other" stackId="a" fill="#e2e8f0" name="Other Customers (GWh)" />
              <Bar dataKey="dc" stackId="a" fill="#2563eb" name="Data Centres (GWh)" radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-slate-400 mt-2">
            Source: Central Statistics Office (CSO) Ireland — Metered Electricity Consumption MEC02, March 2026
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
