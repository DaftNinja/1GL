/**
 * Energy-Charts API integration for German electricity data
 * Used as fallback when ENTSO-E is unavailable
 * Also primary source for the "signal" metric (renewable % + grid health)
 */

import {
  recordEnergyChartsSuccess,
  recordEnergyChartsFailure,
  recordEnergyChartsUsedAsFallback,
} from "./energyChartsHealth";

const ENERGY_CHARTS_BASE = "https://api.energy-charts.info";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Types ────────────────────────────────────────────────────────────────────

export interface SignalResponse {
  signal_color: "green" | "yellow" | "red";
  renewables_share: number; // 0-100, % of current generation
  residual_load: number; // MW
  timestamp: number; // Unix timestamp
}

export interface PriceDataPoint {
  unix_timestamp: number;
  price_eur: number;
}

export interface GenerationBreakdown {
  solar: number;
  wind_onshore: number;
  wind_offshore: number;
  hydro: number;
  biomass: number;
  nuclear: number;
  lignite: number;
  hard_coal: number;
  natural_gas: number;
  other: number;
  total: number;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function energyChartsFetch(endpoint: string): Promise<any> {
  const url = `${ENERGY_CHARTS_BASE}${endpoint}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const error = `HTTP ${res.status}: ${res.statusText}`;
      recordEnergyChartsFailure(error);
      throw new Error(error);
    }
    recordEnergyChartsSuccess();
    return res.json();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    recordEnergyChartsFailure(errorMsg);
    throw err;
  }
}

// ── Signal (Current Grid Health + Renewable Share) ────────────────────────────

export async function getGermanSignal(): Promise<SignalResponse | null> {
  const cacheKey = "ec-signal-de";
  const cached = getCached<SignalResponse>(cacheKey);
  if (cached) return cached;

  try {
    const data = await energyChartsFetch("/signal?country=de");

    // Extract latest values from timeseries
    const timestamps: number[] = data.unix_seconds || [];
    const shares: (number | null)[] = data.share || [];
    const signals: (number | null)[] = data.signal || [];

    if (timestamps.length === 0) {
      return null;
    }

    const lastIdx = timestamps.length - 1;
    const renewablesShare = shares[lastIdx];
    const signal = signals[lastIdx];
    const timestamp = timestamps[lastIdx];

    if (renewablesShare === null || renewablesShare === undefined) {
      return null;
    }

    // Map signal value (0=red, 1=yellow, 2=green) or derive from renewable share
    let signal_color: "green" | "yellow" | "red" = "red";
    if (signal === 2 || renewablesShare >= 65) {
      signal_color = "green";
    } else if (signal === 1 || renewablesShare >= 40) {
      signal_color = "yellow";
    }

    const result: SignalResponse = {
      signal_color,
      renewables_share: Math.round(renewablesShare * 10) / 10,
      residual_load: 0, // Not directly available from /signal endpoint
      timestamp,
    };

    setCached(cacheKey, result);
    return result;
  } catch (err) {
    console.error("[Energy-Charts] Failed to fetch signal:", err);
    return null;
  }
}

// ── Day-Ahead Prices ─────────────────────────────────────────────────────────

export async function getGermanDayAheadPrices(
  date: string // ISO format: YYYY-MM-DD
): Promise<PriceDataPoint[] | null> {
  const cacheKey = `ec-price-de-${date}`;
  const cached = getCached<PriceDataPoint[]>(cacheKey);
  if (cached) return cached;

  try {
    // Energy-Charts uses bzn=DE-LU for German prices (DE-LU = Germany + Luxembourg zone)
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endDate = nextDay.toISOString().split("T")[0];

    const data = await energyChartsFetch(
      `/price?bzn=DE-LU&start=${date}&end=${endDate}`
    );

    const timestamps: number[] = data.unix_seconds || [];
    const prices: (number | null)[] = data.price || [];

    if (timestamps.length === 0) {
      return null;
    }

    const result: PriceDataPoint[] = timestamps
      .map((ts, i) => ({
        unix_timestamp: ts,
        price_eur: prices[i] ?? 0,
      }))
      .filter((point) => point.price_eur !== null && point.price_eur > -999); // Filter invalid data

    setCached(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[Energy-Charts] Failed to fetch prices for ${date}:`, err);
    return null;
  }
}

// ── Generation Mix (Current) ─────────────────────────────────────────────────

