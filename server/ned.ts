const BASE = "https://api.ned.nl/v1";

// NED API key from environment
function getKey(): string | null {
  return process.env.NED_API_KEY || null;
}

// ─── Cache ───────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; fetchedAt: number; }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry<any>>();
function cacheValid<T>(e: CacheEntry<T>) { return Date.now() - e.fetchedAt < CACHE_TTL_MS; }

// ─── NED fuel type IDs ───────────────────────────────────────────────────────
const FUEL_TYPES: Record<number, { name: string; renewable: boolean; color?: string }> = {
  1:  { name: "Wind Onshore",   renewable: true  },
  2:  { name: "Solar",          renewable: true  },
  17: { name: "Wind Offshore",  renewable: true  },
  18: { name: "Fossil Gas",     renewable: false },
  19: { name: "Hard Coal",      renewable: false },
  20: { name: "Nuclear",        renewable: false },
  25: { name: "Biomass",        renewable: true  },
};

const GRANULARITY_MONTH = 7;
const GRANULARITY_TIMEZONE = 1; // UTC+1 (Europe/Amsterdam)
const ACTIVITY_PROVIDING = 1;
const CLASSIFICATION_CURRENT = 2;
const POINT_NATIONAL = 0;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NedMonthly {
  month: string;        // YYYY-MM
  fuels: Record<string, number>; // fuel name → avg MW
  totalMw: number;
  renewableMw: number;
  renewableSharePct: number;
  carbonIntensityGco2Kwh: number;
}

export interface NedData {
  monthly: NedMonthly[];
  latestMonth: NedMonthly | null;
  borsseleStatus: { avgMw: number; month: string } | null;
  offshoreCapacityGw: number | null;
  fetchedAt: string;
}

// ─── Fetch one fuel type's monthly data ──────────────────────────────────────
async function fetchFuelMonthly(typeId: number, fromDate: string, toDate: string): Promise<Array<{ month: string; mw: number; gwh: number; emissionKg: number }>> {
  const key = getKey();
  if (!key) return [];

  const url = new URL(`${BASE}/utilizations`);
  url.searchParams.set("granularity", String(GRANULARITY_MONTH));
  url.searchParams.set("granularitytimezone", String(GRANULARITY_TIMEZONE));
  url.searchParams.set("activity", String(ACTIVITY_PROVIDING));
  url.searchParams.set("point", String(POINT_NATIONAL));
  url.searchParams.set("type", String(typeId));
  url.searchParams.set("classification", String(CLASSIFICATION_CURRENT));
  url.searchParams.set("validfrom[strictly_before]", toDate);
  url.searchParams.set("validfrom[after]", fromDate);
  url.searchParams.set("itemsPerPage", "60");

  const res = await fetch(url.toString(), {
    headers: { "X-AUTH-TOKEN": key, "Accept": "application/json" },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    console.error(`NED API ${res.status} for type ${typeId}: ${await res.text()}`);
    return [];
  }

  const data = await res.json();
  const items: any[] = Array.isArray(data) ? data : (data["hydra:member"] || []);

  return items.map((item) => {
    const validfrom: string = item.validfrom || "";
    const validto: string = item.validto || "";
    const capacityKw: number = item.capacity || 0;
    const volumeKwh: number = item.volume || 0;
    const emissionG: number = item.emission || 0;

    // Calculate hours in period
    const startMs = new Date(validfrom).getTime();
    const endMs = new Date(validto).getTime();
    const hours = (endMs - startMs) / (1000 * 3600);

    // Average MW = volume(kWh) / hours / 1000 (kW→MW), or use capacity directly
    const avgMw = hours > 0 ? volumeKwh / hours / 1000 : capacityKw / 1000;

    // Month label from validfrom (shifted by 1 day since dates are end-of-prev-month in UTC)
    const d = new Date(startMs + 24 * 3600 * 1000); // shift +1 day
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

    return {
      month,
      mw: Math.round(avgMw * 10) / 10,
      gwh: Math.round(volumeKwh / 1e6 * 10) / 10,
      emissionKg: emissionG / 1000,
    };
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function getNetherlandsData(): Promise<NedData> {
  const cacheKey = "ned-nl";
  const cached = cache.get(cacheKey);
  if (cached && cacheValid(cached)) return cached.data;

  const key = getKey();
  if (!key) {
    return { monthly: [], latestMonth: null, borsseleStatus: null, offshoreCapacityGw: null, fetchedAt: new Date().toISOString() };
  }

  // Fetch all fuel types in parallel (2022-01-01 to now)
  const now = new Date();
  const toDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 2).padStart(2, "0")}-01`;
  const fromDate = "2022-01-01";

  const results = await Promise.allSettled(
    Object.entries(FUEL_TYPES).map(async ([idStr, info]) => {
      const id = parseInt(idStr);
      const records = await fetchFuelMonthly(id, fromDate, toDate);
      return { id, name: info.name, renewable: info.renewable, records };
    })
  );

  // Build month → fuel map
  const monthMap: Record<string, Record<string, number>> = {};
  const emissionMap: Record<string, number> = {};

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { name, records } = result.value;
    for (const rec of records) {
      if (!monthMap[rec.month]) monthMap[rec.month] = {};
      monthMap[rec.month][name] = rec.mw;
      emissionMap[rec.month] = (emissionMap[rec.month] || 0) + rec.emissionKg;
    }
  }

  const monthly: NedMonthly[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, fuels]) => {
      let totalMw = 0;
      let renewableMw = 0;

      for (const [fuel, mw] of Object.entries(fuels)) {
        totalMw += mw;
        const typeEntry = Object.values(FUEL_TYPES).find((t) => t.name === fuel);
        if (typeEntry?.renewable) renewableMw += mw;
      }

      const totalGwh = totalMw * 730; // approx hours/month
      const emissionKg = emissionMap[month] || 0;
      const carbonIntensityGco2Kwh = totalGwh > 0 ? Math.round((emissionKg / (totalGwh * 1000)) * 100) / 100 : 0;

      return {
        month,
        fuels,
        totalMw: Math.round(totalMw),
        renewableMw: Math.round(renewableMw),
        renewableSharePct: totalMw > 0 ? Math.round((renewableMw / totalMw) * 100) : 0,
        carbonIntensityGco2Kwh,
      };
    });

  const latestMonth = monthly.length > 0 ? monthly[monthly.length - 1] : null;

  // Borssele nuclear status (latest available month)
  const nuclearRecords = results.find((r) => r.status === "fulfilled" && (r as any).value.id === 20);
  const borsseleLatest = nuclearRecords?.status === "fulfilled"
    ? (nuclearRecords as any).value.records.slice(-1)[0]
    : null;
  const borsseleStatus = borsseleLatest
    ? { avgMw: borsseleLatest.mw, month: borsseleLatest.month }
    : null;

  // Offshore wind capacity (latest month)
  const offshoreRecords = results.find((r) => r.status === "fulfilled" && (r as any).value.id === 17);
  const offshoreLatest = offshoreRecords?.status === "fulfilled"
    ? (offshoreRecords as any).value.records.slice(-1)[0]
    : null;
  const offshoreCapacityGw = offshoreLatest ? Math.round((offshoreLatest.mw / 1000) * 10) / 10 : null;

  const result: NedData = {
    monthly,
    latestMonth,
    borsseleStatus,
    offshoreCapacityGw,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

export function isNedConfigured(): boolean {
  return !!getKey();
}
