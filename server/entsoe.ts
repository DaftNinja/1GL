import { parseStringPromise } from "xml2js";
import fs from "fs";
import path from "path";

// Inline concurrency limiter — avoids depending on p-limit (ESM-only, incompatible
// with the esbuild CJS production bundle).
function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          if (queue.length > 0) queue.shift()!();
        });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}

const ENTSOE_BASE = "https://web-api.tp.entsoe.eu/api";

// EIC bidding zone codes for all ENTSO-E European countries
// Validated against ENTSO-E Transparency Platform March 2026
const COUNTRY_EIC: Record<string, { eic: string; flowEic?: string; name: string; currency?: string; note?: string }> = {
  // Western & Northern Europe
  "United Kingdom":      { eic: "10YGB----------A", name: "UK", currency: "GBP", note: "No ENTSO-E day-ahead prices post-Brexit" },
  "Ireland":             { eic: "10Y1001A1001A59C", name: "IE", note: "SEM (Single Electricity Market)" },
  "Norway":              { eic: "10Y1001A1001A48H", name: "NO" },
  "Sweden":              { eic: "10Y1001A1001A46L", flowEic: "10Y1001A1001A44P", name: "SE3", note: "SE3 for day-ahead prices (Stockholm); SE1 flowEic for cross-border flows (NO/FI/PL borders)" },
  "Denmark":             { eic: "10YDK-1--------W", name: "DK", note: "DK1 (Western Denmark / Nord Pool)" },
  "Finland":             { eic: "10YFI-1--------U", name: "FI" },
  // Baltic States
  "Estonia":             { eic: "10Y1001A1001A39I", name: "EE" },
  "Latvia":              { eic: "10YLV-1001A00074", name: "LV" },
  "Lithuania":           { eic: "10YLT-1001A0008Q", name: "LT" },
  // Central Western Europe
  "Germany":             { eic: "10Y1001A1001A82H", name: "DE", note: "Germany bidding zone (post DE-AT split)" },
  "Netherlands":         { eic: "10YNL----------L", name: "NL" },
  "Belgium":             { eic: "10YBE----------2", name: "BE" },
  "Luxembourg":          { eic: "10YLU-CEGEDEL-NQ", name: "LU" },
  "France":              { eic: "10YFR-RTE------C", name: "FR" },
  "Switzerland":         { eic: "10YCH-SWISSGRIDZ", name: "CH" },
  "Austria":             { eic: "10YAT-APG------L", name: "AT" },
  // Iberian Peninsula
  "Spain":               { eic: "10YES-REE------0", name: "ES" },
  "Portugal":            { eic: "10YPT-REN------W", name: "PT" },
  // Central Eastern Europe
  "Poland":              { eic: "10YPL-AREA-----S", name: "PL" },
  "Czech Republic":      { eic: "10YCZ-CEPS-----N", name: "CZ" },
  "Slovakia":            { eic: "10YSK-SEPS-----K", name: "SK" },
  "Hungary":             { eic: "10YHU-MAVIR----U", name: "HU" },
  // Southern Europe
  "Italy":               { eic: "10Y1001A1001A73I", name: "IT" },
  "Slovenia":            { eic: "10YSI-ELES-----O", name: "SI" },
  "Croatia":             { eic: "10YHR-HEP------M", name: "HR" },
  "Greece":              { eic: "10YGR-HTSO-----Y", name: "GR" },
  // South-Eastern Europe / Balkans
  "Romania":             { eic: "10YRO-TEL------P", name: "RO" },
  "Bulgaria":            { eic: "10YCA-BULGARIA-R", name: "BG" },
  "Serbia":              { eic: "10YCS-SERBIATSOV", name: "RS" },
  "Bosnia":              { eic: "10YBA-JPCBLE-D-", name: "BA" },
  "Montenegro":          { eic: "10YCS-CG-TSO---S", name: "ME" },
  "North Macedonia":     { eic: "10YMK-MEPSO----8", name: "MK" },
  "Albania":             { eic: "10YAL-KESH-----5", name: "AL" },
  "Moldova":             { eic: "10Y1001C--00003F", name: "MD" },
  // ENTSO-E partner / observer
  "Turkey":              { eic: "10YTR-TEIAS----W", name: "TR" },
};

// PSR type codes for generation by fuel
const PSR_TYPES: Record<string, string> = {
  B01: "Biomass",
  B02: "Lignite",
  B04: "Gas",
  B05: "Hard Coal",
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-River",
  B12: "Hydro Reservoir",
  B14: "Nuclear",
  B16: "Solar",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
  B17: "Waste",
};

// Cache structure
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CacheEntry<any>>();

function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Retries an async fetch up to `maxAttempts` times with exponential backoff.
 * ENTSO-E application-level errors (e.g. error 999 "No matching data") are
 * NOT retried — they are deterministic and retrying wastes rate-limit quota.
 * Only transient failures (network timeouts, HTTP 5xx) trigger retries.
 */
