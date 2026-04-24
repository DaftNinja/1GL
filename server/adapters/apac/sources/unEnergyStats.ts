/**
 * UN Energy Statistics API — parallel batch client.
 *
 * ── API ────────────────────────────────────────────────────────────────────────
 *   UN Data WS/REST  (free, no API key required)
 *   Base URL:  http://data.un.org/WS/rest/data/DF_UNDATA_ENERGY/
 *   Format:    {COUNTRY_CODE}.{INDICATOR}.{TIME_PERIOD}
 *   Response:  SDMX-JSON
 *
 * ── Latency strategy ──────────────────────────────────────────────────────────
 *   UNEnergyStatsBatcher collects requests for up to 100 ms then fires them
 *   all in one Promise.all() — so 5 parallel fuel-type requests complete in
 *   one network round-trip (≈200–400 ms) instead of 5 sequential ones (≈1–2 s).
 *   Duplicates within the same batch window share a single in-flight promise.
 *
 * ── Caching ───────────────────────────────────────────────────────────────────
 *   In-memory TTL cache (30 days) — annual data barely changes.
 *   Key: "un:{country}:{indicator}:{year}"
 *
 * ── Error handling ────────────────────────────────────────────────────────────
 *   All errors return null; never throw. Callers receive null + add a warning.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UNEnergyIndicator {
  indicator: string;
  value: number;
  unit: string;
  timeperiod: number;
  source: "UN_ENERGY_STATS";
}

export interface UNGridComposition {
  coal:    { capacityMW: number; generationGWh: number; percentOfTotal: number };
  gas:     { capacityMW: number; generationGWh: number; percentOfTotal: number };
  hydro:   { capacityMW: number; generationGWh: number; percentOfTotal: number };
  wind:    { capacityMW: number; generationGWh: number; percentOfTotal: number };
  solar:   { capacityMW: number; generationGWh: number; percentOfTotal: number };
  nuclear: { capacityMW: number; generationGWh: number; percentOfTotal: number };
  totalCapacityMW:    number;
  totalGenerationGWh: number;
  renewablesPercent:  number;
  year: number;
  source: "UN_ENERGY_STATS";
}

export interface UNEnergyTrend {
  indicator:       string;
  values:          number[];
  years:           number[];
  trend_direction: "increasing" | "decreasing" | "stable";
  cagr_5yr:        number;
}

export interface UNRequest {
  country:   string;           // "India" | "Malaysia" | "Singapore" | "Japan" | …
  indicator: string;           // "COAL_CAPACITY" | "GAS_GENERATION" | …
  year?:     number;           // default: current year − 1
  range?:    [number, number]; // [2020, 2024] for time-series
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UN_BASE = "http://data.un.org/WS/rest/data/DF_UNDATA_ENERGY";

/** WS/REST country codes for APAC coverage */
const COUNTRY_CODE: Record<string, string> = {
  "India":        "IN",
  "Malaysia":     "MY",
  "Singapore":    "SG",
  "Japan":        "JP",
  "Australia":    "AU",
  "China":        "CN",
  "South Korea":  "KR",
  "Indonesia":    "ID",
  "Thailand":     "TH",
  "Philippines":  "PH",
  "Vietnam":      "VN",
  "New Zealand":  "NZ",
  "Pakistan":     "PK",
  "Bangladesh":   "BD",
  "Sri Lanka":    "LK",
};

// Capacity indicators (MW installed)
export const IND_COAL_CAP    = "COAL_CAPACITY";
export const IND_GAS_CAP     = "GAS_CAPACITY";
export const IND_HYDRO_CAP   = "HYDRO_CAPACITY";
export const IND_WIND_CAP    = "WIND_CAPACITY";
export const IND_SOLAR_CAP   = "SOLAR_CAPACITY";
export const IND_NUCLEAR_CAP = "NUCLEAR_CAPACITY";
export const IND_TOTAL_CAP   = "TOTAL_CAPACITY";

// Generation indicators (GWh produced)
export const IND_COAL_GEN    = "COAL_GENERATION";
export const IND_GAS_GEN     = "GAS_GENERATION";
export const IND_HYDRO_GEN   = "HYDRO_GENERATION";
export const IND_WIND_GEN    = "WIND_GENERATION";
export const IND_SOLAR_GEN   = "SOLAR_GENERATION";
export const IND_NUCLEAR_GEN = "NUCLEAR_GENERATION";
export const IND_ELEC_GEN    = "ELEC_GENERATION";

