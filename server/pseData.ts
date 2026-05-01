/**
 * PSE (Polskie Sieci Elektroenergetyczne) — Polish Power System data
 * Primary source for Polish prices (RCE PLN) and generation data.
 * No API key required. Fallback for ENTSO-E Poland when unavailable.
 *
 * Data published daily. API in transition from v1 to v2 (v2 primary until June 2025).
 */

const PSE_BASE_V2 = "https://v2.api.raporty.pse.pl/api";
const PSE_BASE_V1 = "https://v1.api.raporty.pse.pl/api";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (daily data)

// ── Types ────────────────────────────────────────────────────────────────────

export interface PolishGenerationMix {
  date: string; // ISO format YYYY-MM-DD
  pv: number; // GWh
  wind: number; // GWh
  coal: number; // GWh
  natural_gas: number; // GWh
  nuclear: number; // GWh
  other: number; // GWh
  hydro: number; // GWh
  renewables_share: number; // %
  total_demand: number; // GWh
  fetchedAt: string;
}

export interface RCEPrice {
  date: string; // ISO format YYYY-MM-DD
  hour: number; // 1-24
  price_pln: number; // PLN/MWh
  price_eur: number | null; // EUR/MWh, null if conversion failed
}

export interface RCEPriceResult {
  date: string;
  prices: RCEPrice[];
  avg_pln: number;
  avg_eur: number | null;
  fetchedAt: string;
  conversionRate: number | null;
}

export interface CrossBorderFlow {
  date: string;
  hour: number;
  czech_border: number; // MW, positive = import from Czech Republic
  german_border: number; // MW, positive = import from Germany
  lithuanian_border: number; // MW
  slovak_border: number; // MW
  ukrainian_border: number; // MW
}

export interface CrossBorderFlowResult {
  date: string;
  flows: CrossBorderFlow[];
  fetchedAt: string;
}

export interface PolishDemand {
  date: string;
  hour: number;
  actual: number; // MW
  forecast: number; // MW
}

export interface PolishDemandResult {
  date: string;
  demand: PolishDemand[];
  fetchedAt: string;
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

// ── Exchange Rate (PLN to EUR) ───────────────────────────────────────────────

let cachedExchangeRate: { rate: number; fetchedAt: number } | null = null;
const EXCHANGE_RATE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get current PLN to EUR exchange rate.
 * Tries multiple sources: ECB API (primary), cached rate, hardcoded fallback.
 */
export async function getPLNtoEURRate(): Promise<number> {
  // Check if we have a recent cached rate
  if (cachedExchangeRate && Date.now() - cachedExchangeRate.fetchedAt < EXCHANGE_RATE_TTL) {
    return cachedExchangeRate.rate;
  }

  try {
    // Try ECB API for official EU exchange rates
    // ECB publishes daily rates for EUR pairs including PLN
    const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", {
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const xml = await res.text();
      // Simple regex to extract PLN rate: <Cube currency='PLN' rate='X.XXXX'/>
      const match = xml.match(/currency='PLN'\s+rate='([\d.]+)'/);
      if (match) {
        const rate = 1 / parseFloat(match[1]); // ECB gives PLN per EUR, we need EUR per PLN
        cachedExchangeRate = { rate, fetchedAt: Date.now() };
        console.log(`[PSE] Updated PLN/EUR rate from ECB: ${rate.toFixed(4)}`);
        return rate;
      }
    }
  } catch (err) {
    console.warn(`[PSE] Failed to fetch ECB rate: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  // Fallback: use hardcoded approximate rate
  const fallbackRate = 0.245; // ~0.245 EUR per PLN (as of early 2026)
  cachedExchangeRate = { rate: fallbackRate, fetchedAt: Date.now() };
  console.warn(`[PSE] Using fallback exchange rate: ${fallbackRate.toFixed(4)} EUR/PLN`);
  return fallbackRate;
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function pseFetch(endpoint: string, v2First = true): Promise<any> {
  const baseUrl = v2First ? PSE_BASE_V2 : PSE_BASE_V1;
  const url = `${baseUrl}${endpoint}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      // If v2 fails with 404, try v1 as fallback
      if (v2First && res.status === 404) {
        console.log(`[PSE] v2 returned 404, trying v1 fallback`);
        return pseFetch(endpoint, false);
      }
      throw new Error(`PSE ${res.status}: ${res.statusText}`);
    }

    return res.json();
  } catch (err) {
    console.error(`[PSE] Fetch failed for ${endpoint}: ${err instanceof Error ? err.message : "unknown"}`);
    throw err;
  }
}

