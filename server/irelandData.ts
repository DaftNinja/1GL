import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const PLANNING_CACHE = path.join(CACHE_DIR, "ireland_planning.json");
const PLANNING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const TII_WIM_SENSORS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-6.7355, 53.18341] },
      properties: {
        name: "M07 Naas South / M7/M9 Junction",
        location: "M07 Between Jn10 Naas South and Jn11 M7/M9, Lewistown, Co. Kildare",
        road: "M07",
        sensorCode: "TMU M07 030.0 W",
        provider: "NRA",
        siteId: "NRA_000000020073",
        sensorType: "WIM (Weigh-In-Motion)",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-6.47488, 53.4486] },
      properties: {
        name: "R147 Dunshaughlin / Dunboyne",
        location: "R147 (Old N03) Between Dunshaughlin and Dunboyne, Black Bull, Co. Meath",
        road: "R147",
        sensorCode: "TMU R147 000.0 S",
        provider: "NRA",
        siteId: "NRA_000000001037",
        sensorType: "WIM (Weigh-In-Motion)",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-6.19982, 53.50218] },
      properties: {
        name: "M01 Donabate / Balbriggan South",
        location: "M01 Between Jn04 Donabate and Jn05 Balbriggan (South), Donabate",
        road: "M01",
        sensorCode: "TMU M01 010.0 S",
        provider: "NRA",
        siteId: "NRA_000000001015",
        sensorType: "WIM (Weigh-In-Motion)",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-6.30403, 52.65503] },
      properties: {
        name: "M11 Gorey Junction",
        location: "M11 Between Jn23 and Jn24, Gorey, Co. Wexford",
        road: "M11",
        sensorCode: "TMU M11 085.0 S",
        provider: "NRA",
        siteId: "NRA_000000020117",
        sensorType: "WIM (Weigh-In-Motion)",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-6.5458, 53.25975] },
      properties: {
        name: "N07 Athgoe / Castlewarden",
        location: "N07 Westbound Between Jn05 Athgoe and Jn06 Castlewarden, Kilteel, Co. Kildare",
        road: "N07",
        sensorCode: "TMU N07 015.0 W",
        provider: "NRA",
        siteId: "NRA_000000200723",
        sensorType: "WIM (Weigh-In-Motion)",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-6.62558, 53.37465] },
      properties: {
        name: "M04 Maynooth",
        location: "M04, Maynooth, West Co. Kildare",
        road: "M04",
        sensorCode: "TMU M04 020.0 W",
        provider: "NRA",
        siteId: "NRA_000000020042",
        sensorType: "WIM (Weigh-In-Motion)",
      },
    },
  ],
};

export function getTrafficSensors() {
  return TII_WIM_SENSORS;
}

export async function getPlanningApplications(): Promise<{ type: string; features: unknown[] }> {
  ensureCacheDir();

  if (fs.existsSync(PLANNING_CACHE)) {
    const stat = fs.statSync(PLANNING_CACHE);
    if (Date.now() - stat.mtimeMs < PLANNING_CACHE_TTL_MS) {
      try {
        const cached = JSON.parse(fs.readFileSync(PLANNING_CACHE, "utf-8"));
        console.log(`[Ireland] Serving planning applications from cache (${cached.features?.length ?? 0} features)`);
        return cached;
      } catch {
      }
    }
  }

  const BASE_URL = "https://services.arcgis.com/NzlPQPKn5QF9v2US/arcgis/rest/services/IrishPlanningApplications/FeatureServer/0/query";
  const PAGE_SIZE = 500;
  const MAX_FEATURES = 1500;
  const allFeatures: unknown[] = [];
  let offset = 0;

  while (allFeatures.length < MAX_FEATURES) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "OBJECTID,PlanningAuthority,ApplicationNumber,DevelopmentDescription,ApplicationStatus,Decision,ReceivedDate,DevelopmentAddress",
      f: "geojson",
      resultRecordCount: String(Math.min(PAGE_SIZE, MAX_FEATURES - allFeatures.length)),
      resultOffset: String(offset),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}?${params.toString()}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.error(`[Ireland] ArcGIS responded ${response.status} at offset ${offset}`);
      break;
    }

    const data = await response.json() as { features?: unknown[] };
    const features = (data.features ?? []).filter((f: any) => {
      const coords = f?.geometry?.coordinates;
      return Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number";
    });

    console.log(`[Ireland] ArcGIS page offset=${offset}: ${features.length} valid features`);
    if (features.length === 0) break;

    allFeatures.push(...features);
    if (features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const result = {
    type: "FeatureCollection",
    features: allFeatures.slice(0, MAX_FEATURES),
    fetchedAt: new Date().toISOString(),
  };

  if (allFeatures.length > 0) {
    try {
      fs.writeFileSync(PLANNING_CACHE, JSON.stringify(result));
      console.log(`[Ireland] Cached ${allFeatures.length} planning applications`);
    } catch (e) {
      console.error("[Ireland] Failed to write planning cache:", e);
    }
  }

  return result;
}