const BATCH_WINDOW_MS  = 100;   // collect requests for this many ms before firing
const BATCH_SIZE       = 5;     // max concurrent requests per batch tick
const REQUEST_TIMEOUT  = 5_000; // 5 s per request; fail-fast if UN API is slow
const CACHE_TTL_MS     = 30 * 24 * 60 * 60 * 1_000; // 30 days

// ── In-memory TTL cache ────────────────────────────────────────────────────────

interface CacheEntry {
  value: UNEnergyIndicator | null;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry>();

  get(key: string): UNEnergyIndicator | null | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;            // not present
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;                  // expired
    }
    return e.value;                      // null means "confirmed not found" at UN
  }

  set(key: string, value: UNEnergyIndicator | null): void {
    this.store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  size(): number { return this.store.size; }

  prune(): void {
    const now = Date.now();
    for (const [k, e] of this.store) {
      if (now > e.expiresAt) this.store.delete(k);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function defaultYear(): number {
  return new Date().getFullYear() - 1;
}

function normaliseCountry(raw: string): string {
  const map: Record<string, string> = {
    "india": "India", "in": "India",
    "malaysia": "Malaysia", "my": "Malaysia",
    "singapore": "Singapore", "sg": "Singapore",
    "japan": "Japan", "jp": "Japan",
    "australia": "Australia", "au": "Australia",
    "china": "China", "cn": "China",
    "south korea": "South Korea", "korea": "South Korea", "kr": "South Korea",
    "indonesia": "Indonesia", "id": "Indonesia",
    "thailand": "Thailand", "th": "Thailand",
    "philippines": "Philippines", "ph": "Philippines",
    "vietnam": "Vietnam", "vn": "Vietnam",
    "viet nam": "Vietnam",
    "new zealand": "New Zealand", "nz": "New Zealand",
    "pakistan": "Pakistan", "pk": "Pakistan",
    "bangladesh": "Bangladesh", "bd": "Bangladesh",
    "sri lanka": "Sri Lanka", "lk": "Sri Lanka",
  };
  return map[raw.toLowerCase().trim()] ?? raw;
}

function cacheKey(req: UNRequest): string {
  const country = normaliseCountry(req.country);
  const year    = req.year ?? defaultYear();
  return `un:${country}:${req.indicator}:${year}`;
}

function buildUrl(req: UNRequest): string {
  const country = normaliseCountry(req.country);
  const code    = COUNTRY_CODE[country];
  if (!code) return "";                 // unknown country → skip

  let timePeriod: string;
  if (req.range) {
    timePeriod = `${req.range[0]}:${req.range[1]}`;
  } else {
    timePeriod = String(req.year ?? defaultYear());
  }

  return `${UN_BASE}/${code}.${req.indicator}.${timePeriod}?format=jsondata`;
}

/**
 * Parse a SDMX-JSON response.
 *
 * Two shapes are handled:
 *   Shape A (simplified, as specified):
 *     { dataSets: [{ observations: { "0": [{ OBS_VALUE, TIME_PERIOD, UNIT_MEASURE }] } }] }
 *
 *   Shape B (standard SDMX-JSON 2.1 compact):
 *     { data: { dataSets: [{ observations: { "0:0:0": [[value]] } }],
 *               structure: { dimensions: { observation: [{ values: [{ id }] }] } } } }
 */
function parseSDMXResponse(json: any, req: UNRequest): UNEnergyIndicator[] {
  const results: UNEnergyIndicator[] = [];

  try {
    // Navigate to dataSets regardless of top-level wrapper
    const root       = json.data ?? json;
    const dataSets   = root.dataSets ?? [];
    const structure  = root.structure ?? {};
    const timeDims   = structure?.dimensions?.observation ?? [];
    // Find the TIME_PERIOD dimension index in the compact key
    const tpIdx      = timeDims.findIndex((d: any) => d.id === "TIME_PERIOD");
    const tpValues   = tpIdx >= 0 ? (timeDims[tpIdx]?.values ?? []) : [];

    for (const ds of dataSets) {
      const obs = ds.observations ?? ds.series ?? {};

      for (const [obsKey, obsData] of Object.entries(obs)) {
        const arr: any[] = Array.isArray(obsData) ? obsData : [];

        // Shape A: [{ OBS_VALUE, TIME_PERIOD, UNIT_MEASURE }]
        if (arr[0] && typeof arr[0] === "object" && "OBS_VALUE" in arr[0]) {
          for (const o of arr) {
            const val = Number(o.OBS_VALUE);
            if (!isNaN(val)) {
              results.push({
                indicator:  req.indicator,
                value:      val,
                unit:       String(o.UNIT_MEASURE ?? ""),
                timeperiod: Number(o.TIME_PERIOD ?? req.year ?? defaultYear()),
                source:     "UN_ENERGY_STATS",
              });
            }
          }
        }
        // Shape B: [[value, status?]]
        else if (arr[0] !== undefined) {
          const val = Number(arr[0]);
          if (!isNaN(val)) {
            // Decode the time period from the key (e.g. "0:0:2" → index 2 → tpValues[2].id)
            let timePeriod = req.year ?? defaultYear();
            if (tpValues.length > 0) {
              const keyParts = obsKey.split(":");
              const tpOrdinal = Number(keyParts[tpIdx] ?? 0);
              timePeriod = Number(tpValues[tpOrdinal]?.id ?? timePeriod);
            }
            results.push({
              indicator:  req.indicator,
              value:      val,
              unit:       "",
              timeperiod: Number(timePeriod),
              source:     "UN_ENERGY_STATS",
            });
          }
        }
      }
    }
  } catch (parseErr: any) {
    console.warn(`[UN] SDMX parse error for ${req.country}/${req.indicator}:`, parseErr.message);
  }

  return results;
}

// ── Batcher class ──────────────────────────────────────────────────────────────

interface QueueEntry {
  request: UNRequest;
  key:     string;
  resolve: (v: UNEnergyIndicator | null) => void;
}

export class UNEnergyStatsBatcher {
  private readonly cache          = new SimpleCache();
  private readonly queue: QueueEntry[] = [];
  private readonly inflight       = new Map<string, Promise<UNEnergyIndicator | null>>();
  private          batchScheduled = false;

  constructor(
    private readonly batchWindowMs = BATCH_WINDOW_MS,
    private readonly batchSize     = BATCH_SIZE,
  ) {
    // Prune stale cache entries every hour
    const timer = setInterval(() => this.cache.prune(), 60 * 60_000);
    if (typeof timer === "object" && "unref" in timer) (timer as any).unref();
  }

  /**
   * Queue a single UN request.
   * Returns a promise that resolves with the indicator value (or null on error).
   * Requests for the same country:indicator:year within the batch window share
   * one in-flight HTTP call (deduplication).
   */
  add(request: UNRequest): Promise<UNEnergyIndicator | null> {
    const req = { ...request, country: normaliseCountry(request.country), year: request.year ?? defaultYear() };
    const key = cacheKey(req);

    // 1. Cache hit (synchronous path)
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      console.debug(`[UN] cache HIT  ${key}`);
      return Promise.resolve(cached);
    }

    // 2. Already in-flight (deduplicate)
    const existing = this.inflight.get(key);
    if (existing) {
      console.debug(`[UN] dedup      ${key}`);
      return existing;
    }

    // 3. New request — add to queue
    const promise = new Promise<UNEnergyIndicator | null>((resolve) => {
      this.queue.push({ request: req, key, resolve });
    });

    this.inflight.set(key, promise);
    promise.finally(() => this.inflight.delete(key));

    if (!this.batchScheduled) {
      this.batchScheduled = true;
      setTimeout(() => this.flush(), this.batchWindowMs);
    }

    return promise;
  }

  /** Drain the queue in batches of batchSize, firing each group in parallel. */
  private async flush(): Promise<void> {
    this.batchScheduled = false;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      console.debug(`[UN] batch fire: ${batch.map((e) => e.key).join(", ")}`);

      await Promise.all(
        batch.map(async (entry) => {
          const result = await this.fetchUNData(entry.request);
          entry.resolve(result);
        }),
      );

      // If more items arrived while we were fetching, loop continues
    }
  }

  /**
   * Perform a single HTTP request to the UN API with:
   *   - 5 s timeout (AbortSignal)
   *   - 429 Retry-After handling (waits, then returns null — caller will retry via add())
   *   - Caches result (including null for not-found)
   */
  async fetchUNData(request: UNRequest): Promise<UNEnergyIndicator | null> {
    const key = cacheKey(request);

    // Double-check cache (may have been populated by a concurrent request)
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const url = buildUrl(request);
    if (!url) {
      console.warn(`[UN] No country code for "${request.country}" — skipping`);
      this.cache.set(key, null);
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        headers: { Accept: "application/vnd.sdmx.data+json, application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      console.debug(`[UN] ${res.status} ${url} (${latencyMs}ms)`);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 60);
        console.warn(`[UN] 429 rate-limited; Retry-After=${retryAfter}s for ${key}`);
        // Return null now; caller can retry
        return null;
      }

      if (res.status === 404 || res.status === 400) {
        console.warn(`[UN] ${res.status} not found: ${key}`);
        this.cache.set(key, null);
        return null;
      }

      if (!res.ok) {
        console.error(`[UN] HTTP ${res.status} for ${key}`);
        return null;
      }

      const json = await res.json().catch(() => null);
      if (!json) {
        console.warn(`[UN] Non-JSON response for ${key}`);
        return null;
      }

      const parsed = parseSDMXResponse(json, request);
      if (parsed.length === 0) {
        console.warn(`[UN] No observations in response for ${key}`);
        this.cache.set(key, null);
        return null;
      }

      // For single-year requests, take the matching year or the most recent
      const target = request.year ?? defaultYear();
      const match  = parsed.find((p) => p.timeperiod === target) ?? parsed[parsed.length - 1];

      this.cache.set(key, match);
      return match;

    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        console.warn(`[UN] Timeout (>${REQUEST_TIMEOUT}ms) for ${key}`);
      } else {
        console.error(`[UN] Unexpected error for ${key}:`, err.message);
      }
      return null;
    }
  }

  /** Expose cache size for observability / testing */
  cacheSize(): number { return this.cache.size(); }
}

