/**
 * US Energy Information Administration (EIA) API — v2
 *
 * Endpoints:
 *   /electricity/rto/fuel-type-data/data  — hourly generation by fuel type per BA
 *   /electricity/retail-sales/data         — monthly retail prices by state/sector
 *   /electricity/rto/region-data/data      — hourly demand/generation by ISO/RTO region
 *
 * Auth: EIA_API_KEY environment variable
 */

const EIA_BASE = "https://api.eia.gov/v2";
const FETCH_TIMEOUT_MS = 60_000;
const REALTIME_TTL_MS = 60 * 60 * 1_000;      // 1 hour
const PRICES_TTL_MS   = 24 * 60 * 60 * 1_000;  // 24 hours

// Major balancing authorities covered
export const MAJOR_BAS: Record<string, string> = {
  ERCO:  "ERCOT (Texas)",
  CISO:  "CAISO (California)",
  PJM:   "PJM (Mid-Atlantic)",
  MISO:  "MISO (Midwest)",
  NYISO: "NYISO (New York)",
  ISNE:  "ISO-NE (New England)",
  SPP:   "SPP (Southwest)",
};

// EIA fuel type codes
export const FUEL_TYPES: Record<string, string> = {
  NG:  "Natural Gas",
  SUN: "Solar",
  WND: "Wind",
  NUC: "Nuclear",
  COW: "Coal",
  WAT: "Hydro",
  PS:  "Pumped Storage",
  OIL: "Oil",
  GEO: "Geothermal",
  BIO: "Biomass",
  OTH: "Other",
};

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface EiaGenerationPoint {
  period: string;       // "2024-01-15T18"
  respondent: string;   // "ERCO"
  respondentName: string;
  fuelType: string;     // "NG"
  fuelTypeName: string;
  valueMWh: number;
}

export interface EiaGenerationResult {
  data: EiaGenerationPoint[];
  /** Latest snapshot: BA → fuelType → MWh */
  byBA: Record<string, Record<string, number>>;
  latestPeriod: string | null;
  fetchedAt: string;
}

export interface EiaPricePoint {
  period: string;       // "2024-11"
  stateId: string;      // "CA"
  stateName: string;
  sector: string;       // "residential" | "commercial" | "industrial"
  priceCentsPerKwh: number;
}

export interface EiaPricesResult {
  data: EiaPricePoint[];
  /** Latest period average per sector across all states */
  nationalAvgCents: Record<string, number>;
  latestPeriod: string | null;
  fetchedAt: string;
}

export interface EiaRegionDemandPoint {
  period: string;
  respondent: string;
  respondentName: string;
  /** "D" = demand, "NG" = net generation, "TI" = total interchange */
  type: string;
  valueMWh: number;
}

export interface EiaRegionDemandResult {
  data: EiaRegionDemandPoint[];
  /** Latest demand per BA: respondent → MWh */
  latestDemandMWh: Record<string, number>;
  latestPeriod: string | null;
  fetchedAt: string;
}

export interface InterchangePoint {
  period: string;
  fromBA: string;
  fromBAName: string;
  toBA: string;
  toBAName: string;
  valueMW: number;
}

export interface InterchangeResult {
  data: InterchangePoint[];
  byPair: Record<string, number>;
  latestPeriod: string | null;
  fetchedAt: string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry<any>>();

function fromCache<T>(key: string, ttlMs: number): T | null {
  const e = _cache.get(key) as CacheEntry<T> | undefined;
  if (!e || Date.now() - e.fetchedAt > ttlMs) return null;
  return e.data;
}

function toCache<T>(key: string, data: T): T {
  _cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.EIA_API_KEY;
  if (!key) throw new Error("EIA_API_KEY not configured");
  return key;
}

/**
 * Build the request URL with both keys and values percent-encoded.
 * Brackets in EIA v2 param names (e.g. `data[0]`, `sort[0][column]`)
 * must be encoded as %5B / %5D — Node fetch does not encode them automatically.
 */
function buildEiaUrl(path: string, params: [string, string][]): string {
  const qs = [`api_key=${encodeURIComponent(getApiKey())}`];
  for (const [k, v] of params) {
    qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return `${EIA_BASE}${path}?${qs.join("&")}`;
}

async function fetchEia(path: string, params: [string, string][]): Promise<any> {
  const hasKey = !!process.env.EIA_API_KEY;
  console.log(`[EIA] EIA_API_KEY present: ${hasKey}`);

  const url = buildEiaUrl(path, params);
  const redactedUrl = url.replace(/api_key=[^&]+/, "api_key=REDACTED");
  console.log(`[EIA] GET ${redactedUrl}`);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });

