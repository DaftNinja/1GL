/**
 * ENTSO-E grid analysis wrapper for site selection.
 *
 * Wraps the existing server/entsoe.ts module and adds:
 *  - Substation GeoJSON conversion (for the map overlay layer)
 *  - Graceful degradation when ENTSO-E token is absent or the country
 *    is not covered (non-ENTSO-E members: US, Brazil)
 *  - Consistent GridAnalysisResult output shape for the routes layer
 *
 * ENTSO-E coverage: all EU member states + UK, Norway, Switzerland, etc.
 * Countries outside ENTSO-E: United States, Brazil → dataAvailable: false
 */

import type {
  GridAnalysisResult,
  OverpassSubstation,
  SiteFeature,
  SiteScoreBreakdown,
} from "./types";

function blankBreakdown(): SiteScoreBreakdown {
  return { grid: 0, fiber: 0, water: 0, zoning: 0, landCost: 0, environmental: 0, access: 0, total: 0 };
}

/** Converts raw OverpassSubstation list to GeoJSON point features for map overlay. */
function substationsToFeatures(substations: OverpassSubstation[]): SiteFeature[] {
  return substations.map((s) => ({
    type: "Feature" as const,
    id: `osm:${s.type}:${s.id}`,
    geometry: {
      type: "Point" as const,
      coordinates: [s.lon, s.lat] as [number, number],
    },
    properties: {
      id: `osm:${s.type}:${s.id}`,
      score: 0,
      scoreBreakdown: blankBreakdown(),
      country: "",
      zoningClass: s.tags.power ?? "substation",
      voltage: s.voltage,
      gridDataAvailable: true,
      cadastralDataAvailable: false,
      osmId: s.id,
      osmType: s.type,
      dataFetchedAt: new Date().toISOString(),
      dataSources: ["OpenStreetMap (Overpass API)"],
    },
  }));
}

/**
 * Fetches ENTSO-E live grid metrics for a country and returns them in a
 * normalised GridAnalysisResult alongside substation GeoJSON.
 *
 * @param country     Canonical country name (matches entsoe.ts EIC zone map)
 * @param region      Optional sub-national region name (informational only)
 * @param substations Overpass-fetched substations to include as GeoJSON overlay
 */
export async function getGridAnalysis(
  country: string,
  region?: string,
  substations: OverpassSubstation[] = [],
): Promise<GridAnalysisResult> {
  const subFeatures = substationsToFeatures(substations);

  // Countries not covered by ENTSO-E
  const nonEntsoeCountries = new Set(["United States", "Brazil"]);
  if (nonEntsoeCountries.has(country)) {
    return {
      country,
      region,
      dataAvailable: false,
      substations: subFeatures,
      notes: `${country} is not covered by the ENTSO-E Transparency Platform. Live grid data unavailable.`,
    };
  }

  try {
    const { getCountryDayAheadPrices, getCountryGeneration, isEntsoeConfigured } =
      await import("../entsoe");

    if (!isEntsoeConfigured()) {
      return {
        country,
        region,
        dataAvailable: false,
        substations: subFeatures,
        notes:
          "ENTSO-E API not configured. Set the ENTSOE_TOKEN environment variable to enable live grid data.",
      };
    }

    const [priceResult, genResult] = await Promise.allSettled([
      getCountryDayAheadPrices(country),
      getCountryGeneration(country),
    ]);

    const prices = priceResult.status === "fulfilled" ? priceResult.value : null;
    const gen    = genResult.status   === "fulfilled" ? genResult.value   : null;

    const dataAvailable = !!(prices || gen);

    return {
      country,
      region,
      dataAvailable,
      currentPriceMWh:       prices?.latestDayAvg ?? undefined,
      renewableSharePercent: gen?.renewableSharePct ?? undefined,
      generationMix:         gen?.fuels.slice(0, 10).map((f) => ({ fuelType: f.fuelType, avgMw: f.avgMw })) ?? undefined,
      substations: subFeatures,
      notes: dataAvailable
        ? `Live ENTSO-E data retrieved for ${country}.`
        : `ENTSO-E query succeeded but returned no data for ${country} — grid data flagged unavailable.`,
    };
  } catch (err: any) {
    console.warn(`[GridAnalysis] ENTSO-E error for ${country}:`, err.message);
    return {
      country,
      region,
      dataAvailable: false,
      substations: subFeatures,
      notes: `ENTSO-E fetch failed for ${country}: ${err.message}`,
    };
  }
}
