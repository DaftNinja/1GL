const BASE = "https://api.energy-charts.info";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CacheEntry<any>>();

function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export interface MonthlyGeneration {
  month: string; // YYYY-MM
  fuels: Record<string, number>; // fuel name → avg MW
  totalMw: number;
  renewableMw: number;
  renewableSharePct: number;
}

export interface AnnualGeneration {
  year: number;
  fuels: Record<string, number>; // fuel name → avg MW
  totalMw: number;
  renewableMw: number;
  renewableSharePct: number;
  totalTwh: number;
}

export interface GermanyGenerationData {
  monthly: MonthlyGeneration[];
  annual: AnnualGeneration[];
  currentMix: Record<string, number>; // last 30 days avg MW
  fetchedAt: string;
}

// Fuels considered renewable for share calculation
const RENEWABLE_FUELS = new Set([
  "Wind onshore",
  "Wind offshore",
  "Solar",
  "Hydro Run-of-River",
  "Hydro water reservoir",
  "Biomass",
  "Geothermal",
]);

// Display name normalisation
const FUEL_DISPLAY: Record<string, string> = {
  "Nuclear": "Nuclear",
  "Wind onshore": "Wind Onshore",
  "Wind offshore": "Wind Offshore",
  "Solar": "Solar",
  "Fossil brown coal / lignite": "Lignite",
  "Fossil hard coal": "Hard Coal",
  "Fossil gas": "Gas",
  "Fossil oil": "Oil",
  "Biomass": "Biomass",
  "Hydro Run-of-River": "Hydro Run-of-River",
  "Hydro water reservoir": "Hydro Reservoir",
  "Hydro pumped storage": "Hydro Pumped",
  "Waste": "Waste",
  "Others": "Others",
};

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchPublicPower(start: string, end: string): Promise<any> {
  const url = `${BASE}/public_power?country=de&start=${start}&end=${end}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Energy Charts API ${res.status}: ${res.statusText}`);
  return res.json();
}

function aggregateToMonthly(data: any): MonthlyGeneration[] {
  const ts: number[] = data.unix_seconds;
  const pts: Array<{ name: string; data: (number | null)[] }> = data.production_types;

  // Filter to fuel types we care about
  const fuelTypes = Object.keys(FUEL_DISPLAY);

  const monthly: Record<string, Record<string, { sum: number; count: number }>> = {};

  for (let i = 0; i < ts.length; i++) {
    const d = new Date(ts[i] * 1000);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

    if (!monthly[m]) monthly[m] = {};

    for (const pt of pts) {
      if (!fuelTypes.includes(pt.name)) continue;
      const val = pt.data[i];
      if (val == null || val < 0) continue;
      if (!monthly[m][pt.name]) monthly[m][pt.name] = { sum: 0, count: 0 };
      monthly[m][pt.name].sum += val;
      monthly[m][pt.name].count++;
    }
  }

  return Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, fuels]) => {
      const fuelAvg: Record<string, number> = {};
      let totalMw = 0;
      let renewableMw = 0;

      for (const [rawName, { sum, count }] of Object.entries(fuels)) {
        const avg = count > 0 ? Math.round(sum / count) : 0;
        const displayName = FUEL_DISPLAY[rawName] || rawName;
        fuelAvg[displayName] = avg;
        totalMw += avg;
        if (RENEWABLE_FUELS.has(rawName)) renewableMw += avg;
      }

      return {
        month,
        fuels: fuelAvg,
        totalMw: Math.round(totalMw),
        renewableMw: Math.round(renewableMw),
        renewableSharePct: totalMw > 0 ? Math.round((renewableMw / totalMw) * 100) : 0,
      };
    });
}

