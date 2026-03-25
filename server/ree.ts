/**
 * REE (Red Eléctrica de España) — Spain Grid Data Client
 * https://apidatos.ree.es — Free public API, no auth required
 * Endpoint: /en/datos/generacion/estructura-generacion
 * Units returned: GWh (converted to average MW for consistency)
 */

const BASE = "https://apidatos.ree.es";

// ─── data cache ──────────────────────────────────────────────────────────────
const TTL_MS = 24 * 60 * 60 * 1000;
interface CacheEntry { data: any; ts: number }
const cache: Map<string, CacheEntry> = new Map();

function fromCache(key: string): any | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts > TTL_MS) { cache.delete(key); return null; }
  return e.data;
}
function toCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

// ─── fuel label normalisation ────────────────────────────────────────────────
// Skip rollup entries
const SKIP_FUELS = new Set(["Total generation", "Total capacity"]);

const FUEL_MAP: Record<string, string> = {
  "Wind":                   "Wind",
  "Solar photovoltaic":     "Solar PV",
  "Thermal solar":          "Solar CSP",
  "Nuclear":                "Nuclear",
  "Hydro":                  "Hydro",
  "Combined cycle":         "CCGT Gas",
  "Cogeneration":           "Cogeneration",
  "Coal":                   "Hard Coal",
  "Other renewables":       "Other Renewables",
  "Renewable waste":        "Biomass/Waste",
  "Non-renewable waste":    "Non-Ren Waste",
  "Fuel + Gas":             "Fossil Oil",
  "Gas turbine":            "Gas Turbine",
  "Steam turbine":          "Steam Turbine",
  "Diesel engines":         "Diesel",
  "Hydroeolian":            "Hydroeolian",
};

const RENEWABLE_FUELS = new Set(["Wind", "Solar PV", "Solar CSP", "Hydro", "Other Renewables", "Biomass/Waste", "Hydroeolian"]);
const LOW_CARBON_FUELS = new Set(["Wind", "Solar PV", "Solar CSP", "Hydro", "Other Renewables", "Biomass/Waste", "Hydroeolian", "Nuclear"]);

// ─── fetch one year of monthly generation ────────────────────────────────────
async function fetchYear(year: number): Promise<Record<string, Record<string, number>>> {
  // returns { "YYYY-MM": { fuel: avgMw, ... } }
  const url =
    `${BASE}/en/datos/generacion/estructura-generacion` +
    `?start_date=${year}-01-01T00:00&end_date=${year + 1}-01-01T00:00&time_trunc=month`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`REE ${resp.status}`);

  const json = await resp.json();
  const result: Record<string, Record<string, number>> = {};

  for (const item of json.included ?? []) {
    const rawTitle: string = item.attributes?.title ?? "";
    if (SKIP_FUELS.has(rawTitle)) continue;
    const fuel = FUEL_MAP[rawTitle] ?? rawTitle;
    for (const v of item.attributes?.values ?? []) {
      const month = v.datetime?.slice(0, 7);
      if (!month) continue;
      const mwh = v.value ?? 0; // MWh (REE monthly API returns MWh)
      // Convert MWh → average MW (divide by hours in the month)
      const [yr, mo] = month.split("-").map(Number);
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const avgMw = Math.round(mwh / (daysInMonth * 24));
      if (!result[month]) result[month] = {};
      result[month][fuel] = (result[month][fuel] ?? 0) + avgMw;
    }
  }
  return result;
}

// ─── installed capacities ────────────────────────────────────────────────────
async function fetchCapacities(): Promise<Record<string, number>> {
  const cacheKey = "ree_capacities";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const year = new Date().getFullYear();
  const url =
    `${BASE}/en/datos/generacion/potencia-instalada` +
    `?start_date=${year}-01-01T00:00&end_date=${year + 1}-01-01T00:00&time_trunc=year`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) return {};

  const json = await resp.json();
  const caps: Record<string, number> = {};

  for (const item of json.included ?? []) {
    const rawTitle: string = item.attributes?.title ?? "";
    if (SKIP_FUELS.has(rawTitle)) continue;
    const fuel = FUEL_MAP[rawTitle] ?? rawTitle;
    for (const v of item.attributes?.values ?? []) {
      // API returns MW directly (e.g. 32128 MW for 32.1 GW wind)
      const mw = Math.round(v.value ?? 0);
      caps[fuel] = (caps[fuel] ?? 0) + mw;
    }
  }

  // Stored as MW — divide by 1000 for GW display on frontend
  toCache(cacheKey, caps);
  return caps;
}

// ─── main export ─────────────────────────────────────────────────────────────
export async function getSpainData(): Promise<any> {
  const cacheKey = "ree_spain_full";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  // Fetch last 3 full years + current partial year in parallel
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];

  const [yearResults, capacities] = await Promise.all([
    Promise.all(years.map((y) => fetchYear(y).catch(() => ({})))),
    fetchCapacities().catch(() => ({})),
  ]);

  // Merge all months
  const allMonths: Record<string, Record<string, number>> = {};
  for (const yr of yearResults) {
    for (const [month, fuels] of Object.entries(yr)) {
      allMonths[month] = fuels;
    }
  }

  const monthly = Object.entries(allMonths)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, fuels]) => {
      let totalMw = 0, renewableMw = 0, lowCarbonMw = 0;
      for (const [fuel, mw] of Object.entries(fuels)) {
        totalMw += mw;
        if (RENEWABLE_FUELS.has(fuel)) renewableMw += mw;
        if (LOW_CARBON_FUELS.has(fuel)) lowCarbonMw += mw;
      }
      return {
        month,
        fuels,
        totalMw,
        renewableSharePct: totalMw > 0 ? Math.round((renewableMw / totalMw) * 100) : 0,
        lowCarbonSharePct: totalMw > 0 ? Math.round((lowCarbonMw / totalMw) * 100) : 0,
      };
    });

  // Annual aggregates
  const byYear: Record<string, typeof monthly> = {};
  for (const m of monthly) {
    const yr = m.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  }

  const annual = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, months]) => {
      const avgFuels: Record<string, number> = {};
      const allFuels = new Set(months.flatMap((m) => Object.keys(m.fuels)));
      for (const fuel of allFuels) {
        const vals = months.map((m) => m.fuels[fuel] ?? 0);
        avgFuels[fuel] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
      const renewablePct = Math.round(months.reduce((s, m) => s + m.renewableSharePct, 0) / months.length);
      const lowCarbonPct = Math.round(months.reduce((s, m) => s + m.lowCarbonSharePct, 0) / months.length);
      return { year, ...avgFuels, renewablePct, lowCarbonPct, monthCount: months.length };
    });

  const latestMonth = monthly.length > 0 ? monthly[monthly.length - 1] : null;

  const result = {
    live: true,
    monthly,
    annual,
    capacities,
    latestMonth,
    fetchedAt: new Date().toISOString(),
  };

  toCache(cacheKey, result);
  return result;
}
