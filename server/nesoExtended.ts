import * as fs from "fs/promises";
import * as path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "neso");
const FETCH_TIMEOUT_MS = 25000;
const TTL_4H = 4 * 60 * 60 * 1000;
const TTL_24H = 24 * 60 * 60 * 1000;
const TTL_7D = 7 * 24 * 60 * 60 * 1000;

const URLS = {
  forecast14Day: "https://api.neso.energy/dataset/633daec6-3e70-444a-88b0-c4cef9419d40/resource/7c0411cd-2714-4bb5-a408-adb065edf34d/download/ng-demand-14da-hh.csv",
  forecast52Week: "https://api.neso.energy/dataset/edd6190a-66d4-480d-a125-88d32bd11c91/resource/903302b4-b577-4228-a347-b9917568b4e1/download/year_ahead_weekly.csv",
  transmissionLosses: "https://api.neso.energy/dataset/ec5a1356-f6dd-40a1-b714-dbdad3ed00af/resource/fddc307d-fc5a-458d-809f-2ad9a697b142/download/monthly-losses.csv",
  trrespRegions: "https://api.neso.energy/dataset/e5e8eb8e-9fbd-4355-b4ad-9bbf00569d15/resource/cb1f1b31-1fde-40ab-86c9-34a3e1bdb665/download/tresp_pathways_demand_by_resp_region_published.csv",
};

async function fetchWithCache(url: string, cacheFile: string, ttlMs: number): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, cacheFile);
  try {
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < ttlMs) {
      return await fs.readFile(cachePath, "utf-8");
    }
  } catch {}

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const text = await res.text();
    await fs.writeFile(cachePath, text);
    console.log(`[NESO] Fetched and cached: ${cacheFile} (${text.length} bytes)`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function unquote(v: string): string {
  return v.replace(/^"|"$/g, "").trim();
}

function parseCSVLine(line: string): string[] {
  return line.split(",").map(unquote);
}

// ─── 14-Day Half-Hourly Forecast ─────────────────────────────────────────────

export interface DayForecast {
  date: string;
  peakMW: number;
  minMW: number;
  avgMW: number;
}

export interface Forecast14DayResult {
  days: DayForecast[];
  fetchedAt: string;
}

let cache14Day: Forecast14DayResult | null = null;
let cache14DayTime = 0;

function parse14DayCSV(csv: string): DayForecast[] {
  const lines = csv.trim().split("\n");
  const dayMap = new Map<string, number[]>();

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 4) continue;
    const date = vals[0];
    const demand = parseInt(vals[3]);
    if (!date || isNaN(demand) || demand <= 0) continue;
    if (!dayMap.has(date)) dayMap.set(date, []);
    dayMap.get(date)!.push(demand);
  }

  return Array.from(dayMap.entries())
    .map(([date, demands]) => ({
      date,
      peakMW: Math.max(...demands),
      minMW: Math.min(...demands),
      avgMW: Math.round(demands.reduce((a, b) => a + b, 0) / demands.length),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function get14DayForecast(): Promise<Forecast14DayResult> {
  if (cache14Day && Date.now() - cache14DayTime < TTL_4H) return cache14Day;
  const csv = await fetchWithCache(URLS.forecast14Day, "forecast_14day.csv", TTL_4H);
  const days = parse14DayCSV(csv);
  cache14Day = { days, fetchedAt: new Date().toISOString() };
  cache14DayTime = Date.now();
  console.log(`[NESO] 14-day forecast: ${days.length} days`);
  return cache14Day;
}

// ─── 52-Week Seasonal Forecast ────────────────────────────────────────────────

export interface WeekForecast {
  weekNum: number;
  dateOfPeak: string;
  peakMW: number;
  minMW: number;
}

export interface Forecast52WeekResult {
  weeks: WeekForecast[];
  fetchedAt: string;
}

let cache52Week: Forecast52WeekResult | null = null;
let cache52WeekTime = 0;

function parse52WeekCSV(csv: string): WeekForecast[] {
  const lines = csv.trim().split("\n");
  const results: WeekForecast[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 6) continue;
    // calendar_year, financial_year, ESIWK, CDATE_peak, tsd_peak, tsd_min, day_min, night_min
    const weekNum = parseInt(vals[2]);
    const dateOfPeak = vals[3];
    const peakMW = parseInt(vals[4]);
    const minMW = parseInt(vals[5]);
    if (isNaN(peakMW) || isNaN(minMW) || !dateOfPeak) continue;
    results.push({ weekNum, dateOfPeak, peakMW, minMW });
  }

  return results.slice(0, 52);
}

export async function get52WeekForecast(): Promise<Forecast52WeekResult> {
  if (cache52Week && Date.now() - cache52WeekTime < TTL_24H) return cache52Week;
  const csv = await fetchWithCache(URLS.forecast52Week, "forecast_52week.csv", TTL_24H);
  const weeks = parse52WeekCSV(csv);
  cache52Week = { weeks, fetchedAt: new Date().toISOString() };
  cache52WeekTime = Date.now();
  console.log(`[NESO] 52-week forecast: ${weeks.length} weeks`);
  return cache52Week;
}

// ─── Transmission Losses ──────────────────────────────────────────────────────

export interface MonthlyLoss {
  month: string;
  nget: number;
  spt: number;
  shetl: number;
  gbTotal: number;
}

export interface TransmissionLossesResult {
  months: MonthlyLoss[];
  fetchedAt: string;
}

let cacheLosses: TransmissionLossesResult | null = null;
let cacheLossesTime = 0;

function parseLossesCSV(csv: string): MonthlyLoss[] {
  const lines = csv.trim().split("\n");
  const results: MonthlyLoss[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 6) continue;
    // "Financial Year","Month","NGET","SPT","SHETL","GB totals"
    const month = vals[1];
    const nget = parseFloat(vals[2]);
    const spt = parseFloat(vals[3]);
    const shetl = parseFloat(vals[4]);
    const gbTotal = parseFloat(vals[5]);
    if (!month || isNaN(gbTotal)) continue;
    results.push({ month, nget: nget || 0, spt: spt || 0, shetl: shetl || 0, gbTotal });
  }

  return results.slice(-24);
}

export async function getTransmissionLosses(): Promise<TransmissionLossesResult> {
  if (cacheLosses && Date.now() - cacheLossesTime < TTL_24H) return cacheLosses;
  const csv = await fetchWithCache(URLS.transmissionLosses, "transmission_losses.csv", TTL_24H);
  const months = parseLossesCSV(csv);
  cacheLosses = { months, fetchedAt: new Date().toISOString() };
  cacheLossesTime = Date.now();
  console.log(`[NESO] Transmission losses: ${months.length} months`);
  return cacheLosses;
}

// ─── TRESP Regional Demand ────────────────────────────────────────────────────

export interface RegionDemand {
  region: string;
  totalGWh: number;
  year: number;
}

export interface TRESPRegionsResult {
  regions: RegionDemand[];
  pathway: string;
  year: number;
  fetchedAt: string;
}

let cacheTRESP: TRESPRegionsResult | null = null;
let cacheTRESPTime = 0;

function formatRegionName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace("And", "and");
}

