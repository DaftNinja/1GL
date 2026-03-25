import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import { TrendingDown, Wind, Zap, Waves, ExternalLink, Database } from "lucide-react";

interface TechCostRecord {
  year: number;
  capex_eur_per_mw: number;
  fixed_opex_eur_per_mw_yr: number;
  lifetime_years: number | null;
  source: string;
  version: string;
}

interface WindExpansionRecord {
  region: string;
  installed_mw: number;
  expansion_limit_mw: number;
  year: number;
  version: string;
}

interface OEPBenchmarks {
  onshoreWind: TechCostRecord[];
  offshoreWind: TechCostRecord[];
  offshoreExpansion: WindExpansionRecord[];
  onshoreExpansionByState: WindExpansionRecord[];
  fetchedAt: string;
}

const SHOW_YEARS = [2016, 2030, 2050];
const ONSHORE_COLOR = "#2563eb";
const OFFSHORE_COLOR = "#0ea5e9";

function buildCapexChartData(onshore: TechCostRecord[], offshore: TechCostRecord[]) {
  const onshoreByYear = Object.fromEntries(onshore.map(r => [r.year, r]));
  const offshoreByYear = Object.fromEntries(offshore.map(r => [r.year, r]));
  return SHOW_YEARS.map(yr => ({
    year: String(yr),
    "Onshore Wind": onshoreByYear[yr] ? Math.round(onshoreByYear[yr].capex_eur_per_mw / 1000) : null,
    "Offshore Wind": offshoreByYear[yr] ? Math.round(offshoreByYear[yr].capex_eur_per_mw / 1000) : null,
  }));
}

function buildOpexChartData(onshore: TechCostRecord[], offshore: TechCostRecord[]) {
  const onshoreByYear = Object.fromEntries(onshore.map(r => [r.year, r]));
  const offshoreByYear = Object.fromEntries(offshore.map(r => [r.year, r]));
  return SHOW_YEARS.map(yr => ({
    year: String(yr),
    "Onshore Wind": onshoreByYear[yr] ? Math.round(onshoreByYear[yr].fixed_opex_eur_per_mw_yr / 1000) : null,
    "Offshore Wind": offshoreByYear[yr] ? Math.round(offshoreByYear[yr].fixed_opex_eur_per_mw_yr / 1000) : null,
  }));
}

function capexDecline(records: TechCostRecord[], fromYear: number, toYear: number): string {
  const from = records.find(r => r.year === fromYear);
  const to = records.find(r => r.year === toYear);
  if (!from || !to) return "–";
  const pct = ((from.capex_eur_per_mw - to.capex_eur_per_mw) / from.capex_eur_per_mw * 100).toFixed(0);
  return `−${pct}%`;
}

const CustomTooltip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full" style={{ background: p.fill }} />
          <span className="text-gray-600 dark:text-gray-300">{p.name}:</span>
          <span className="font-medium text-gray-800 dark:text-gray-100">
            €{p.value}{unit}
          </span>
        </div>
      ))}
    </div>
  );
};

interface Props {
  showExpansion?: boolean;
}

