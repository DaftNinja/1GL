import type { InsertOneGLDatacentre } from "@shared/schema";

// ── NASA EONET v3 Natural Hazards integration ─────────────────────────────────
// Fetches open events from NASA's Earth Observatory Natural Event Tracker.
// https://eonet.gsfc.nasa.gov/docs/v3

export interface EONETEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;        // e.g. "wildfires"
  categoryTitle: string;   // e.g. "Wildfires"
  date: string;            // ISO 8601 timestamp of the most recent geometry
  coordinates: [number, number]; // [lng, lat] — GeoJSON order
  magnitude: number | null;
  magnitudeUnit: string | null;
  sources: Array<{ id: string; url: string }>;
  closed: string | null;   // ISO timestamp if event is closed, otherwise null
}

export interface EONETResponse {
  _meta: {
    source: string;
    fetchedAt: string;
    totalEvents: number;
    categories: Record<string, number>; // category → count
  };
  events: EONETEvent[];
}

// Mapping from EONET category ids to our normalised keys
const CATEGORY_MAP: Record<string, string> = {
  "wildfires":                   "wildfires",
  "severeStorms":                "severeStorms",
  "earthquakes":                 "earthquakes",
  "floods":                      "floods",
  "volcanoes":                   "volcanoes",
  "drought":                     "drought",
  "tempExtremes":                "tempExtremes",
  "landslides":                  "landslides",
  // EONET v3 uses these exact ids — map any alternate spellings here
  "seaLakeIce":                  "seaLakeIce",
  "waterColor":                  "waterColor",
};

interface CacheEntry {
  data: EONETResponse;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT_MS = 30_000;     // 30 seconds

let cache: CacheEntry | null = null;

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

export async function getEONETEvents(): Promise<EONETResponse> {
  if (isCacheValid()) return cache!.data;

  const url = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=30";

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!resp.ok) {
    throw new Error(`NASA EONET returned HTTP ${resp.status}`);
  }

  const geojson: any = await resp.json();

  const events: EONETEvent[] = [];
  const categoryCounts: Record<string, number> = {};

  for (const feature of geojson.features ?? []) {
    const props = feature.properties ?? {};
    const geometry = feature.geometry;

    // Only handle Point geometries (most events)
    if (!geometry || geometry.type !== "Point") continue;

    const [lng, lat] = geometry.coordinates as [number, number];
    if (!isFinite(lat) || !isFinite(lng)) continue;

    // Category
    const rawCat = props.categories?.[0]?.id ?? "unknown";
    const category = CATEGORY_MAP[rawCat] ?? rawCat;
    const categoryTitle = props.categories?.[0]?.title ?? rawCat;

    // Magnitude from the last geometry entry in the full event (if available)
    const mag = props.magnitudeValue ?? null;
    const magUnit = props.magnitudeUnit ?? null;

    // Sources
    const sources: Array<{ id: string; url: string }> = (props.sources ?? []).map(
      (s: any) => ({ id: String(s.id ?? ""), url: String(s.url ?? "") }),
    );

    events.push({
      id: String(feature.id ?? props.id ?? Math.random()),
      title: String(props.title ?? "Unknown event"),
      description: props.description ? String(props.description) : null,
      category,
      categoryTitle: String(categoryTitle),
      date: String(props.date ?? props.closed ?? new Date().toISOString()),
      coordinates: [lng, lat],
      magnitude: mag != null ? Number(mag) : null,
      magnitudeUnit: magUnit ? String(magUnit) : null,
      sources,
      closed: props.closed ? String(props.closed) : null,
    });

    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }

  const result: EONETResponse = {
    _meta: {
      source: "NASA EONET v3",
      fetchedAt: new Date().toISOString(),
      totalEvents: events.length,
      categories: categoryCounts,
    },
    events,
  };

  cache = { data: result, fetchedAt: Date.now() };
  console.log(`[eonet] Fetched ${events.length} open events from NASA EONET v3`);
  return result;
}
