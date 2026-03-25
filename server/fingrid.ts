/**
 * Fingrid (Finland) Open Data API client
 * https://data.fingrid.fi/api
 * Auth: x-api-key header
 * Resolution: 3-min (nuclear/hydro/total) or 15-min (wind)
 *
 * Key datasets:
 *  74  - Total electricity production in Finland
 *  75  - Wind power generation (15-min)
 * 188  - Nuclear power production (3-min)
 * 191  - Hydro power production (3-min)
 * 201  - District heat CHP (3-min)
 * 202  - Industrial CHP (3-min)
 * 265  - CO₂ emission factor, consumed electricity (gCO₂/kWh)
 * 266  - CO₂ emission factor, production (gCO₂/kWh)
 * 395  - Share of non-fossil electricity (%)
 */

const BASE = "https://data.fingrid.fi/api";
const PAGE_SIZE = 10_000;
const REQUEST_DELAY_MS = 300; // avoid 429

// ─── cache ────────────────────────────────────────────────────────────────────
const TTL_MS = 24 * 60 * 60 * 1000;
interface CacheEntry { data: any; ts: number }
const cache: Map<string, CacheEntry> = new Map();
function fromCache(k: string): any | null {
  const e = cache.get(k);
  if (!e || Date.now() - e.ts > TTL_MS) { cache.delete(k); return null; }
  return e.data;
}
function toCache(k: string, d: any) { cache.set(k, { data: d, ts: Date.now() }); }

// ─── sleep helper ─────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── fetch all pages for a dataset / time window ─────────────────────────────
async function fetchDataset(
  datasetId: number,
  startTime: string,
  endTime: string,
): Promise<number[]> {
  const key = process.env.FINGRID_API_KEY;
  if (!key) return [];

  let values: number[] = [];
  let page = 1;

  while (true) {
    const url =
      `${BASE}/datasets/${datasetId}/data` +
      `?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}` +
      `&format=json&page=${page}&pageSize=${PAGE_SIZE}`;

    try {
      const resp = await fetch(url, {
        headers: { "x-api-key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (resp.status === 429) {
        console.warn(`[Fingrid] Rate limited on DS ${datasetId}, sleeping 5s`);
        await sleep(5_000);
        continue;
      }
      if (!resp.ok) {
        console.warn(`[Fingrid] DS ${datasetId} HTTP ${resp.status}`);
        break;
      }
      const json = await resp.json();
      const rows: any[] = json.data ?? [];
      values.push(...rows.map((r: any) => r.value ?? 0));

      const pagination = json.pagination ?? {};
      if (!pagination.nextPage || rows.length < PAGE_SIZE) break;
      page++;
      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      console.error(`[Fingrid] DS ${datasetId} error:`, e);
      break;
    }
  }

  return values;
}

// average of an array
function avg(vals: number[]): number {
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

// ─── fetch one calendar month of data for multiple datasets ─────────────────
async function fetchMonth(
  year: number,
  month: number, // 1-12
  datasets: number[],
): Promise<Record<number, number>> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01T00:00:00Z`;
  const endDate = new Date(year, month, 1); // first day of next month
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-01T00:00:00Z`;

  const result: Record<number, number> = {};
  for (const ds of datasets) {
    const vals = await fetchDataset(ds, start, end);
    result[ds] = avg(vals);
    await sleep(REQUEST_DELAY_MS);
  }
  return result;
}

// ─── main export ─────────────────────────────────────────────────────────────
export async function getFinlandData(): Promise<any> {
  const cacheKey = "fingrid_finland_full";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const hasKey = !!process.env.FINGRID_API_KEY;
  if (!hasKey) {
    return { live: false, reason: "no_key", monthly: [], latestMonth: null };
  }

  const now = new Date();
  // Core 4 datasets only (avoid rate limits) — CHP estimated as total minus known fuels
  const DATASETS = [74, 75, 188, 191]; // total, wind, nuclear, hydro

  // Fetch last 6 months of live data (3-min resolution = ~14k pts/month per dataset)
  const months: { year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  // Process months sequentially to respect rate limits
  const monthlyRows: any[] = [];
  for (const { year, month } of months) {
    const label = `${year}-${String(month).padStart(2, "0")}`;
    const cacheK = `fingrid_month_${label}`;
    let row = fromCache(cacheK);
    if (!row) {
      try {
        const values = await fetchMonth(year, month, DATASETS);
        const wind    = values[75]  ?? 0;
        const nuclear = values[188] ?? 0;
        const hydro   = values[191] ?? 0;
        const total   = values[74]  ?? 0;
        // CHP (biomass/gas district heat + industrial) = total minus metered generation types
        const chpEstimate = Math.max(0, total - wind - nuclear - hydro);
        const renewableMw = wind + hydro;
        const lowCarbonMw = wind + hydro + nuclear;
        const renewableSharePct = total > 0 ? Math.round((renewableMw / total) * 100) : 0;
        const lowCarbonSharePct = total > 0 ? Math.round((lowCarbonMw / total) * 100) : 0;

        row = {
          month: label,
          fuels: { Wind: wind, Nuclear: nuclear, Hydro: hydro, "CHP & Other": chpEstimate },
          totalMw: total,
          renewableSharePct,
          lowCarbonSharePct,
        };
        toCache(cacheK, row);
      } catch (e) {
        console.error(`[Fingrid] Error fetching ${label}:`, e);
        continue;
      }
    }
    monthlyRows.push(row);
  }

  const latestMonth = monthlyRows.length > 0 ? monthlyRows[monthlyRows.length - 1] : null;

  // Annual aggregates from monthly rows
  const byYear: Record<string, any[]> = {};
  for (const m of monthlyRows) {
    const yr = m.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  }
  const annual = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, ms]) => {
      const fuels = ["Wind", "Nuclear", "Hydro", "CHP & Other"];
      const avgFuels: Record<string, number> = {};
      for (const f of fuels) {
        avgFuels[f] = Math.round(ms.reduce((s, m) => s + (m.fuels[f] ?? 0), 0) / ms.length);
      }
      return {
        year,
        ...avgFuels,
        renewablePct: Math.round(ms.reduce((s, m) => s + m.renewableSharePct, 0) / ms.length),
        lowCarbonPct: Math.round(ms.reduce((s, m) => s + m.lowCarbonSharePct, 0) / ms.length),
        monthCount: ms.length,
      };
    });

  const result = {
    live: monthlyRows.length > 0,
    monthly: monthlyRows,
    annual,
    latestMonth,
    fetchedAt: new Date().toISOString(),
  };

  if (monthlyRows.length > 0) toCache(cacheKey, result);
  return result;
}