async function retryFetch<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      // ENTSO-E application errors are deterministic — don't waste retries
      if (typeof err?.message === "string" && err.message.startsWith("ENTSO-E error")) throw err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * 2 ** attempt;
        console.warn(`[ENTSOE] retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts}): ${err?.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function getToken(): string | null {
  return process.env.ENTSOE_API_KEY || null;
}

function formatDate(d: Date): string {
  // ENTSOE format: YYYYMMDDHHmm
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes())
  );
}

const FETCH_TIMEOUT_MS = 20000;

async function fetchEntsoe(params: Record<string, string>): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("ENTSOE_API_KEY not configured");

  const url = new URL(ENTSOE_BASE);
  url.searchParams.set("securityToken", token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/xml" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const xml = await response.text();

  // Check for error acknowledgement (ENTSO-E returns XML even on 400)
  if (xml.includes("Acknowledgement_MarketDocument")) {
    const codeMatch = xml.match(/<code>(\d+)<\/code>/);
    const textMatch = xml.match(/<text>([^<]+)<\/text>/);
    const code = codeMatch?.[1] || "unknown";
    const msg = textMatch?.[1] || "Unknown error";
    throw new Error(`ENTSO-E error ${code}: ${msg}`);
  }

  if (!response.ok) {
    throw new Error(`ENTSO-E API ${response.status}: ${response.statusText}`);
  }

  return parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });
}

// ─── Day-Ahead Prices (documentType A44) ────────────────────────────────────

interface MonthlyPrice {
  year: number;
  month: number;
  avgEurMwh: number;
  minEurMwh: number;
  maxEurMwh: number;
  sampleCount: number;
}

interface PriceResult {
  country: string;
  eicCode: string;
  monthly: MonthlyPrice[];
  latestDayAvg: number | null;
  latestDayDate: string | null;
  annualAvg: Record<string, number>;
  currency: string;
  fetchedAt: string;
}

function parsePriceDocument(doc: any): Array<{ datetime: Date; price: number }> {
  const points: Array<{ datetime: Date; price: number }> = [];

  const root =
    doc["Publication_MarketDocument"] ||
    doc["GL_MarketDocument"] ||
    doc;

  let timeSeries = root["TimeSeries"];
  if (!timeSeries) return points;
  if (!Array.isArray(timeSeries)) timeSeries = [timeSeries];

  for (const ts of timeSeries) {
    let periods = ts["Period"];
    if (!periods) continue;
    if (!Array.isArray(periods)) periods = [periods];

    for (const period of periods) {
      const startStr: string =
        period["timeInterval"]?.["start"] ||
        period["time_Period.timeInterval"]?.["start"] ||
        "";
      if (!startStr) continue;

      const resolution: string = period["resolution"] || "PT60M";
      const resMinutes =
        resolution === "PT15M" ? 15 :
        resolution === "PT30M" ? 30 : 60;

      const startDate = new Date(startStr);

      let pts = period["Point"];
      if (!pts) continue;
      if (!Array.isArray(pts)) pts = [pts];

      for (const pt of pts) {
        const pos = parseInt(pt["position"] || "1", 10);
        const priceRaw = pt["price.amount"];
        if (priceRaw == null) continue;
        const price = parseFloat(priceRaw);
        if (isNaN(price)) continue;

        const dt = new Date(startDate.getTime() + (pos - 1) * resMinutes * 60000);
        points.push({ datetime: dt, price });
      }
    }
  }

  return points;
}

export async function getCountryDayAheadPrices(country: string): Promise<PriceResult | null> {
  const cacheKey = `prices:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  const eicInfo = COUNTRY_EIC[country];
  if (!eicInfo) return null;

  const token = getToken();
  if (!token) return null;

  const t0 = Date.now();
  try {
    // Fetch last 364 days — ENTSO-E max is P1Y (strict); 365d window exceeds it
    // by ~23h when periodEnd is set to 23:00 UTC, so we use 364 days to be safe.
    const now = new Date();
    now.setUTCHours(22, 0, 0, 0); // end at 22:00 UTC today
    const oneYearAgo = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000);
    oneYearAgo.setUTCHours(0, 0, 0, 0);

    const doc = await retryFetch(() => fetchEntsoe({
      documentType: "A44",
      in_Domain: eicInfo.eic,
      out_Domain: eicInfo.eic,
      periodStart: formatDate(oneYearAgo),
      periodEnd: formatDate(now),
    }));

    const points = parsePriceDocument(doc);
    if (points.length === 0) {
      console.log(`[prices] ${country} (${eicInfo.name}): no price points in response (${Date.now() - t0}ms)`);
      return null;
    }

    // Group by year-month
    const byYearMonth = new Map<string, number[]>();
    const byYear = new Map<string, number[]>();

    for (const { datetime, price } of points) {
      const ym = `${datetime.getUTCFullYear()}-${String(datetime.getUTCMonth() + 1).padStart(2, "0")}`;
      const yr = String(datetime.getUTCFullYear());

      if (!byYearMonth.has(ym)) byYearMonth.set(ym, []);
      byYearMonth.get(ym)!.push(price);

      if (!byYear.has(yr)) byYear.set(yr, []);
      byYear.get(yr)!.push(price);
    }

    const monthly: MonthlyPrice[] = Array.from(byYearMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, prices]) => {
        const [y, m] = ym.split("-").map(Number);
        const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
        return {
          year: y,
          month: m,
          avgEurMwh: Math.round(avg * 100) / 100,
          minEurMwh: Math.round(Math.min(...prices) * 100) / 100,
          maxEurMwh: Math.round(Math.max(...prices) * 100) / 100,
          sampleCount: prices.length,
        };
      });

    const annualAvg: Record<string, number> = {};
    for (const [yr, prices] of byYear.entries()) {
      annualAvg[yr] = Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100;
    }

    // Latest day: get the last 24 entries
    const sortedByDate = [...points].sort((a, b) => b.datetime.getTime() - a.datetime.getTime());
    const latestDate = sortedByDate[0]?.datetime;
    let latestDayAvg: number | null = null;
    let latestDayDate: string | null = null;
    if (latestDate) {
      const latestDay = latestDate.toISOString().slice(0, 10);
      const latestDayPrices = sortedByDate
        .filter((p) => p.datetime.toISOString().slice(0, 10) === latestDay)
        .map((p) => p.price);
      if (latestDayPrices.length > 0) {
        latestDayAvg = Math.round((latestDayPrices.reduce((s, p) => s + p, 0) / latestDayPrices.length) * 100) / 100;
        latestDayDate = latestDay;
      }
    }

    const result: PriceResult = {
      country,
      eicCode: eicInfo.eic,
      monthly,
      latestDayAvg,
      latestDayDate,
      annualAvg,
      currency: eicInfo.currency || "EUR",
      fetchedAt: new Date().toISOString(),
    };

    const latestMonth = monthly[monthly.length - 1];
    console.log(`[prices] ${country} (${eicInfo.name}): ${monthly.length} months, latest ${latestMonth?.avgEurMwh ?? "null"} EUR/MWh (${Date.now() - t0}ms)`);

    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (err: any) {
    const elapsed = Date.now() - t0;
    console.error(`[prices] ${country} (${eicInfo.name}): FAILED in ${elapsed}ms — ${err.message}`);
    // Serve stale cache rather than returning null — keeps the map populated
    // during ENTSO-E outages or transient maintenance windows.
    if (cached) {
      const staleAge = Math.round((Date.now() - cached.fetchedAt) / 3600000);
      console.warn(`[prices] ${country}: serving stale cache (${staleAge}h old)`);
      return cached.data;
    }
    return null;
  }
}

