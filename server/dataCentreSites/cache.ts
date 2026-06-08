/**
 * 24-hour TTL cache for geospatial and grid data.
 *
 * Grid, cadastral, and Overpass data is stable on a daily timescale —
 * power substations and industrial zones don't move hour to hour.
 * Caching prevents hammering Overpass (rate-limited), ENTSO-E, and cadastral APIs.
 *
 * Cache keys are deterministic JSON-stringified query fingerprints.
 * Individual site details are cached by siteId so the /details endpoint
 * can respond without re-running a full search.
 */

import type { SiteSearchResult, GridAnalysisResult, CadastralParcel, SiteFeature } from "./types";

class TTLCache<T> {
  private readonly store = new Map<string, { data: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {
    // Prune expired entries hourly; .unref() so the timer doesn't block process exit
    const timer = setInterval(() => this.prune(), 60 * 60 * 1000);
    if (typeof timer === "object" && "unref" in timer) (timer as any).unref();
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  size(): number {
    return this.store.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

const TTL_24H = 24 * 60 * 60 * 1000;

/** Search result cache — keyed by stringified {country, region, bbox, filters} */
export const searchCache = new TTLCache<SiteSearchResult>(TTL_24H);

/** ENTSO-E grid analysis cache — keyed by "grid:{country}:{region}" */
export const gridCache = new TTLCache<GridAnalysisResult>(TTL_24H);

/** Cadastral parcels cache — keyed by "cadastral:{country}:{bbox}" */
export const cadastralCache = new TTLCache<CadastralParcel[]>(TTL_24H);

/**
 * Individual site detail cache — keyed by siteId (osm:way:123456).
 * Populated automatically during every /search call so that
 * GET /api/data-centre-sites/:siteId/details can respond without a re-fetch.
 */
export const siteDetailCache = new TTLCache<SiteFeature>(TTL_24H);