  console.log(`[EIA] ${path} → HTTP ${res.status}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EIA API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (json?.error) throw new Error(`EIA API error: ${json.error}`);
  return json;
}

// ── Generation by Fuel Type ───────────────────────────────────────────────────

export async function getGenerationByFuelType(): Promise<EiaGenerationResult> {
  const cached = fromCache<EiaGenerationResult>("eia:generation", REALTIME_TTL_MS);
  if (cached) return cached;

  const baList = Object.keys(MAJOR_BAS);

  const params: [string, string][] = [
    ["frequency", "hourly"],
    ["data[0]", "value"],
    ...baList.map((ba): [string, string] => ["facets[respondent][]", ba]),
    ["sort[0][column]", "period"],
    ["sort[0][direction]", "desc"],
    ["length", "5000"],
    ["offset", "0"],
  ];

  const json = await fetchEia("/electricity/rto/fuel-type-data/data", params);
  const rows: any[] = json?.response?.data ?? [];

  const points: EiaGenerationPoint[] = [];
  for (const row of rows) {
    const raw = parseFloat(row.value ?? row["value"]);
    if (isNaN(raw)) continue;
    points.push({
      period:        row.period ?? "",
      respondent:    row.respondent ?? "",
      respondentName: row["respondent-name"] ?? MAJOR_BAS[row.respondent] ?? row.respondent,
      fuelType:      row.type ?? "",
      fuelTypeName:  row["type-name"] ?? FUEL_TYPES[row.type] ?? row.type,
      valueMWh:      raw,
    });
  }

  // Derive latest snapshot per BA per fuel type
  const byBA: Record<string, Record<string, number>> = {};
  const seenBAFuel = new Set<string>();
  for (const p of points) {
    const k = `${p.respondent}|${p.fuelType}`;
    if (seenBAFuel.has(k)) continue;   // data is already desc-sorted; first occurrence is latest
    seenBAFuel.add(k);
    if (!byBA[p.respondent]) byBA[p.respondent] = {};
    byBA[p.respondent][p.fuelType] = p.valueMWh;
  }

  const latestPeriod = points[0]?.period ?? null;

  return toCache("eia:generation", { data: points, byBA, latestPeriod, fetchedAt: new Date().toISOString() });
}

// ── Retail Electricity Prices ─────────────────────────────────────────────────

export async function getRetailPrices(): Promise<EiaPricesResult> {
  const cached = fromCache<EiaPricesResult>("eia:prices", PRICES_TTL_MS);
  if (cached) return cached;

  const params: [string, string][] = [
    ["frequency", "monthly"],
    ["data[0]", "price"],
    ["facets[sectorName][]", "residential"],
    ["facets[sectorName][]", "commercial"],
    ["facets[sectorName][]", "industrial"],
    ["sort[0][column]", "period"],
    ["sort[0][direction]", "desc"],
    ["length", "400"],
    ["offset", "0"],
  ];

  const json = await fetchEia("/electricity/retail-sales/data", params);
  const rows: any[] = json?.response?.data ?? [];

  const points: EiaPricePoint[] = [];
  for (const row of rows) {
    const price = parseFloat(row.price ?? row["price"]);
    if (isNaN(price)) continue;
    points.push({
      period:             row.period ?? "",
      stateId:            row.stateid ?? row.stateId ?? "",
      stateName:          row.stateDescription ?? row["stateDescription"] ?? "",
      sector:             row.sectorName ?? row["sectorName"] ?? "",
      priceCentsPerKwh:   price,
    });
  }

  // Latest period national average per sector
  const latestPeriod = points[0]?.period ?? null;
  const latestRows = latestPeriod ? points.filter(p => p.period === latestPeriod) : [];

  const sectorTotals: Record<string, { sum: number; count: number }> = {};
  for (const p of latestRows) {
    if (!sectorTotals[p.sector]) sectorTotals[p.sector] = { sum: 0, count: 0 };
    sectorTotals[p.sector].sum   += p.priceCentsPerKwh;
    sectorTotals[p.sector].count += 1;
  }
  const nationalAvgCents: Record<string, number> = {};
  for (const [sector, { sum, count }] of Object.entries(sectorTotals)) {
    nationalAvgCents[sector] = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  }

  return toCache("eia:prices", { data: points, nationalAvgCents, latestPeriod, fetchedAt: new Date().toISOString() });
}

// ── Region Demand ─────────────────────────────────────────────────────────────

export async function getRegionDemand(): Promise<EiaRegionDemandResult> {
  const cached = fromCache<EiaRegionDemandResult>("eia:demand", REALTIME_TTL_MS);
  if (cached) return cached;

  const params: [string, string][] = [
    ["frequency", "hourly"],
    ["data[0]", "value"],
    // D = demand, NG = net generation (both useful for US page)
    ["facets[type][]", "D"],
    ["facets[type][]", "NG"],
    ["sort[0][column]", "period"],
    ["sort[0][direction]", "desc"],
    ["length", "300"],
    ["offset", "0"],
  ];

  const json = await fetchEia("/electricity/rto/region-data/data", params);
  const rows: any[] = json?.response?.data ?? [];

  const points: EiaRegionDemandPoint[] = [];
  for (const row of rows) {
    const val = parseFloat(row.value ?? row["value"]);
    if (isNaN(val)) continue;
    points.push({
      period:        row.period ?? "",
      respondent:    row.respondent ?? "",
      respondentName: row["respondent-name"] ?? MAJOR_BAS[row.respondent] ?? row.respondent,
      type:          row.type ?? "",
      valueMWh:      val,
    });
  }

  // Latest demand (type=D) per respondent
  const latestDemandMWh: Record<string, number> = {};
  const seen = new Set<string>();
  for (const p of points) {
    if (p.type !== "D") continue;
    if (seen.has(p.respondent)) continue;
    seen.add(p.respondent);
    latestDemandMWh[p.respondent] = p.valueMWh;
  }

  const demandPoints = points.filter(p => p.type === "D");
  const latestPeriod = demandPoints[0]?.period ?? null;

  return toCache("eia:demand", { data: points, latestDemandMWh, latestPeriod, fetchedAt: new Date().toISOString() });
}

// ── Interchange Data ──────────────────────────────────────────────────────────

export async function getInterchangeData(): Promise<InterchangeResult> {
  const cached = fromCache<InterchangeResult>("eia:interchange", REALTIME_TTL_MS);
  if (cached) return cached;

  // Step 1: probe for the single most-recent period value (1 row, fast)
  const probeJson = await fetchEia("/electricity/rto/interchange-data/data", [
    ["frequency", "hourly"],
    ["data[0]", "value"],
    ["sort[0][column]", "period"],
    ["sort[0][direction]", "desc"],
    ["length", "1"],
  ]);
  const latestPeriod: string | null = probeJson?.response?.data?.[0]?.period ?? null;
  console.log(`[EIA] interchange latest period: ${latestPeriod}`);

  if (!latestPeriod) {
    console.warn("[EIA] interchange probe returned no period — returning empty result");
    return toCache("eia:interchange", { data: [], byPair: {}, latestPeriod: null, fetchedAt: new Date().toISOString() });
  }

  // Step 2: fetch ALL pairs for exactly that period using start/end params.
  // Note: facets[period][] is a categorical filter and does NOT work for time
  // period filtering in the EIA v2 API — use start= and end= instead.
  // ~200–300 BA-to-BA pairs per hour; paginate in batches of 1000.
  let allRows: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  let page = 0;

  while (true) {
    console.log(`[EIA] interchange page ${page} (offset=${offset}) for period ${latestPeriod}`);
    const pageJson = await fetchEia("/electricity/rto/interchange-data/data", [
      ["frequency", "hourly"],
      ["data[0]", "value"],
      ["start", latestPeriod],
      ["end", latestPeriod],
      ["sort[0][column]", "fromba"],
      ["sort[0][direction]", "asc"],
      ["length", String(PAGE)],
      ["offset", String(offset)],
    ]);

    const pageRows: any[] = pageJson?.response?.data ?? [];
    const total: number = pageJson?.response?.total ?? 0;
    console.log(`[EIA] interchange page ${page}: ${pageRows.length} rows (total reported: ${total})`);
    allRows = allRows.concat(pageRows);

    if (offset + PAGE >= total || pageRows.length < PAGE) break;
    offset += PAGE;
    page++;
  }

  console.log(`[EIA] interchange total rows fetched for ${latestPeriod}: ${allRows.length}`);

  const points: InterchangePoint[] = [];
  for (const row of allRows) {
    const raw = parseFloat(row.value ?? row["value"]);
    if (isNaN(raw)) continue;
    points.push({
      period:     row.period ?? "",
      fromBA:     row.fromba ?? row["fromba"] ?? "",
      fromBAName: row["fromba-name"] ?? row.fromba ?? "",
      toBA:       row.toba ?? row["toba"] ?? "",
      toBAName:   row["toba-name"] ?? row.toba ?? "",
      valueMW:    raw,
    });
  }

  // Log unique fromBA values to diagnose coverage
  const uniqueFromBAs = [...new Set(points.map(p => p.fromBA))].sort();
  console.log(`[EIA] interchange unique fromBA (${uniqueFromBAs.length}):`, uniqueFromBAs.join(", "));

  // Build byPair map for the single period
  const byPair: Record<string, number> = {};
  for (const p of points) {
    byPair[`${p.fromBA}->${p.toBA}`] = p.valueMW;
  }

  return toCache("eia:interchange", { data: points, byPair, latestPeriod, fetchedAt: new Date().toISOString() });
}
