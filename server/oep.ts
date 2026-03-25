/**
 * Open Energy Platform (OEP) MODEX Technology Benchmark Client
 *
 * Fetches technology cost parameters (CAPEX, fixed OPEX, lifetime) and
 * renewable expansion potential data from the OEP MODEX benchmark dataset.
 * Source: Danish Energy Agency (DEA) 2020 projections via MODEX model benchmark.
 *
 * API: https://openenergyplatform.org/api/v0/schema/{schema}/tables/{table}/rows/
 */

const OEP_BASE = "https://openenergyplatform.org/api/v0/schema/model_draft/tables";
const OEP_API_KEY = process.env.OEP_API_KEY ?? "";

const OEP_HEADERS: Record<string, string> = OEP_API_KEY
  ? { Authorization: `Token ${OEP_API_KEY}` }
  : {};

export interface TechCostRecord {
  year: number;
  capex_eur_per_mw: number;
  fixed_opex_eur_per_mw_yr: number;
  lifetime_years: number | null;
  source: string;
  version: string;
}

export interface WindExpansionRecord {
  region: string;
  installed_mw: number;
  expansion_limit_mw: number;
  year: number;
  version: string;
}

export interface OEPBenchmarks {
  onshoreWind: TechCostRecord[];
  offshoreWind: TechCostRecord[];
  offshoreExpansion: WindExpansionRecord[];
  onshoreExpansionByState: WindExpansionRecord[];
  fetchedAt: string;
}

let _cache: OEPBenchmarks | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Static fallback — DEA 2020 values from MODEX v12, verified 2026-03-19.
// Used when the OEP API is temporarily unavailable.
const STATIC_FALLBACK: OEPBenchmarks = {
  onshoreWind: [
    { year: 2016, capex_eur_per_mw: 1_288_000, fixed_opex_eur_per_mw_yr: 23_280, lifetime_years: 25.4, source: "DEA2020", version: "v12" },
    { year: 2030, capex_eur_per_mw: 1_040_000, fixed_opex_eur_per_mw_yr: 12_600, lifetime_years: 30,   source: "DEA2020", version: "v12" },
    { year: 2050, capex_eur_per_mw:   960_000, fixed_opex_eur_per_mw_yr: 11_340, lifetime_years: 30,   source: "DEA2020", version: "v12" },
  ],
  offshoreWind: [
    { year: 2016, capex_eur_per_mw: 2_714_000, fixed_opex_eur_per_mw_yr: 53_852, lifetime_years: 25.4, source: "DEA2020", version: "v12" },
    { year: 2030, capex_eur_per_mw: 1_930_000, fixed_opex_eur_per_mw_yr: 36_053, lifetime_years: 30,   source: "DEA2020", version: "v12" },
    { year: 2050, capex_eur_per_mw: 1_780_000, fixed_opex_eur_per_mw_yr: 32_448, lifetime_years: 30,   source: "DEA2020", version: "v12" },
  ],
  offshoreExpansion: [
    { region: "North",  installed_mw: 8_088, expansion_limit_mw: 56_792, year: 2050, version: "v12" },
    { region: "Baltic", installed_mw: 1_566, expansion_limit_mw: 16_665, year: 2050, version: "v12" },
  ],
  onshoreExpansionByState: [],
  fetchedAt: "static-fallback",
};