// ─── Actual Generation by Fuel (documentType A75) ──────────────────────────

interface GenerationFuel {
  fuelType: string;
  avgMw: number;
  totalGwh: number;
}

interface GenerationResult {
  country: string;
  period: string;
  fuels: GenerationFuel[];
  renewableSharePct: number;
  fetchedAt: string;
}

export async function getCountryGeneration(country: string): Promise<GenerationResult | null> {
  const cacheKey = `gen:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  const eicInfo = COUNTRY_EIC[country];
  if (!eicInfo) return null;

  const token = getToken();
  if (!token) return null;

  try {
    // Last 30 days of actual generation
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    now.setUTCHours(23, 0, 0, 0);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    const doc = await fetchEntsoe({
      documentType: "A75",
      processType: "A16",
      in_Domain: eicInfo.eic,
      periodStart: formatDate(thirtyDaysAgo),
      periodEnd: formatDate(now),
    });

    const root = doc["GL_MarketDocument"] || doc;
    let timeSeries = root["TimeSeries"];
    if (!timeSeries) return null;
    if (!Array.isArray(timeSeries)) timeSeries = [timeSeries];

    const fuelTotals = new Map<string, number[]>();

    for (const ts of timeSeries) {
      const psrType =
        ts["MktPSRType"]?.["psrType"] ||
        ts["psr_Type"]?.["psrType"] ||
        "Unknown";

      const fuelName = PSR_TYPES[psrType] || psrType;

      let periods = ts["Period"];
      if (!periods) continue;
      if (!Array.isArray(periods)) periods = [periods];

      for (const period of periods) {
        let pts = period["Point"];
        if (!pts) continue;
        if (!Array.isArray(pts)) pts = [pts];

        for (const pt of pts) {
          const qty = parseFloat(pt["quantity"] || "0");
          if (!isNaN(qty) && qty >= 0) {
            if (!fuelTotals.has(fuelName)) fuelTotals.set(fuelName, []);
            fuelTotals.get(fuelName)!.push(qty);
          }
        }
      }
    }

    const RENEWABLE_TYPES = new Set(["Solar", "Wind Offshore", "Wind Onshore", "Hydro Run-of-River", "Hydro Reservoir", "Geothermal", "Biomass"]);

    const fuels: GenerationFuel[] = Array.from(fuelTotals.entries())
      .map(([fuelType, readings]) => {
        const avgMw = readings.reduce((s, v) => s + v, 0) / readings.length;
        return {
          fuelType,
          avgMw: Math.round(avgMw),
          totalGwh: Math.round((avgMw * 30 * 24) / 1000),
        };
      })
      .sort((a, b) => b.avgMw - a.avgMw);

    const totalMw = fuels.reduce((s, f) => s + f.avgMw, 0);
    const renewableMw = fuels
      .filter((f) => RENEWABLE_TYPES.has(f.fuelType))
      .reduce((s, f) => s + f.avgMw, 0);
    const renewableSharePct = totalMw > 0 ? Math.round((renewableMw / totalMw) * 100) : 0;

    const result: GenerationResult = {
      country,
      period: `${thirtyDaysAgo.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`,
      fuels,
      renewableSharePct,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (err: any) {
    console.error(`ENTSO-E generation error for ${country}:`, err.message);
    return null;
  }
}

// ─── Generation Time Series per Fuel Type ────────────────────────────────────

const FUEL_COLORS: Record<string, string> = {
  "Biomass":              "#84cc16",
  "Lignite":              "#b45309",
  "Gas":                  "#f97316",
  "Hard Coal":            "#78716c",
  "Geothermal":           "#c084fc",
  "Hydro Pumped Storage": "#0ea5e9",
  "Hydro Run-of-River":   "#38bdf8",
  "Hydro Reservoir":      "#0284c7",
  "Nuclear":              "#a78bfa",
  "Oil":                  "#94a3b8",
  "Other":                "#9ca3af",
  "Solar":                "#fbbf24",
  "Waste":                "#6b7280",
  "Wind Offshore":        "#34d399",
  "Wind Onshore":         "#4ade80",
};

const RENEWABLE_TYPES_SET = new Set([
  "Solar", "Wind Offshore", "Wind Onshore",
  "Hydro Run-of-River", "Hydro Reservoir", "Geothermal", "Biomass",
]);

export interface GenTimePoint { dt: string; mw: number }
export interface FuelSeriesResult {
  fuelType: string; color: string;
  points: GenTimePoint[];
  avgMw: number; peakMw: number; totalGwh: number;
  isRenewable: boolean;
}
export interface GenerationTimeSeriesResult {
  country: string; period: string;
  fuels: FuelSeriesResult[];
  renewableSharePct: number; fetchedAt: string;
}

export async function getCountryGenerationTimeSeries(country: string): Promise<GenerationTimeSeriesResult | null> {
  const cacheKey = `gen-ts:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  const eicInfo = COUNTRY_EIC[country];
  if (!eicInfo) return null;
  const token = getToken();
  if (!token) return null;

  try {
    const now = new Date();
    now.setUTCHours(23, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);

    const doc = await fetchEntsoe({
      documentType: "A75",
      processType:  "A16",
      in_Domain:    eicInfo.eic,
      periodStart:  formatDate(sevenDaysAgo),
      periodEnd:    formatDate(now),
    });

    const root = doc["GL_MarketDocument"] || doc;
    let timeSeries = root["TimeSeries"];
    if (!timeSeries) return null;
    if (!Array.isArray(timeSeries)) timeSeries = [timeSeries];

    // Collect raw points per fuel
    const fuelRaw = new Map<string, Array<{ dt: Date; mw: number }>>();

    for (const ts of timeSeries) {
      const psrType = ts["MktPSRType"]?.["psrType"] || ts["psr_Type"]?.["psrType"] || "Unknown";
      const fuelName = PSR_TYPES[psrType] || psrType;

      let periods = ts["Period"];
      if (!periods) continue;
      if (!Array.isArray(periods)) periods = [periods];

      for (const period of periods) {
        const startStr: string = period["timeInterval"]?.["start"] || period["time_Period.timeInterval"]?.["start"] || "";
        if (!startStr) continue;
        const resolution = period["resolution"] || "PT60M";
        const resMin = resolution === "PT15M" ? 15 : resolution === "PT30M" ? 30 : 60;
        const startDate = new Date(startStr);

        let pts = period["Point"];
        if (!pts) continue;
        if (!Array.isArray(pts)) pts = [pts];

        for (const pt of pts) {
          const pos = parseInt(pt["position"] || "1", 10);
          const qty = parseFloat(pt["quantity"] || "0");
          if (!isNaN(qty) && qty >= 0) {
            const dt = new Date(startDate.getTime() + (pos - 1) * resMin * 60000);
            if (!fuelRaw.has(fuelName)) fuelRaw.set(fuelName, []);
            fuelRaw.get(fuelName)!.push({ dt, mw: qty });
          }
        }
      }
    }

    // Downsample to hourly buckets and build result
    const fuels: FuelSeriesResult[] = Array.from(fuelRaw.entries())
      .map(([fuelType, rawPts]) => {
        // Bucket by hour
        const byHour = new Map<number, number[]>();
        for (const { dt, mw } of rawPts) {
          const h = new Date(dt);
          h.setUTCMinutes(0, 0, 0);
          const key = h.getTime();
          if (!byHour.has(key)) byHour.set(key, []);
          byHour.get(key)!.push(mw);
        }
        const points: GenTimePoint[] = Array.from(byHour.entries())
          .sort(([a], [b]) => a - b)
          .map(([ts, vals]) => ({
            dt: new Date(ts).toISOString(),
            mw: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
          }));

        const mwValues = points.map(p => p.mw);
        const avgMw = mwValues.length ? Math.round(mwValues.reduce((s, v) => s + v, 0) / mwValues.length) : 0;
        const peakMw = mwValues.length ? Math.max(...mwValues) : 0;
        const totalGwh = Math.round((avgMw * 7 * 24) / 1000);

        return {
          fuelType, color: FUEL_COLORS[fuelType] || "#94a3b8",
          points, avgMw, peakMw, totalGwh,
          isRenewable: RENEWABLE_TYPES_SET.has(fuelType),
        };
      })
      .filter(f => f.peakMw > 0)
      .sort((a, b) => b.avgMw - a.avgMw);

    const totalAvg = fuels.reduce((s, f) => s + f.avgMw, 0);
    const renewableAvg = fuels.filter(f => f.isRenewable).reduce((s, f) => s + f.avgMw, 0);
    const renewableSharePct = totalAvg > 0 ? Math.round((renewableAvg / totalAvg) * 100) : 0;

    const result: GenerationTimeSeriesResult = {
      country, period: `${sevenDaysAgo.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`,
      fuels, renewableSharePct, fetchedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (err: any) {
    console.error(`ENTSO-E generation TS error for ${country}:`, err.message);
    return null;
  }
}

// ─── All Countries Summary (for global comparison chart) ───────────────────

export interface CountrySummary {
  country: string;
  code: string;
  latestMonthAvg: number | null;
  latestMonthLabel: string | null;
  annualAvg: Record<string, number>;
  eicCode: string;
  estimated?: boolean;
  estimatedNote?: string;
}

// ─── UK Day-Ahead Price via Elexon BMRS (N2EX market index) ─────────────────
// UK left EU internal electricity market post-Brexit so ENTSO-E has no GB prices.
// Elexon publishes N2EX day-ahead market index data (GBP/MWh) at no cost.
// Fixed GBP→EUR conversion rate — updated periodically.
const GBP_TO_EUR = 1.175;

async function getUKElexonPriceEstimate(): Promise<{
  avgEurMwh: number;
  avgGbpMwh: number;
  label: string;
} | null> {
  try {
    const now = new Date();
    // Elexon MID API has a 7-day max range — use last 7 days for a current estimate
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromStr = from.toISOString().replace(/\.\d{3}Z$/, "Z");
    const toStr   = now.toISOString().replace(/\.\d{3}Z$/, "Z");

    // APXMIDP (APX Power UK) has full settlement-period coverage; N2EXMIDP is sparse
    const url = `https://data.elexon.co.uk/bmrs/api/v1/datasets/MID?from=${fromStr}&to=${toStr}&dataProviders=APXMIDP`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) {
      console.warn(`Elexon MID API returned ${resp.status}`);
      return null;
    }
    const json = await resp.json() as { data: Array<{ price?: number | null }> };
    const prices = (json.data ?? [])
      .map(d => d.price)
      .filter((p): p is number => typeof p === "number" && p > 0 && p < 2000);

    if (prices.length === 0) return null;

    const avgGbpMwh = prices.reduce((a, b) => a + b, 0) / prices.length;
    const avgEurMwh = avgGbpMwh * GBP_TO_EUR;
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return {
      avgGbpMwh: Math.round(avgGbpMwh * 10) / 10,
      avgEurMwh: Math.round(avgEurMwh * 10) / 10,
      label: `${year}-${month} (7d avg)`,
    };
  } catch (err) {
    console.warn("Elexon MID fetch failed:", (err as Error).message);
    return null;
  }
}

export async function getAllCountriesPriceSummary(): Promise<CountrySummary[]> {
  const cacheKey = "all-countries-summary";
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  // Fetch ENTSO-E prices in batches of 5 to avoid rate-limiting, UK Elexon in parallel
  const countries = Object.keys(COUNTRY_EIC);
  const batchSize = 5;
  const allResults: PromiseSettledResult<any>[] = [];
  for (let i = 0; i < countries.length; i += batchSize) {
    const batch = countries.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((country) => getCountryDayAheadPrices(country))
    );
    allResults.push(...batchResults);
  }
  const [results, ukEstimate] = [allResults, await getUKElexonPriceEstimate()];

  const summaries: CountrySummary[] = [];

  for (let i = 0; i < results.length; i++) {
    const country = Object.keys(COUNTRY_EIC)[i];
    const eicInfo = COUNTRY_EIC[country];
    const result = results[i];

    if (country === "United Kingdom") {
      // UK has no ENTSO-E price post-Brexit — use Elexon N2EX estimate
      summaries.push({
        country,
        code: eicInfo.name,
        latestMonthAvg: ukEstimate?.avgEurMwh ?? null,
        latestMonthLabel: ukEstimate?.label ?? null,
        annualAvg: {},
        eicCode: eicInfo.eic,
        estimated: true,
        estimatedNote: ukEstimate
          ? `Elexon APX 7-day avg ${ukEstimate.avgGbpMwh} GBP/MWh × ${GBP_TO_EUR} GBP/EUR`
          : "No Elexon data available",
      });
      continue;
    }

    if (result.status === "fulfilled" && result.value) {
      const pr = result.value;
      const lastMonth = pr.monthly[pr.monthly.length - 1];
      summaries.push({
        country,
        code: eicInfo.name,
        latestMonthAvg: lastMonth?.avgEurMwh ?? null,
        latestMonthLabel: lastMonth ? `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}` : null,
        annualAvg: pr.annualAvg,
        eicCode: eicInfo.eic,
      });
    } else {
      summaries.push({
        country,
        code: eicInfo.name,
        latestMonthAvg: null,
        latestMonthLabel: null,
        annualAvg: {},
        eicCode: eicInfo.eic,
      });
    }
  }

  const withPrice = summaries.filter(s => s.latestMonthAvg !== null);
  const nullPrice  = summaries.filter(s => s.latestMonthAvg === null);
  console.log(`[prices] all-countries summary: ${withPrice.length}/${summaries.length} have prices | null: ${nullPrice.map(s => s.code).join(", ")}`);

  cache.set(cacheKey, { data: summaries, fetchedAt: Date.now() });
  return summaries;
}

// ─── Cross-border Physical Flows (documentType A11) ─────────────────────────

const CROSS_BORDER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const INTERCONNECTOR_PAIRS: Array<{ from: string; to: string }> = [
  // Nordic
  { from: "Norway",         to: "Sweden" },
  { from: "Norway",         to: "Finland" },
  { from: "Norway",         to: "Denmark" },
  { from: "Norway",         to: "Netherlands" },
  { from: "Norway",         to: "United Kingdom" },
  { from: "Norway",         to: "Germany" },
  { from: "Sweden",         to: "Finland" },
  { from: "Sweden",         to: "Denmark" },
  { from: "Sweden",         to: "Poland" },
  { from: "Denmark",        to: "Germany" },
  { from: "Denmark",        to: "Netherlands" },
  // Baltic States
  { from: "Estonia",        to: "Latvia" },
  { from: "Estonia",        to: "Finland" },
  { from: "Latvia",         to: "Lithuania" },
  { from: "Lithuania",      to: "Poland" },
  // Central Western Europe
  { from: "Germany",        to: "Netherlands" },
  { from: "Germany",        to: "Belgium" },
  { from: "Germany",        to: "France" },
  { from: "Germany",        to: "Poland" },
  { from: "Germany",        to: "Switzerland" },
  { from: "Germany",        to: "Austria" },
  { from: "Germany",        to: "Czech Republic" },
  { from: "Germany",        to: "Luxembourg" },
  { from: "France",         to: "Belgium" },
  { from: "France",         to: "Spain" },
  { from: "France",         to: "Italy" },
  { from: "France",         to: "Switzerland" },
  { from: "France",         to: "United Kingdom" },
  { from: "France",         to: "Luxembourg" },
  { from: "Belgium",        to: "Netherlands" },
  { from: "Belgium",        to: "United Kingdom" },
  { from: "Belgium",        to: "Luxembourg" },
  { from: "United Kingdom", to: "Ireland" },
  // Switzerland / Austria
  { from: "Switzerland",    to: "Austria" },
  { from: "Switzerland",    to: "Italy" },
  { from: "Austria",        to: "Italy" },
  { from: "Austria",        to: "Czech Republic" },
  { from: "Austria",        to: "Slovakia" },
  { from: "Austria",        to: "Hungary" },
  { from: "Austria",        to: "Slovenia" },
  // Central Eastern Europe
  { from: "Czech Republic", to: "Slovakia" },
  { from: "Czech Republic", to: "Poland" },
  { from: "Slovakia",       to: "Hungary" },
  { from: "Slovakia",       to: "Poland" },
  // South-Eastern Europe
  { from: "Hungary",        to: "Romania" },
  { from: "Hungary",        to: "Croatia" },
  { from: "Hungary",        to: "Serbia" },
  { from: "Hungary",        to: "Slovenia" },
  { from: "Romania",        to: "Bulgaria" },
  { from: "Romania",        to: "Serbia" },
  { from: "Romania",        to: "Moldova" },
  { from: "Bulgaria",       to: "Greece" },
  { from: "Bulgaria",       to: "Serbia" },
  { from: "Bulgaria",       to: "North Macedonia" },
  { from: "Croatia",        to: "Slovenia" },
  { from: "Croatia",        to: "Serbia" },
  { from: "Croatia",        to: "Bosnia" },
  { from: "Slovenia",       to: "Italy" },
  // Balkans
  { from: "Serbia",         to: "Bosnia" },
  { from: "Serbia",         to: "Montenegro" },
  { from: "Serbia",         to: "North Macedonia" },
  { from: "Bosnia",         to: "Montenegro" },
  { from: "Montenegro",     to: "Albania" },
  { from: "North Macedonia",to: "Greece" },
  { from: "North Macedonia",to: "Albania" },
  { from: "Albania",        to: "Greece" },
  { from: "Albania",        to: "Italy" },
  // Turkey borders
  { from: "Turkey",         to: "Greece" },
  { from: "Turkey",         to: "Bulgaria" },
  // Iberian
  { from: "Spain",          to: "Portugal" },
];

export interface CrossBorderFlow {
  from: string;
  to: string;
  netMw: number;
  inMw: number;
  outMw: number;
  updatedAt: string;
}

function parseFlowQuantity(doc: any): { qty: number; ts: number } {
  const root =
    doc["Publication_MarketDocument"] ||
    doc["GL_MarketDocument"] ||
    doc;

  let timeSeries = root["TimeSeries"];
  if (!timeSeries) return { qty: 0, ts: 0 };
  if (!Array.isArray(timeSeries)) timeSeries = [timeSeries];

  let latestVal = 0;
  let latestTime = 0;

  for (const ts of timeSeries) {
    let periods = ts["Period"];
    if (!periods) continue;
    if (!Array.isArray(periods)) periods = [periods];

    for (const period of periods) {
      const startStr: string =
        period["timeInterval"]?.["start"] ||
        period["time_Period.timeInterval"]?.["start"] ||
        "";
      if (!startStr) continue;

      const resolution = period["resolution"] || "PT60M";
      const resMin = resolution === "PT15M" ? 15 : resolution === "PT30M" ? 30 : 60;
      const startDate = new Date(startStr);

      let pts = period["Point"];
      if (!pts) continue;
      if (!Array.isArray(pts)) pts = [pts];

      for (const pt of pts) {
        const pos = parseInt(pt["position"] || "1", 10);
        const qty = parseFloat(pt["quantity"] || "0");
        if (isNaN(qty)) continue;
        const dt = new Date(startDate.getTime() + (pos - 1) * resMin * 60000);
        if (dt.getTime() > latestTime) {
          latestTime = dt.getTime();
          latestVal = qty;
        }
      }
    }
  }

  return { qty: latestVal, ts: latestTime };
}

async function fetchDirectionalFlow(fromEic: string, toEic: string, periodStart: string, periodEnd: string): Promise<{ value: number; ts: number }> {
  try {
    const doc = await fetchEntsoe({
      documentType: "A11",
      in_Domain: toEic,
      out_Domain: fromEic,
      periodStart,
      periodEnd,
    });
    const { qty, ts } = parseFlowQuantity(doc);
    return { value: qty, ts };
  } catch (err: any) {
    if (err.message?.includes("999") || err.message?.includes("No matching data")) {
      return { value: 0, ts: 0 }; // TSO hasn't submitted data for this border/window yet
    }
    // Log unexpected errors (e.g. 401 auth, 400 bad params) so they show in Railway logs
    console.warn(`[ENTSOE A11] ${fromEic}→${toEic}: ${err.message}`);
    return { value: 0, ts: 0 };
  }
}

// Two high-volume interconnectors used as lightweight data-availability probes.
// If either has ENTSO-E data for a given hour, we treat that hour as available.
const PROBE_PAIRS: Array<{ from: string; to: string }> = [
  { from: "Germany", to: "France" },
  { from: "Norway",  to: "Sweden" },
];
const LATEST_OFFSET_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function probeHourHasData(offset: number): Promise<boolean> {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const targetHour = new Date(now.getTime() - offset * 60 * 60 * 1000);
  // 24h lookback window matches the main query so probe detects slow-publishing TSOs.
  const periodStart = formatDate(new Date(targetHour.getTime() - 24 * 60 * 60 * 1000));
  const periodEnd   = formatDate(new Date(targetHour.getTime() + 60 * 60 * 1000));
  for (const pair of PROBE_PAIRS) {
    const fromEic = COUNTRY_EIC[pair.from]?.flowEic ?? COUNTRY_EIC[pair.from]?.eic;
    const toEic   = COUNTRY_EIC[pair.to]?.flowEic   ?? COUNTRY_EIC[pair.to]?.eic;
    if (!fromEic || !toEic) continue;
    const { ts } = await fetchDirectionalFlow(fromEic, toEic, periodStart, periodEnd);
    if (ts > 0) return true;
  }
  return false;
}

export async function findLatestAvailableHourOffset(): Promise<number> {
  const cacheKey = "latest-available-offset";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LATEST_OFFSET_CACHE_TTL_MS) {
    return cached.data as number;
  }
  let found = 1; // fallback: 1 hour ago
  for (let offset = 0; offset <= 23; offset++) {
    if (await probeHourHasData(offset)) { found = offset; break; }
  }
  console.log(`[ENTSOE A11] latest available hour offset: ${found}`);
  cache.set(cacheKey, { data: found, fetchedAt: Date.now() });
  return found;
}

