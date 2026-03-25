/**
 * PSE SA (Polskie Sieci Elektroenergetyczne) Open Data API
 * https://api.raporty.pse.pl/api
 * No auth required. OData-style REST API.
 *
 * Key endpoint: /his-gen-pal  — historical generation by ENTSO-E fuel type (15-min)
 * Filter: $filter=business_date eq 'YYYY-MM-DD'   $first=2000
 *
 * ENTSO-E fuel codes used by PSE:
 *  B01 Biomass   B02 Lignite   B03 Coal-derived gas   B04 Natural Gas
 *  B05 Hard Coal  B06 Oil  B10 Hydro Pumped  B11 Hydro RoR  B12 Hydro Reservoir
 *  B15 Other Renewable  B16 Solar  B19 Wind Onshore  B20 Other
 */

const BASE = "https://api.raporty.pse.pl/api";
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry { data: any; ts: number }
const cache: Map<string, CacheEntry> = new Map();
function fromCache(k: string): any | null {
  const e = cache.get(k);
  if (!e || Date.now() - e.ts > TTL_MS) { cache.delete(k); return null; }
  return e.data;
}
function toCache(k: string, d: any) { cache.set(k, { data: d, ts: Date.now() }); }

const FUEL_LABEL: Record<string, string> = {
  B01: "Biomass",
  B02: "Lignite",
  B03: "Coal Gas",
  B04: "Natural Gas",
  B05: "Hard Coal",
  B06: "Oil",
  B10: "Hydro Pumped",
  B11: "Hydro RoR",
  B12: "Hydro Reservoir",
  B15: "Other Renewable",
  B16: "Solar",
  B19: "Wind Onshore",
  B20: "Other",
};

// Display groups (combined labels)
const DISPLAY_FUELS = [
  "Hard Coal", "Lignite", "Natural Gas", "Wind Onshore",
  "Solar", "Biomass", "Hydro", "Other",
];

// Fetch generation data for a specific calendar date (all fuels)
async function fetchDay(date: string): Promise<Record<string, number>> {
  const cacheKey = `pse_day_${date}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const url =
    `${BASE}/his-gen-pal` +
    `?$filter=business_date%20eq%20'${date}'&$first=2000`;

  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.warn(`[PSE] HTTP ${resp.status} for date ${date}`);
      return {};
    }
    const json = await resp.json();
    const rows: any[] = json.value ?? [];

    // Average MW per fuel type across the day
    const totals: Record<string, number[]> = {};
    for (const r of rows) {
      const code = r.alias_entsoe as string;
      const raw = r.value as string;
      if (!code || !raw) continue;
      const val = parseFloat(raw.replace(",", "."));
      if (isNaN(val)) continue;
      if (!totals[code]) totals[code] = [];
      totals[code].push(val);
    }

    const avgByCode: Record<string, number> = {};
    for (const [code, vals] of Object.entries(totals)) {
      avgByCode[code] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    }

    // Map ENTSO-E codes → display labels, group hydro
    const result: Record<string, number> = {};
    result["Hard Coal"]    = avgByCode["B05"] ?? 0;
    result["Lignite"]      = avgByCode["B02"] ?? 0;
    result["Natural Gas"]  = (avgByCode["B04"] ?? 0) + (avgByCode["B03"] ?? 0);
    result["Wind Onshore"] = avgByCode["B19"] ?? 0;
    result["Solar"]        = avgByCode["B16"] ?? 0;
    result["Biomass"]      = avgByCode["B01"] ?? 0;
    result["Hydro"]        = (avgByCode["B10"] ?? 0) + (avgByCode["B11"] ?? 0) + (avgByCode["B12"] ?? 0);
    result["Other"]        = (avgByCode["B06"] ?? 0) + (avgByCode["B15"] ?? 0) + (avgByCode["B20"] ?? 0);

    toCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error(`[PSE] Error fetching ${date}:`, e);
    return {};
  }
}

export async function getPolandData(): Promise<any> {
  const cacheKey = "pse_poland_full";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const now = new Date();

  // Fetch 12 months (one representative day per month — the 15th)
  const monthlyRows: any[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i - 1, 15);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const date = `${yr}-${mo}-15`;
    const label = `${yr}-${mo}`;

    const fuels = await fetchDay(date);
    if (Object.keys(fuels).length === 0) continue;

    const total = DISPLAY_FUELS.reduce((s, f) => s + (fuels[f] ?? 0), 0);
    const renewableMw = (fuels["Wind Onshore"] ?? 0) + (fuels["Solar"] ?? 0) +
      (fuels["Hydro"] ?? 0) + (fuels["Biomass"] ?? 0);
    const coalMw = (fuels["Hard Coal"] ?? 0) + (fuels["Lignite"] ?? 0);
    const renewablePct = total > 0 ? Math.round((renewableMw / total) * 100) : 0;
    const coalPct = total > 0 ? Math.round((coalMw / total) * 100) : 0;

    monthlyRows.push({
      month: label,
      fuels,
      totalMw: total,
      renewablePct,
      coalPct,
    });
  }

  // Annual averages from monthly data
  const byYear: Record<string, any[]> = {};
  for (const m of monthlyRows) {
    const yr = m.month.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  }

  const annual = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, ms]) => {
      const avgFuels: Record<string, number> = {};
      for (const f of DISPLAY_FUELS) {
        avgFuels[f] = Math.round(ms.reduce((s, m) => s + (m.fuels[f] ?? 0), 0) / ms.length);
      }
      return {
        year,
        ...avgFuels,
        renewablePct: Math.round(ms.reduce((s, m) => s + m.renewablePct, 0) / ms.length),
        coalPct: Math.round(ms.reduce((s, m) => s + m.coalPct, 0) / ms.length),
        monthCount: ms.length,
      };
    });

  const latest = monthlyRows.length > 0 ? monthlyRows[monthlyRows.length - 1] : null;

  const result = {
    live: monthlyRows.length > 0,
    monthly: monthlyRows,
    annual,
    latestMonth: latest,
    fetchedAt: new Date().toISOString(),
  };

  if (monthlyRows.length > 0) toCache(cacheKey, result);
  return result;
}
