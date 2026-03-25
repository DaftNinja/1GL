/**
 * RTE France Open Data API client
 * https://digital.iservices.rte-france.com/open_api
 *
 * Auth: OAuth2 client_credentials — Base64(client_id:client_secret)
 * Token lifetime: 3600 seconds (1 hour)
 * APIs used (requires portal subscription):
 *   - actual_generation/v1/actual_generations_per_production_type
 *   - generation_installed_capacities/v1/installed_capacities_per_production_unit
 *   - consolidated_consumption/v1/consolidated_power_consumption
 */

const BASE = "https://digital.iservices.rte-france.com";

// ─── token cache ─────────────────────────────────────────────────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const key = process.env.RTE_API_KEY;
  if (!key) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  try {
    const resp = await fetch(`${BASE}/token/oauth/`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      console.warn(`[RTE] Token fetch failed: ${resp.status}`);
      return null;
    }
    const json = await resp.json();
    tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in - 120) * 1000,
    };
    return tokenCache.token;
  } catch (e) {
    console.error("[RTE] Token error:", e);
    return null;
  }
}

// ─── data cache ──────────────────────────────────────────────────────────────
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
interface CacheEntry { data: any; ts: number }
const cache: Map<string, CacheEntry> = new Map();

function fromCache(key: string): any | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL_MS) { cache.delete(key); return null; }
  return e.data;
}
function toCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

// ─── generic RTE fetch ────────────────────────────────────────────────────────
async function rteFetch(path: string): Promise<any | null> {
  const token = await getToken();
  if (!token) return null;

  const url = `${BASE}/open_api/${path}`;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.status === 403) {
      console.warn(`[RTE] 403 on ${path} — API not yet subscribed in portal`);
      return null;
    }
    if (!resp.ok) {
      console.warn(`[RTE] ${resp.status} on ${path}`);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error("[RTE] fetch error:", e);
    return null;
  }
}

// ─── fuel type map (RTE production_type strings) ─────────────────────────────
const FUEL_MAP: Record<string, string> = {
  NUCLEAR:           "Nuclear",
  FOSSIL_GAS:        "Fossil Gas",
  FOSSIL_OIL:        "Fossil Oil",
  FOSSIL_COAL:       "Hard Coal",
  HYDRO_RUN_OF_RIVER_AND_POUNDAGE: "Hydro Run-of-River",
  HYDRO_WATER_RESERVOIR: "Hydro Reservoir",
  WIND_ONSHORE:      "Wind Onshore",
  WIND_OFFSHORE:     "Wind Offshore",
  SOLAR:             "Solar",
  BIOMASS:           "Biomass",
  GEOTHERMAL:        "Geothermal",
  OTHER:             "Other",
};

// Build ISO date range string for RTE (last N months)
function rteRange(monthsBack = 36): { start: string; end: string } {
  const end = new Date();
  end.setDate(1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - monthsBack);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01T00:00:00%2B01:00`;
  return { start: fmt(start), end: fmt(end) };
}

// ─── monthly aggregated actual generation ─────────────────────────────────────
async function fetchActualGeneration(): Promise<any[]> {
  const cacheKey = "rte_actual_gen";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const { start, end } = rteRange(36);
  const path = `actual_generation/v1/actual_generations_per_production_type?start_date=${start}&end_date=${end}`;
  const json = await rteFetch(path);
  if (!json) return [];

  // RTE returns: { actual_generations_per_production_type: [ { production_type, values: [{start_date, end_date, value}] } ] }
  const series: any[] = json.actual_generations_per_production_type ?? [];

  // Aggregate to monthly averages keyed by YYYY-MM
  const monthly: Record<string, Record<string, number[]>> = {};
  for (const s of series) {
    const fuel = FUEL_MAP[s.production_type] ?? s.production_type;
    for (const v of s.values ?? []) {
      const month = v.start_date?.slice(0, 7);
      if (!month) continue;
      if (!monthly[month]) monthly[month] = {};
      if (!monthly[month][fuel]) monthly[month][fuel] = [];
      monthly[month][fuel].push(v.value ?? 0);
    }
  }

  const result = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, fuels]) => {
      const row: Record<string, any> = { month };
      let totalMw = 0;
      let nuclearMw = 0;
      let renewableMw = 0;
      for (const [fuel, vals] of Object.entries(fuels)) {
        const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
        row[fuel] = avg;
        totalMw += avg;
        if (fuel === "Nuclear") nuclearMw += avg;
        if (["Wind Onshore", "Wind Offshore", "Solar", "Hydro Run-of-River", "Hydro Reservoir", "Biomass"].includes(fuel)) {
          renewableMw += avg;
        }
      }
      row.totalMw = totalMw;
      row.nuclearSharePct = totalMw > 0 ? Math.round((nuclearMw / totalMw) * 100) : 0;
      row.renewableSharePct = totalMw > 0 ? Math.round((renewableMw / totalMw) * 100) : 0;
      return row;
    });

  toCache(cacheKey, result);
  return result;
}

// ─── installed capacities ────────────────────────────────────────────────────
async function fetchInstalledCapacities(): Promise<any> {
  const cacheKey = "rte_installed_cap";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const path = `generation_installed_capacities/v1/installed_capacities_per_production_type`;
  const json = await rteFetch(path);
  if (!json) return null;

  const caps: Record<string, number> = {};
  for (const entry of json.installed_capacities_per_production_type ?? []) {
    const fuel = FUEL_MAP[entry.production_type] ?? entry.production_type;
    caps[fuel] = (caps[fuel] ?? 0) + (entry.installed_capacity ?? 0);
  }

  toCache(cacheKey, caps);
  return caps;
}

// ─── public entry point ───────────────────────────────────────────────────────
export async function getFranceData(): Promise<any> {
  const cacheKey = "rte_france_full";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const hasKey = !!process.env.RTE_API_KEY;
  const token = hasKey ? await getToken() : null;

  if (!token) {
    return {
      live: false,
      reason: hasKey ? "token_failed" : "no_key",
      monthly: [],
      installedCapacities: null,
      latestMonth: null,
      summary: null,
    };
  }

  const [monthly, installedCapacities] = await Promise.all([
    fetchActualGeneration(),
    fetchInstalledCapacities(),
  ]);

  const latestMonth = monthly.length > 0 ? monthly[monthly.length - 1] : null;

  const result = {
    live: monthly.length > 0,
    monthly,
    installedCapacities,
    latestMonth,
    fetchedAt: new Date().toISOString(),
  };

  if (monthly.length > 0) toCache(cacheKey, result);
  return result;
}