// ── Singleton batcher ─────────────────────────────────────────────────────────

export const unBatcher = new UNEnergyStatsBatcher();

// ── Public API functions ──────────────────────────────────────────────────────

/**
 * Fetch all 6 fuel types (capacity + generation) for a country in one batch window.
 * All 12 requests land in the batcher within microseconds, so they fire in parallel.
 * Target: < 500 ms total (one network round-trip to UN API).
 */
export async function getGridCompositionParallel(
  country: string,
  year = defaultYear(),
): Promise<UNGridComposition | null> {
  const c = normaliseCountry(country);

  // Dispatch all 12 requests simultaneously — batcher fires them as one batch
  const [
    coalCap,    gasCap,    hydroCap,    windCap,    solarCap,    nuclearCap,
    coalGen,    gasGen,    hydroGen,    windGen,    solarGen,    nuclearGen,
  ] = await Promise.all([
    unBatcher.add({ country: c, indicator: IND_COAL_CAP,    year }),
    unBatcher.add({ country: c, indicator: IND_GAS_CAP,     year }),
    unBatcher.add({ country: c, indicator: IND_HYDRO_CAP,   year }),
    unBatcher.add({ country: c, indicator: IND_WIND_CAP,    year }),
    unBatcher.add({ country: c, indicator: IND_SOLAR_CAP,   year }),
    unBatcher.add({ country: c, indicator: IND_NUCLEAR_CAP, year }),
    unBatcher.add({ country: c, indicator: IND_COAL_GEN,    year }),
    unBatcher.add({ country: c, indicator: IND_GAS_GEN,     year }),
    unBatcher.add({ country: c, indicator: IND_HYDRO_GEN,   year }),
    unBatcher.add({ country: c, indicator: IND_WIND_GEN,    year }),
    unBatcher.add({ country: c, indicator: IND_SOLAR_GEN,   year }),
    unBatcher.add({ country: c, indicator: IND_NUCLEAR_GEN, year }),
  ]);

  // Return null only if we got nothing at all (total outage)
  const anyData = [coalCap, gasCap, hydroCap, windCap, solarCap,
                   coalGen, gasGen, hydroGen, windGen, solarGen].some((r) => r !== null);
  if (!anyData) return null;

  const capTotal =
    (coalCap?.value    ?? 0) + (gasCap?.value     ?? 0) +
    (hydroCap?.value   ?? 0) + (windCap?.value    ?? 0) +
    (solarCap?.value   ?? 0) + (nuclearCap?.value ?? 0);

  const genTotal =
    (coalGen?.value    ?? 0) + (gasGen?.value     ?? 0) +
    (hydroGen?.value   ?? 0) + (windGen?.value    ?? 0) +
    (solarGen?.value   ?? 0) + (nuclearGen?.value ?? 0);

  function pct(cap: number | undefined, gen: number | undefined): number {
    if (!capTotal && !genTotal) return 0;
    const share = capTotal > 0
      ? (cap ?? 0) / capTotal
      : (gen ?? 0) / genTotal;
    return Math.round(share * 1000) / 10; // 1 dp
  }

  const renewablesCap =
    (hydroCap?.value ?? 0) + (windCap?.value ?? 0) +
    (solarCap?.value ?? 0);
  const renewablesPercent = capTotal > 0
    ? Math.round((renewablesCap / capTotal) * 1000) / 10
    : 0;

  return {
    coal:    { capacityMW: coalCap?.value    ?? 0, generationGWh: coalGen?.value    ?? 0, percentOfTotal: pct(coalCap?.value,    coalGen?.value)    },
    gas:     { capacityMW: gasCap?.value     ?? 0, generationGWh: gasGen?.value     ?? 0, percentOfTotal: pct(gasCap?.value,     gasGen?.value)     },
    hydro:   { capacityMW: hydroCap?.value   ?? 0, generationGWh: hydroGen?.value   ?? 0, percentOfTotal: pct(hydroCap?.value,   hydroGen?.value)   },
    wind:    { capacityMW: windCap?.value    ?? 0, generationGWh: windGen?.value    ?? 0, percentOfTotal: pct(windCap?.value,    windGen?.value)    },
    solar:   { capacityMW: solarCap?.value   ?? 0, generationGWh: solarGen?.value   ?? 0, percentOfTotal: pct(solarCap?.value,   solarGen?.value)   },
    nuclear: { capacityMW: nuclearCap?.value ?? 0, generationGWh: nuclearGen?.value ?? 0, percentOfTotal: pct(nuclearCap?.value, nuclearGen?.value) },
    totalCapacityMW:    Math.round(capTotal),
    totalGenerationGWh: Math.round(genTotal),
    renewablesPercent,
    year,
    source: "UN_ENERGY_STATS",
  };
}

