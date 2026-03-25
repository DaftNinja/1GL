import * as fs from "fs/promises";
import * as path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "ukgen");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (NESO updates every 30 min)

// Historic generation mix and carbon intensity — NESO Data Portal
const NESO_RESOURCE_ID = "f93d1835-75bc-43e5-84ad-12472b180a98";

const FUEL_COLORS: Record<string, string> = {
  "Gas":             "#f97316",
  "Coal":            "#78716c",
  "Nuclear":         "#a78bfa",
  "Wind (Grid)":     "#4ade80",
  "Wind (Embedded)": "#86efac",
  "Hydro":           "#38bdf8",
  "Imports":         "#3b82f6",
  "Biomass":         "#84cc16",
  "Other":           "#9ca3af",
  "Solar":           "#fbbf24",
  "Storage":         "#e879f9",
};

const RENEWABLE_FUELS = new Set([
  "Wind (Grid)", "Wind (Embedded)", "Hydro", "Biomass", "Solar",
]);

const FUEL_FIELDS: Array<{ field: string; label: string }> = [
  { field: "GAS",      label: "Gas" },
  { field: "COAL",     label: "Coal" },
  { field: "NUCLEAR",  label: "Nuclear" },
  { field: "WIND",     label: "Wind (Grid)" },
  { field: "WIND_EMB", label: "Wind (Embedded)" },
  { field: "HYDRO",    label: "Hydro" },
  { field: "IMPORTS",  label: "Imports" },
  { field: "BIOMASS",  label: "Biomass" },
  { field: "SOLAR",    label: "Solar" },
  { field: "STORAGE",  label: "Storage" },
  { field: "OTHER",    label: "Other" },
];

export interface UKFuelSeries {
  fuelType: string;
  color: string;
  points: Array<{ dt: string; mw: number }>;
  avgMw: number;
  peakMw: number;
  totalGwh: number;
  isRenewable: boolean;
}

export interface UKGenerationResult {
  country: "United Kingdom";
  period: string;
  fuels: UKFuelSeries[];
  renewableSharePct: number;
  carbonIntensityAvg: number;
  totalAvgMw: number;
  dataUnit: "MW";
  source: string;
  fetchedAt: string;
}

async function ensureCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function getUKGenerationTimeSeries(): Promise<UKGenerationResult | null> {
  await ensureCache();
  const cacheFile = path.join(CACHE_DIR, "uk-gen-neso.json");

  try {
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      const raw = await fs.readFile(cacheFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}

  try {
    // 7 days × 48 half-hour intervals = 336 records
    const url = `https://api.neso.energy/api/3/action/datastore_search?resource_id=${NESO_RESOURCE_ID}&sort=DATETIME+desc&limit=336`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`NESO API ${res.status}`);

    const json = await res.json();
    const records: any[] = (json.result?.records || []).reverse(); // oldest first

    if (!records.length) return null;

    const fuels: UKFuelSeries[] = FUEL_FIELDS
      .map(({ field, label }) => {
        const points = records
          .filter(r => r[field] != null)
          .map(r => ({
            dt: r.DATETIME.endsWith("Z") ? r.DATETIME : r.DATETIME + "Z",
            mw: Math.max(0, Math.round(parseFloat(r[field]) || 0)),
          }));

        const mwVals = points.map(p => p.mw);
        const avgMw  = mwVals.length ? Math.round(mwVals.reduce((s, v) => s + v, 0) / mwVals.length) : 0;
        const peakMw = mwVals.length ? Math.max(...mwVals) : 0;
        const totalGwh = Math.round((avgMw * 7 * 24) / 1000);

        return {
          fuelType: label,
          color: FUEL_COLORS[label] || "#94a3b8",
          points,
          avgMw,
          peakMw,
          totalGwh,
          isRenewable: RENEWABLE_FUELS.has(label),
        };
      })
      .filter(f => f.peakMw > 0)
      .sort((a, b) => b.avgMw - a.avgMw);

    // Carbon intensity average
    const ciVals = records.map(r => parseFloat(r.CARBON_INTENSITY)).filter(v => !isNaN(v) && v > 0);
    const carbonIntensityAvg = ciVals.length
      ? Math.round(ciVals.reduce((s, v) => s + v, 0) / ciVals.length)
      : 0;

    // Renewable share — use NESO's own RENEWABLE_perc field
    const renVals = records.map(r => parseFloat(r.RENEWABLE_perc)).filter(v => !isNaN(v));
    const renewableSharePct = renVals.length
      ? Math.round(renVals.reduce((s, v) => s + v, 0) / renVals.length)
      : 0;

    // Total system generation average
    const genVals = records.map(r => parseFloat(r.GENERATION)).filter(v => !isNaN(v) && v > 0);
    const totalAvgMw = genVals.length
      ? Math.round(genVals.reduce((s, v) => s + v, 0) / genVals.length)
      : 0;

    const firstDt = records[0]?.DATETIME?.slice(0, 10) ?? "";
    const lastDt  = records[records.length - 1]?.DATETIME?.slice(0, 10) ?? "";
    const period  = `${firstDt} to ${lastDt}`;

    const result: UKGenerationResult = {
      country: "United Kingdom",
      period,
      fuels,
      renewableSharePct,
      carbonIntensityAvg,
      totalAvgMw,
      dataUnit: "MW",
      source: "NESO Historic Generation Mix",
      fetchedAt: new Date().toISOString(),
    };

    await fs.writeFile(cacheFile, JSON.stringify(result));
    return result;
  } catch (err: any) {
    console.error("UK NESO generation error:", err.message);
    return null;
  }
}
