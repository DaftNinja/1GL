import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Zap, Wind, Droplets, TrendingUp, ArrowLeftRight, AlertTriangle } from "lucide-react";

// ── Colour palette ────────────────────────────────────────────────────────────

// ONS plant types vary by year/locale; normalise to English labels + colour
const PLANT_COLOURS: Record<string, string> = {
  // Hydro variants
  "Hidráulica":          "#3b82f6",
  "HIDRÁULICA":          "#3b82f6",
  "Hidro":               "#3b82f6",
  "UHE":                 "#3b82f6",
  "PCH":                 "#60a5fa",
  // Wind
  "Eólica":              "#22c55e",
  "EÓLICA":              "#22c55e",
  "EOL":                 "#22c55e",
  // Solar
  "Solar":               "#facc15",
  "SOLAR":               "#facc15",
  "UFV":                 "#facc15",
  // Thermal / gas
  "Termelétrica":        "#f97316",
  "TERMELÉTRICA":        "#f97316",
  "Gás Natural":         "#f97316",
  "UTE":                 "#f97316",
  // Nuclear
  "Nuclear":             "#8b5cf6",
  "NUCLEAR":             "#8b5cf6",
  "UTN":                 "#8b5cf6",
  // Biomass
  "Biomassa":            "#84cc16",
  "BIOMASSA":            "#84cc16",
  // Import / Other
  "Importação":          "#06b6d4",
  "Outros":              "#94a3b8",
};

const SUBSYSTEM_COLOURS: Record<string, string> = {
  "SE": "#3b82f6",   // Southeast / Centro-Oeste
  "S":  "#22c55e",   // Sul
  "NE": "#f97316",   // Northeast
  "N":  "#8b5cf6",   // North
  "SE/CO": "#3b82f6",
  "Sul":   "#22c55e",
  "Nordeste": "#f97316",
  "Norte":    "#8b5cf6",
};

function plantColour(type: string): string {
  return PLANT_COLOURS[type] ?? "#94a3b8";
}

function subColour(sub: string): string {
  return SUBSYSTEM_COLOURS[sub] ?? "#64748b";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGW(mw: number) {
  if (mw >= 1_000) return `${(mw / 1_000).toFixed(1)} GW`;
  return `${Math.round(mw).toLocaleString()} MW`;
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50 mb-4">
      <CardContent className="p-4 flex items-center gap-2 text-amber-700 text-sm">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        {message}
      </CardContent>
    </Card>
  );
}

type FetchState = { isLoading: boolean; error: unknown; data: any };

function loading(s: FetchState) { return s.isLoading; }
function err(s: FetchState)     { return !!s.error; }

// ── Main component ────────────────────────────────────────────────────────────

