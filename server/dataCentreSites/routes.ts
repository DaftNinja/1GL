/**
 * Data Centre Site Selection — Express route handlers.
 *
 * Routes registered:
 *   GET  /api/data-centre-sites/search
 *        Query: country, region?, south, west, north, east,
 *               minScore?, maxFiberDistanceKm?, minAreaM2?, maxAreaM2?,
 *               excludeFloodPlains?
 *
 *   GET  /api/data-centre-sites/:siteId/details
 *        Returns a single SiteFeature from cache (populated by /search).
 *
 *   GET  /api/data-centre-sites/grid-analysis/:country/:region
 *        Returns live ENTSO-E grid metrics + substation GeoJSON for the
 *        named country/region pair.
 *
 *   GET  /api/data-centre-sites/cadastral/:country
 *        Returns cadastral parcels for the given country + bbox (query params).
 *
 * All endpoints:
 *   - Require authentication (isAuthenticated middleware)
 *   - Apply 24-hour TTL caching; cache key is printed in metadata.cacheHit
 *   - Return partial results + processing notes on sub-component failures
 *   - Enforce a max bounding-box size (~100 km × 150 km) for Overpass safety
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/setup";
import { queryOverpass } from "./overpass";
import { scoreSites } from "./scoring";
import { getGridAnalysis } from "./entsoeGrid";
import { getCadastralParcels } from "./cadastral/index";
import {
  searchCache,
  gridCache,
  cadastralCache,
  siteDetailCache,
} from "./cache";
import type {
  BoundingBox,
  SiteFilters,
  SiteFeature,
  SiteSearchResult,
} from "./types";

// ── Preset bounding boxes for popular DC regions ───────────────────────────────
// These give well-known starting points; the API also accepts custom bbox params.
export const REGION_PRESETS: Record<string, BoundingBox> = {
  // UK
  "London Metro":        { south: 51.2,  west: -0.6,  north: 51.75, east: 0.35 },
  "Manchester":          { south: 53.3,  west: -2.5,  north: 53.7,  east: -1.9 },
  "Edinburgh":           { south: 55.8,  west: -3.5,  north: 56.1,  east: -2.9 },
  "Slough / Thames Valley": { south: 51.4, west: -0.8, north: 51.6, east: -0.4 },

  // Netherlands
  "Amsterdam AMS-IX":    { south: 52.25, west: 4.7,   north: 52.55, east: 5.1  },
  "Rotterdam":           { south: 51.8,  west: 4.3,   north: 52.0,  east: 4.7  },

  // Germany
  "Frankfurt":           { south: 49.9,  west: 8.5,   north: 50.25, east: 8.9  },
  "Berlin":              { south: 52.35, west: 13.1,  north: 52.7,  east: 13.7 },
  "Munich":              { south: 47.9,  west: 11.3,  north: 48.3,  east: 11.9 },
  "Hamburg":             { south: 53.4,  west: 9.8,   north: 53.7,  east: 10.2 },

  // France
  "Paris":               { south: 48.7,  west: 2.1,   north: 49.0,  east: 2.6  },
  "Lyon":                { south: 45.6,  west: 4.7,   north: 45.9,  east: 5.1  },
  "Marseille":           { south: 43.2,  west: 5.2,   north: 43.45, east: 5.55 },

  // Belgium
  "Brussels":            { south: 50.75, west: 4.25,  north: 51.0,  east: 4.55 },

  // Ireland
  "Dublin":              { south: 53.2,  west: -6.5,  north: 53.5,  east: -6.1 },

  // Sweden
  "Stockholm":           { south: 59.1,  west: 17.7,  north: 59.5,  east: 18.3 },

  // Denmark
  "Copenhagen":          { south: 55.5,  west: 12.3,  north: 55.85, east: 12.75},

  // Poland
  "Warsaw":              { south: 52.1,  west: 20.8,  north: 52.4,  east: 21.3 },
};

// ── Maximum bbox dimensions to protect Overpass ────────────────────────────────
const MAX_BBOX_DEG_LAT = 1.5;   // ~165 km
const MAX_BBOX_DEG_LON = 2.0;   // ~110 km at 56° lat, ~140 km at 45°

// ── Zod validators ─────────────────────────────────────────────────────────────

const bboxQuerySchema = z.object({
  south: z.coerce.number().min(-90).max(90),
  west:  z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  east:  z.coerce.number().min(-180).max(180),
});

const searchQuerySchema = bboxQuerySchema.extend({
  country:             z.string().min(1),
  region:              z.string().optional(),
  minScore:            z.coerce.number().min(0).max(100).optional(),
  maxFiberDistanceKm:  z.coerce.number().min(0).optional(),
  minAreaM2:           z.coerce.number().min(0).optional(),
  maxAreaM2:           z.coerce.number().min(0).optional(),
  excludeFloodPlains:  z.string().transform((v) => v === "true").optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function bboxSizeError(bbox: BoundingBox): string | null {
  const latSpan = bbox.north - bbox.south;
  const lonSpan = bbox.east  - bbox.west;
  if (latSpan <= 0 || lonSpan <= 0) return "north must be > south and east must be > west";
  if (latSpan > MAX_BBOX_DEG_LAT)   return `Bounding box too large (${latSpan.toFixed(2)}° lat > ${MAX_BBOX_DEG_LAT}°). Use a smaller area.`;
  if (lonSpan > MAX_BBOX_DEG_LON)   return `Bounding box too large (${lonSpan.toFixed(2)}° lon > ${MAX_BBOX_DEG_LON}°). Use a smaller area.`;
  return null;
}

function searchCacheKey(params: z.infer<typeof searchQuerySchema>): string {
  return JSON.stringify({
    c: params.country, r: params.region ?? "",
    s: params.south, w: params.west, n: params.north, e: params.east,
    ms: params.minScore, mf: params.maxFiberDistanceKm,
    mi: params.minAreaM2, ma: params.maxAreaM2, ef: params.excludeFloodPlains,
  });
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerDataCentreSiteRoutes(app: Express): void {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/data-centre-sites/search
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/data-centre-sites/search",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid query parameters",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const params = parsed.data;
      const bbox: BoundingBox = {
        south: params.south, west: params.west,
        north: params.north, east: params.east,
      };

      const sizeErr = bboxSizeError(bbox);
      if (sizeErr) return res.status(400).json({ error: sizeErr });

      const cacheKey = searchCacheKey(params);
      const cached = searchCache.get(cacheKey);
      if (cached) {
        return res.json({ ...cached, metadata: { ...cached.metadata, cacheHit: true } });
      }

      const processingNotes: string[] = [];
      const dataSources: string[] = ["OpenStreetMap (Overpass API)"];
      const fetchedAt = new Date().toISOString();

      // 1. Overpass — industrial zones + surrounding infrastructure
      let overpassData;
      try {
        overpassData = await queryOverpass(bbox);
        processingNotes.push(...overpassData.notes);
      } catch (err: any) {
        console.error("[DataCentreSites/search] Overpass error:", err.message);
        return res.status(502).json({
          error: "Overpass API unavailable. Please retry in a few minutes.",
          detail: err.message,
        });
      }

      if (overpassData.industrialZones.length === 0) {
        return res.json({
          type: "FeatureCollection",
          features: [],
          metadata: {
            country: params.country,
            region: params.region,
            boundingBox: bbox,
            totalCandidates: 0,
            gridDataAvailable: false,
            cadastralDataAvailable: false,
            dataFetchedAt: fetchedAt,
            dataSources,
            cacheHit: false,
            processingNotes: [
              ...processingNotes,
              "No industrial zones found in this bounding box. Try expanding the area or adjusting the region.",
            ],
          },
        } satisfies SiteSearchResult);
      }

      // 2. Cadastral data — enriches land parcel information
      let cadastralAvailable = false;
      const cadastralKey = `cadastral:${params.country}:${JSON.stringify(bbox)}`;
      let cadastralParcels = cadastralCache.get(cadastralKey);

      if (!cadastralParcels) {
        const cadastralResult = await getCadastralParcels(params.country, bbox);
        cadastralParcels = cadastralResult.parcels;
        cadastralAvailable = cadastralResult.dataAvailable;
        processingNotes.push(cadastralResult.notes);
        if (cadastralAvailable) {
          cadastralCache.set(cadastralKey, cadastralParcels);
          dataSources.push(cadastralParcels[0]?.properties.dataSource ?? "Cadastral data");
        }
      } else {
        cadastralAvailable = cadastralParcels.length > 0;
        processingNotes.push(`Cadastral data served from 24h cache (${cadastralParcels.length} parcels).`);
      }

      // 3. ENTSO-E grid analysis
      const gridKey = `grid:${params.country}:${params.region ?? ""}`;
      let gridResult = gridCache.get(gridKey);
      let gridAvailable = false;

      if (!gridResult) {
        gridResult = await getGridAnalysis(
          params.country,
          params.region,
          overpassData.substations,
        );
        gridCache.set(gridKey, gridResult);
      }
      gridAvailable = gridResult.dataAvailable;
      processingNotes.push(gridResult.notes);
      if (gridAvailable) dataSources.push("ENTSO-E Transparency Platform");

      // 4. Scoring
      const filters: SiteFilters = {
        minScore:           params.minScore,
        maxFiberDistanceKm: params.maxFiberDistanceKm,
        minAreaM2:          params.minAreaM2,
        maxAreaM2:          params.maxAreaM2,
        excludeFloodPlains: params.excludeFloodPlains,
      };

      const sites = overpassData.industrialZones.map((site) => ({
        ...site,
        properties: {
          ...site.properties,
          country: params.country,
          region: params.region,
          gridDataAvailable: gridAvailable,
          cadastralDataAvailable: cadastralAvailable,
          dataFetchedAt: fetchedAt,
          dataSources,
        },
      })) as SiteFeature[];

      const scored = scoreSites(sites, overpassData, params.country, filters);

      // Populate the individual-site cache so /details can serve without re-fetch
      for (const site of scored) {
        siteDetailCache.set(site.id, site);
      }

      const result: SiteSearchResult = {
        type: "FeatureCollection",
        features: scored,
        metadata: {
          country: params.country,
          region: params.region,
          boundingBox: bbox,
          totalCandidates: scored.length,
          gridDataAvailable: gridAvailable,
          cadastralDataAvailable: cadastralAvailable,
          dataFetchedAt: fetchedAt,
          dataSources,
          cacheHit: false,
          processingNotes,
        },
      };

      searchCache.set(cacheKey, result);
      return res.json(result);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/data-centre-sites/:siteId/details
  // Note: must be registered AFTER the /search route to avoid matching it.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/data-centre-sites/:siteId/details",
    isAuthenticated,
    (req: Request, res: Response) => {
      const { siteId } = req.params;

      // Decode URI component so colons in osm:way:123 survive URL encoding
      const decoded = decodeURIComponent(siteId);
      const site = siteDetailCache.get(decoded);

      if (!site) {
        return res.status(404).json({
          error: "Site not found in cache.",
          hint: "Call GET /api/data-centre-sites/search for the bounding box containing this site first, then retry /details. Site cache TTL is 24 hours.",
        });
      }

      return res.json(site);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/data-centre-sites/grid-analysis/:country/:region
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/data-centre-sites/grid-analysis/:country/:region",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const country = decodeURIComponent(req.params.country);
      const region  = decodeURIComponent(req.params.region);

      const cacheKey = `grid:${country}:${region}`;
      const cached = gridCache.get(cacheKey);
      if (cached) {
        return res.json({ ...cached, cacheHit: true });
      }

      // For the standalone grid-analysis endpoint we don't have Overpass
      // substations — the caller can supply bbox params to get them if needed.
      // For now we call getGridAnalysis with no substations.
      const result = await getGridAnalysis(country, region, []);
      gridCache.set(cacheKey, result);
      return res.json({ ...result, cacheHit: false });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/data-centre-sites/cadastral/:country
  // Query params: south, west, north, east (required)
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/data-centre-sites/cadastral/:country",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const country = decodeURIComponent(req.params.country);

      const bboxParsed = bboxQuerySchema.safeParse(req.query);
      if (!bboxParsed.success) {
        return res.status(400).json({
          error: "Missing or invalid bbox parameters. Provide south, west, north, east.",
          details: bboxParsed.error.flatten().fieldErrors,
        });
      }
      const bbox = bboxParsed.data as BoundingBox;

      const sizeErr = bboxSizeError(bbox);
      if (sizeErr) return res.status(400).json({ error: sizeErr });

      const cacheKey = `cadastral:${country}:${JSON.stringify(bbox)}`;
      const cached = cadastralCache.get(cacheKey);
      if (cached) {
        return res.json({
          type: "FeatureCollection",
          features: cached,
          metadata: { country, parcels: cached.length, cacheHit: true },
        });
      }

      const result = await getCadastralParcels(country, bbox);
      if (result.dataAvailable) {
        cadastralCache.set(cacheKey, result.parcels);
      }

      return res.json({
        type: "FeatureCollection",
        features: result.parcels,
        metadata: {
          country,
          parcels: result.parcels.length,
          dataAvailable: result.dataAvailable,
          notes: result.notes,
          cacheHit: false,
        },
      });
    },
  );
}
