import https from "https";

export interface NPGUtilisationSite {
  siteName: string;
  region: string;
  primarySubstation: string;
  postcode: string;
  transformerRatingKVA: number | null;
  currentUtilisationPct: number | null;
  utilisationBand: "Green" | "Amber" | "Red";
  lat: number;
  lng: number;
}

export interface NPGUtilisationResult {
  sites: NPGUtilisationSite[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    green: number;
    amber: number;
    red: number;
  };
}

export interface NPGConnectionQueueItem {
  gsp: string;
  technologyType: string;
  queuedMW: number;
  lat: number | null;
  lng: number | null;
}

export interface NPGConnectionQueueResult {
  items: NPGConnectionQueueItem[];
  totalCount: number;
  fetchedAt: string;
  byGSP: Record<string, { totalMW: number; technologies: { type: string; mw: number }[] }>;
}

export interface NPGNDPSubstation {
  substationName: string;
  licenceArea: "NPgY" | "NPgN";
  substationType: "BSP" | "Primary";
  bspGroup: string;
  gspGroup: string;
  postcode: string;
  demandHeadroom2025: number;
  demandHeadroom2030: number;
  demandHeadroom2035: number;
  genHeadroom2025: number;
  genHeadroom2030: number;
  genHeadroom2035: number;
  demandBand: "Green" | "Amber" | "Red";
  lat: number;
  lng: number;
}

export interface NPGNDPHeadroomResult {
  substations: NPGNDPSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    yorkshire: number;
    northeast: number;
    green: number;
    amber: number;
    red: number;
  };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let utilisationCache: { data: NPGUtilisationResult; ts: number } | null = null;
let connectionQueueCache: { data: NPGConnectionQueueResult; ts: number } | null = null;
let ndpHeadroomCache: { data: NPGNDPHeadroomResult; ts: number } | null = null;

const BASE_URL = "https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets";

const KNOWN_UTILISATION_DATASETS = [
  "npg-site-utilisation-forecasted",
  "npg-site-utilisation",
];
const CONNECTION_QUEUE_DATASET = "connection-queue-information";

let discoveredUtilisationDatasets: string[] | null = null;

async function discoverUtilisationDatasets(apiKey?: string): Promise<string[]> {
  if (discoveredUtilisationDatasets) return discoveredUtilisationDatasets;

  try {
    const catalogUrl = `${BASE_URL}?limit=100&where=dataset_id%20like%20%27%25utilisation%25%27`;
    const response = await fetchJSON(catalogUrl, apiKey);
    const catalogIds: string[] = (response.results || []).map((r: any) => r.dataset_id);
    const allIds = new Set([...KNOWN_UTILISATION_DATASETS, ...catalogIds]);
    discoveredUtilisationDatasets = Array.from(allIds);
    console.log(`NPG catalog discovery found utilisation datasets: ${discoveredUtilisationDatasets.join(", ")}`);
  } catch (err) {
    console.warn(`NPG catalog discovery failed, using known datasets: ${err instanceof Error ? err.message : String(err)}`);
    discoveredUtilisationDatasets = [...KNOWN_UTILISATION_DATASETS];
  }

  return discoveredUtilisationDatasets;
}

function fetchJSON(url: string, apiKey?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; EnergyDashboard/1.0)",
    };
    if (apiKey) headers["Authorization"] = `Apikey ${apiKey}`;
    const opts = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers,
    };

    https.get(opts, (res) => {
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        fetchJSON(res.headers.location, apiKey).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => reject(new Error(`HTTP ${res.statusCode} from NPG API: ${body.substring(0, 200)}`)));
        return;
      }
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse NPG API response as JSON"));
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function parseUtilisationBand(pct: number | null): "Green" | "Amber" | "Red" {
  if (pct == null) return "Green";
  if (pct < 40) return "Green";
  if (pct <= 80) return "Amber";
  return "Red";
}