export default function BrazilGridChart() {
  const genQ = useQuery<any>({
    queryKey: ["/api/ons/generation"],
    queryFn: () => fetch("/api/ons/generation", { credentials: "include" }).then(r => r.json()),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const capQ = useQuery<any>({
    queryKey: ["/api/ons/capacity"],
    queryFn: () => fetch("/api/ons/capacity", { credentials: "include" }).then(r => r.json()),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const demandQ = useQuery<any>({
    queryKey: ["/api/ons/demand"],
    queryFn: () => fetch("/api/ons/demand", { credentials: "include" }).then(r => r.json()),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const cfQ = useQuery<any>({
    queryKey: ["/api/ons/capacity-factor"],
    queryFn: () => fetch("/api/ons/capacity-factor", { credentials: "include" }).then(r => r.json()),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const intlQ = useQuery<any>({
    queryKey: ["/api/ons/cross-border"],
    queryFn: () => fetch("/api/ons/cross-border", { credentials: "include" }).then(r => r.json()),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const subQ = useQuery<any>({
    queryKey: ["/api/ons/subsystem-exchange"],
    queryFn: () => fetch("/api/ons/subsystem-exchange", { credentials: "include" }).then(r => r.json()),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  // ── Generation mix ───────────────────────────────────────────────────────────
  const byFuelRaw: Record<string, number> = genQ.data?.byFuelType ?? {};
  const totalGenMW = Object.values(byFuelRaw).reduce((a, b) => a + b, 0);
  const genPieData = Object.entries(byFuelRaw)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, mw]) => ({ name: type, value: Math.round(mw) }));

  // Renewable share
  const renewKeys = Object.keys(byFuelRaw).filter(k =>
    /hid|eol|solar|uhe|pch|eólica|solar|ufv/i.test(k)
  );
  const renewMW = renewKeys.reduce((s, k) => s + byFuelRaw[k], 0);
  const renewPct = pct(renewMW, totalGenMW);

  // ── Installed capacity ───────────────────────────────────────────────────────
  const byType: Record<string, number> = capQ.data?.byPlantType ?? {};
  const totalCapMW = capQ.data?.totalMW ?? 0;
  const capBarData = Object.entries(byType)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, mw]) => ({ type, mw: Math.round(mw) }));

  // ── Demand by subsystem ──────────────────────────────────────────────────────
  const demandBySub: Record<string, number> = demandQ.data?.latestBySubsystem ?? {};
  const demandBarData = Object.entries(demandBySub)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([sub, gwh]) => ({ sub, gwh: Math.round(gwh * 10) / 10 }));
  const totalDemandGWh = Object.values(demandBySub).reduce((a, b) => a + b, 0);

  // ── Capacity factors ─────────────────────────────────────────────────────────
  const cfByType: Record<string, number> = cfQ.data?.latestByType ?? {};
  const cfBarData = Object.entries(cfByType)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, factor]) => ({
      type,
      pct: Math.round(factor * 100),
    }));

  // ── International exchange ────────────────────────────────────────────────────
  const intlByCountry: Record<string, number> = intlQ.data?.latestByCountry ?? {};
  const intlData = Object.entries(intlByCountry)
    .filter(([country]) => country.trim())
    .map(([country, mwh]) => ({
      country,
      mwh: Math.round(mwh),
      dir: mwh >= 0 ? "Export" : "Import",
    }));

  // ── Subsystem flows ──────────────────────────────────────────────────────────
  const latestFlows: Array<{ from: string; to: string; valueMWh: number }> =
    subQ.data?.latestFlows ?? [];

  return (
    <div className="space-y-6 mb-8">

      {/* ── Summary metrics ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-none shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50">
                <Droplets className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Renewables Share</p>
                <p className="text-xl font-bold text-slate-900">
                  {loading(genQ) ? "—" : totalGenMW > 0 ? `${renewPct}%` : "No data"}
                </p>
                <p className="text-xs text-slate-400">of active generation</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-50">
                <Zap className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Installed Capacity</p>
                <p className="text-xl font-bold text-slate-900">
                  {loading(capQ) ? "—" : totalCapMW > 0 ? fmtGW(totalCapMW) : "No data"}
                </p>
                <p className="text-xs text-slate-400">SIN · {capQ.data?.latestDate ?? ""}</p>
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
                <p className="text-xs text-slate-500 uppercase tracking-wide">Daily Demand</p>
                <p className="text-xl font-bold text-slate-900">
                  {loading(demandQ) ? "—" : totalDemandGWh > 0 ? `${Math.round(totalDemandGWh).toLocaleString()} GWh` : "No data"}
                </p>
                <p className="text-xs text-slate-400">{demandQ.data?.latestDate ?? ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Generation mix (pie) ──────────────────────────────────────────────── */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-slate-500" />
              Generation Mix — SIN
            </CardTitle>
            {genQ.data?.latestDate && (
              <Badge variant="outline" className="text-xs font-normal">{genQ.data.latestDate}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {loading(genQ) && (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Loading ONS generation data…</div>
          )}
          {err(genQ) && <ErrorCard message="Could not load generation data from ONS." />}
          {!loading(genQ) && !err(genQ) && genPieData.length === 0 && (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No generation data available.</div>
          )}
          {!loading(genQ) && genPieData.length > 0 && (
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={genPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    innerRadius={55}
                    paddingAngle={2}
                    label={({ name, percent }) =>
                      percent > 0.04 ? `${Math.round(percent * 100)}%` : ""
                    }
                    labelLine={false}
                  >
                    {genPieData.map((entry) => (
                      <Cell key={entry.name} fill={plantColour(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtGW(v), name]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Installed capacity by type ─────────────────────────────────────────── */}
      <Card className="border-none shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Wind className="w-4 h-4 text-slate-500" />
              Installed Capacity by Source
            </CardTitle>
            {capQ.data?.latestDate && (
              <Badge variant="outline" className="text-xs font-normal">{capQ.data.latestDate}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {loading(capQ) && (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Loading capacity data…</div>
          )}
          {err(capQ) && <ErrorCard message="Could not load installed capacity from ONS." />}
          {!loading(capQ) && !err(capQ) && capBarData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={capBarData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtGW(v)} tick={{ fontSize: 11 }} />
                <YAxis dataKey="type" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => [fmtGW(v), "Installed"]} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="mw" radius={[0, 4, 4, 0]}>
                  {capBarData.map((entry) => (
                    <Cell key={entry.type} fill={plantColour(entry.type)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Demand by subsystem + Capacity factors ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Demand */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-slate-500" />
                Energy Demand by Subsystem
              </CardTitle>
              {demandQ.data?.latestDate && (
                <Badge variant="outline" className="text-xs font-normal">{demandQ.data.latestDate}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {loading(demandQ) && (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            )}
            {err(demandQ) && <ErrorCard message="Could not load demand data from ONS." />}
            {!loading(demandQ) && !err(demandQ) && demandBarData.length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={demandBarData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="sub" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v} GWh`} tick={{ fontSize: 11 }} width={52} />
                  <Tooltip formatter={(v: number) => [`${v} GWh`, "Demand"]} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="gwh" radius={[4, 4, 0, 0]}>
                    {demandBarData.map((entry) => (
                      <Cell key={entry.sub} fill={subColour(entry.sub)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Capacity factors */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Wind className="w-4 h-4 text-slate-500" />
                Wind & Solar Capacity Factors
              </CardTitle>
              {cfQ.data?.latestDate && (
                <Badge variant="outline" className="text-xs font-normal">{cfQ.data.latestDate}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {loading(cfQ) && (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            )}
            {err(cfQ) && <ErrorCard message="Could not load capacity factor data from ONS." />}
            {!loading(cfQ) && !err(cfQ) && cfBarData.length === 0 && (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No capacity factor data available.</div>
            )}
            {!loading(cfQ) && cfBarData.length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={cfBarData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={36} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Capacity Factor"]} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {cfBarData.map((entry) => (
                      <Cell key={entry.type} fill={plantColour(entry.type)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── International exchange ────────────────────────────────────────────── */}
      {(intlData.length > 0 || loading(intlQ)) && (
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-slate-500" />
                International Energy Exchange
              </CardTitle>
              {intlQ.data?.latestDate && (
                <Badge variant="outline" className="text-xs font-normal">{intlQ.data.latestDate}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {loading(intlQ) && (
              <div className="h-24 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            )}
            {!loading(intlQ) && intlData.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {intlData.map(({ country, mwh, dir }) => (
                  <div
                    key={country}
                    className={`flex-1 min-w-[120px] rounded-xl p-4 text-white text-center ${mwh >= 0 ? "bg-blue-600" : "bg-orange-600"}`}
                  >
                    <p className="text-xs uppercase tracking-wide opacity-80 mb-1">{country}</p>
                    <p className="text-lg font-bold">{Math.abs(mwh).toLocaleString()} MWh</p>
                    <p className="text-xs opacity-70 mt-0.5">{dir}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Subsystem flows ───────────────────────────────────────────────────── */}
      {(latestFlows.length > 0 || loading(subQ)) && (
        <Card className="border-none shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-slate-500" />
              Subsystem Energy Flows
              {subQ.data?.latestInstant && (
                <Badge variant="outline" className="text-xs font-normal ml-2">{subQ.data.latestInstant}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {loading(subQ) && (
              <div className="h-24 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            )}
            {!loading(subQ) && latestFlows.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {latestFlows
                  .filter(f => f.from && f.to && f.valueMWh !== 0)
                  .map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
                      <span className="font-semibold text-slate-700">{f.from}</span>
                      <ArrowLeftRight className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-700">{f.to}</span>
                      <span className="ml-2 text-slate-500">{Math.round(f.valueMWh).toLocaleString()} MWh</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-400 text-right">
        Source: ONS — Operador Nacional do Sistema Elétrico · dados.ons.org.br
      </p>
    </div>
  );
}