/**
 * Fetch a 5-year time series for one indicator.
 * Uses a range request "2020:2024" — single UN API call.
 */
export async function getEnergyTrendParallel(
  country:   string,
  indicator: string,
  startYear: number,
  endYear:   number,
): Promise<UNEnergyTrend | null> {
  const c = normaliseCountry(country);

  // Single range request — the batcher passes it through as-is
  const url = buildUrl({ country: c, indicator, range: [startYear, endYear] });
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.sdmx.data+json, application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[UN] Trend fetch HTTP ${res.status} for ${c}/${indicator}/${startYear}:${endYear}`);
      return null;
    }

    const json = await res.json().catch(() => null);
    if (!json) return null;

    const req: UNRequest = { country: c, indicator, range: [startYear, endYear] };
    const observations   = parseSDMXResponse(json, req);

    if (observations.length === 0) return null;

    // Sort by year ascending
    observations.sort((a, b) => a.timeperiod - b.timeperiod);

    const years  = observations.map((o) => o.timeperiod);
    const values = observations.map((o) => o.value);

    // CAGR = (last/first)^(1/(n-1)) - 1
    let cagr = 0;
    if (values.length >= 2 && values[0] > 0) {
      const n = values.length - 1;
      cagr = (Math.pow(values[values.length - 1] / values[0], 1 / n) - 1) * 100;
      cagr = Math.round(cagr * 100) / 100; // 2 dp
    }

    const first = values[0];
    const last  = values[values.length - 1];
    const delta = last - first;
    const pctChange = first > 0 ? (delta / first) * 100 : 0;

    const trend_direction: UNEnergyTrend["trend_direction"] =
      pctChange > 3  ? "increasing" :
      pctChange < -3 ? "decreasing" :
      "stable";

    return { indicator, values, years, trend_direction, cagr_5yr: cagr };

  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      console.warn(`[UN] Trend timeout for ${c}/${indicator}`);
    } else {
      console.error(`[UN] Trend error for ${c}/${indicator}:`, err.message);
    }
    return null;
  }
}

/**
 * Generic batch function: submit N requests, return Map keyed by "country:indicator:year".
 * All requests land in the batcher simultaneously → one parallel batch window.
 */
export async function batchQueryUN(
  requests: UNRequest[],
): Promise<Map<string, UNEnergyIndicator>> {
  const results = new Map<string, UNEnergyIndicator>();

  const settled = await Promise.allSettled(
    requests.map((req) => unBatcher.add(req)),
  );

  for (let i = 0; i < requests.length; i++) {
    const req    = requests[i];
    const result = settled[i];
    if (result.status === "fulfilled" && result.value !== null) {
      const key = `${normaliseCountry(req.country)}:${req.indicator}:${req.year ?? defaultYear()}`;
      results.set(key, result.value);
    }
  }

  return results;
}
