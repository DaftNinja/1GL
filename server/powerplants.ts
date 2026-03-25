import * as fs from "fs/promises";
import * as path from "path";

export interface PowerPlant {
  gppd_idnr: string;
  name: string;
  country_long: string;
  primary_fuel: string;
  capacity_mw: number;
  latitude: number;
  longitude: number;
  owner: string | null;
  generation_gwh: number | null;   // best available annual generation
  generation_year: number | null;  // year the generation figure relates to
  capacity_factor: number | null;  // generation_gwh / (capacity_mw * 8.76), expressed 0–1
}

const CACHE_FILE = path.join(process.cwd(), ".cache", "powerplants.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ISO-3 country codes for the 14 supported countries
const COUNTRY_CODES = new Set([
  "GBR", "IRL", "NLD", "DEU", "FRA", "BEL",
  "SWE", "NOR", "DNK", "FIN", "ESP", "ITA", "POL", "CHE", "PRT",
]);

const GPPD_CSV_URL =
  "https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv";

/** Minimal RFC-4180 CSV parser — handles quoted fields with embedded commas/newlines */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        row.push(field); field = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        if (ch === "\r") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function getPowerPlants(): Promise<PowerPlant[]> {
  // Try file cache first
  try {
    const stat = await fs.stat(CACHE_FILE);
    if (Date.now() - stat.mtimeMs < CACHE_TTL) {
      const raw = await fs.readFile(CACHE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}

  // Fetch CSV from WRI GitHub (Global Power Plant Database v1.3)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let resp: Response;
  try {
    resp = await fetch(GPPD_CSV_URL, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new Error(`GPPD fetch error: ${resp.status}`);

  const text = await resp.text();
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("GPPD CSV empty");

  // Map header names to column indices
  const headers = rows[0];
  const col = (name: string) => headers.indexOf(name);
  const iCountry   = col("country");
  const iLong      = col("country_long");
  const iName      = col("name");
  const iId        = col("gppd_idnr");
  const iCap       = col("capacity_mw");
  const iLat       = col("latitude");
  const iLon       = col("longitude");
  const iFuel      = col("primary_fuel");
  const iOwner     = col("owner");

  // Actual generation columns newest-first, then estimated fallbacks
  const genActual: Array<{ year: number; idx: number }> = [2019, 2018, 2017, 2016, 2015]
    .map(yr => ({ year: yr, idx: col(`generation_gwh_${yr}`) }))
    .filter(g => g.idx >= 0);
  const genEstimated: Array<{ year: number; idx: number }> = [2017, 2016, 2015]
    .map(yr => ({ year: yr, idx: col(`estimated_generation_gwh_${yr}`) }))
    .filter(g => g.idx >= 0);

  const plants: PowerPlant[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;
    const code = r[iCountry]?.trim();
    if (!COUNTRY_CODES.has(code)) continue;
    const cap = parseFloat(r[iCap]);
    const lat = parseFloat(r[iLat]);
    const lon = parseFloat(r[iLon]);
    if (isNaN(lat) || isNaN(lon) || isNaN(cap)) continue;

    // Pick best available generation figure
    let generation_gwh: number | null = null;
    let generation_year: number | null = null;
    for (const { year, idx } of genActual) {
      const v = parseFloat(r[idx]);
      if (!isNaN(v) && v > 0) { generation_gwh = Math.round(v * 10) / 10; generation_year = year; break; }
    }
    if (generation_gwh === null) {
      for (const { year, idx } of genEstimated) {
        const v = parseFloat(r[idx]);
        if (!isNaN(v) && v > 0) { generation_gwh = Math.round(v * 10) / 10; generation_year = year; break; }
      }
    }

    // Capacity factor = annual_gwh / (capacity_mw × 8.76 hours/year / 1000)
    const capacity_factor = (generation_gwh !== null && cap > 0)
      ? Math.min(1, Math.round((generation_gwh / (cap * 8.76)) * 1000) / 1000)
      : null;

    plants.push({
      gppd_idnr:    r[iId]?.trim() ?? "",
      name:         r[iName]?.trim() || "Unknown",
      country_long: r[iLong]?.trim() || "",
      primary_fuel: r[iFuel]?.trim() || "Other",
      capacity_mw:  cap,
      latitude:     lat,
      longitude:    lon,
      owner:        r[iOwner]?.trim() || null,
      generation_gwh,
      generation_year,
      capacity_factor,
    });
  }

  // Sort by capacity descending
  plants.sort((a, b) => b.capacity_mw - a.capacity_mw);

  // Persist cache
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(plants));
  } catch {}

  return plants;
}
