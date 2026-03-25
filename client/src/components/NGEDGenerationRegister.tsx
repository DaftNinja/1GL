import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Zap, AlertTriangle, Search } from "lucide-react";

interface NGEDGenerator {
  id: string;
  generatorName: string;
  siteName: string;
  gsp: string;
  voltage: string;
  licenceArea: string;
  technology: string;
  installedCapacityMW: number;
  connectionStatus: string;
  exportCapacityMW: number | null;
}

interface NGEDGenerationRegisterResult {
  generators: NGEDGenerator[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    totalCapacityMW: number;
    byStatus: Record<string, { count: number; capacityMW: number }>;
    byTechnology: Record<string, { count: number; capacityMW: number }>;
    byLicenceArea: Record<string, { count: number; capacityMW: number }>;
  };
}

const STATUS_COLORS: Record<string, string> = {
  Connected: "#10B981",
  Accepted: "#3B82F6",
  Offered: "#F59E0B",
  Enquired: "#94A3B8",
  Unknown: "#CBD5E1",
};

const TECH_COLORS: Record<string, string> = {
  "Solar PV": "#F59E0B",
  Wind: "#2196F3",
  BESS: "#1565C0",
  Gas: "#F97316",
  Hydro: "#06B6D4",
  Biomass: "#10B981",
  CHP: "#8B5CF6",
  Waste: "#84CC16",
  "Diesel/Oil": "#92400E",
  Nuclear: "#A855F7",
  Other: "#CBD5E1",
};