export default function OEPBenchmarkChart({ showExpansion = false }: Props) {
  const { data, isLoading, error } = useQuery<OEPBenchmarks>({
    queryKey: ["/api/oep/benchmarks"],
    retry: 2,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const isStaticFallback = data?.fetchedAt === "static-fallback";

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map(i => (
          <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">OEP benchmark data unavailable</p>
      </div>
    );
  }

  const capexData = buildCapexChartData(data.onshoreWind, data.offshoreWind);
  const opexData = buildOpexChartData(data.onshoreWind, data.offshoreWind);

  const onshore2030 = data.onshoreWind.find(r => r.year === 2030);
  const offshore2030 = data.offshoreWind.find(r => r.year === 2030);
  const northSea = data.offshoreExpansion.find(r => r.region === "North");
  const baltic = data.offshoreExpansion.find(r => r.region === "Baltic");
  const totalExpansion = data.offshoreExpansion.reduce((s, r) => s + r.expansion_limit_mw, 0);
  const totalInstalled = data.offshoreExpansion.reduce((s, r) => s + r.installed_mw, 0);

  const onshoreDecline = capexDecline(data.onshoreWind, 2016, 2030);
  const offshoreDecline = capexDecline(data.offshoreWind, 2016, 2030);

  return (
    <div className="space-y-6" data-testid="oep-benchmark-chart">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wind className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Onshore CAPEX 2030</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100" data-testid="text-onshore-capex-2030">
              €{onshore2030 ? (onshore2030.capex_eur_per_mw / 1000).toFixed(0) : "–"}k
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">per MW installed</p>
          </CardContent>
        </Card>

        <Card className="bg-cyan-50 dark:bg-cyan-950/40 border-cyan-100 dark:border-cyan-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Waves className="w-4 h-4 text-cyan-600" />
              <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">Offshore CAPEX 2030</span>
            </div>
            <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-100" data-testid="text-offshore-capex-2030">
              €{offshore2030 ? (offshore2030.capex_eur_per_mw / 1000).toFixed(0) : "–"}k
            </p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">per MW installed</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-950/40 border-green-100 dark:border-green-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wide">Onshore CAPEX fall</span>
            </div>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100" data-testid="text-onshore-decline">
              {onshoreDecline}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">2016 → 2030</p>
          </CardContent>
        </Card>

        <Card className="bg-teal-50 dark:bg-teal-950/40 border-teal-100 dark:border-teal-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-medium text-teal-700 dark:text-teal-300 uppercase tracking-wide">Offshore CAPEX fall</span>
            </div>
            <p className="text-2xl font-bold text-teal-900 dark:text-teal-100" data-testid="text-offshore-decline">
              {offshoreDecline}
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">2016 → 2030</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Capital Expenditure (€k/MW installed)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={capexData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${v}k`} width={56} />
                <Tooltip content={<CustomTooltip unit="k/MW" />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="Onshore Wind" fill={ONSHORE_COLOR} radius={[3, 3, 0, 0]} data-testid="bar-onshore-capex" />
                <Bar dataKey="Offshore Wind" fill={OFFSHORE_COLOR} radius={[3, 3, 0, 0]} data-testid="bar-offshore-capex" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Fixed Operating Expenditure (€k/MW/yr)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={opexData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${v}k`} width={56} />
                <Tooltip content={<CustomTooltip unit="k/MW/yr" />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="Onshore Wind" fill={ONSHORE_COLOR} radius={[3, 3, 0, 0]} data-testid="bar-onshore-opex" />
                <Bar dataKey="Offshore Wind" fill={OFFSHORE_COLOR} radius={[3, 3, 0, 0]} data-testid="bar-offshore-opex" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {showExpansion && (northSea || baltic) && (
        <Card className="border-blue-100 dark:border-blue-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Waves className="w-4 h-4 text-blue-500" />
                Germany Offshore Wind — 2050 Expansion Potential (Siala 2020 Model)
              </CardTitle>
              <Badge variant="outline" className="text-xs">MODEX v12</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-3">
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3" data-testid="stat-north-sea-expansion">
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">North Sea Zone</p>
                  <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                    {northSea ? (northSea.expansion_limit_mw / 1000).toFixed(1) : "–"} GW
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    2050 limit vs {northSea ? (northSea.installed_mw / 1000).toFixed(1) : "–"} GW today
                  </p>
                  <div className="mt-2 bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${northSea ? (northSea.installed_mw / northSea.expansion_limit_mw * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {northSea ? ((northSea.installed_mw / northSea.expansion_limit_mw) * 100).toFixed(1) : 0}% of 2050 potential built
                  </p>
                </div>

                <div className="bg-cyan-50 dark:bg-cyan-950/30 rounded-lg p-3" data-testid="stat-baltic-expansion">
                  <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 uppercase tracking-wide mb-1">Baltic Sea Zone</p>
                  <p className="text-xl font-bold text-cyan-900 dark:text-cyan-100">
                    {baltic ? (baltic.expansion_limit_mw / 1000).toFixed(1) : "–"} GW
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    2050 limit vs {baltic ? (baltic.installed_mw / 1000).toFixed(1) : "–"} GW today
                  </p>
                  <div className="mt-2 bg-cyan-200 dark:bg-cyan-800 rounded-full h-2">
                    <div
                      className="bg-cyan-600 h-2 rounded-full"
                      style={{ width: `${baltic ? (baltic.installed_mw / baltic.expansion_limit_mw * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {baltic ? ((baltic.installed_mw / baltic.expansion_limit_mw) * 100).toFixed(1) : 0}% of 2050 potential built
                  </p>
                </div>
              </div>

              <div className="md:col-span-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">DC Investment Context</p>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p>
                      Germany's total offshore potential of{" "}
                      <span className="font-semibold">{(totalExpansion / 1000).toFixed(1)} GW</span>{" "}
                      represents a <span className="font-semibold">{Math.round(totalExpansion / totalInstalled)}×</span> expansion headroom
                      above the current {(totalInstalled / 1000).toFixed(1)} GW installed.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <TrendingDown className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p>
                      Offshore CAPEX is projected to fall from €2,714k/MW (2016) to{" "}
                      <span className="font-semibold">€1,780k/MW by 2050</span> — making long-duration offshore PPAs
                      increasingly competitive for DC operators.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Wind className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p>
                      Germany's 2030 offshore target is 30 GW and 2050 target is 70 GW — both comfortably within the
                      model's {(totalExpansion / 1000).toFixed(1)} GW expansion ceiling, supporting long-term PPA viability.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-3">
        <Database className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          Source: Open Energy Platform (OEP) — MODEX Benchmark Dataset v12/v13. Technology cost parameters from
          Danish Energy Agency (DEA) 2020. German expansion potential from Siala 2020 energy system model.
          {isStaticFallback && " · Displaying verified static values (OEP API temporarily unavailable)."}
        </span>
        <a
          href="https://openenergyplatform.org/dataedit/view/model_draft/modex_tech_wind_turbine_onshore"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-blue-400 hover:text-blue-600"
          data-testid="link-oep-source"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
