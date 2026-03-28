/**
 * EPİAŞ (EXIST) Transparency Platform v2.0 — Turkey Electricity Market
 *
 * Auth: CAS TGT/ST flow
 *   1. POST https://giris.epias.com.tr/cas/v1/tickets  → TGT URL (cached 7h)
 *   2. POST <tgtUrl>  with service param               → Service Ticket (single-use)
 *   3. POST data endpoint with TGT: <ST> header
 *
 * Env vars: EPIAS_USERNAME, EPIAS_PASSWORD
 */

const CAS_BASE       = "https://giris.epias.com.tr/cas/v1/tickets";
const EPIAS_SERVICE  = "https://seffaflik.epias.com.tr";
const ELEC_BASE      = `${EPIAS_SERVICE}/electricity-service`;
const FETCH_TIMEOUT  = 30_000;

// TTLs
const PRICE_TTL_MS   = 60 * 60 * 1_000;        // 1 hour
const RT_TTL_MS      = 15 * 60 * 1_000;         // 15 minutes
const TGT_TTL_MS     = 7 * 60 * 60 * 1_000;     // 7 hours (TGTs last ~8h)

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EpiasPricePoint {
  date: string;
  priceTRY: number;
  priceEUR: number | null;
}

export interface EpiasPricesResult {
  items: EpiasPricePoint[];
  dailyAvgTRY: number | null;
  dailyAvgEUR: number | null;
  date: string;
  fetchedAt: string;
}

export interface EpiasGenerationPoint {
  date: string;
  total: number;
  naturalGas: number;
  wind: number;
  solar: number;
  hydro: number;
  lignite: number;
  hardCoal: number;
  importedCoal: number;
  geothermal: number;
  biomass: number;
  other: number;
}

export interface EpiasGenerationResult {
  items: EpiasGenerationPoint[];
  latest: EpiasGenerationPoint | null;
  fetchedAt: string;
}

export interface EpiasConsumptionPoint {
  date: string;
  consumption: number;
}

export interface EpiasConsumptionResult {
  items: EpiasConsumptionPoint[];
  latestConsumptionMWh: number | null;
  fetchedAt: string;
}

// ── In-memory cache ────────────────────────────────────────────────────────────

interface CacheEntry<T> { data: T; fetchedAt: number }
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

// ── TGT cache ─────────────────────────────────────────────────────────────────

let _tgt: { url: string; expiresAt: number } | null = null;

function isConfigured(): boolean {
  return !!(process.env.EPIAS_USERNAME && process.env.EPIAS_PASSWORD);
}

export function isEpiasConfigured(): boolean {
  return isConfigured();
}