/**
 * Determine which date to fetch based on current time.
 * PSE publishes daily data in early morning (6-10 AM UTC).
 * If before 6 AM UTC, fetch yesterday's data (today's not published yet).
 * After 6 AM UTC, fetch today's data.
 */
function getPublishedDate(offsetDays = 0): string {
  const d = new Date();
  const hour = d.getUTCHours();

  if (offsetDays === 0 && hour < 6) {
    // Before 6 AM, last published date is yesterday
    d.setUTCDate(d.getUTCDate() - 1);
  } else if (offsetDays !== 0) {
    d.setUTCDate(d.getUTCDate() + offsetDays);
  }

  return d.toISOString().split("T")[0];
}

// ── Generation Mix (daily aggregate) ─────────────────────────────────────────

export async function getPolishGenerationMix(
  date?: string
): Promise<PolishGenerationMix | null> {
  const queryDate = date || getPublishedDate();
  const cacheKey = `pse-gen-${queryDate}`;
  const cached = getCached<PolishGenerationMix>(cacheKey);
  if (cached) return cached;

  try {
    const data = await pseFetch(`/his-wlk-cal?$filter=doba eq '${queryDate}'`);

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[PSE] No generation data for ${queryDate}`);
      return null;
    }

    const row = data[0]; // PSE returns array with one row for the date
    const result: PolishGenerationMix = {
      date: queryDate,
      pv: row.pv || 0, // GWh
      wind: row.wi || 0, // wi = wind (wiatr)
      coal: row.ko || 0, // ko = coal (węgiel)
      natural_gas: row.go || 0, // go = natural gas (gaz)
      nuclear: row.jak || 0, // jak = nuclear
      other: row.gaz || 0, // gaz = other (various)
      hydro: row.wod || 0, // wod = hydro (wodna)
      renewables_share: row.udział_oe || 0, // % renewable share
      total_demand: row.zap_kse || 0, // Total system demand
      fetchedAt: new Date().toISOString(),
    };

    setCached(cacheKey, result);
    console.log(
      `[PSE] Generation mix for ${queryDate}: renewables ${result.renewables_share}%, demand ${result.total_demand} GWh`
    );
    return result;
  } catch (err) {
    console.error(`[PSE] Failed to fetch generation for ${queryDate}`);
    return null;
  }
}

// ── RCE Prices (hourly, in PLN) ──────────────────────────────────────────────

export async function getPolishRCEPrices(
  date?: string
): Promise<RCEPriceResult | null> {
  const queryDate = date || getPublishedDate();
  const cacheKey = `pse-prices-${queryDate}`;
  const cached = getCached<RCEPriceResult>(cacheKey);
  if (cached) return cached;

  try {
    const data = await pseFetch(`/his-rce-pln?$filter=Data eq '${queryDate}'`);

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[PSE] No RCE prices for ${queryDate}`);
      return null;
    }

    const exchangeRate = await getPLNtoEURRate();
    const prices: RCEPrice[] = [];
    let sumPln = 0;
    let sumEur = 0;

    for (const row of data) {
      const pricePln = parseFloat(row.rce_pln) || 0;
      const priceEur = pricePln * exchangeRate;

      prices.push({
        date: queryDate,
        hour: parseInt(row.Godzina) || 0,
        price_pln: Math.round(pricePln * 100) / 100,
        price_eur: Math.round(priceEur * 100) / 100,
      });

      sumPln += pricePln;
      sumEur += priceEur;
    }

    if (prices.length === 0) {
      return null;
    }

    const result: RCEPriceResult = {
      date: queryDate,
      prices: prices.sort((a, b) => a.hour - b.hour),
      avg_pln: Math.round((sumPln / prices.length) * 100) / 100,
      avg_eur: Math.round((sumEur / prices.length) * 100) / 100,
      fetchedAt: new Date().toISOString(),
      conversionRate: Math.round(exchangeRate * 10000) / 10000,
    };

    setCached(cacheKey, result);
    console.log(
      `[PSE] RCE prices for ${queryDate}: avg ${result.avg_eur} EUR/MWh (${result.avg_pln} PLN/MWh)`
    );
    return result;
  } catch (err) {
    console.error(`[PSE] Failed to fetch RCE prices for ${queryDate}`);
    return null;
  }
}