export async function getNPGUtilisation(): Promise<NPGUtilisationResult> {
  if (utilisationCache && Date.now() - utilisationCache.ts < CACHE_TTL_MS) {
    return utilisationCache.data;
  }

  const apiKey = process.env.NPG_API_KEY;
  if (!apiKey) {
    throw new Error("NPG_API_KEY not configured");
  }

  const datasets = await discoverUtilisationDatasets(apiKey);

  const sites: NPGUtilisationSite[] = [];
  const seenKeys = new Set<string>();
  const limit = 100;

  for (const datasetId of datasets) {
    let offset = 0;
    let datasetCount = 0;

    while (true) {
      const url = `${BASE_URL}/${datasetId}/records?limit=${limit}&offset=${offset}&select=*`;
      let response: any;
      try {
        response = await fetchJSON(url, apiKey);
      } catch (err: unknown) {
        console.warn(`NPG dataset "${datasetId}" fetch failed, skipping: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }

      if (!response.results || response.results.length === 0) break;

      for (const record of response.results) {
        const fields = record;

        let lat: number | null = null;
        let lng: number | null = null;

        const gp = fields.geopoint ?? fields.geo_point ?? fields.geo_point_2d ?? null;
        if (gp && gp.lat != null && gp.lon != null) {
          lat = gp.lat;
          lng = gp.lon;
        } else if (fields.latitude != null && fields.longitude != null) {
          lat = parseFloat(String(fields.latitude));
          lng = parseFloat(String(fields.longitude));
        }

        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

        const ratingRaw = fields.transformer_rating_kva ?? fields.rating_kva ?? fields.transformer_rating ?? null;
        const ratingKVA = ratingRaw != null ? parseFloat(String(ratingRaw)) : null;

        const utilRaw = fields.utilisation ?? fields.current_utilisation_pct ?? fields.utilisation_pct ?? null;
        const utilPct = utilRaw != null ? parseFloat(String(utilRaw)) : null;

        const siteName = fields.site ?? fields.site_name ?? fields.substation_name ?? fields.name ?? "Unknown Site";
        const region = fields.npg_region ?? fields.region ?? fields.licence_area ?? fields.area ?? "";
        const primarySub = fields.associated_primary ?? fields.primary_substation ?? fields.primary ?? "";
        const postcode = fields.postcode ?? fields.post_code ?? "";
        const bandRaw: string = fields.utilisation_band ?? "";

        const dedupeKey = `${String(siteName).toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const band: "Green" | "Amber" | "Red" =
          (bandRaw === "Green" || bandRaw === "Amber" || bandRaw === "Red")
            ? bandRaw
            : parseUtilisationBand(utilPct != null && !isNaN(utilPct) ? utilPct : null);

        sites.push({
          siteName: String(siteName),
          region: String(region),
          primarySubstation: String(primarySub),
          postcode: String(postcode),
          transformerRatingKVA: ratingKVA != null && !isNaN(ratingKVA) ? ratingKVA : null,
          currentUtilisationPct: utilPct != null && !isNaN(utilPct) ? utilPct : null,
          utilisationBand: band,
          lat,
          lng,
        });
        datasetCount++;
      }

      offset += limit;
      if (response.results.length < limit) break;
    }

    console.log(`NPG dataset "${datasetId}": fetched ${datasetCount} unique sites`);
  }

  const summary = { green: 0, amber: 0, red: 0 };
  for (const s of sites) {
    summary[s.utilisationBand.toLowerCase() as "green" | "amber" | "red"]++;
  }

  const result: NPGUtilisationResult = {
    sites,
    totalCount: sites.length,
    fetchedAt: new Date().toISOString(),
    summary,
  };

  utilisationCache = { data: result, ts: Date.now() };
  return result;
}

export async function getNPGConnectionQueue(): Promise<NPGConnectionQueueResult> {
  if (connectionQueueCache && Date.now() - connectionQueueCache.ts < CACHE_TTL_MS) {
    return connectionQueueCache.data;
  }

  // Connection queue is publicly accessible — no API key required
  const apiKey = process.env.NPG_API_KEY;

  const items: NPGConnectionQueueItem[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = `${BASE_URL}/${CONNECTION_QUEUE_DATASET}/records?limit=${limit}&offset=${offset}&select=*`;
    const response = await fetchJSON(url, apiKey || undefined);

    if (!response.results || response.results.length === 0) break;

    for (const record of response.results) {
      const fields = record;

      const gsp = fields.gsp ?? fields.gsp_name ?? fields.grid_supply_point ?? "Unknown GSP";
      const techType = fields.technology ?? fields.technology_type ?? fields.fuel_type ?? "Unknown";
      const mwRaw = fields.export_capacity_mw ?? fields.mw ?? fields.queued_mw ?? fields.capacity_mw ?? 0;
      const mw = parseFloat(String(mwRaw)) || 0;

      let lat: number | null = null;
      let lng: number | null = null;
      const gp2 = fields.geopoint ?? fields.geo_point ?? fields.geo_point_2d ?? null;
      if (gp2 && gp2.lat != null && gp2.lon != null) {
        lat = gp2.lat;
        lng = gp2.lon;
      } else if (fields.latitude != null && fields.longitude != null) {
        lat = parseFloat(String(fields.latitude));
        lng = parseFloat(String(fields.longitude));
      }

      if (lat != null && isNaN(lat)) lat = null;
      if (lng != null && isNaN(lng)) lng = null;

      items.push({
        gsp: String(gsp),
        technologyType: String(techType),
        queuedMW: mw,
        lat,
        lng,
      });
    }

    offset += limit;
    if (response.results.length < limit) break;
  }

  const byGSP: Record<string, { totalMW: number; technologies: { type: string; mw: number }[] }> = {};
  for (const item of items) {
    if (!byGSP[item.gsp]) {
      byGSP[item.gsp] = { totalMW: 0, technologies: [] };
    }
    byGSP[item.gsp].totalMW += item.queuedMW;
    const existing = byGSP[item.gsp].technologies.find(t => t.type === item.technologyType);
    if (existing) {
      existing.mw += item.queuedMW;
    } else {
      byGSP[item.gsp].technologies.push({ type: item.technologyType, mw: item.queuedMW });
    }
  }

  const result: NPGConnectionQueueResult = {
    items,
    totalCount: items.length,
    fetchedAt: new Date().toISOString(),
    byGSP,
  };

  connectionQueueCache = { data: result, ts: Date.now() };
  return result;
}

const NDP_DEMAND_DATASET = "npg_ndp_demand_headroom";
const NDP_GEN_DATASET = "npg_ndp_generation_headroom";
const NDP_SCENARIO = "NPg Reference Scenario";

function parseNDPBand(mw: number): "Green" | "Amber" | "Red" {
  if (mw >= 15) return "Green";
  if (mw >= 5) return "Amber";
  return "Red";
}

async function fetchAllNDPRecords(datasetId: string, scenario: string): Promise<any[]> {
  const all: any[] = [];
  const limit = 100;
  let offset = 0;
  const encodedScenario = encodeURIComponent(`scenario_name="${scenario}"`);
  while (true) {
    const url = `${BASE_URL}/${datasetId}/records?limit=${limit}&offset=${offset}&where=${encodedScenario}&select=*`;
    const response = await fetchJSON(url);
    if (!response.results || response.results.length === 0) break;
    all.push(...response.results);
    offset += limit;
    if (response.results.length < limit) break;
  }
  return all;
}

export async function getNPGNDPHeadroom(): Promise<NPGNDPHeadroomResult> {
  if (ndpHeadroomCache && Date.now() - ndpHeadroomCache.ts < CACHE_TTL_MS) {
    return ndpHeadroomCache.data;
  }

  const [demandRecords, genRecords] = await Promise.all([
    fetchAllNDPRecords(NDP_DEMAND_DATASET, NDP_SCENARIO),
    fetchAllNDPRecords(NDP_GEN_DATASET, NDP_SCENARIO),
  ]);

  const genMap = new Map<string, any>();
  for (const r of genRecords) {
    const key = `${String(r.substation_name || "").toLowerCase()}|${String(r.licence_area || "").toLowerCase()}`;
    genMap.set(key, r);
  }

  const substations: NPGNDPSubstation[] = [];

  for (const r of demandRecords) {
    const gp = r.geo_point_2d;
    if (!gp || gp.lat == null || gp.lon == null) continue;

    const lat = parseFloat(String(gp.lat));
    const lng = parseFloat(String(gp.lon));
    if (isNaN(lat) || isNaN(lng)) continue;

    const name = String(r.substation_name || "Unknown");
    const la = String(r.licence_area || "");
    const rawType = String(r.bulk_supply_point_or_primary || "Primary");
    const substationType: "BSP" | "Primary" = rawType === "BSP" ? "BSP" : "Primary";
    const licenceArea: "NPgY" | "NPgN" = la === "NPgY" ? "NPgY" : "NPgN";

    const dem2025 = parseFloat(String(r.demand_headroom_capacity_mw_2025 ?? 0)) || 0;
    const dem2030 = parseFloat(String(r.demand_headroom_capacity_mw_2030 ?? 0)) || 0;
    const dem2035 = parseFloat(String(r.demand_headroom_capacity_mw_2035 ?? 0)) || 0;

    const genKey = `${name.toLowerCase()}|${la.toLowerCase()}`;
    const gRec = genMap.get(genKey);
    const gen2025 = gRec ? parseFloat(String(gRec.generation_headroom_capacity_mw_2025 ?? 0)) || 0 : 0;
    const gen2030 = gRec ? parseFloat(String(gRec.generation_headroom_capacity_mw_2030 ?? 0)) || 0 : 0;
    const gen2035 = gRec ? parseFloat(String(gRec.generation_headroom_capacity_mw_2035 ?? 0)) || 0 : 0;

    substations.push({
      substationName: name,
      licenceArea,
      substationType,
      bspGroup: String(r.bsp_group || ""),
      gspGroup: String(r.gsp_group || ""),
      postcode: String(r.substation_location || ""),
      demandHeadroom2025: dem2025,
      demandHeadroom2030: dem2030,
      demandHeadroom2035: dem2035,
      genHeadroom2025: gen2025,
      genHeadroom2030: gen2030,
      genHeadroom2035: gen2035,
      demandBand: parseNDPBand(dem2025),
      lat,
      lng,
    });
  }

  const summary = { yorkshire: 0, northeast: 0, green: 0, amber: 0, red: 0 };
  for (const s of substations) {
    if (s.licenceArea === "NPgY") summary.yorkshire++;
    else summary.northeast++;
    summary[s.demandBand.toLowerCase() as "green" | "amber" | "red"]++;
  }

  console.log(`NPg NDP Headroom: ${substations.length} substations (Yorkshire: ${summary.yorkshire}, NE: ${summary.northeast})`);

  const result: NPGNDPHeadroomResult = {
    substations,
    totalCount: substations.length,
    fetchedAt: new Date().toISOString(),
    summary,
  };

  ndpHeadroomCache = { data: result, ts: Date.now() };
  return result;
}
