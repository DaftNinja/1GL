import * as shp from "shapefile";
import * as fs from "fs/promises";
import * as path from "path";
import proj4 from "proj4";

const NESO_API_BASE = "https://api.neso.energy/api/3/action/datapackage_show";
const DATASET_ID = "ssep-onshore-publication-zone-shapefile";
const ALLOWED_HOSTS = ["api.neso.energy"];

const CACHE_DIR = path.join("/tmp", "neso-cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30000;

proj4.defs("EPSG:27700", "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs");

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: any[];
}

interface SSEPData {
  onshore: GeoJSONFeatureCollection;
  offshore: GeoJSONFeatureCollection;
  economic: GeoJSONFeatureCollection;
  fetchedAt: string;
}

let memoryCache: SSEPData | null = null;
let memoryCacheTime = 0;

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) throw new Error(`Disallowed host: ${parsed.hostname}`);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  validateUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(arrayBuffer));
  } finally {
    clearTimeout(timeout);
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<string> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  await fs.mkdir(destDir, { recursive: true });
  await execAsync(`unzip -o "${zipPath}" -d "${destDir}"`, { timeout: 15000 });

  const findShp = async (dir: string): Promise<string> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = await findShp(fullPath);
        if (result) return result;
      } else if (entry.name.endsWith(".shp")) {
        return fullPath;
      }
    }
    return "";
  };

  const shpFile = await findShp(destDir);
  if (!shpFile) throw new Error(`No .shp file found in ${destDir}`);
  return shpFile;
}

function reprojectCoords(coords: any): any {
  if (typeof coords[0] === "number" && typeof coords[1] === "number" && !Array.isArray(coords[0])) {
    const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [coords[0], coords[1]]);
    return [lng, lat];
  }
  return coords.map((c: any) => reprojectCoords(c));
}

function reprojectFeature(feature: any): any {
  if (!feature.geometry || !feature.geometry.coordinates) return feature;
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: reprojectCoords(feature.geometry.coordinates),
    },
  };
}

function findNumericPair(coords: any): [number, number] | null {
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    return [coords[0], coords[1]];
  }
  if (Array.isArray(coords)) {
    for (const c of coords) {
      const found = findNumericPair(c);
      if (found) return found;
    }
  }
  return null;
}

function hasUnprojectedCoords(data: SSEPData): boolean {
  const layers = [data.onshore, data.offshore, data.economic];
  for (const layer of layers) {
    if (!layer?.features?.length) continue;
    for (let i = 0; i < Math.min(layer.features.length, 3); i++) {
      const geom = layer.features[i]?.geometry;
      if (!geom?.coordinates) continue;
      const pair = findNumericPair(geom.coordinates);
      if (pair) {
        const [lng, lat] = pair;
        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return true;
      }
    }
  }
  return false;
}

async function shapefileToGeoJSON(shpPath: string): Promise<GeoJSONFeatureCollection> {
  const source = await shp.open(shpPath);
  const features: any[] = [];
  let result;
  while (!(result = await source.read()).done) {
    features.push(reprojectFeature(result.value));
  }
  return { type: "FeatureCollection", features };
}

async function fetchAndConvert(): Promise<SSEPData> {
  await ensureCacheDir();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let meta;
  try {
    const metaRes = await fetch(`${NESO_API_BASE}?id=${DATASET_ID}`, { signal: controller.signal });
    if (!metaRes.ok) throw new Error(`NESO API error: ${metaRes.status}`);
    meta = await metaRes.json();
  } finally {
    clearTimeout(timeout);
  }

  const resources = meta.result.resources as any[];

  const resourceMap: Record<string, string> = {};
  for (const r of resources) {
    const name = (r.name || "").toLowerCase();
    if (name.includes("onshore")) resourceMap.onshore = r.path || r.url;
    else if (name.includes("offshore")) resourceMap.offshore = r.path || r.url;
    else if (name.includes("economic")) resourceMap.economic = r.path || r.url;
  }

  const results: Record<string, GeoJSONFeatureCollection> = {};

  for (const [key, url] of Object.entries(resourceMap)) {
    const zipPath = path.join(CACHE_DIR, `${key}.zip`);
    const extractDir = path.join(CACHE_DIR, key);

    await downloadFile(url, zipPath);
    const shpPath = await extractZip(zipPath, extractDir);
    results[key] = await shapefileToGeoJSON(shpPath);

    console.log(`[NESO] ${key}: ${results[key].features.length} features`);
  }

  const data: SSEPData = {
    onshore: results.onshore || { type: "FeatureCollection", features: [] },
    offshore: results.offshore || { type: "FeatureCollection", features: [] },
    economic: results.economic || { type: "FeatureCollection", features: [] },
    fetchedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(CACHE_DIR, "ssep_geojson.json"),
    JSON.stringify(data)
  );

  memoryCache = data;
  memoryCacheTime = Date.now();
  return data;
}

export async function getSSEPData(): Promise<SSEPData> {
  if (memoryCache && (Date.now() - memoryCacheTime < CACHE_TTL_MS)) {
    return memoryCache;
  }

  try {
    const cachePath = path.join(CACHE_DIR, "ssep_geojson.json");
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      const raw = await fs.readFile(cachePath, "utf-8");
      const cached = JSON.parse(raw) as SSEPData;
      if (hasUnprojectedCoords(cached)) {
        console.log("[NESO] Stale cache with unprojected coords, re-fetching...");
        throw new Error("stale");
      }
      memoryCache = cached;
      memoryCacheTime = stat.mtimeMs;
      return memoryCache!;
    }
  } catch {}

  return fetchAndConvert();
}