function parseTRESPCSV(csv: string): { regions: RegionDemand[]; pathway: string; year: number } {
  const lines = csv.trim().split("\n");
  let firstPathway = "";
  // year -> region -> total GWh
  const yearMap = new Map<string, Map<string, number>>();

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 5) continue;
    // Building_block_id, RESP_region, Pathway, Year, Value, Unit
    const region = formatRegionName(vals[1]);
    const pathway = vals[2];
    const year = vals[3];
    const value = parseFloat(vals[4]);
    const unit = vals[5]?.trim();

    if (!region || !year || isNaN(value) || value <= 0) continue;
    if (unit !== "GWh") continue;
    if (!firstPathway) firstPathway = pathway;
    if (pathway !== firstPathway) continue;

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const regionMap = yearMap.get(year)!;
    regionMap.set(region, (regionMap.get(region) || 0) + value);
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => parseInt(b) - parseInt(a));
  if (years.length === 0) return { regions: [], pathway: firstPathway, year: 0 };

  const latestYear = parseInt(years[0]);
  const regionMap = yearMap.get(years[0])!;

  const regions = Array.from(regionMap.entries())
    .map(([region, totalGWh]) => ({ region, totalGWh: Math.round(totalGWh), year: latestYear }))
    .sort((a, b) => b.totalGWh - a.totalGWh);

  return { regions, pathway: firstPathway, year: latestYear };
}

export async function getTRESPRegions(): Promise<TRESPRegionsResult> {
  if (cacheTRESP && Date.now() - cacheTRESPTime < TTL_7D) return cacheTRESP;
  const csv = await fetchWithCache(URLS.trrespRegions, "tresp_regions.csv", TTL_7D);
  const { regions, pathway, year } = parseTRESPCSV(csv);
  cacheTRESP = { regions, pathway, year, fetchedAt: new Date().toISOString() };
  cacheTRESPTime = Date.now();
  console.log(`[NESO] TRESP regions: ${regions.length} regions for ${year} (${pathway})`);
  return cacheTRESP;
}

// ─── TEC Register ─────────────────────────────────────────────────────────────

const TEC_RESOURCE_ID = "17becbab-e3e8-473f-b303-3806f43a6a10";

