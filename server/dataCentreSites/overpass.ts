/**
 * Overpass API (OpenStreetMap) client — geospatial data for DC site selection.
 *
 * What it fetches per bounding box:
 *   - Industrial / commercial zones  (way[landuse=industrial|commercial])
 *   - HV power substations           (node/way[power=substation])
 *   - Rivers, canals, water bodies   (way[waterway=river|canal], way[natural=water])
 *   - Telecom exchange points        (node[telecom=exchange|communications_tower])
 *   - Motorway / trunk roads         (way[highway=motorway|trunk])
 *   - Railway lines                  (way[railway=rail])
 *
 * Free tier constraints:
 *   - Max 1 concurrent request per IP
 *   - Default server timeout: 60 s
 *   - Please don't hammer it; the 24h cache in cache.ts handles this
 *
 * Override the API endpoint via env:  OVERPASS_URL=https://your-instance.example.com/api/interpreter
 * Public mirror list: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
 */

import type {
  BoundingBox,
  OverpassParsedData,
  OverpassSubstation,
  OverpassWaterBody,
  OverpassFiberInfra,
  OverpassRoad,
  SiteFeature,
  SiteScoreBreakdown,
  GeoJsonGeometry,
} from "./types";

const OVERPASS_URL =
  process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

const TIMEOUT_S = 60;

/** Exponential-backoff delays (ms) for rate-limit / timeout retries */
const RETRY_DELAYS = [6_000, 15_000, 30_000];

// ── Geometry utilities ─────────────────────────────────────────────────────────

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine great-circle distance between two lat/lon pairs, in kilometres.
 * Exported so the scoring engine can reuse it without re-importing geometry logic.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Approximate polygon area in m² using the Shoelace formula projected onto
 * a local flat-earth approximation (accurate within ~1 % for areas < 500 km²).
 *
 * coords: array of [lon, lat] pairs (GeoJSON order).
 */
export function polygonAreaM2(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const midLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const mPerLat = 111_320;
  const mPerLon = 111_320 * Math.cos(toRad(midLat));

  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i][0] * mPerLon;
    const yi = coords[i][1] * mPerLat;
    const xj = coords[j][0] * mPerLon;
    const yj = coords[j][1] * mPerLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

/** Returns the arithmetic centroid [lon, lat] of a coordinate ring. */
export function polygonCentroid(coords: [number, number][]): [number, number] {
  const sum = coords.reduce(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1]] as [number, number],
    [0, 0] as [number, number],
  );
  return [sum[0] / coords.length, sum[1] / coords.length];
}

// ── Overpass QL query builder ──────────────────────────────────────────────────

function buildQuery(bbox: BoundingBox): string {
  const { south, west, north, east } = bbox;
  const b = `(${south},${west},${north},${east})`;
  // Note: voltage regex matches 132 kV, 220 kV, 275 kV, 400 kV — HV suitable for large DC loads.
  return `[out:json][timeout:${TIMEOUT_S}];
(
  way[landuse=industrial]${b};
  way[landuse=commercial]${b};
  node[power=substation]${b};
  way[power=substation]${b};
  node[power=transformer][voltage~"(132|220|275|400|500)"]${b};
  way[waterway~"^(river|canal)$"]${b};
  way[natural=water]${b};
  node[natural=spring]${b};
  node[telecom=exchange]${b};
  node[man_made=communications_tower]${b};
  node[man_made=telephone_exchange]${b};
  way[highway=motorway]${b};
  way[highway=trunk]${b};
  way[railway=rail]${b};
);
out geom;`;
}

// ── HTTP fetch with retry-on-rate-limit ────────────────────────────────────────

