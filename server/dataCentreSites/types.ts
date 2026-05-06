/**
 * Data Centre Site Selection — Shared TypeScript types (server-side).
 *
 * For shared client/server Zod schemas see @shared/schema.ts.
 * These types are intentionally kept as plain interfaces — no Zod dependency
 * — so they compile fast and stay easy to adjust as the API evolves.
 */

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface SiteFilters {
  minGridCapacityMW?: number;
  maxFiberDistanceKm?: number;
  maxLandCostPerM2?: number;
  excludeFloodPlains?: boolean;
  minAreaM2?: number;
  maxAreaM2?: number;
  minScore?: number;
}

/** Per-dimension breakdown of the 0–100 composite site score. */
export interface SiteScoreBreakdown {
  grid: number;           // 0–25  grid capacity within 10 km
  fiber: number;          // 0–20  telecom/fiber infra within 5 km
  water: number;          // 0–15  cooling water within 2 km
  zoning: number;         // 0–15  industrial zoning quality
  landCost: number;       // 0–15  estimated land cost (lower → more points)
  environmental: number;  // −20–0 flood risk + protected-area penalties
  access: number;         // 0–10  motorway + rail proximity
  total: number;          // 0–100
}

export interface SiteProperties {
  id: string;             // osm:{type}:{id}  or  cadastral:{country}:{ref}
  score: number;
  scoreBreakdown: SiteScoreBreakdown;
  country: string;
  region?: string;
  address?: string;
  areaM2?: number;
  zoningClass?: string;

  // Grid
  nearestSubstationKm?: number;
  gridCapacityEstimateMW?: number;
  gridDataAvailable: boolean;

  // Fiber / connectivity
  nearestFiberInfraKm?: number;
  fiberDataSource?: string;

  // Cooling water
  nearestWaterBodyKm?: number;
  waterBodyType?: string;

  // Land / cadastral
  estimatedLandCostPerM2?: number;
  cadastralDataAvailable: boolean;
  cadastralReference?: string;
  ownershipType?: string;
  titleNumber?: string;

  // Environmental
  floodRisk?: "none" | "low" | "medium" | "high";
  protectedArea?: boolean;
  protectedAreaName?: string;

  // Satellite / land cover (Copernicus)
  sentinelImageryUrl?: string;
  landCoverClass?: string;

  // Access
  nearestMotorwayKm?: number;
  nearestRailKm?: number;

  // Substation-specific (for grid overlay features)
  voltage?: string;

  // Provenance
  osmId?: number;
  osmType?: "node" | "way" | "relation";
  dataFetchedAt: string;
  dataSources: string[];
}

export type GeoJsonPoint   = { type: "Point";      coordinates: [number, number] };
export type GeoJsonPolygon = { type: "Polygon";     coordinates: [number, number][][] };
export type GeoJsonLine    = { type: "LineString";  coordinates: [number, number][] };
export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonLine;

export interface SiteFeature {
  type: "Feature";
  id: string;
  geometry: GeoJsonGeometry;
  properties: SiteProperties;
}

export interface SearchMetadata {
  country: string;
  region?: string;
  boundingBox: BoundingBox;
  totalCandidates: number;
  gridDataAvailable: boolean;
  cadastralDataAvailable: boolean;
  dataFetchedAt: string;
  dataSources: string[];
  cacheHit: boolean;
  processingNotes: string[];
}

export interface SiteSearchResult {
  type: "FeatureCollection";
  features: SiteFeature[];
  metadata: SearchMetadata;
}

// ── Overpass intermediate types ────────────────────────────────────────────────

export interface OverpassSubstation {
  id: number;
  type: "node" | "way";
  lat: number;
  lon: number;
  voltage?: string;
  tags: Record<string, string>;
}

export interface OverpassWaterBody {
  id: number;
  lat: number;
  lon: number;
  waterType: string;
}

export interface OverpassFiberInfra {
  id: number;
  lat: number;
  lon: number;
  infraType: string;
}

export interface OverpassRoad {
  id: number;
  lat: number;
  lon: number;
  roadType: string;
}

export interface OverpassParsedData {
  industrialZones: SiteFeature[];
  substations: OverpassSubstation[];
  waterBodies: OverpassWaterBody[];
  fiberInfra: OverpassFiberInfra[];
  roads: OverpassRoad[];
  notes: string[];
}

// ── Grid analysis ──────────────────────────────────────────────────────────────

export interface UNFuelSlot {
  capacityMW:     number;
  generationGWh:  number;
  percentOfTotal: number;
}

/** UN Energy Statistics fuel-mix breakdown — present for APAC countries. */
export interface GridComposition {
  coal:    UNFuelSlot;
  gas:     UNFuelSlot;
  hydro:   UNFuelSlot;
  wind:    UNFuelSlot;
  solar:   UNFuelSlot;
  nuclear: UNFuelSlot;
  totalCapacityMW:    number;
  totalGenerationGWh: number;
  renewablesPercent:  number;
  year: number;
  source: "UN_ENERGY_STATS";
}

export interface GridAnalysisResult {
  country: string;
  region?: string;
  dataAvailable: boolean;
  currentPriceMWh?: number;
  priceTrendMonthly?: Array<{ year: number; month: number; avgEurMwh: number }>;
  priceCurrency?: string;
  renewableSharePercent?: number;
  generationMix?: Array<{ fuelType: string; avgMw: number }>;
  substations: SiteFeature[];   // GeoJSON point features for map overlay
  notes: string;
  cacheHit?: boolean;

  // UN Energy Statistics enrichment (APAC countries)
  gridComposition?: GridComposition | null;
  regionalCapacityMW?: number;
  connectionQueueMonths?: number;
  gridStabilityScore?: number;
  dataQuality?: {
    manual_data_age_years: number;
    un_data_age_years:     number;
    consistent:            boolean | null;
    delta_pct?:            number;
  };
  warnings?: string[];
}

// ── Cadastral ──────────────────────────────────────────────────────────────────

export interface CadastralParcelProperties {
  reference: string;
  country: string;
  ownershipType?: string;
  areaM2?: number;
  landUse?: string;
  estimatedCostPerM2?: number;
  titleNumber?: string;
  dataSource: string;
  fetchedAt: string;
}

export interface CadastralParcel {
  type: "Feature";
  id: string;
  geometry: GeoJsonGeometry;
  properties: CadastralParcelProperties;
}