export interface TECProject {
  name: string;
  customer: string;
  site: string;
  mw: number;
  status: string;
  technology: string;
  host: string;
  effectiveFrom: string | null;
}

export interface TECSummary {
  technology: string;
  totalMW: number;
  count: number;
}

export interface TECStatusSummary {
  status: string;
  totalMW: number;
  count: number;
}

export interface TECHostSummary {
  host: string;
  totalMW: number;
  count: number;
}

export interface TECResult {
  totalProjects: number;
  totalPipelineMW: number;
  builtMW: number;
  inProgressMW: number;
  byTechnology: TECSummary[];
  byStatus: TECStatusSummary[];
  byHost: TECHostSummary[];
  topProjects: TECProject[];
  fetchedAt: string;
}

function simplifyTechnology(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("energy storage")) return "BESS";
  if (t.includes("wind offshore")) return "Offshore Wind";
  if (t.includes("wind onshore")) return "Onshore Wind";
  if (t.includes("ccgt") || t.includes("gas")) return "Gas (CCGT)";
  if (t.includes("nuclear")) return "Nuclear";
  if (t.includes("pump storage")) return "Pumped Hydro";
  if (t.includes("pv array") || t.includes("photo voltaic") || t.includes("solar")) return "Solar PV";
  if (t.includes("hydro")) return "Hydro";
  if (t.includes("demand")) return "Demand";
  if (t.includes("reactive")) return "Reactive Comp.";
  return "Other";
}

let cacheTEC: TECResult | null = null;
let cacheTECTime = 0;

export async function getTECRegister(): Promise<TECResult> {
  if (cacheTEC && Date.now() - cacheTECTime < TTL_24H) return cacheTEC;

  const url = `https://api.neso.energy/api/3/action/datastore_search?resource_id=${TEC_RESOURCE_ID}&limit=10000`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let records: any[];
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    records = json?.result?.records ?? [];
  } finally {
    clearTimeout(timeout);
  }

  const techMap = new Map<string, { totalMW: number; count: number }>();
  const statusMap = new Map<string, { totalMW: number; count: number }>();
  const hostMap = new Map<string, { totalMW: number; count: number }>();
  let totalMW = 0;
  let builtMW = 0;
  let inProgressMW = 0;
  const topProjects: TECProject[] = [];

  for (const r of records) {
    const mw = parseFloat(r["Cumulative Total Capacity (MW)"]) || 0;
    const status = (r["Project Status"] || "Unknown").trim();
    const rawTech = (r["Plant Type"] || "Other").trim();
    const tech = simplifyTechnology(rawTech);
    const host = (r["HOST TO"] || "Unknown").trim();

    totalMW += mw;
    if (status === "Built") builtMW += mw;
    if (status === "Under Construction/Commissioning" || status === "Consents Approved") inProgressMW += mw;

    const t = techMap.get(tech) ?? { totalMW: 0, count: 0 };
    t.totalMW += mw; t.count += 1; techMap.set(tech, t);

    const s = statusMap.get(status) ?? { totalMW: 0, count: 0 };
    s.totalMW += mw; s.count += 1; statusMap.set(status, s);

    const h = hostMap.get(host) ?? { totalMW: 0, count: 0 };
    h.totalMW += mw; h.count += 1; hostMap.set(host, h);

    topProjects.push({
      name: r["Project Name"] || "",
      customer: r["Customer Name"] || "",
      site: r["Connection Site"] || "",
      mw,
      status,
      technology: tech,
      host,
      effectiveFrom: r["MW Effective From"] || null,
    });
  }

  topProjects.sort((a, b) => b.mw - a.mw);

  const result: TECResult = {
    totalProjects: records.length,
    totalPipelineMW: Math.round(totalMW),
    builtMW: Math.round(builtMW),
    inProgressMW: Math.round(inProgressMW),
    byTechnology: Array.from(techMap.entries())
      .map(([technology, v]) => ({ technology, totalMW: Math.round(v.totalMW), count: v.count }))
      .sort((a, b) => b.totalMW - a.totalMW),
    byStatus: Array.from(statusMap.entries())
      .map(([status, v]) => ({ status, totalMW: Math.round(v.totalMW), count: v.count }))
      .sort((a, b) => b.totalMW - a.totalMW),
    byHost: Array.from(hostMap.entries())
      .map(([host, v]) => ({ host, totalMW: Math.round(v.totalMW), count: v.count }))
      .sort((a, b) => b.totalMW - a.totalMW),
    topProjects: topProjects.slice(0, 25),
    fetchedAt: new Date().toISOString(),
  };

  cacheTEC = result;
  cacheTECTime = Date.now();
  console.log(`[NESO] TEC Register: ${records.length} projects, ${Math.round(totalMW / 1000)} GW total pipeline`);
  return result;
}