async function overpassFetch(query: string): Promise<any> {
  const body = `data=${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout((TIMEOUT_S + 15) * 1000),
      });

      if (res.status === 429 || res.status === 504) {
        const delay = RETRY_DELAYS[attempt];
        if (delay === undefined) {
          throw new Error(`Overpass rate limit exceeded after ${RETRY_DELAYS.length} retries`);
        }
        console.warn(
          `[Overpass] HTTP ${res.status} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS.length})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      return res.json();
    } catch (err: any) {
      const isRetryable =
        err?.message?.includes("timeout") ||
        err?.message?.includes("ECONNRESET") ||
        err?.code === "ECONNRESET";

      if (isRetryable && attempt < RETRY_DELAYS.length) {
        console.warn(`[Overpass] Network error (${err.message}) — retrying in ${RETRY_DELAYS[attempt] / 1000}s`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }
}

// ── OSM element types ──────────────────────────────────────────────────────────

interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OsmWay {
  type: "way";
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

type OsmElement = OsmNode | OsmWay;

// ── Blank score breakdown (populated by scoring engine) ────────────────────────
function blankScore(): SiteScoreBreakdown {
  return { grid: 0, fiber: 0, water: 0, zoning: 0, landCost: 0, environmental: 0, access: 0, total: 0 };
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Queries the Overpass API and parses the response into categorised GeoJSON
 * features and infrastructure point lists ready for the scoring engine.
 *
 * @param bbox  Bounding box in WGS-84 degrees.  Max ~100 km × 150 km.
 */
export async function queryOverpass(bbox: BoundingBox): Promise<OverpassParsedData> {
  const query = buildQuery(bbox);
  const raw: { elements: OsmElement[] } = await overpassFetch(query);
  const elements = raw.elements ?? [];

  const industrialZones: SiteFeature[] = [];
  const substations: OverpassSubstation[] = [];
  const waterBodies: OverpassWaterBody[] = [];
  const fiberInfra: OverpassFiberInfra[] = [];
  const roads: OverpassRoad[] = [];
  const notes: string[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const { landuse, power, waterway, natural, highway, railway } = tags;
    const telecomTag = tags.telecom ?? (tags.man_made === "communications_tower" || tags.man_made === "telephone_exchange" ? tags.man_made : undefined);

    // ── Industrial / commercial zones ─────────────────────────────────────
    if (el.type === "way" && (landuse === "industrial" || landuse === "commercial")) {
      const way = el as OsmWay;
      if (!way.geometry || way.geometry.length < 3) continue;

      const coords: [number, number][] = way.geometry.map((pt) => [pt.lon, pt.lat]);
      // Close the GeoJSON ring if the first and last coords differ
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0]);
      }

      const areaM2 = polygonAreaM2(coords);
      // Discard tiny fragments — minimum 0.5 ha (5,000 m²)
      if (areaM2 < 5_000) continue;

      const siteId = `osm:way:${el.id}`;
      const geometry: GeoJsonGeometry = { type: "Polygon", coordinates: [coords] };

      industrialZones.push({
        type: "Feature",
        id: siteId,
        geometry,
        properties: {
          id: siteId,
          score: 0,
          scoreBreakdown: blankScore(),
          country: "",
          areaM2: Math.round(areaM2),
          zoningClass: landuse,
          gridDataAvailable: false,
          cadastralDataAvailable: false,
          osmId: el.id,
          osmType: "way",
          dataFetchedAt: new Date().toISOString(),
          dataSources: ["OpenStreetMap (Overpass API)"],
        },
      });
      continue;
    }

    // ── Power substations ─────────────────────────────────────────────────
    if (power === "substation" || power === "transformer") {
      let lat: number;
      let lon: number;

      if (el.type === "node") {
        ({ lat, lon } = el as OsmNode);
      } else {
        const way = el as OsmWay;
        if (!way.geometry?.length) continue;
        const c = polygonCentroid(way.geometry.map((g) => [g.lon, g.lat] as [number, number]));
        [lon, lat] = c;
      }

      substations.push({ id: el.id, type: el.type as "node" | "way", lat, lon, voltage: tags.voltage, tags });
      continue;
    }

    // ── Water bodies ──────────────────────────────────────────────────────
    if (waterway === "river" || waterway === "canal" || natural === "water" || natural === "spring") {
      let lat: number;
      let lon: number;

      if (el.type === "node") {
        ({ lat, lon } = el as OsmNode);
      } else {
        const way = el as OsmWay;
        if (!way.geometry?.length) continue;
        const c = polygonCentroid(way.geometry.map((g) => [g.lon, g.lat] as [number, number]));
        [lon, lat] = c;
      }

      waterBodies.push({ id: el.id, lat, lon, waterType: waterway ?? natural ?? "water" });
      continue;
    }

    // ── Telecom / fiber exchange points ───────────────────────────────────
    if (telecomTag) {
      if (el.type === "node") {
        const { lat, lon } = el as OsmNode;
        fiberInfra.push({ id: el.id, lat, lon, infraType: telecomTag });
      }
      continue;
    }

    // ── Roads and rail ────────────────────────────────────────────────────
    if (highway === "motorway" || highway === "trunk" || railway === "rail") {
      const way = el as OsmWay;
      if (way.geometry?.length) {
        const mid = way.geometry[Math.floor(way.geometry.length / 2)];
        roads.push({ id: el.id, lat: mid.lat, lon: mid.lon, roadType: highway ?? railway ?? "road" });
      }
    }
  }

  notes.push(
    `Overpass: parsed ${elements.length} elements → ` +
      `${industrialZones.length} industrial zones (≥0.5 ha), ` +
      `${substations.length} substations, ` +
      `${waterBodies.length} water bodies, ` +
      `${fiberInfra.length} telecom points, ` +
      `${roads.length} road/rail segments`,
  );

  return { industrialZones, substations, waterBodies, fiberInfra, roads, notes };
}
