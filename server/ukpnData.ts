const UKPN_BASE = "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets";

const DATASETS = {
  gridSubstations: "ukpn-grid-transformers",
  connectionQueue: "ltds-table-6-interest-connections",
  faultLevels: "ltds-table-4b-earth-fault-level",
  gridPrimarySites: "grid-and-primary-sites",
};

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache: Record<string, CacheEntry<any>> = {};

async function fetchODS(dataset: string, limit = 100, offset = 0): Promise<any> {
  const apiKey = process.env.UKPN_API_KEY;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (apiKey) {
    params.set("apikey", apiKey);
  }

  const url = `${UKPN_BASE}/${dataset}/records?${params}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`UKPN API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllPages(dataset: string, maxRecords = 1000): Promise<any[]> {
  const cacheKey = `ukpn_${dataset}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const PAGE_SIZE = 100;
  const allRecords: any[] = [];
  let offset = 0;

  while (offset < maxRecords) {
    const result = await fetchODS(dataset, PAGE_SIZE, offset);
    const records = result.results || [];
    allRecords.push(...records);
    if (records.length < PAGE_SIZE || allRecords.length >= (result.total_count || maxRecords)) {
      break;
    }
    offset += PAGE_SIZE;
  }

  cache[cacheKey] = { data: allRecords, fetchedAt: Date.now() };
  return allRecords;
}

export interface GridSubstation {
  id: string;
  siteName: string;
  dnoArea: string;
  operationalVoltage: number | null;
  transformerRatingKVA: number | null;
  lat: number;
  lng: number;
}

export interface ConnectionQueueItem {
  id: string;
  primarySubstation: string;
  dnoArea: string;
  demandMW: number | null;
  generationMW: number | null;
  connectionStatus: string;
  lat: number;
  lng: number;
}

export interface FaultLevelItem {
  id: string;
  substationName: string;
  dnoArea: string;
  existingFaultLevelKA: number | null;
  ratedFaultLevelKA: number | null;
  headroomKA: number | null;
  headroomPct: number | null;
  lat: number;
  lng: number;
}

function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function normaliseDNO(raw: string): string {
  const upper = String(raw).toUpperCase();
  if (upper.includes("LPN") || upper.includes("LONDON")) return "LPN";
  if (upper.includes("EPN") || upper.includes("EASTERN")) return "EPN";
  if (upper.includes("SPN") || upper.includes("SOUTH")) return "SPN";
  return raw;
}

export async function getGridSubstations(): Promise<GridSubstation[]> {
  const raw = await fetchAllPages(DATASETS.gridSubstations, 1000);
  console.log(`[UKPN] Grid substations: ${raw.length} records fetched`);

  return raw
    .map((r: any, i: number) => {
      const coords = r.spatial_coordinates;
      if (!coords || coords.lat == null || coords.lon == null) return null;

      return {
        id: r.sitefunctionallocation || `gs-${i}`,
        siteName: r.sitedesc || r.functionallocationname || `Substation ${i + 1}`,
        dnoArea: normaliseDNO(r.dno || ""),
        operationalVoltage: toNum(r.operationalvoltage),
        transformerRatingKVA: toNum(r.onanrating_kva),
        lat: Number(coords.lat),
        lng: Number(coords.lon),
      } as GridSubstation;
    })
    .filter((s): s is GridSubstation => s !== null);
}

export async function getConnectionQueue(): Promise<ConnectionQueueItem[]> {
  const raw = await fetchAllPages(DATASETS.connectionQueue, 1000);
  console.log(`[UKPN] Connection queue: ${raw.length} records fetched`);

  return raw
    .map((r: any, i: number) => {
      const coords = r.spatial_coordinates;
      if (!coords || coords.lat == null || coords.lon == null) return null;

      return {
        id: r.sitefunctionallocation || `cq-${i}`,
        primarySubstation: r.substation || `Primary ${i + 1}`,
        dnoArea: normaliseDNO(r.licencearea || ""),
        demandMW: toNum(r.demand_numbers_received_total_capacity),
        generationMW: toNum(r.generation_numbers_received_total_capacity),
        connectionStatus: r.status_of_connection || "",
        lat: Number(coords.lat),
        lng: Number(coords.lon),
      } as ConnectionQueueItem;
    })
    .filter((s): s is ConnectionQueueItem => s !== null);
}

export interface GridPrimarySite {
  id: string;
  siteName: string;
  siteType: string;
  siteVoltage: number | null;
  licenceArea: string;
  maxDemandSummer: number | null;
  maxDemandWinter: number | null;
  transRatingSummer: string | null;
  siteClassification: string | null;
  county: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
}

export async function getGridAndPrimarySites(): Promise<GridPrimarySite[]> {
  const raw = await fetchAllPages(DATASETS.gridPrimarySites, 1600);
  console.log(`[UKPN] Grid & primary sites: ${raw.length} records fetched`);

  return raw
    .map((r: any, i: number) => {
      const coords = r.spatial_coordinates;
      if (!coords || coords.lat == null || coords.lon == null) return null;

      return {
        id: r.sitefunctionallocation || `gps-${i}`,
        siteName: r.sitename || `Site ${i + 1}`,
        siteType: r.sitetype || "Unknown",
        siteVoltage: toNum(r.sitevoltage),
        licenceArea: normaliseDNO(r.licencearea || ""),
        maxDemandSummer: toNum(r.maxdemandsummer),
        maxDemandWinter: toNum(r.maxdemandwinter),
        transRatingSummer: r.transratingsummer || null,
        siteClassification: r.siteclassification || null,
        county: r.county || null,
        postcode: r.postcode || null,
        lat: Number(coords.lat),
        lng: Number(coords.lon),
      } as GridPrimarySite;
    })
    .filter((s): s is GridPrimarySite => s !== null);
}

export interface UKPNDFESSubstation {
  substationName: string;
  licenceArea: "LPN" | "EPN" | "SPN";
  voltageKV: number | null;
  bspName: string;
  gspName: string;
  siteId: string;
  demandHeadroom2025: number;
  demandHeadroom2030: number;
  demandHeadroom2035: number;
  genInverterHeadroom2025: number;
  genSynchHeadroom2025: number;
  demandBand: "Green" | "Amber" | "Red";
  lat: number;
  lng: number;
}

export interface UKPNDFESHeadroomResult {
  substations: UKPNDFESSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: { lpn: number; epn: number; spn: number; green: number; amber: number; red: number };
}

const DFES_DATASET = "dfes-network-headroom-report";
const DFES_SCENARIO = "Electric Engagement";
const DFES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let dfesCache: { data: UKPNDFESHeadroomResult; ts: number } | null = null;

function parseDFESBand(mw: number): "Green" | "Amber" | "Red" {
  if (mw >= 15) return "Green";
  if (mw >= 5) return "Amber";
  return "Red";
}

async function fetchDFESCategory(category: string, yearFrom: string, yearTo: string): Promise<any[]> {
  const apiKey = process.env.UKPN_API_KEY;
  const where = `scenario='${DFES_SCENARIO}' AND category='${category}' AND year>='${yearFrom}-01-01' AND year<'${yearTo}-01-01'`;
  const all: any[] = [];
  const PAGE_SIZE = 100;
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      where,
      select: "sitefunctionallocation,substation_name,licencearea,voltage_kv,bulksupplypoint,gridsupplypoint,headroom_mw,spatial_coordinates",
    });
    if (apiKey) params.set("apikey", apiKey);
    const url = `${UKPN_BASE}/${DFES_DATASET}/records?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let result: any;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`UKPN DFES ${res.status}`);
      result = await res.json();
    } finally {
      clearTimeout(timeout);
    }
    const records = result.results || [];
    all.push(...records);
    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function getUKPNDFESHeadroom(): Promise<UKPNDFESHeadroomResult> {
  if (dfesCache && Date.now() - dfesCache.ts < DFES_CACHE_TTL_MS) {
    return dfesCache.data;
  }

  const [dem2025, dem2030, dem2035, genInv2025, genSynch2025] = await Promise.all([
    fetchDFESCategory("Demand Headroom", "2025", "2026"),
    fetchDFESCategory("Demand Headroom", "2030", "2031"),
    fetchDFESCategory("Demand Headroom", "2035", "2036"),
    fetchDFESCategory("Gen inverter headroom", "2025", "2026"),
    fetchDFESCategory("Gen synch headroom", "2025", "2026"),
  ]);

  const byId = new Map<string, Partial<UKPNDFESSubstation> & { lat: number; lng: number }>();

  function upsert(r: any, key: keyof UKPNDFESSubstation, value: any) {
    const id = r.sitefunctionallocation || `${r.substation_name}|${r.licencearea}`;
    if (!byId.has(id)) {
      const coords = r.spatial_coordinates;
      if (!coords || coords.lat == null || coords.lon == null) return;
      byId.set(id, {
        substationName: String(r.substation_name || ""),
        licenceArea: (["LPN", "EPN", "SPN"].includes(r.licencearea) ? r.licencearea : "EPN") as "LPN" | "EPN" | "SPN",
        voltageKV: r.voltage_kv != null ? Number(r.voltage_kv) : null,
        bspName: String(r.bulksupplypoint || ""),
        gspName: String(r.gridsupplypoint || ""),
        siteId: id,
        demandHeadroom2025: 0,
        demandHeadroom2030: 0,
        demandHeadroom2035: 0,
        genInverterHeadroom2025: 0,
        genSynchHeadroom2025: 0,
        demandBand: "Green",
        lat: Number(coords.lat),
        lng: Number(coords.lon),
      });
    }
    const entry = byId.get(id)!;
    (entry as any)[key] = typeof value === "number" ? value : Number(value) || 0;
  }

  for (const r of dem2025)  upsert(r, "demandHeadroom2025", r.headroom_mw ?? 0);
  for (const r of dem2030)  upsert(r, "demandHeadroom2030", r.headroom_mw ?? 0);
  for (const r of dem2035)  upsert(r, "demandHeadroom2035", r.headroom_mw ?? 0);
  for (const r of genInv2025)  upsert(r, "genInverterHeadroom2025", r.headroom_mw ?? 0);
  for (const r of genSynch2025)  upsert(r, "genSynchHeadroom2025", r.headroom_mw ?? 0);

  const substations: UKPNDFESSubstation[] = [];
  for (const sub of byId.values()) {
    if (!sub.substationName || sub.lat == null || sub.lng == null) continue;
    sub.demandBand = parseDFESBand(sub.demandHeadroom2025 ?? 0);
    substations.push(sub as UKPNDFESSubstation);
  }

  const summary = { lpn: 0, epn: 0, spn: 0, green: 0, amber: 0, red: 0 };
  for (const s of substations) {
    summary[s.licenceArea.toLowerCase() as "lpn" | "epn" | "spn"]++;
    summary[s.demandBand.toLowerCase() as "green" | "amber" | "red"]++;
  }

  console.log(`[UKPN] DFES headroom: ${substations.length} substations (LPN:${summary.lpn} EPN:${summary.epn} SPN:${summary.spn})`);

  const result: UKPNDFESHeadroomResult = {
    substations,
    totalCount: substations.length,
    fetchedAt: new Date().toISOString(),
    summary,
  };

  dfesCache = { data: result, ts: Date.now() };
  return result;
}