function aggregateToAnnual(monthly: MonthlyGeneration[]): AnnualGeneration[] {
  const byYear: Record<string, MonthlyGeneration[]> = {};
  for (const m of monthly) {
    const yr = m.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  }

  return Object.entries(byYear)
    .filter(([, months]) => months.length >= 6) // Only complete-ish years
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, months]) => {
      const allFuels = new Set(months.flatMap((m) => Object.keys(m.fuels)));
      const fuelAvg: Record<string, number> = {};
      let totalMw = 0;
      let renewableMw = 0;

      for (const fuel of allFuels) {
        const vals = months.map((m) => m.fuels[fuel] ?? 0);
        const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
        fuelAvg[fuel] = avg;
      }

      for (const [fuel, avg] of Object.entries(fuelAvg)) {
        const rawName = Object.entries(FUEL_DISPLAY).find(([, d]) => d === fuel)?.[0];
        totalMw += avg;
        if (rawName && RENEWABLE_FUELS.has(rawName)) renewableMw += avg;
      }

      return {
        year: parseInt(year),
        fuels: fuelAvg,
        totalMw: Math.round(totalMw),
        renewableMw: Math.round(renewableMw),
        renewableSharePct: totalMw > 0 ? Math.round((renewableMw / totalMw) * 100) : 0,
        totalTwh: Math.round((totalMw * 8760) / 1000),
      };
    });
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function getGermanyGeneration(): Promise<GermanyGenerationData> {
  const cacheKey = "de-generation";
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  // Fetch in two chunks to avoid huge responses
  // Historical: 2019-2022 (pre-nuclear-exit)
  // Recent: 2023-now (post-nuclear-exit)
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");

  const [historicalData, recentData] = await Promise.all([
    fetchPublicPower("2019-01-01", "2022-12-31"),
    fetchPublicPower("2023-01-01", `${currentYear}-${currentMonth}-28`),
  ]);

  const historicalMonthly = aggregateToMonthly(historicalData);
  const recentMonthly = aggregateToMonthly(recentData);
  const allMonthly = [...historicalMonthly, ...recentMonthly];

  // Current mix = last 30 days from recent data
  const lastMonth = recentMonthly[recentMonthly.length - 1];
  const currentMix = lastMonth?.fuels ?? {};

  const annual = aggregateToAnnual(allMonthly);

  const result: GermanyGenerationData = {
    monthly: allMonthly,
    annual,
    currentMix,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Shared country code mapping ─────────────────────────────────────────────

export const COUNTRY_TO_EC_CODE: Record<string, string> = {
  "United Kingdom": "uk",
  "Germany":        "de",
  "France":         "fr",
  "Netherlands":    "nl",
  "Belgium":        "be",
  "Ireland":        "ie",
  "Spain":          "es",
  "Italy":          "it",
  "Greece":         "gr",
  "Poland":         "pl",
  "Denmark":        "dk",
  "Sweden":         "se",
  "Norway":         "no",
  "Finland":        "fi",
  "Switzerland":    "ch",
  "Portugal":       "pt",
};

// ─── Short-lived cache for live data ─────────────────────────────────────────

const liveCache = new Map<string, CacheEntry<any>>();
const LIVE_TTL_MS = 15 * 60 * 1000; // 15 minutes
function isLiveCacheValid<T>(e: CacheEntry<T>) { return Date.now() - e.fetchedAt < LIVE_TTL_MS; }

async function ecFetch(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Energy Charts ${res.status} for ${path}`);
  return res.json();
}

// ─── Installed Power ─────────────────────────────────────────────────────────

export interface InstalledPowerData {
  years: string[];
  currentYear: number;
  fuels: Array<{ name: string; data: (number | null)[] }>;
  fetchedAt: string;
}

const INSTALLED_FUEL_DISPLAY: Record<string, string> = {
  "Nuclear":                       "Nuclear",
  "Wind onshore":                  "Wind Onshore",
  "Wind offshore":                 "Wind Offshore",
  "Solar AC":                      "Solar",
  "Solar":                         "Solar",
  "Fossil brown coal / lignite":   "Lignite",
  "Fossil hard coal":              "Hard Coal",
  "Fossil gas":                    "Gas",
  "Fossil oil":                    "Oil",
  "Fossil peat":                   "Peat",
  "Biomass":                       "Biomass",
  "Hydro Run-of-River":            "Hydro Run-of-River",
  "Hydro water reservoir":         "Hydro Reservoir",
  "Hydro pumped storage":          "Hydro Pumped",
  "Geothermal":                    "Geothermal",
  "Marine":                        "Marine",
  "Others":                        "Others",
  "Waste":                         "Waste",
};

const SHOW_FUELS_ORDER = [
  "Nuclear", "Wind Offshore", "Wind Onshore", "Solar",
  "Hydro Reservoir", "Hydro Run-of-River", "Hydro Pumped",
  "Biomass", "Gas", "Lignite", "Hard Coal", "Oil", "Peat", "Others", "Waste",
];

export async function getInstalledPower(countryCode: string): Promise<InstalledPowerData> {
  const key = `installed-${countryCode}`;
  const cached = cache.get(key);
  if (cached && isCacheValid(cached)) return cached.data;

  const raw = await ecFetch(`/installed_power?country=${countryCode}&time_step=yearly`);
  const years: string[] = raw.time ?? [];
  const currentYear = new Date().getFullYear();

  // Merge duplicate display names (e.g. "Solar AC" + "Solar")
  const merged: Record<string, (number | null)[]> = {};
  for (const pt of raw.production_types ?? []) {
    const display = INSTALLED_FUEL_DISPLAY[pt.name];
    if (!display) continue;
    if (!merged[display]) merged[display] = new Array(years.length).fill(null);
    for (let i = 0; i < years.length; i++) {
      const v = pt.data[i];
      if (v != null && v > 0) {
        merged[display][i] = (merged[display][i] ?? 0) + v;
      }
    }
  }

  // Sort by our preferred order; filter only fuels with any data
  const fuels = SHOW_FUELS_ORDER
    .filter(name => merged[name] && (merged[name] as (number | null)[]).some(v => v != null && v > 0))
    .map(name => ({ name, data: merged[name] as (number | null)[] }));

  const result: InstalledPowerData = { years, currentYear, fuels, fetchedAt: new Date().toISOString() };
  cache.set(key, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Grid Signal ─────────────────────────────────────────────────────────────

export interface GridSignalData {
  currentShare: number | null;
  currentSignal: number | null;
  timeseries: Array<{ ts: number; share: number; signal: number }>;
  hasData: boolean;
  fetchedAt: string;
}

export async function getGridSignal(countryCode: string): Promise<GridSignalData> {
  const key = `signal-${countryCode}`;
  const cached = liveCache.get(key);
  if (cached && isLiveCacheValid(cached)) return cached.data;

  const cutoff = Date.now() / 1000 - 48 * 3600;
  const timeseries: Array<{ ts: number; share: number; signal: number }> = [];

  // Try the dedicated signal endpoint first (works for most continental Europe countries)
  const raw = await ecFetch(`/signal?country=${countryCode}`);
  const tsList: number[] = raw.unix_seconds ?? [];
  const shareList: (number | null)[] = raw.share ?? [];
  const signalList: (number | null)[] = raw.signal ?? [];

  if (tsList.length > 0 && shareList.some(v => v != null)) {
    for (let i = 0; i < tsList.length; i++) {
      if (tsList[i] < cutoff) continue;
      const sh = shareList[i];
      const sg = signalList[i];
      if (sh == null) continue;
      timeseries.push({ ts: tsList[i], share: sh, signal: sg ?? 0 });
    }
  } else {
    // Fallback: use public_power "Renewable share of generation" series
    // This works for countries like UK and IE where /signal is not populated
    try {
      const pp = await ecFetch(`/public_power?country=${countryCode}`);
      const ppTs: number[] = pp.unix_seconds ?? [];
      const renPt = (pp.production_types ?? []).find(
        (pt: any) => pt.name === "Renewable share of generation"
      );
      if (renPt && ppTs.length > 0) {
        for (let i = 0; i < ppTs.length; i++) {
          if (ppTs[i] < cutoff) continue;
          const sh = renPt.data[i];
          if (sh == null || sh < 0) continue;
          // Derive signal from share threshold: ≥65 green(2), ≥40 amber(1), else red(0)
          const sg = sh >= 65 ? 2 : sh >= 40 ? 1 : 0;
          timeseries.push({ ts: ppTs[i], share: sh, signal: sg });
        }
      }
    } catch {
      // If fallback also fails, return empty
    }
  }

  const last = timeseries[timeseries.length - 1] ?? null;
  const result: GridSignalData = {
    currentShare: last?.share ?? null,
    currentSignal: last?.signal ?? null,
    timeseries,
    hasData: timeseries.length > 0,
    fetchedAt: new Date().toISOString(),
  };
  liveCache.set(key, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Renewable Share Daily Average ───────────────────────────────────────────

export interface RenShareData {
  days: string[];   // dd.mm.yyyy
  data: number[];   // % share
  avg90: number;
  avg365: number;
  fetchedAt: string;
}

export async function getRenShareDailyAvg(countryCode: string): Promise<RenShareData> {
  const key = `renshare-${countryCode}`;
  const cached = liveCache.get(key);
  if (cached && isLiveCacheValid(cached)) return cached.data;

  const raw = await ecFetch(`/ren_share_daily_avg?country=${countryCode}`);
  const days: string[] = raw.days ?? [];
  const data: number[] = raw.data ?? [];

  const last90 = data.slice(-90).filter(v => v != null);
  const last365 = data.filter(v => v != null);
  const avg90 = last90.length ? Math.round(last90.reduce((a, b) => a + b, 0) / last90.length * 10) / 10 : 0;
  const avg365 = last365.length ? Math.round(last365.reduce((a, b) => a + b, 0) / last365.length * 10) / 10 : 0;

  const result: RenShareData = { days, data, avg90, avg365, fetchedAt: new Date().toISOString() };
  liveCache.set(key, { data: result, fetchedAt: Date.now() });
  return result;
}
