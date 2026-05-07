/**
 * DC Market Intelligence API Routes
 * 
 * Public-facing endpoints for visualizing data centre market data
 */

import { Router } from 'express';
import { db } from '../db';
import { dcPricingSnapshots, dcScrapingLogs, dcScrapingTargets } from '../db/schema';
import { sql, desc, eq, and } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/dc-market/overview
 * Returns high-level market statistics
 */
router.get('/overview', async (req, res) => {
  try {
    // Get total facilities
    const [facilityCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dcPricingSnapshots);

    // Get unique operators
    const [operatorCount] = await db
      .select({ count: sql<number>`count(distinct operator_name)` })
      .from(dcPricingSnapshots);

    // Get unique countries
    const [countryCount] = await db
      .select({ count: sql<number>`count(distinct country)` })
      .from(dcPricingSnapshots);

    // Get last scrape time
    const [lastScrape] = await db
      .select({ completedAt: dcScrapingLogs.scrapeCompletedAt })
      .from(dcScrapingLogs)
      .where(eq(dcScrapingLogs.status, 'success'))
      .orderBy(desc(dcScrapingLogs.scrapeCompletedAt))
      .limit(1);

    // Get facilities with capacity data
    const [capacityCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dcPricingSnapshots)
      .where(sql`mw_deployed IS NOT NULL`);

    res.json({
      totalFacilities: facilityCount.count,
      totalOperators: operatorCount.count,
      totalCountries: countryCount.count,
      facilitiesWithCapacity: capacityCount.count,
      lastUpdated: lastScrape?.completedAt || null,
    });
  } catch (error) {
    console.error('Failed to fetch overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview data' });
  }
});

/**
 * GET /api/dc-market/operators
 * Returns facility count by operator
 */
router.get('/operators', async (req, res) => {
  try {
    const operators = await db
      .select({
        operatorName: dcPricingSnapshots.operatorName,
        facilityCount: sql<string>`count(*)::text`,
      })
      .from(dcPricingSnapshots)
      .groupBy(dcPricingSnapshots.operatorName)
      .orderBy(desc(sql`count(*)`));

    res.json({ operators });
  } catch (error) {
    console.error('Failed to fetch operators:', error);
    res.status(500).json({ error: 'Failed to fetch operator data' });
  }
});

/**
 * GET /api/dc-market/regions
 * Returns facility count by region/country
 */
router.get('/regions', async (req, res) => {
  try {
    const regions = await db
      .select({
        country: dcPricingSnapshots.country,
        facilityCount: sql<string>`count(*)::text`,
      })
      .from(dcPricingSnapshots)
      .groupBy(dcPricingSnapshots.country)
      .orderBy(desc(sql`count(*)`));

    // Convert string counts to numbers for proper chart rendering
    const regionsWithNumbers = regions.map(r => ({
      ...r,
      facilityCount: parseInt(r.facilityCount) || 0
    }));

    res.json({ regions: regionsWithNumbers });
  } catch (error) {
    console.error('Failed to fetch regions:', error);
    res.status(500).json({ error: 'Failed to fetch region data' });
  }
});

/**
 * GET /api/dc-market/facilities
 * Returns all facilities with location data for mapping
 */
router.get('/facilities', async (req, res) => {
  try {
    const facilities = await db
      .select({
        id: dcPricingSnapshots.id,
        operatorName: dcPricingSnapshots.operatorName,
        facilityName: dcPricingSnapshots.facilityName,
        region: dcPricingSnapshots.region,
        country: dcPricingSnapshots.country,
        mwDeployed: dcPricingSnapshots.mwDeployed,
        confidence: dcPricingSnapshots.confidence,
      })
      .from(dcPricingSnapshots)
      .orderBy(dcPricingSnapshots.operatorName, dcPricingSnapshots.facilityName);

    res.json({ facilities });
  } catch (error) {
    console.error('Failed to fetch facilities:', error);
    res.status(500).json({ error: 'Failed to fetch facility data' });
  }
});

/**
 * GET /api/dc-market/scrape-history
 * Returns recent scrape history for data freshness indicator
 */
router.get('/scrape-history', async (req, res) => {
  try {
    const history = await db
      .select({
        id: dcScrapingLogs.id,
        startedAt: dcScrapingLogs.scrapeStartedAt,
        completedAt: dcScrapingLogs.scrapeCompletedAt,
        status: dcScrapingLogs.status,
        recordsInserted: dcScrapingLogs.recordsInserted,
        operatorName: dcScrapingTargets.operatorName,
      })
      .from(dcScrapingLogs)
      .leftJoin(dcScrapingTargets, eq(dcScrapingLogs.targetId, dcScrapingTargets.id))
      .orderBy(desc(dcScrapingLogs.scrapeStartedAt))
      .limit(20);

    res.json({ history });
  } catch (error) {
    console.error('Failed to fetch scrape history:', error);
    res.status(500).json({ error: 'Failed to fetch scrape history' });
  }
});
/**
 * GET /api/dc-market/facilities-map
 * Returns geocoded facilities for mapping
 */