// Border pairs that consistently return ENTSO-E error 999 (no data published).
// Skipped on normal fetch cycles; re-checked every 6th cycle to catch TSO re-activation.
const KNOWN_EMPTY_BORDERS = new Set([
  "Albania→North Macedonia",
  "Albania→Montenegro",
  "Albania→Greece",
  "Bosnia→Croatia",
  "Bosnia→Serbia",
  "Bosnia→Montenegro",
  "Kosovo→Serbia",
  "Kosovo→North Macedonia",
  "Kosovo→Albania",
  "Kosovo→Montenegro",
  "Moldova→Romania",
  "Moldova→Ukraine",
  "Montenegro→Serbia",
  "Montenegro→North Macedonia",
  "North Macedonia→Greece",
  "North Macedonia→Bulgaria",
  "North Macedonia→Serbia",
  "Serbia→Bulgaria",
  "Serbia→Romania",
  "Serbia→Hungary",
  "Ukraine→Slovakia",
  "Ukraine→Hungary",
]);

let crossBorderFetchCycle = 0;

export async function getCrossBorderFlows(hourOffset: number = 0): Promise<CrossBorderFlow[]> {
  const cacheKey = `cross-border-flows:${hourOffset}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CROSS_BORDER_CACHE_TTL_MS) {
    return cached.data;
  }

  const token = getToken();
  if (!token) return [];

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const targetHour = new Date(now.getTime() - hourOffset * 60 * 60 * 1000);
  // 24h lookback window: Western European TSOs (Germany, France, UK, NL, BE) publish
  // A11 physical-flow data with ~24h lag; Eastern European / Iberian TSOs publish in 2–4h.
  // parseFlowQuantity picks the LATEST available point per pair, so slow publishers show
  // their most-recent confirmed value while fast publishers show near-real-time data.
  const periodStart = formatDate(new Date(targetHour.getTime() - 24 * 60 * 60 * 1000));
  const periodEnd   = formatDate(new Date(targetHour.getTime() + 1 * 60 * 60 * 1000));

  const isReCheckCycle = crossBorderFetchCycle % 6 === 0;
  crossBorderFetchCycle++;

  const activePairs = INTERCONNECTOR_PAIRS.filter((pair) => {
    if (!isReCheckCycle && KNOWN_EMPTY_BORDERS.has(`${pair.from}→${pair.to}`)) return false;
    return true;
  });
  const skippedCount = INTERCONNECTOR_PAIRS.length - activePairs.length;

  const fetchStart = Date.now();
  console.log(`[ENTSOE A11] Fetching ${activePairs.length} borders (${skippedCount} skipped) with concurrency=4 | hourOffset: ${hourOffset} | window: ${periodStart} → ${periodEnd}`);

  const flows: CrossBorderFlow[] = [];
  let maxDataTs = 0; // track the most recent ENTSO-E data point timestamp across all pairs
  const bordersWithData: string[] = [];
  const bordersNoData: string[] = [];

  const limit = pLimit(4);

  const results = await Promise.allSettled(
    activePairs.map((pair) =>
      limit(async () => {
        const fromEic = COUNTRY_EIC[pair.from]?.flowEic ?? COUNTRY_EIC[pair.from]?.eic;
        const toEic = COUNTRY_EIC[pair.to]?.flowEic   ?? COUNTRY_EIC[pair.to]?.eic;
        if (!fromEic || !toEic) return null;

        const [outFlow, inFlow] = await Promise.allSettled([
          fetchDirectionalFlow(fromEic, toEic, periodStart, periodEnd),
          fetchDirectionalFlow(toEic, fromEic, periodStart, periodEnd),
        ]);

        const outMw = outFlow.status === "fulfilled" ? outFlow.value.value : 0;
        const inMw = inFlow.status === "fulfilled" ? inFlow.value.value : 0;
        const netMw = inMw - outMw;

        // Propagate the latest data timestamp from either direction
        const outTs = outFlow.status === "fulfilled" ? outFlow.value.ts : 0;
        const inTs = inFlow.status === "fulfilled" ? inFlow.value.ts : 0;
        const pairTs = Math.max(outTs, inTs);
        if (pairTs > maxDataTs) maxDataTs = pairTs;

        const label = `${pair.from}→${pair.to}`;
        if (pairTs > 0) {
          bordersWithData.push(`${label}(${outMw}out/${inMw}in)`);
        } else {
          bordersNoData.push(label);
        }

        return {
          from: pair.from,
          to: pair.to,
          netMw: Math.round(netMw),
          inMw: Math.round(inMw),
          outMw: Math.round(outMw),
          updatedAt: new Date().toISOString(), // filled in below once maxDataTs is known
        } as CrossBorderFlow;
      })
    )
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      flows.push(r.value);
    }
  }

  const elapsed = Date.now() - fetchStart;
  console.log(`[ENTSOE A11] fetch complete in ${elapsed}ms`);

  // Replace the placeholder updatedAt with the actual most-recent ENTSO-E data timestamp.
  // Falls back to the request time if no data points were found.
  const dataTimestamp = maxDataTs > 0 ? new Date(maxDataTs).toISOString() : new Date().toISOString();
  for (const f of flows) f.updatedAt = dataTimestamp;

  console.log(`[ENTSOE A11] ${bordersWithData.length}/${INTERCONNECTOR_PAIRS.length} borders have data | latest data point: ${dataTimestamp}`);
  if (bordersWithData.length > 0) {
    console.log(`[ENTSOE A11] borders WITH data: ${bordersWithData.join(", ")}`);
  }
  if (bordersNoData.length > 0) {
    console.log(`[ENTSOE A11] borders NO data (error 999 or no TSO submission): ${bordersNoData.join(", ")}`);
  }

  cache.set(cacheKey, { data: flows, fetchedAt: Date.now() });
  return flows;
}

export function isEntsoeConfigured(): boolean {
  return !!getToken();
}

// Background pre-fetch: warm the cross-border flows cache on startup and every 15 minutes
// so frontend requests are served from cache rather than waiting 30-60s for live fetches.
async function backgroundPrefetch() {
  if (!isEntsoeConfigured()) return;
  try {
    const offset = await findLatestAvailableHourOffset();
    await getCrossBorderFlows(offset);
  } catch (err: any) {
    console.log(`[ENTSOE A11] background pre-fetch error: ${err.message}`);
  }
}

// Fire once after startup (defer to avoid blocking server init), then every 15 minutes.
setImmediate(() => {
  backgroundPrefetch();
  setInterval(backgroundPrefetch, 15 * 60 * 1000);
});
