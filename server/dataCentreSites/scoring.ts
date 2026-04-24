/**
 * Site scoring engine — assigns a composite 0–100 score to each industrial zone.
 *
 * Score weights (summing to 100 max):
 *   Grid capacity within 10 km   0–25 pts
 *   Fiber/telecom within 5 km    0–20 pts
 *   Cooling water within 2 km    0–15 pts
 *   Industrial zoning class      0–15 pts
 *   Land cost (lower = better)   0–15 pts
 *   Environmental penalties      −20–0 pts
 *   Road / rail access           0–10 pts
 *
 * All distance thresholds and point allocations are tunable constants at the
 * top of each sub-scorer so future operators can recalibrate without hunting
 * through the logic.
 */

import { haversineKm } from "./overpass";
import type { SiteFeature, SiteScoreBreakdown, OverpassParsedData, SiteFilters, GeoJsonPolygon, GeoJsonPoint } from "./types";

// ── Grid capacity (0–25) ───────────────────────────────────────────────────────
function scoreGrid(distKm: number | undefined): number {
  if (distKm === undefined) return 5; // no substation data — partial credit
  if (distKm <= 1)  return 25;
  if (distKm <= 3)  return 21;
  if (distKm <= 5)  return 17;
  if (distKm <= 10) return 10;
  return 0;
}

// ── Fiber / telecom (0–20) ────────────────────────────────────────────────────
function scoreFiber(distKm: number | undefined): number {
  if (distKm === undefined) return 5;
  if (distKm <= 0.5) return 20;
  if (distKm <= 1)   return 17;
  if (distKm <= 2)   return 13;
  if (distKm <= 5)   return 8;
  return 0;
}

// ── Cooling water (0–15) ──────────────────────────────────────────────────────
function scoreWater(distKm: number | undefined): number {
  if (distKm === undefined) return 3;
  if (distKm <= 0.5) return 15;
  if (distKm <= 1)   return 12;
  if (distKm <= 2)   return 9;
  if (distKm <= 5)   return 4;
  return 0;
}

// ── Zoning classification (0–15) ──────────────────────────────────────────────
function scoreZoning(zoningClass: string | undefined): number {
  if (!zoningClass) return 5;
  if (zoningClass === "industrial") return 15;
  if (zoningClass === "commercial") return 10;
  return 4;
}

// ── Land cost (0–15) — lower cost → higher score ──────────────────────────────
/**
 * Country-average industrial land costs (€/m²) used when cadastral data is
 * absent.  Sources: CBRE European Industrial Market Report 2024, JLL EMEA.
 * Update as market data refreshes.
 */
const COUNTRY_AVG_LAND_COST: Record<string, number> = {
  "Netherlands":   180,
  "United Kingdom":200,
  "Germany":       155,
  "France":        125,
  "Belgium":       135,
  "Denmark":       120,
  "Sweden":         95,
  "Norway":        105,
  "Finland":        85,
  "Spain":          80,
  "Portugal":       70,
  "Italy":         110,
  "Poland":         60,
  "Czechia":        65,
  "Romania":        45,
  "Ireland":       165,
};

function scoreLandCost(costPerM2: number | undefined, country: string): number {
  const cost = costPerM2 ?? COUNTRY_AVG_LAND_COST[country] ?? 120;
  if (cost <= 50)  return 15;
  if (cost <= 80)  return 13;
  if (cost <= 120) return 10;
  if (cost <= 160) return 7;
  if (cost <= 220) return 4;
  return 1;
}

// ── Environmental penalties (−20–0) ───────────────────────────────────────────
function scoreEnvironmental(
  floodRisk: "none" | "low" | "medium" | "high" | undefined,
  protectedArea: boolean | undefined,
): number {
  let penalty = 0;
  switch (floodRisk) {
    case "high":   penalty -= 20; break;
    case "medium": penalty -= 10; break;
    case "low":    penalty -=  5; break;
  }
  if (protectedArea) penalty -= 10;
  return Math.max(penalty, -20);
}

// ── Road / rail access (0–10) ─────────────────────────────────────────────────
function scoreAccess(motorwayKm: number | undefined, railKm: number | undefined): number {
  let score = 0;

  // Road access (max 6 pts)
  if (motorwayKm === undefined) {
    score += 3; // unknown — assume moderate
  } else if (motorwayKm <= 2)  score += 6;
  else if (motorwayKm <= 5)    score += 4;
  else if (motorwayKm <= 10)   score += 2;

  // Rail access (max 4 pts — important for construction material delivery)
  if (railKm === undefined) {
    score += 2;
  } else if (railKm <= 1)  score += 4;
  else if (railKm <= 3)    score += 3;
  else if (railKm <= 5)    score += 1;

  return Math.min(score, 10);
}

