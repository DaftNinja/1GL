import * as fs from "fs/promises";
import * as path from "path";

const NESO_API_BASE = "https://api.neso.energy/api/3/action/datapackage_show";
const DATASET_ID = "1-day-ahead-demand-forecast";
const ALLOWED_HOSTS = ["api.neso.energy"];

const CACHE_DIR = path.join(process.cwd(), ".cache", "neso");
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

interface CardinalPoint {
  daysAhead: number;
  targetDate: string;
  forecastDemandMW: number;
  cardinalPoint: string;
  cpType: string;
  startTime: string;
  endTime: string;
  label: string;
}

interface DemandForecastData {
  targetDate: string;
  cardinalPoints: CardinalPoint[];
  peakDemandMW: number;
  minDemandMW: number;
  demandCurve: { time: string; demandMW: number; label: string }[];
  fetchedAt: string;
}

let memoryCache: DemandForecastData | null = null;
let memoryCacheTime = 0;

function validateUrl(url: string, allowAnyHttpsHost = false): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`URL must use HTTPS: ${url}`);
  if (!allowAnyHttpsHost && !ALLOWED_HOSTS.includes(parsed.hostname)) throw new Error(`Disallowed host: ${parsed.hostname}`);
}

function formatTime(timeStr: string): string {
  const padded = timeStr.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

function parseCSV(csv: string): CardinalPoint[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const results: CardinalPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.replace(/^"|"$/g, "").trim());
    if (values.length < 8) continue;

    results.push({
      daysAhead: parseInt(values[0]) || 1,
      targetDate: values[1],
      forecastDemandMW: parseInt(values[2]) || 0,
      cardinalPoint: values[3],
      cpType: values[4],
      startTime: formatTime(values[5]),
      endTime: formatTime(values[6]),
      label: values[7] || values[3],
    });
  }

  return results;
}

async function fetchDemandForecast(): Promise<DemandForecastData> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const controller1 = new AbortController();
  const timeout1 = setTimeout(() => controller1.abort(), FETCH_TIMEOUT_MS);
  let meta;
  try {
    const metaUrl = `${NESO_API_BASE}?id=${DATASET_ID}`;
    validateUrl(metaUrl);
    const metaRes = await fetch(metaUrl, { signal: controller1.signal });
    if (!metaRes.ok) throw new Error(`NESO API error: ${metaRes.status}`);
    meta = await metaRes.json();
  } finally {
    clearTimeout(timeout1);
  }

  const resources = meta.result.resources as any[];
  const csvResource = resources.find((r: any) => {
    const name = (r.name || "").toLowerCase();
    const format = (r.format || "").toLowerCase();
    return format === "csv" && name.includes("day_ahead") && !name.includes("historic");
  }) || resources.find((r: any) => {
    const format = (r.format || "").toLowerCase();
    const path = (r.path || "").toLowerCase();
    return format === "csv" && path.includes("demand_1da") && !path.includes("historic");
  });

  if (!csvResource) throw new Error("No CSV resource found in demand forecast dataset");

  const csvUrl = csvResource.path || csvResource.url;
  validateUrl(csvUrl, true); // URL comes from NESO API metadata — any HTTPS host is trusted

  const controller2 = new AbortController();
  const timeout2 = setTimeout(() => controller2.abort(), FETCH_TIMEOUT_MS);
  let csvText: string;
  try {
    const csvRes = await fetch(csvUrl, { signal: controller2.signal });
    if (!csvRes.ok) throw new Error(`Failed to download CSV: ${csvRes.status}`);
    csvText = await csvRes.text();
  } finally {
    clearTimeout(timeout2);
  }

  const allPoints = parseCSV(csvText);
  const cardinalPoints = allPoints.filter(cp => cp.daysAhead === 1);
  if (cardinalPoints.length === 0) throw new Error("No data rows in demand forecast CSV");

  const targetDate = cardinalPoints[0].targetDate;
  const peakDemandMW = Math.max(...cardinalPoints.map(cp => cp.forecastDemandMW));
  const minDemandMW = Math.min(...cardinalPoints.map(cp => cp.forecastDemandMW));

  const timeOrder: Record<string, number> = {
    "1F": 1, "1A": 2, "4": 3, "1B": 4,
    "2F": 5, "2A": 6, "2B": 7, "3B": 8,
    "DP": 9, "4B": 10, "4C": 11,
  };

  const sorted = [...cardinalPoints].sort((a, b) =>
    (timeOrder[a.cardinalPoint] || 99) - (timeOrder[b.cardinalPoint] || 99)
  );

  const labelMap: Record<string, string> = {
    "1F": "Night Start",
    "1A": "Early Morning",
    "4": "Pre-Dawn Low",
    "1B": "Overnight Min",
    "2F": "Morning Rise",
    "2A": "Morning Peak",
    "2B": "Midday",
    "3B": "Afternoon Dip",
    "DP": "Evening Peak",
    "4B": "Late Evening",
    "4C": "Midnight",
  };

  const demandCurve = sorted.map(cp => ({
    time: cp.startTime,
    demandMW: cp.forecastDemandMW,
    label: labelMap[cp.cardinalPoint] || cp.label || cp.cardinalPoint,
  }));

  const data: DemandForecastData = {
    targetDate,
    cardinalPoints: sorted,
    peakDemandMW,
    minDemandMW,
    demandCurve,
    fetchedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(CACHE_DIR, "demand_forecast.json"),
    JSON.stringify(data)
  );

  memoryCache = data;
  memoryCacheTime = Date.now();
  console.log(`[NESO] Demand forecast loaded: ${cardinalPoints.length} cardinal points, peak=${peakDemandMW}MW`);
  return data;
}

export async function getDemandForecastData(): Promise<DemandForecastData> {
  if (memoryCache && (Date.now() - memoryCacheTime < CACHE_TTL_MS)) {
    return memoryCache;
  }

  try {
    const cachePath = path.join(CACHE_DIR, "demand_forecast.json");
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      const raw = await fs.readFile(cachePath, "utf-8");
      memoryCache = JSON.parse(raw);
      memoryCacheTime = stat.mtimeMs;
      return memoryCache!;
    }
  } catch {}

  return fetchDemandForecast();
}