router.get('/facilities-map', async (req, res) => {
  try {
    // City coordinates lookup
    const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
      'Chandler': { lat: 33.3062, lng: -111.8413 },
      'Phoenix': { lat: 33.4484, lng: -112.0740 },
      'Aurora': { lat: 41.7606, lng: -88.3201 },
      'Chicago': { lat: 41.8781, lng: -87.6298 },
      'Sydney': { lat: -33.8688, lng: 151.2093 },
      'Melbourne': { lat: -37.8136, lng: 144.9631 },
      'Brisbane': { lat: -27.4698, lng: 153.0251 },
      'Perth': { lat: -31.9505, lng: 115.8605 },
      'London': { lat: 51.5074, lng: -0.1278 },
      'Frankfurt': { lat: 50.1109, lng: 8.6821 },
      'Amsterdam': { lat: 52.3676, lng: 4.9041 },
      'Paris': { lat: 48.8566, lng: 2.3522 },
      'Tokyo': { lat: 35.6762, lng: 139.6503 },
      'Hong Kong': { lat: 22.3193, lng: 114.1694 },
      'Singapore': { lat: 1.3521, lng: 103.8198 },
      'Kuala Lumpur': { lat: 3.1390, lng: 101.6869 },
      'Durham': { lat: 35.9940, lng: -78.8986 },
      'Lebanon': { lat: 39.4353, lng: -84.2030 },
      'Florence': { lat: 38.9989, lng: -84.6266 },
      'Austin': { lat: 30.2672, lng: -97.7431 },
      'Houston': { lat: 29.7604, lng: -95.3698 },
      'San Antonio': { lat: 29.4241, lng: -98.4936 },
      'Sterling': { lat: 39.0062, lng: -77.4286 },
      'Quincy': { lat: 47.2340, lng: -119.8526 },
      'Ashburn': { lat: 39.0438, lng: -77.4874 },
      'Dallas': { lat: 32.7767, lng: -96.7970 },
      'Portland': { lat: 45.5152, lng: -122.6784 },
      'San Jose': { lat: 37.3382, lng: -121.8863 },
      'Johor': { lat: 1.4854, lng: 103.7618 },
      'Atlanta': { lat: 33.7490, lng: -84.3880 },
      'Marseille': { lat: 43.2965, lng: 5.3698 },
      'Istanbul': { lat: 41.0082, lng: 28.9784 },
      'Hanoi': { lat: 21.0285, lng: 105.8542 },
      'Shanghai': { lat: 31.2304, lng: 121.4737 },
      'Los Angeles': { lat: 34.0522, lng: -118.2437 },
      'New York': { lat: 40.7128, lng: -74.0060 },
      'Magny-Les-Hameaux': { lat: 48.7271, lng: 2.0685 },
      'Adelaide': { lat: -34.9285, lng: 138.6007 },
      'Canberra': { lat: -35.2809, lng: 149.1300 },
      'Darwin': { lat: -12.4634, lng: 130.8456 },
      'Port Hedland': { lat: -20.3106, lng: 118.6056 },
      // Add more as needed
    };

    const facilities = await db
      .select({
        id: dcPricingSnapshots.id,
        operatorName: dcPricingSnapshots.operatorName,
        facilityName: dcPricingSnapshots.facilityName,
        region: dcPricingSnapshots.region,
        country: dcPricingSnapshots.country,
        mwDeployed: dcPricingSnapshots.mwDeployed,
        confidence: dcPricingSnapshots.confidence,
      })
      .from(dcPricingSnapshots)
      // .where(sql`operator_name IN ('CyrusOne', 'NEXTDC', 'Telehouse', 'Stack Infrastructure', 'AirTrunk')`)
      
    const geocoded = facilities
  .map(f => {
    // Use region field (which contains the city) instead of parsing facility_name
    const city = f.region;
    
    if (!city || !CITY_COORDS[city]) return null;
    return { ...f, lat: CITY_COORDS[city].lat, lng: CITY_COORDS[city].lng, city };
  })
  .filter(Boolean);

    const unique = geocoded.reduce((acc: any[], curr) => {
      if (!acc.find(f => f.facilityName === curr.facilityName)) acc.push(curr);
      return acc;
    }, []);

    res.json({ facilities: unique });
  } catch (error) {
    console.error('Failed to fetch facilities map:', error);
    res.status(500).json({ error: 'Failed to fetch facilities map' });
  }
});

export default router;