export async function getGermanGenerationMix(): Promise<GenerationBreakdown | null> {
  const cacheKey = "ec-generation-de";
  const cached = getCached<GenerationBreakdown>(cacheKey);
  if (cached) return cached;

  try {
    const data = await energyChartsFetch("/public_power?country=de");

    const productionTypes: Array<{ name: string; data: (number | null)[] }> =
      data.production_types || [];
    const timestamps: number[] = data.unix_seconds || [];

    if (timestamps.length === 0) {
      return null;
    }

    // Use latest timestamp
    const lastIdx = timestamps.length - 1;

    // Mapping from Energy-Charts names to our breakdown
    const typeMap: Record<string, keyof GenerationBreakdown> = {
      Solar: "solar",
      "Wind onshore": "wind_onshore",
      "Wind offshore": "wind_offshore",
      "Hydro Run-of-River": "hydro",
      "Hydro water reservoir": "hydro",
      "Hydro pumped storage": "hydro",
      Biomass: "biomass",
      Nuclear: "nuclear",
      "Fossil brown coal / lignite": "lignite",
      "Fossil hard coal": "hard_coal",
      "Fossil gas": "natural_gas",
      Others: "other",
    };

    const breakdown: GenerationBreakdown = {
      solar: 0,
      wind_onshore: 0,
      wind_offshore: 0,
      hydro: 0,
      biomass: 0,
      nuclear: 0,
      lignite: 0,
      hard_coal: 0,
      natural_gas: 0,
      other: 0,
      total: 0,
    };

    for (const pt of productionTypes) {
      const key = typeMap[pt.name];
      if (!key) continue;

      const value = pt.data[lastIdx];
      if (value !== null && value !== undefined && value > 0) {
        breakdown[key] += Math.round(value);
      }
    }

    // Calculate total
    breakdown.total = Object.entries(breakdown)
      .filter(([k]) => k !== "total")
      .reduce((sum, [, v]) => sum + v, 0);

    setCached(cacheKey, breakdown);
    return breakdown;
  } catch (err) {
    console.error("[Energy-Charts] Failed to fetch generation mix:", err);
    return null;
  }
}

// ── Cross-Border Flows ───────────────────────────────────────────────────────

export interface CrossBorderData {
  country: string;
  direction: "import" | "export"; // Positive = export, negative = import
  flow_mw: number; // Positive means exporting
  timestamp: number;
}

export async function getGermanCrossBorder(): Promise<CrossBorderData[] | null> {
  const cacheKey = "ec-cross-border-de";
  const cached = getCached<CrossBorderData[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await energyChartsFetch("/cross_border?country=de");

    const result: CrossBorderData[] = [];
    const timestamps: number[] = data.unix_seconds || [];

    // Energy-Charts cross_border returns exchange flows to neighboring countries
    // Structure: { countries: [...], data: { countryA: [...], countryB: [...], ... } }
    const countries: string[] = data.countries || [];
    const flowData: Record<string, (number | null)[]> = data.data || {};

    if (timestamps.length === 0) {
      return null;
    }

    const lastIdx = timestamps.length - 1;
    const timestamp = timestamps[lastIdx];

    for (const country of countries) {
      const flows = flowData[country];
      if (!flows) continue;

      const flow = flows[lastIdx];
      if (flow === null || flow === undefined) continue;

      result.push({
        country,
        direction: flow > 0 ? "export" : "import",
        flow_mw: Math.abs(Math.round(flow)),
        timestamp,
      });
    }

    setCached(cacheKey, result);
    return result;
  } catch (err) {
    console.error("[Energy-Charts] Failed to fetch cross-border flows:", err);
    return null;
  }
}

// ── Fallback for ENTSO-E Germany prices ──────────────────────────────────────

/**
 * Get German day-ahead prices as fallback for ENTSO-E.
 * Used when ENTSO-E is unavailable to still provide price data to clients.
 */
export async function getGermanPricesForENTSOEFallback(
  date: string // ISO format: YYYY-MM-DD
): Promise<Map<number, number> | null> {
  recordEnergyChartsUsedAsFallback();

  const prices = await getGermanDayAheadPrices(date);
  if (!prices) {
    return null;
  }

  // Convert to Map<hour, price_eur> format compatible with ENTSO-E response
  const priceMap = new Map<number, number>();
  for (const point of prices) {
    const d = new Date(point.unix_timestamp * 1000);
    const hour = d.getUTCHours();
    priceMap.set(hour, point.price_eur);
  }

  return priceMap;
}