async function getTGT(): Promise<string> {
  // Return cached TGT if still valid (refresh 30 min before expiry)
  if (_tgt && Date.now() < _tgt.expiresAt - 30 * 60 * 1000) {
    return _tgt.url;
  }

  const username = process.env.EPIAS_USERNAME;
  const password = process.env.EPIAS_PASSWORD;
  if (!username || !password) throw new Error("EPIAS_USERNAME / EPIAS_PASSWORD not configured");

  console.log("[EPIAS] Obtaining new TGT");
  const body = new URLSearchParams({ username, password });

  const res = await fetch(CAS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  // CAS returns 201 with the TGT URL in the Location header (and sometimes body)
  let tgtUrl: string | null = res.headers.get("location");
  if (!tgtUrl) {
    // Fallback: some CAS implementations embed the URL in the response body
    const text = await res.text();
    const match = text.match(/https:\/\/giris\.epias\.com\.tr\/cas\/v1\/tickets\/TGT-[^\s"<]+/);
    tgtUrl = match ? match[0] : null;
  }

  if (!tgtUrl) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new Error(`EPİAŞ TGT request failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  console.log(`[EPIAS] TGT obtained (status ${res.status})`);
  _tgt = { url: tgtUrl, expiresAt: Date.now() + TGT_TTL_MS };
  return tgtUrl;
}

async function getServiceTicket(tgtUrl: string): Promise<string> {
  const body = new URLSearchParams({ service: EPIAS_SERVICE });

  const res = await fetch(tgtUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) {
    // TGT may have expired — clear cache
    _tgt = null;
    const text = await res.text().catch(() => "");
    throw new Error(`EPİAŞ ST request failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const st = (await res.text()).trim();
  if (!st.startsWith("ST-")) {
    throw new Error(`EPİAŞ unexpected ST response: "${st.slice(0, 100)}"`);
  }
  return st;
}

async function epiasPost(endpoint: string, bodyObj: object): Promise<any> {
  let tgtUrl = await getTGT();
  let st = await getServiceTicket(tgtUrl);

  const url = `${ELEC_BASE}${endpoint}`;
  console.log(`[EPIAS] POST ${endpoint}`);

  const doRequest = async (ticket: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TGT": ticket,
      },
      body: JSON.stringify(bodyObj),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

  let res = await doRequest(st);

  // On 401 clear the TGT cache and retry once with a fresh auth chain
  if (res.status === 401) {
    console.warn("[EPIAS] 401 — clearing TGT cache and retrying");
    _tgt = null;
    tgtUrl = await getTGT();
    st = await getServiceTicket(tgtUrl);
    res = await doRequest(st);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EPİAŞ API ${res.status} for ${endpoint}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (json?.error) throw new Error(`EPİAŞ API error: ${JSON.stringify(json.error)}`);
  return json;
}

// ── Turkey date helper (UTC+3, no DST) ────────────────────────────────────────

function turkeyToday(): string {
  const now = new Date();
  const tr  = new Date(now.getTime() + 3 * 60 * 60 * 1_000);
  const yyyy = tr.getUTCFullYear();
  const mm   = String(tr.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(tr.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ── Day-Ahead Market Clearing Price ───────────────────────────────────────────

export async function getTurkeyDayAheadPrices(): Promise<EpiasPricesResult> {
  const cached = fromCache<EpiasPricesResult>("epias:prices", PRICE_TTL_MS);
  if (cached) return cached;

  const date = turkeyToday();
  console.log(`[EPIAS] Fetching day-ahead MCP for ${date}`);

  const json = await epiasPost("/v1/markets/dam/data/mcp", {
    startDate: date,
    endDate:   date,
  });

  const rows: any[] = json?.body?.mCPList ?? json?.items ?? json?.body?.items ?? [];
  const items: EpiasPricePoint[] = [];

  for (const row of rows) {
    const priceTRY = parseFloat(row.price ?? row.mcp ?? row.ptf ?? NaN);
    const priceEUR = row.priceEur != null ? parseFloat(row.priceEur) : null;
    if (isNaN(priceTRY)) continue;
    items.push({
      date:     row.date ?? row.period ?? "",
      priceTRY,
      priceEUR: priceEUR !== null && !isNaN(priceEUR) ? priceEUR : null,
    });
  }

  const avgTRY = items.length
    ? items.reduce((s, p) => s + p.priceTRY, 0) / items.length
    : null;
  const eurItems = items.filter(p => p.priceEUR !== null);
  const avgEUR = eurItems.length
    ? eurItems.reduce((s, p) => s + (p.priceEUR as number), 0) / eurItems.length
    : null;

  console.log(`[EPIAS] MCP: ${items.length} hourly rows, avg ${avgTRY?.toFixed(1)} TRY/MWh, ${avgEUR?.toFixed(2)} EUR/MWh`);

  return toCache("epias:prices", {
    items,
    dailyAvgTRY: avgTRY,
    dailyAvgEUR: avgEUR,
    date,
    fetchedAt: new Date().toISOString(),
  });
}

// ── Real-Time Generation ───────────────────────────────────────────────────────

export async function getTurkeyGeneration(): Promise<EpiasGenerationResult> {
  const cached = fromCache<EpiasGenerationResult>("epias:generation", RT_TTL_MS);
  if (cached) return cached;

  const date = turkeyToday();
  console.log(`[EPIAS] Fetching real-time generation for ${date}`);

  const json = await epiasPost("/v1/generation/data/real-time-generation", {
    startDate: date,
    endDate:   date,
  });

  const rows: any[] = json?.body?.hourlyGenerations ?? json?.items ?? json?.body?.items ?? [];
  const items: EpiasGenerationPoint[] = [];

  for (const row of rows) {
    const total = parseFloat(row.total ?? NaN);
    if (isNaN(total)) continue;
    items.push({
      date:         row.date ?? "",
      total,
      naturalGas:   parseFloat(row.naturalGas   ?? 0) || 0,
      wind:         parseFloat(row.wind          ?? 0) || 0,
      solar:        parseFloat(row.sun           ?? row.solar ?? 0) || 0,
      hydro:        parseFloat(row.dammedHydro   ?? row.hydro ?? 0) || 0,
      lignite:      parseFloat(row.lignite       ?? 0) || 0,
      hardCoal:     parseFloat(row.blackCoal     ?? row.hardCoal ?? 0) || 0,
      importedCoal: parseFloat(row.importedCoal  ?? 0) || 0,
      geothermal:   parseFloat(row.geothermal    ?? 0) || 0,
      biomass:      parseFloat(row.biomass       ?? 0) || 0,
      other:        parseFloat(row.naphtha       ?? row.other ?? 0) || 0,
    });
  }

  const latest = items.length ? items[items.length - 1] : null;
  console.log(`[EPIAS] Generation: ${items.length} rows, latest total ${latest?.total} MWh`);

  return toCache("epias:generation", { items, latest, fetchedAt: new Date().toISOString() });
}

// ── Real-Time Consumption ──────────────────────────────────────────────────────

export async function getTurkeyConsumption(): Promise<EpiasConsumptionResult> {
  const cached = fromCache<EpiasConsumptionResult>("epias:consumption", RT_TTL_MS);
  if (cached) return cached;

  const date = turkeyToday();
  console.log(`[EPIAS] Fetching real-time consumption for ${date}`);

  const json = await epiasPost("/v1/consumption/data/real-time-consumption", {
    startDate: date,
    endDate:   date,
  });

  const rows: any[] = json?.body?.hourlyConsumptions ?? json?.items ?? json?.body?.items ?? [];
  const items: EpiasConsumptionPoint[] = [];

  for (const row of rows) {
    const consumption = parseFloat(row.consumption ?? NaN);
    if (isNaN(consumption)) continue;
    items.push({ date: row.date ?? "", consumption });
  }

  const latestConsumptionMWh = items.length ? items[items.length - 1].consumption : null;
  console.log(`[EPIAS] Consumption: ${items.length} rows, latest ${latestConsumptionMWh} MWh`);

  return toCache("epias:consumption", {
    items,
    latestConsumptionMWh,
    fetchedAt: new Date().toISOString(),
  });
}