async function fetchRows(table: string, limit = 300): Promise<any[]> {
  const url = `${OEP_BASE}/${table}/rows/?limit=${limit}`;
  const resp = await fetch(url, { headers: OEP_HEADERS });
  if (!resp.ok) {
    throw new Error(`OEP fetch failed for ${table}: ${resp.status}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data)) {
    throw new Error(`OEP unexpected response for ${table}: ${JSON.stringify(data).slice(0, 100)}`);
  }
  return data;
}

function parseCostRecords(rows: any[]): TechCostRecord[] {
  const results: TechCostRecord[] = [];
  for (const r of rows) {
    if (!r.capital_costs || !r.year) continue;
    const srcObj = r.source ?? {};
    const src = typeof srcObj === "object" ? (srcObj.capital_costs ?? "") : String(srcObj);
    results.push({
      year: r.year,
      capex_eur_per_mw: r.capital_costs,
      fixed_opex_eur_per_mw_yr: r.fixed_costs ?? 0,
      lifetime_years: r.lifetime ?? null,
      source: src,
      version: r.version ?? "",
    });
  }
  results.sort((a, b) => a.year - b.year);
  return results;
}

function dedupeByYearVersion(records: TechCostRecord[]): TechCostRecord[] {
  const seen = new Set<string>();
  return records.filter(r => {
    const key = `${r.year}|${r.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseExpansionRecords(rows: any[], allowedRegions?: Set<string>): WindExpansionRecord[] {
  const results: WindExpansionRecord[] = [];
  for (const r of rows) {
    const regions: string[] = Array.isArray(r.region) ? r.region : [];
    if (regions.length !== 1) continue;
    const region = regions[0];
    if (allowedRegions && !allowedRegions.has(region)) continue;
    if (!r.installed_capacity && !r.expansion_limit) continue;
    results.push({
      region,
      installed_mw: r.installed_capacity ?? 0,
      expansion_limit_mw: r.expansion_limit ?? 0,
      year: r.year,
      version: r.version ?? "",
    });
  }
  return results;
}

const GERMAN_STATES = new Set([
  "BB","BE","BW","BY","HB","HE","HH","MV","NI","NW","RP","SH","SL","SN","ST","TH"
]);
const OFFSHORE_REGIONS = new Set(["North", "Baltic"]);

export async function getOEPBenchmarks(): Promise<OEPBenchmarks> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache;

  let onshoreRows: any[], offshoreRows: any[];
  try {
    [onshoreRows, offshoreRows] = await Promise.all([
      fetchRows("modex_tech_wind_turbine_onshore", 300),
      fetchRows("modex_tech_wind_turbine_offshore", 200),
    ]);
  } catch (err) {
    console.warn("OEP API unavailable, using static fallback:", err);
    return STATIC_FALLBACK;
  }

  const onshoreWind = dedupeByYearVersion(parseCostRecords(onshoreRows));
  const offshoreWind = dedupeByYearVersion(parseCostRecords(offshoreRows));

  const offshoreExpansion = parseExpansionRecords(
    offshoreRows.filter(r => r.version === "v12"),
    OFFSHORE_REGIONS
  );

  const onshoreExpansionByState = parseExpansionRecords(
    onshoreRows.filter(r => r.version === "v12"),
    GERMAN_STATES
  );

  _cache = {
    onshoreWind,
    offshoreWind,
    offshoreExpansion,
    onshoreExpansionByState,
    fetchedAt: new Date().toISOString(),
  };
  _cacheTs = Date.now();
  return _cache;
}

export function summariseForPrompt(benchmarks: OEPBenchmarks): string {
  const onshore2016 = benchmarks.onshoreWind.find(r => r.year === 2016);
  const onshore2030 = benchmarks.onshoreWind.find(r => r.year === 2030);
  const onshore2050 = benchmarks.onshoreWind.find(r => r.year === 2050);
  const offshore2016 = benchmarks.offshoreWind.find(r => r.year === 2016);
  const offshore2030 = benchmarks.offshoreWind.find(r => r.year === 2030);
  const offshore2050 = benchmarks.offshoreWind.find(r => r.year === 2050);

  const totalOffshoreExpansion = benchmarks.offshoreExpansion
    .reduce((s, r) => s + r.expansion_limit_mw, 0);
  const totalOffshoreInstalled = benchmarks.offshoreExpansion
    .reduce((s, r) => s + r.installed_mw, 0);
  const northSea = benchmarks.offshoreExpansion.find(r => r.region === "North");
  const baltic = benchmarks.offshoreExpansion.find(r => r.region === "Baltic");

  const stateTotal2050 = benchmarks.onshoreExpansionByState
    .reduce((acc, r) => {
      const k = r.region;
      if (!acc[k]) acc[k] = { region: k, installed: 0, expansion: 0 };
      acc[k].installed += r.installed_mw;
      acc[k].expansion += r.expansion_limit_mw;
      return acc;
    }, {} as Record<string, { region: string; installed: number; expansion: number }>);

  const topStates = Object.values(stateTotal2050)
    .sort((a, b) => b.expansion - a.expansion)
    .slice(0, 5);

  return `MODEX TECHNOLOGY COST BENCHMARKS — OEP (Open Energy Platform), DEA 2020:
Onshore Wind (per MW of installed capacity):
  2016: CAPEX €${(onshore2016?.capex_eur_per_mw ?? 0) / 1000}k/MW, Fixed OPEX €${(onshore2016?.fixed_opex_eur_per_mw_yr ?? 0).toFixed(0)}/MW/yr, Lifetime ${onshore2016?.lifetime_years}y
  2030: CAPEX €${(onshore2030?.capex_eur_per_mw ?? 0) / 1000}k/MW, Fixed OPEX €${(onshore2030?.fixed_opex_eur_per_mw_yr ?? 0).toFixed(0)}/MW/yr, Lifetime ${onshore2030?.lifetime_years}y
  2050: CAPEX €${(onshore2050?.capex_eur_per_mw ?? 0) / 1000}k/MW, Fixed OPEX €${(onshore2050?.fixed_opex_eur_per_mw_yr ?? 0).toFixed(0)}/MW/yr, Lifetime ${onshore2050?.lifetime_years}y
Offshore Wind (per MW installed):
  2016: CAPEX €${(offshore2016?.capex_eur_per_mw ?? 0) / 1000}k/MW, Fixed OPEX €${(offshore2016?.fixed_opex_eur_per_mw_yr ?? 0).toFixed(0)}/MW/yr, Lifetime ${offshore2016?.lifetime_years}y
  2030: CAPEX €${(offshore2030?.capex_eur_per_mw ?? 0) / 1000}k/MW, Fixed OPEX €${(offshore2030?.fixed_opex_eur_per_mw_yr ?? 0).toFixed(0)}/MW/yr, Lifetime ${offshore2030?.lifetime_years}y
  2050: CAPEX €${(offshore2050?.capex_eur_per_mw ?? 0) / 1000}k/MW, Fixed OPEX €${(offshore2050?.fixed_opex_eur_per_mw_yr ?? 0).toFixed(0)}/MW/yr, Lifetime ${offshore2050?.lifetime_years}y
Key observation: Offshore CAPEX declining ${(((offshore2016?.capex_eur_per_mw ?? 0) - (offshore2030?.capex_eur_per_mw ?? 0)) / (offshore2016?.capex_eur_per_mw ?? 1) * 100).toFixed(0)}% from 2016→2030; onshore declining ${(((onshore2016?.capex_eur_per_mw ?? 0) - (onshore2030?.capex_eur_per_mw ?? 0)) / (onshore2016?.capex_eur_per_mw ?? 1) * 100).toFixed(0)}%.

GERMANY OFFSHORE WIND EXPANSION POTENTIAL (Siala2020 model, 2050):
  North Sea: ${northSea?.expansion_limit_mw ? (northSea.expansion_limit_mw / 1000).toFixed(1) : "n/a"} GW potential, ${northSea?.installed_mw ? (northSea.installed_mw / 1000).toFixed(1) : "n/a"} GW installed (MaStR)
  Baltic Sea: ${baltic?.expansion_limit_mw ? (baltic.expansion_limit_mw / 1000).toFixed(1) : "n/a"} GW potential, ${baltic?.installed_mw ? (baltic.installed_mw / 1000).toFixed(1) : "n/a"} GW installed (MaStR)
  Total Germany offshore 2050 potential: ${(totalOffshoreExpansion / 1000).toFixed(1)} GW vs ${(totalOffshoreInstalled / 1000).toFixed(1)} GW today
  Top 5 onshore expansion states (2050 model): ${topStates.map(s => `${s.region}: ${(s.expansion / 1000).toFixed(1)} GW`).join("; ")}`;
}
