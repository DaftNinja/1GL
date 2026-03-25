import type { InsertBaxtelDatacentre } from "@shared/schema";
import * as fs from "fs/promises";
import * as path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "baxtel");
const FILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000;

// The Mapbox public token used to fetch Baxtel tile data (set via BAXTEL_MAPBOX_TOKEN env var)
const BAXTEL_MAPBOX_TOKEN = process.env.BAXTEL_MAPBOX_TOKEN;
const BAXTEL_TILESET = "ericbell.baxtel_sites";

// Europe bounding box (covers all 15 target countries + Iceland)
const EUROPE_BOUNDS = { minLat: 34, maxLat: 72, minLng: -25, maxLng: 42 };
const TILE_ZOOM = 5;

let memoryCache: InsertBaxtelDatacentre[] | null = null;
let memoryCacheTimestamp = 0;

export function isBaxtelConfigured(): boolean {
  return !!BAXTEL_MAPBOX_TOKEN;
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readFileCache(): Promise<InsertBaxtelDatacentre[] | null> {
  try {
    const cacheFile = path.join(CACHE_DIR, "datacentres.json");
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < FILE_CACHE_TTL_MS) {
      const raw = await fs.readFile(cacheFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

async function writeFileCache(records: InsertBaxtelDatacentre[]): Promise<void> {
  try {
    await ensureCacheDir();
    await fs.writeFile(
      path.join(CACHE_DIR, "datacentres.json"),
      JSON.stringify(records)
    );
  } catch (err: any) {
    console.warn("Failed to write Baxtel file cache:", err.message);
  }
}

// ---------- Tile maths ----------
function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
function tile2lng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function lng2tile(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
function lat2tile(lat: number, z: number): number {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, z)
  );
}
function mvtCoordToLatLng(
  x: number,
  y: number,
  tileX: number,
  tileY: number,
  zoom: number
): { lat: number; lng: number } {
  const extent = 4096;
  const z2 = Math.pow(2, zoom);

  // Longitude: linear in Mercator X — no distortion, simple interpolation is exact
  const lng1 = tile2lng(tileX, zoom);
  const lng2 = tile2lng(tileX + 1, zoom);
  const lng = lng1 + (x / extent) * (lng2 - lng1);

  // Latitude: MVT y coords are in Mercator space, NOT geographic degrees.
  // Linearly interpolating geographic latitudes introduces a systematic error
  // of up to ~0.1° at UK latitudes. We must interpolate in Mercator Y instead.
  const mercY1 = Math.PI - (2 * Math.PI * tileY)       / z2; // north (Mercator Y, higher value)
  const mercY2 = Math.PI - (2 * Math.PI * (tileY + 1)) / z2; // south
  const mercY  = mercY1 + (y / extent) * (mercY2 - mercY1);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercY));

  return { lat, lng };
}

// ---------- Vector tile decoding ----------
async function fetchAndDecodeTile(
  z: number,
  x: number,
  y: number
): Promise<any[]> {
  const url = `https://api.mapbox.com/v4/${BAXTEL_TILESET}/${z}/${x}/${y}.vector.pbf?access_token=${BAXTEL_MAPBOX_TOKEN}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    if (resp.status !== 404) {
      console.warn(`Baxtel tile ${z}/${x}/${y} returned ${resp.status}`);
    }
    return [];
  }

  const buf = await resp.arrayBuffer();

  // Lazy-load decoders to avoid startup cost
  const [{ default: Pbf }, { VectorTile }] = await Promise.all([
    import("pbf"),
    import("@mapbox/vector-tile"),
  ]);

  const tile = new VectorTile(new Pbf(buf));
  const features: any[] = [];

  for (const layerName of Object.keys(tile.layers)) {
    const layer = tile.layers[layerName];
    for (let i = 0; i < layer.length; i++) {
      const feat = layer.feature(i);
      const geom = feat.loadGeometry();
      if (geom.length > 0 && geom[0].length > 0) {
        const pt = geom[0][0];
        const { lat, lng } = mvtCoordToLatLng(pt.x, pt.y, x, y, z);
        features.push({ lat, lng, ...feat.properties });
      }
    }
  }
  return features;
}

// ---------- Main scraper ----------
async function fetchEuropeFromTiles(): Promise<InsertBaxtelDatacentre[]> {
  const { minLat, maxLat, minLng, maxLng } = EUROPE_BOUNDS;
  const z = TILE_ZOOM;

  const minX = lng2tile(minLng, z);
  const maxX = lng2tile(maxLng, z);
  const minY = lat2tile(maxLat, z); // inverted
  const maxY = lat2tile(minLat, z);

  const totalTiles = (maxX - minX + 1) * (maxY - minY + 1);
  console.log(
    `Baxtel: fetching ${totalTiles} tiles at z${z} (x=${minX}-${maxX}, y=${minY}-${maxY})`
  );

  const allFeatures = new Map<string, any>();
  let tileCount = 0;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tileCount++;
      try {
        const features = await fetchAndDecodeTile(z, x, y);
        for (const f of features) {
          // Deduplicate by site_id + layer_id (same site can appear in multiple tiles)
          const key = `${f.site_id}_${f.layer_id}`;
          if (!allFeatures.has(key)) {
            allFeatures.set(key, f);
          }
        }
      } catch (err: any) {
        console.warn(`Baxtel tile ${z}/${x}/${y} error:`, err.message);
      }
      // Small delay to avoid overwhelming the API
      if (tileCount % 5 === 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  console.log(
    `Baxtel: decoded ${allFeatures.size} unique features from ${tileCount} tiles`
  );

  // Convert to InsertBaxtelDatacentre records
  const records: InsertBaxtelDatacentre[] = [];
  for (const f of Array.from(allFeatures.values())) {
    if (!f.lat || !f.lng || isNaN(f.lat) || isNaN(f.lng)) continue;

    // Only include active stages
    const stage = (f.layer_stage || "").toLowerCase();
    if (
      stage === "decommissioned" ||
      stage === "withdrawn" ||
      stage === "in doubt"
    ) {
      continue;
    }

    // f.id is a unique record ID per site+layer combination; use as stable key
    const baxtelId = String(f.id || `${f.site_id}_${f.layer_id}` || f.public_id || `${f.lat}_${f.lng}`);
    const name = String(f.site_name || f.name || "Unknown");

    let capacityMW: number | null = null;
    if (f.megawatts != null) {
      const parsed = parseFloat(String(f.megawatts));
      if (!isNaN(parsed) && parsed > 0) capacityMW = parsed;
    }

    const url = f.site_slug
      ? `https://baxtel.com/data-center/${f.site_slug}`
      : null;

    records.push({
      baxtelId,
      name,
      lat: f.lat,
      lng: f.lng,
      country: null, // derived from region in the frontend
      operator: f.company_name || null,
      capacityMW,
      tier: f.layer_stage || null,
      websiteUrl: url,
    });
  }

  return records;
}

export async function scrapeBaxtelDatacentres(
  forceRefresh = false
): Promise<InsertBaxtelDatacentre[]> {
  if (!forceRefresh) {
    if (memoryCache && Date.now() - memoryCacheTimestamp < MEMORY_CACHE_TTL_MS) {
      return memoryCache;
    }

    const fileCached = await readFileCache();
    if (fileCached) {
      memoryCache = fileCached;
      memoryCacheTimestamp = Date.now();
      return fileCached;
    }
  }

  const records = await fetchEuropeFromTiles();

  memoryCache = records;
  memoryCacheTimestamp = Date.now();
  await writeFileCache(records);

  return records;
}

export function clearBaxtelCache(): void {
  memoryCache = null;
  memoryCacheTimestamp = 0;
}