function formatMW(mw: number): string {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${mw.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW`;
}

export function NGEDGenerationRegister() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [techFilter, setTechFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");

  const { data, isLoading, error } = useQuery<NGEDGenerationRegisterResult>({
    queryKey: ["/api/nged/generation-register"],
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });

  const statuses = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.summary.byStatus).sort();
  }, [data]);

  const technologies = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.summary.byTechnology)
      .sort(([, a], [, b]) => b.capacityMW - a.capacityMW)
      .map(([t]) => t);
  }, [data]);

  const areas = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.summary.byLicenceArea).sort();
  }, [data]);

  const filteredGenerators = useMemo(() => {
    if (!data) return [];
    return data.generators.filter((g) => {
      if (statusFilter !== "all" && g.connectionStatus !== statusFilter) return false;
      if (techFilter !== "all" && g.technology !== techFilter) return false;
      if (areaFilter !== "all" && g.licenceArea !== areaFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          g.generatorName.toLowerCase().includes(q) ||
          g.siteName.toLowerCase().includes(q) ||
          g.licenceArea.toLowerCase().includes(q) ||
          g.technology.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, statusFilter, techFilter, areaFilter, searchTerm]);

  const sortedGenerators = useMemo(() => {
    return [...filteredGenerators].sort((a, b) => b.installedCapacityMW - a.installedCapacityMW);
  }, [filteredGenerators]);

  const displayGenerators = sortedGenerators.slice(0, 100);

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-nged-gcr-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Unable to load NGED Generation Capacity Register data.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-nged-generation-register">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <CardTitle className="text-lg">NGED Generation Capacity Register</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: National Grid Electricity Distribution — Midlands, South West & South Wales
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-pink-500 mr-2" />
            <span className="text-sm text-slate-500">Loading NGED Generation Register...</span>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-pink-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Total Generators</p>
                <p className="text-sm font-bold text-pink-700" data-testid="text-nged-total-generators">
                  {data.totalCount.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Total Capacity</p>
                <p className="text-sm font-bold text-purple-700" data-testid="text-nged-total-capacity">
                  {formatMW(data.summary.totalCapacityMW)}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Connected</p>
                <p className="text-sm font-bold text-green-700" data-testid="text-nged-connected">
                  {formatMW(data.summary.byStatus["Connected"]?.capacityMW ?? 0)}
                </p>
                <p className="text-xs text-green-500 mt-0.5">
                  {(data.summary.byStatus["Connected"]?.count ?? 0).toLocaleString()} projects
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-1">Accepted / Offered</p>
                <p className="text-sm font-bold text-blue-700" data-testid="text-nged-pipeline">
                  {formatMW(
                    (data.summary.byStatus["Accepted"]?.capacityMW ?? 0) +
                    (data.summary.byStatus["Offered"]?.capacityMW ?? 0)
                  )}
                </p>
                <p className="text-xs text-blue-500 mt-0.5">
                  {(
                    (data.summary.byStatus["Accepted"]?.count ?? 0) +
                    (data.summary.byStatus["Offered"]?.count ?? 0)
                  ).toLocaleString()}{" "}
                  projects
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">By Technology</p>
                <div className="space-y-1.5">
                  {Object.entries(data.summary.byTechnology)
                    .sort(([, a], [, b]) => b.capacityMW - a.capacityMW)
                    .slice(0, 10)
                    .map(([tech, info]) => (
                      <div key={tech} className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: TECH_COLORS[tech] ?? "#CBD5E1" }}
                        />
                        <span className="text-xs text-slate-600 flex-1">{tech}</span>
                        <span className="text-xs font-semibold text-slate-700">{formatMW(Math.round(info.capacityMW))}</span>
                        <span className="text-[10px] text-slate-400">{info.count}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">By Licence Area</p>
                <div className="space-y-1.5">
                  {Object.entries(data.summary.byLicenceArea)
                    .sort(([, a], [, b]) => b.capacityMW - a.capacityMW)
                    .map(([area, info]) => (
                      <div key={area} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 flex-1">{area}</span>
                        <span className="text-xs font-semibold text-slate-700">{formatMW(Math.round(info.capacityMW))}</span>
                        <span className="text-[10px] text-slate-400">{info.count} projects</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search generators..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs"
                  data-testid="input-nged-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-nged-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={techFilter} onValueChange={setTechFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-nged-technology">
                  <SelectValue placeholder="Technology" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technologies</SelectItem>
                  {technologies.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-nged-area">
                  <SelectValue placeholder="Area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-slate-400 mb-2">
              Showing {displayGenerators.length} of {filteredGenerators.length} generators
              {filteredGenerators.length !== data.totalCount && ` (filtered from ${data.totalCount.toLocaleString()})`}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-nged-generators">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600">BSP</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600">GSP</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600">Primary</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600">kV</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600">Area</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600">Technology</th>
                    <th className="text-right py-2 pr-3 font-semibold text-slate-600">Capacity</th>
                    <th className="text-left py-2 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayGenerators.map((g) => (
                    <tr key={g.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-1.5 pr-3 text-slate-800 max-w-[160px] truncate" title={g.generatorName}>
                        {g.generatorName}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600 max-w-[140px] truncate" title={g.gsp}>
                        {g.gsp || "–"}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600 max-w-[120px] truncate" title={g.siteName}>
                        {g.siteName || "–"}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{g.voltage || "–"}</td>
                      <td className="py-1.5 pr-3 text-slate-600 max-w-[100px] truncate">{g.licenceArea}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                          style={{ backgroundColor: TECH_COLORS[g.technology] ?? "#CBD5E1" }}
                        >
                          {g.technology}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-pink-700">
                        {formatMW(g.installedCapacityMW)}
                      </td>
                      <td className="py-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: `${STATUS_COLORS[g.connectionStatus] ?? "#CBD5E1"}20`,
                            color: STATUS_COLORS[g.connectionStatus] ?? "#64748B",
                            border: `1px solid ${STATUS_COLORS[g.connectionStatus] ?? "#CBD5E1"}40`,
                          }}
                        >
                          {g.connectionStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-slate-600 mt-4 space-y-1.5">
              <p>
                <span className="font-semibold">Capacity methodology:</span> Figures show registered peak export capacity in MW (not annual energy). Each row is a substation-level generation connection, grouped by BSP (Bulk Supply Point) and technology. The displayed capacity is the sum of all pipeline stages — Connected + Accepted + Offered + Enquired — converted from kVA to MW. Total Capacity (52 GW) therefore includes speculative pipeline projects, not just operational plant.
              </p>
              <p>
                <span className="font-semibold">To be confirmed generators:</span> Where technology is "To be confirmed", the BSP and GSP columns identify the substation connection point. Most TBC entries have real network locations and kV levels — use these to cross-reference NGED's network capacity maps for headroom.
              </p>
              <p>
                <span className="font-semibold">Data Centre Insight:</span> The NGED register covers the Midlands, South West England, and South Wales. Sites with high nearby renewable capacity (solar, wind) near substations with available demand headroom present strong co-location opportunities for data centre developments seeking green power supply.
              </p>
            </div>

            {data.fetchedAt && (
              <p className="text-xs text-slate-400 mt-2 text-right">
                Updated: {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">No NGED generation data available.</p>
        )}
        <p className="text-xs text-slate-400 text-center mt-3">
          Supported by National Grid Electricity Distribution Connected Data Portal
        </p>
      </CardContent>
    </Card>
  );
}