// ── Cross-Border Flows (daily aggregate by hour) ──────────────────────────────

export async function getPolishCrossBorder(
  date?: string
): Promise<CrossBorderFlowResult | null> {
  const queryDate = date || getPublishedDate();
  const cacheKey = `pse-cross-border-${queryDate}`;
  const cached = getCached<CrossBorderFlowResult>(cacheKey);
  if (cached) return cached;

  try {
    const data = await pseFetch(`/his-przesyly-granica?$filter=Data eq '${queryDate}'`);

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[PSE] No cross-border data for ${queryDate}`);
      return null;
    }

    const flows: CrossBorderFlow[] = data
      .map((row) => ({
        date: queryDate,
        hour: parseInt(row.Godzina) || 0,
        czech_border: parseFloat(row.cze) || 0, // Czech Republic
        german_border: parseFloat(row.nie) || 0, // Germany (Niemcy)
        lithuanian_border: parseFloat(row.lit) || 0, // Lithuania
        slovak_border: parseFloat(row.slo) || 0, // Slovakia
        ukrainian_border: parseFloat(row.ukr) || 0, // Ukraine
      }))
      .sort((a, b) => a.hour - b.hour);

    if (flows.length === 0) {
      return null;
    }

    const result: CrossBorderFlowResult = {
      date: queryDate,
      flows,
      fetchedAt: new Date().toISOString(),
    };

    setCached(cacheKey, result);
    console.log(`[PSE] Cross-border data for ${queryDate}: ${flows.length} hourly entries`);
    return result;
  } catch (err) {
    console.error(`[PSE] Failed to fetch cross-border flows for ${queryDate}`);
    return null;
  }
}

// ── System Demand (hourly forecast vs actual) ────────────────────────────────

export async function getPolishDemand(
  date?: string
): Promise<PolishDemandResult | null> {
  const queryDate = date || getPublishedDate();
  const cacheKey = `pse-demand-${queryDate}`;
  const cached = getCached<PolishDemandResult>(cacheKey);
  if (cached) return cached;

  try {
    const data = await pseFetch(`/his-zapotrzebowanie?$filter=Data eq '${queryDate}'`);

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[PSE] No demand data for ${queryDate}`);
      return null;
    }

    const demand: PolishDemand[] = data
      .map((row) => ({
        date: queryDate,
        hour: parseInt(row.Godzina) || 0,
        actual: parseFloat(row.zycie) || 0, // Actual consumption
        forecast: parseFloat(row.prognoza) || 0, // Forecast
      }))
      .sort((a, b) => a.hour - b.hour);

    if (demand.length === 0) {
      return null;
    }

    const result: PolishDemandResult = {
      date: queryDate,
      demand,
      fetchedAt: new Date().toISOString(),
    };

    setCached(cacheKey, result);
    console.log(`[PSE] Demand data for ${queryDate}: ${demand.length} hourly entries`);
    return result;
  } catch (err) {
    console.error(`[PSE] Failed to fetch demand for ${queryDate}`);
    return null;
  }
}

// ── Fallback for ENTSO-E Poland ──────────────────────────────────────────────

/**
 * Get Polish RCE prices as fallback for ENTSO-E.
 * Returns daily average price in EUR.
 */
export async function getPolishPricesForENTSOEFallback(
  date?: string
): Promise<{ avgEurMwh: number; conversionRate: number } | null> {
  const prices = await getPolishRCEPrices(date);
  if (!prices || prices.prices.length === 0) {
    return null;
  }

  return {
    avgEurMwh: prices.avg_eur || 0,
    conversionRate: prices.conversionRate || 0,
  };
}