export async function getFaultLevels(): Promise<FaultLevelItem[]> {
  const raw = await fetchAllPages(DATASETS.faultLevels, 2500);
  console.log(`[UKPN] Fault levels: ${raw.length} records fetched`);

  const seen = new Map<string, any>();
  for (const r of raw) {
    const key = r.sitefunctionallocation;
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, r);
    }
  }

  const gridSubstations = await getGridSubstations();
  const coordsMap = new Map<string, { lat: number; lng: number }>();
  for (const gs of gridSubstations) {
    coordsMap.set(gs.id, { lat: gs.lat, lng: gs.lng });
  }

  const connQueue = await getConnectionQueue();
  for (const cq of connQueue) {
    if (!coordsMap.has(cq.id)) {
      coordsMap.set(cq.id, { lat: cq.lat, lng: cq.lng });
    }
  }

  return Array.from(seen.values())
    .map((r: any, i: number) => {
      const key = r.sitefunctionallocation || `fl-${i}`;
      const coords = coordsMap.get(key);
      if (!coords) return null;

      const existing = toNum(r.existing_system_fault_currents_rms_break_ka);
      const rated = toNum(r.fault_rating_peak_break_ka);
      const headroom = (existing != null && rated != null) ? rated - existing : null;
      const headroomPct = (headroom != null && rated != null && rated > 0) ? (headroom / rated) * 100 : null;

      return {
        id: key,
        substationName: r.substation || `Substation ${i + 1}`,
        dnoArea: normaliseDNO(r.licencearea || ""),
        existingFaultLevelKA: existing,
        ratedFaultLevelKA: rated,
        headroomKA: headroom,
        headroomPct: headroomPct,
        lat: coords.lat,
        lng: coords.lng,
      } as FaultLevelItem;
    })
    .filter((s): s is FaultLevelItem => s !== null);
}