// ── Centroid of a GeoJSON feature ─────────────────────────────────────────────
function featureCentroid(feature: SiteFeature): [number, number] {
  if (feature.geometry.type === "Point") {
    return (feature.geometry as GeoJsonPoint).coordinates as [number, number];
  }
  const ring = (feature.geometry as GeoJsonPolygon).coordinates[0];
  const sum = ring.reduce(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1]] as [number, number],
    [0, 0] as [number, number],
  );
  return [sum[0] / ring.length, sum[1] / ring.length];
}

// ── Minimum distance from point to list ───────────────────────────────────────
function minDistKm(
  lat: number,
  lon: number,
  points: Array<{ lat: number; lon: number }>,
): number | undefined {
  if (points.length === 0) return undefined;
  let min = Infinity;
  for (const p of points) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < min) min = d;
  }
  return min;
}

// ── Main scoring function ─────────────────────────────────────────────────────

/**
 * Scores and ranks a list of industrial zone features against the surrounding
 * infrastructure parsed from Overpass.  Returns features sorted by score desc.
 *
 * @param sites    Industrial zone GeoJSON features (from Overpass parser)
 * @param parsed   All Overpass-fetched infrastructure for the bounding box
 * @param country  Canonical country name (for land cost estimation)
 * @param filters  Optional post-score filters to apply before returning
 */
export function scoreSites(
  sites: SiteFeature[],
  parsed: OverpassParsedData,
  country: string,
  filters?: SiteFilters,
): SiteFeature[] {
  const motorways = parsed.roads.filter(
    (r) => r.roadType === "motorway" || r.roadType === "trunk",
  );
  const rails = parsed.roads.filter((r) => r.roadType === "rail");

  const scored: SiteFeature[] = sites.map((site) => {
    const [lon, lat] = featureCentroid(site);

    const nearestSubstationKm = minDistKm(lat, lon, parsed.substations);
    const nearestFiberKm = minDistKm(lat, lon, parsed.fiberInfra);
    const nearestWaterKm = minDistKm(lat, lon, parsed.waterBodies);
    const nearestMotorwayKm = minDistKm(lat, lon, motorways);
    const nearestRailKm = minDistKm(lat, lon, rails);

    const { floodRisk, protectedArea, estimatedLandCostPerM2, zoningClass } = site.properties;

    const breakdown: SiteScoreBreakdown = {
      grid:          scoreGrid(nearestSubstationKm),
      fiber:         scoreFiber(nearestFiberKm),
      water:         scoreWater(nearestWaterKm),
      zoning:        scoreZoning(zoningClass),
      landCost:      scoreLandCost(estimatedLandCostPerM2, country),
      environmental: scoreEnvironmental(floodRisk, protectedArea),
      access:        scoreAccess(nearestMotorwayKm, nearestRailKm),
      total: 0,
    };

    breakdown.total = Math.max(
      0,
      breakdown.grid +
        breakdown.fiber +
        breakdown.water +
        breakdown.zoning +
        breakdown.landCost +
        breakdown.environmental +
        breakdown.access,
    );

    const round1 = (n: number | undefined) =>
      n != null ? Math.round(n * 10) / 10 : undefined;

    return {
      ...site,
      properties: {
        ...site.properties,
        country,
        score: breakdown.total,
        scoreBreakdown: breakdown,
        nearestSubstationKm:  round1(nearestSubstationKm),
        nearestFiberInfraKm:  round1(nearestFiberKm),
        nearestWaterBodyKm:   round1(nearestWaterKm),
        nearestMotorwayKm:    round1(nearestMotorwayKm),
        nearestRailKm:        round1(nearestRailKm),
      },
    } as SiteFeature;
  });

  // ── Apply filters ─────────────────────────────────────────────────────────
  let filtered = scored;

  if (filters?.minScore !== undefined) {
    filtered = filtered.filter((s) => s.properties.score >= filters.minScore!);
  }
  if (filters?.maxFiberDistanceKm !== undefined) {
    filtered = filtered.filter(
      (s) =>
        s.properties.nearestFiberInfraKm == null ||
        s.properties.nearestFiberInfraKm <= filters.maxFiberDistanceKm!,
    );
  }
  if (filters?.minAreaM2 !== undefined) {
    filtered = filtered.filter((s) => (s.properties.areaM2 ?? 0) >= filters.minAreaM2!);
  }
  if (filters?.maxAreaM2 !== undefined) {
    filtered = filtered.filter((s) => (s.properties.areaM2 ?? Infinity) <= filters.maxAreaM2!);
  }
  if (filters?.excludeFloodPlains) {
    filtered = filtered.filter(
      (s) =>
        s.properties.floodRisk !== "high" &&
        s.properties.floodRisk !== "medium",
    );
  }

  // Sort by composite score descending — best candidates first
  return filtered.sort((a, b) => b.properties.score - a.properties.score);
}
