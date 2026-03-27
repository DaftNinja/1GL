import * as fs from "fs/promises";
import * as path from "path";

const CACHE_DIR = path.join("/tmp", "nged-cache");
const FETCH_TIMEOUT_MS = 30000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const NGED_BASE = "https://connecteddata.nationalgrid.co.uk";
const CKAN_RESOURCE_SHOW = `${NGED_BASE}/api/3/action/resource_show`;

const RESOURCE_IDS = {
  networkCapacity: "d1895bd3-d9d2-4886-a0a3-b7eadd9ab6c2",
  opportunityMap: "d1963858-d451-4794-a6bf-123fad0f0b3a",
  generationRegister: "a31330fc-88a2-41de-b339-9424c1232fc7",
  gcrSummaryByStatus: "94255c7c-4446-44a7-956f-0869bfc7a6d2",
  gcrSummaryByTechnology: "1195699d-99db-4fdf-a47a-42fa9587a2cf",
};

const ECR_DIRECT_URL = `${NGED_BASE}/dataset/55621879-bd56-48d8-8179-36daa38ede99/resource/82a4ae83-77a3-4e7b-9060-8072ed96de9d/download/nged_ecr_jan_2026.csv`;

class NGEDApiKeyMissingError extends Error {
  constructor() {
    super(
      "NGED_API_KEY is not configured. Register at https://connecteddata.nationalgrid.co.uk and agree to the data sharing terms for each dataset, then set the NGED_API_KEY environment variable."
    );
    this.name = "NGEDApiKeyMissingError";
  }
}

function getNGEDApiKey(): string {
  const apiKey = process.env.NGED_API_KEY || process.env.NATIONAL_GRID_API_KEY;
  if (!apiKey) {
    throw new NGEDApiKeyMissingError();
  }
  return apiKey;
}

async function resolveResourceUrl(resourceId: string, apiKey: string): Promise<string> {
  const metaUrl = `${CKAN_RESOURCE_SHOW}?id=${resourceId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(metaUrl, {
      signal: controller.signal,
      headers: { Authorization: apiKey },
    });
    // --- TEMPORARY DIAGNOSTIC LOGGING ---
    const rawText = await res.text().catch(() => "");
    console.log(`[NGED-DEBUG] resource_show status: ${res.status} for resource ${resourceId}`);
    console.log(`[NGED-DEBUG] resource_show response (first 200 chars): ${rawText.slice(0, 200)}`);
    // --- END TEMPORARY LOGGING ---
    if (!res.ok) {
      throw new Error(`CKAN resource_show ${res.status} for ${resourceId}: ${rawText.slice(0, 200)}`);
    }
    const json = JSON.parse(rawText) as { success: boolean; result?: { url?: string } };
    if (!json.success || !json.result?.url) {
      throw new Error(`CKAN resource_show did not return a URL for resource ${resourceId}`);
    }
    return json.result.url;
  } finally {
    clearTimeout(timeout);
  }
}

function osgb36ToWgs84(easting: number, northing: number): { lat: number; lng: number } | null {
  if (easting < 0 || easting > 700000 || northing < 0 || northing > 1300000) return null;

  const a = 6377563.396;
  const b = 6356256.909;
  const e2 = (a * a - b * b) / (a * a);
  const N0 = -100000;
  const E0 = 400000;
  const F0 = 0.9996012717;
  const phi0 = (49 * Math.PI) / 180;
  const lambda0 = (-2 * Math.PI) / 180;

  let phiN = phi0;
  let M = 0;
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n * n * n;

  for (let i = 0; i < 10; i++) {
    M =
      b *
      F0 *
      ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (phiN - phi0) -
        (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(phiN - phi0) * Math.cos(phiN + phi0) +
        ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (phiN - phi0)) * Math.cos(2 * (phiN + phi0)) -
        (35 / 24) * n3 * Math.sin(3 * (phiN - phi0)) * Math.cos(3 * (phiN + phi0)));
    if (Math.abs(northing - N0 - M) < 0.00001) break;
    phiN = phiN + (northing - N0 - M) / (a * F0);
  }

  const sinPhi = Math.sin(phiN);
  const cosPhi = Math.cos(phiN);
  const tanPhi = Math.tan(phiN);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;

  const VII = tanPhi / (2 * rho * nu);
  const VIII = (tanPhi / (24 * rho * nu * nu * nu)) * (5 + 3 * tanPhi * tanPhi + eta2 - 9 * tanPhi * tanPhi * eta2);
  const IX = (tanPhi / (720 * rho * Math.pow(nu, 5))) * (61 + 90 * tanPhi * tanPhi + 45 * Math.pow(tanPhi, 4));
  const X = 1 / (cosPhi * nu);
  const XI = (1 / (cosPhi * 6 * nu * nu * nu)) * (nu / rho + 2 * tanPhi * tanPhi);
  const XII = (1 / (cosPhi * 120 * Math.pow(nu, 5))) * (5 + 28 * tanPhi * tanPhi + 24 * Math.pow(tanPhi, 4));

  const dE = easting - E0;
  const dE2 = dE * dE;
  const dE3 = dE2 * dE;
  const dE4 = dE3 * dE;
  const dE5 = dE4 * dE;
  const dE6 = dE5 * dE;

  let lat = phiN - VII * dE2 + VIII * dE4 - IX * dE6;
  let lng = lambda0 + X * dE - XI * dE3 + XII * dE5;

  lat = (lat * 180) / Math.PI;
  lng = (lng * 180) / Math.PI;

  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = -20.4894e-6;
  const rx = (0.1502 / 3600) * (Math.PI / 180);
  const ry = (0.247 / 3600) * (Math.PI / 180);
  const rz = (0.8421 / 3600) * (Math.PI / 180);

  const sinLat = Math.sin((lat * Math.PI) / 180);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const sinLng = Math.sin((lng * Math.PI) / 180);
  const cosLng = Math.cos((lng * Math.PI) / 180);

  const aWgs = 6378137.0;
  const bWgs = 6356752.3142;
  const e2Wgs = (aWgs * aWgs - bWgs * bWgs) / (aWgs * aWgs);

  const nuOsgb = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const H = 0;

  const x1 = (nuOsgb + H) * cosLat * cosLng;
  const y1 = (nuOsgb + H) * cosLat * sinLng;
  const z1 = (nuOsgb * (1 - e2) + H) * sinLat;

  const x2 = tx + (1 + s) * (x1 - rz * y1 + ry * z1);
  const y2 = ty + (1 + s) * (rz * x1 + y1 - rx * z1);
  const z2 = tz + (1 + s) * (-ry * x1 + rx * y1 + z1);

  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let latWgs = Math.atan2(z2, p * (1 - e2Wgs));
  for (let i = 0; i < 10; i++) {
    const nuW = aWgs / Math.sqrt(1 - e2Wgs * Math.sin(latWgs) * Math.sin(latWgs));
    latWgs = Math.atan2(z2 + e2Wgs * nuW * Math.sin(latWgs), p);
  }
  const lngWgs = Math.atan2(y2, x2);

  return {
    lat: (latWgs * 180) / Math.PI,
    lng: (lngWgs * 180) / Math.PI,
  };
}

async function fetchAuthenticatedCSV(resourceId: string, cacheFile: string, bypassCache = false): Promise<string> {
  const apiKey = getNGEDApiKey();

  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, cacheFile);

  if (!bypassCache) {
    try {
      const stat = await fs.stat(cachePath);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        return await fs.readFile(cachePath, "utf-8");
      }
    } catch {}
  } else {
    console.log(`[NGED-DEBUG] Cache bypass active — skipping disk cache for ${cacheFile}`);
  }

  const downloadUrl = await resolveResourceUrl(resourceId, apiKey);
  console.log(`[NGED] Resolved download URL for ${cacheFile}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(downloadUrl, {
      signal: controller.signal,
      headers: { Authorization: apiKey },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`NGED download ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const text = await res.text();
    await fs.writeFile(cachePath, text);
    console.log(`[NGED] Fetched and cached: ${cacheFile} (${text.length} bytes)`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicCSV(url: string, cacheFile: string): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, cacheFile);

  try {
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      return await fs.readFile(cachePath, "utf-8");
    }
  } catch {}

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`NGED public fetch ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const text = await res.text();
    await fs.writeFile(cachePath, text);
    console.log(`[NGED] Fetched and cached (public): ${cacheFile} (${text.length} bytes)`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCSVLines(csv: string): string[][] {
  const lines = csv.trim().split("\n");
  if (lines.length === 0) return [];
  return lines.map((line) => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function toNum(v: string | undefined): number | null {
  if (v == null || v === "" || v === "-" || v === "N/A" || v === "n/a") return null;
  const cleaned = v.replace(/,/g, "").replace(/\s+/g, "").replace(/[mMwW]+$/, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const lower = c.toLowerCase();
    const idx = headers.findIndex((h) => h.toLowerCase().includes(lower));
    if (idx >= 0) return idx;
  }
  return -1;
}

export type CoordinateSource = "latlng" | "bng" | "inferred";

export interface NGEDSubstation {
  id: string;
  name: string;
  substationType: string;
  licenceArea: string;
  demandHeadroomMW: number | null;
  generationHeadroomMW: number | null;
  demandMW: number | null;
  firmCapacityMW: number | null;
  lat: number;
  lng: number;
  coordinateSource: CoordinateSource;
}

export interface NGEDOpportunitySite {
  id: string;
  name: string;
  connectionType: string;
  licenceArea: string;
  headroomMW: number | null;
  voltage: string;
  lat: number;
  lng: number;
  coordinateSource: CoordinateSource;
}

export interface NGEDGenerator {
  id: string;
  generatorName: string;
  siteName: string;
  gsp: string;
  voltage: string;
  licenceArea: string;
  technology: string;
  installedCapacityMW: number;
  connectionStatus: string;
  exportCapacityMW: number | null;
}

export interface NGEDNetworkCapacityResult {
  substations: NGEDSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    byLicenceArea: Record<string, number>;
    byType: Record<string, number>;
    avgDemandHeadroom: number | null;
    avgGenHeadroom: number | null;
  };
}

export interface NGEDOpportunityMapResult {
  sites: NGEDOpportunitySite[];
  totalCount: number;
  fetchedAt: string;
}

export interface NGEDGenerationRegisterResult {
  generators: NGEDGenerator[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    totalCapacityMW: number;
    byStatus: Record<string, { count: number; capacityMW: number }>;
    byTechnology: Record<string, { count: number; capacityMW: number }>;
    byLicenceArea: Record<string, { count: number; capacityMW: number }>;
  };
}

let cacheNetCap: NGEDNetworkCapacityResult | null = null;
let cacheNetCapTime = 0;
let cacheOppMap: NGEDOpportunityMapResult | null = null;
let cacheOppMapTime = 0;
let cacheGenReg: NGEDGenerationRegisterResult | null = null;
let cacheGenRegTime = 0;

const MEM_TTL = 4 * 60 * 60 * 1000;

const NGED_LICENCE_AREAS: Record<string, { lat: number; lng: number }> = {
  "East Midlands": { lat: 52.95, lng: -1.15 },
  "West Midlands": { lat: 52.48, lng: -1.89 },
  "South West": { lat: 51.45, lng: -2.59 },
  "South Wales": { lat: 51.48, lng: -3.18 },
};

function inferCoordinates(
  licenceArea: string,
  name: string,
  index: number
): { lat: number; lng: number } | null {
  for (const [area, center] of Object.entries(NGED_LICENCE_AREAS)) {
    if (
      licenceArea.toLowerCase().includes(area.toLowerCase()) ||
      name.toLowerCase().includes(area.toLowerCase())
    ) {
      const jitter = (index * 0.0137) % 0.8;
      const jitter2 = (index * 0.0093) % 0.6;
      return {
        lat: center.lat + (jitter - 0.4),
        lng: center.lng + (jitter2 - 0.3),
      };
    }
  }

  if (licenceArea) {
    const normalised = licenceArea.trim();
    if (normalised.toLowerCase().includes("midland")) {
      const center = NGED_LICENCE_AREAS["East Midlands"];
      return {
        lat: center.lat + ((index * 0.0137) % 0.8 - 0.4),
        lng: center.lng + ((index * 0.0093) % 0.6 - 0.3),
      };
    }
    if (
      normalised.toLowerCase().includes("south") &&
      normalised.toLowerCase().includes("west")
    ) {
      const center = NGED_LICENCE_AREAS["South West"];
      return {
        lat: center.lat + ((index * 0.0137) % 0.8 - 0.4),
        lng: center.lng + ((index * 0.0093) % 0.6 - 0.3),
      };
    }
    if (normalised.toLowerCase().includes("wales")) {
      const center = NGED_LICENCE_AREAS["South Wales"];
      return {
        lat: center.lat + ((index * 0.0137) % 0.8 - 0.4),
        lng: center.lng + ((index * 0.0093) % 0.6 - 0.3),
      };
    }
  }
  return null;
}

export async function getNetworkCapacity(): Promise<NGEDNetworkCapacityResult> {
  if (cacheNetCap && Date.now() - cacheNetCapTime < MEM_TTL) return cacheNetCap;

  const csv = await fetchAuthenticatedCSV(RESOURCE_IDS.networkCapacity, "network-capacity-map.csv");
  const rows = parseCSVLines(csv);
  if (rows.length < 2) {
    return { substations: [], totalCount: 0, fetchedAt: new Date().toISOString(), summary: { byLicenceArea: {}, byType: {}, avgDemandHeadroom: null, avgGenHeadroom: null } };
  }

  const headers = rows[0].map((h) => h.toLowerCase());
  const iName = findCol(headers, "name", "substation name", "substation");
  const iType = findCol(headers, "type", "substation type");
  const iArea = findCol(headers, "area", "licence area", "license area", "licence");
  const iDemandHead = findCol(headers, "demandconnectedheadroomMW".toLowerCase(), "demand headroom", "demand_headroom");
  const iGenHead = findCol(headers, "generationconnectedheadroomMW".toLowerCase(), "generation headroom", "gen headroom");
  const iDemand = findCol(headers, "demandmaximum", "peak demand", "demand mw", "max demand");
  const iFirmCap = findCol(headers, "demandtotalcapacity", "firm capacity", "capacity mw");
  const iLat = findCol(headers, "latitude", "lat");
  const iLng = findCol(headers, "longitude", "lng", "lon", "long");
  const iEasting = findCol(headers, "easting", "x");
  const iNorthing = findCol(headers, "northing", "y");

  const substations: NGEDSubstation[] = [];
  const byArea: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalDemandHead = 0;
  let countDemandHead = 0;
  let totalGenHead = 0;
  let countGenHead = 0;
  let coordsFromLatLng = 0;
  let coordsFromBNG = 0;
  let coordsInferred = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (iName >= 0 ? r[iName] : "") || `Substation ${i}`;
    const type = (iType >= 0 ? r[iType] : "") || "Primary";
    const area = (iArea >= 0 ? r[iArea] : "") || "Unknown";

    // Skip Secondary substations — there are ~120k of them; only map Primary and BSP
    if (type.toLowerCase() === "secondary") continue;
    const demandHead = iDemandHead >= 0 ? toNum(r[iDemandHead]) : null;
    const genHead = iGenHead >= 0 ? toNum(r[iGenHead]) : null;
    const demand = iDemand >= 0 ? toNum(r[iDemand]) : null;
    const firmCap = iFirmCap >= 0 ? toNum(r[iFirmCap]) : null;

    let lat: number | null = iLat >= 0 ? toNum(r[iLat]) : null;
    let lng: number | null = iLng >= 0 ? toNum(r[iLng]) : null;
    let coordSource: "latlng" | "bng" | "inferred" = "latlng";

    if (lat == null || lng == null || lat === 0 || lng === 0 || lat < 49 || lat > 57 || lng < -8 || lng > 3) {
      lat = null;
      lng = null;
    }

    if (lat == null || lng == null) {
      const easting = iEasting >= 0 ? toNum(r[iEasting]) : null;
      const northing = iNorthing >= 0 ? toNum(r[iNorthing]) : null;
      if (easting != null && northing != null && easting > 0 && northing > 0) {
        const converted = osgb36ToWgs84(easting, northing);
        if (converted && converted.lat >= 49 && converted.lat <= 57 && converted.lng >= -8 && converted.lng <= 3) {
          lat = converted.lat;
          lng = converted.lng;
          coordSource = "bng";
        }
      }
    }

    if (lat == null || lng == null) {
      const inferred = inferCoordinates(area, name, i);
      if (!inferred) continue;
      lat = inferred.lat;
      lng = inferred.lng;
      coordSource = "inferred";
    }

    if (coordSource === "latlng") coordsFromLatLng++;
    else if (coordSource === "bng") coordsFromBNG++;
    else coordsInferred++;

    substations.push({
      id: `nged-nc-${i}`,
      name,
      substationType: type,
      licenceArea: area,
      demandHeadroomMW: demandHead,
      generationHeadroomMW: genHead,
      demandMW: demand,
      firmCapacityMW: firmCap,
      lat,
      lng,
      coordinateSource: coordSource,
    });

    byArea[area] = (byArea[area] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    if (demandHead != null) { totalDemandHead += demandHead; countDemandHead++; }
    if (genHead != null) { totalGenHead += genHead; countGenHead++; }
  }

  const result: NGEDNetworkCapacityResult = {
    substations,
    totalCount: substations.length,
    fetchedAt: new Date().toISOString(),
    summary: {
      byLicenceArea: byArea,
      byType: byType,
      avgDemandHeadroom: countDemandHead > 0 ? Math.round((totalDemandHead / countDemandHead) * 10) / 10 : null,
      avgGenHeadroom: countGenHead > 0 ? Math.round((totalGenHead / countGenHead) * 10) / 10 : null,
    },
  };

  cacheNetCap = result;
  cacheNetCapTime = Date.now();
  const total = coordsFromLatLng + coordsFromBNG + coordsInferred;
  const pctReal = total > 0 ? Math.round(((coordsFromLatLng + coordsFromBNG) / total) * 100) : 0;
  console.log(`[NGED] Network capacity: ${substations.length} substations parsed (coords: ${coordsFromLatLng} lat/lng, ${coordsFromBNG} BNG converted, ${coordsInferred} inferred — ${pctReal}% real)`);
  return result;
}

export async function getOpportunityMap(): Promise<NGEDOpportunityMapResult> {
  if (cacheOppMap && Date.now() - cacheOppMapTime < MEM_TTL) return cacheOppMap;

  const csv = await fetchAuthenticatedCSV(RESOURCE_IDS.opportunityMap, "network-headroom.csv");
  const rows = parseCSVLines(csv);
  if (rows.length < 2) {
    return { sites: [], totalCount: 0, fetchedAt: new Date().toISOString() };
  }

  const headers = rows[0].map((h) => h.toLowerCase());
  const iName = findCol(headers, "name", "substation name", "substation");
  const iType = findCol(headers, "type", "substation type");
  const iArea = findCol(headers, "area", "licence area", "license area", "licence");
  const iHeadroom = findCol(headers, "demandconnectedheadroomMW".toLowerCase(), "demand headroom", "headroom");
  const iVoltage = findCol(headers, "voltages", "voltage", "volt");
  const iLat = findCol(headers, "latitude", "lat");
  const iLng = findCol(headers, "longitude", "lng", "lon", "long");
  const iEasting = findCol(headers, "easting", "x");
  const iNorthing = findCol(headers, "northing", "y");

  const sites: NGEDOpportunitySite[] = [];
  let coordsFromLatLng = 0;
  let coordsFromBNG = 0;
  let coordsInferred = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (iName >= 0 ? r[iName] : "") || `Site ${i}`;
    const connType = (iType >= 0 ? r[iType] : "") || "Primary";
    const area = (iArea >= 0 ? r[iArea] : "") || "Unknown";

    // Skip Secondary substations — only show Primary and BSP on the map
    if (connType.toLowerCase() === "secondary") continue;

    const headroom = iHeadroom >= 0 ? toNum(r[iHeadroom]) : null;
    const voltage = (iVoltage >= 0 ? r[iVoltage] : "") || "–";

    let lat: number | null = iLat >= 0 ? toNum(r[iLat]) : null;
    let lng: number | null = iLng >= 0 ? toNum(r[iLng]) : null;
    let coordSource: "latlng" | "bng" | "inferred" = "latlng";

    if (lat == null || lng == null || lat === 0 || lng === 0 || lat < 49 || lat > 57 || lng < -8 || lng > 3) {
      lat = null;
      lng = null;
    }

    if (lat == null || lng == null) {
      const easting = iEasting >= 0 ? toNum(r[iEasting]) : null;
      const northing = iNorthing >= 0 ? toNum(r[iNorthing]) : null;
      if (easting != null && northing != null && easting > 0 && northing > 0) {
        const converted = osgb36ToWgs84(easting, northing);
        if (converted && converted.lat >= 49 && converted.lat <= 57 && converted.lng >= -8 && converted.lng <= 3) {
          lat = converted.lat;
          lng = converted.lng;
          coordSource = "bng";
        }
      }
    }

    if (lat == null || lng == null) {
      const inferred = inferCoordinates(area, name, i);
      if (!inferred) continue;
      lat = inferred.lat;
      lng = inferred.lng;
      coordSource = "inferred";
    }

    if (coordSource === "latlng") coordsFromLatLng++;
    else if (coordSource === "bng") coordsFromBNG++;
    else coordsInferred++;

    sites.push({
      id: `nged-op-${i}`,
      name,
      connectionType: connType,
      licenceArea: area,
      headroomMW: headroom,
      voltage,
      lat,
      lng,
      coordinateSource: coordSource,
    });
  }

  const result: NGEDOpportunityMapResult = {
    sites,
    totalCount: sites.length,
    fetchedAt: new Date().toISOString(),
  };

  cacheOppMap = result;
  cacheOppMapTime = Date.now();
  const total = coordsFromLatLng + coordsFromBNG + coordsInferred;
  const pctReal = total > 0 ? Math.round(((coordsFromLatLng + coordsFromBNG) / total) * 100) : 0;
  console.log(`[NGED] Opportunity map: ${sites.length} sites parsed (coords: ${coordsFromLatLng} lat/lng, ${coordsFromBNG} BNG converted, ${coordsInferred} inferred — ${pctReal}% real)`);
  return result;
}

function simplifyTech(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("solar") || t.includes("photovoltaic") || t.includes("pv")) return "Solar PV";
  if (t.includes("wind")) return "Wind";
  if (t.includes("battery") || t.includes("storage") || t.includes("bess")) return "BESS";
  if (t.includes("gas") || t.includes("ccgt") || t.includes("ocgt")) return "Gas";
  if (t.includes("hydro")) return "Hydro";
  if (t.includes("biomass") || t.includes("bio")) return "Biomass";
  if (t.includes("chp") || t.includes("cogen")) return "CHP";
  if (t.includes("waste") || t.includes("efw")) return "Waste";
  if (t.includes("diesel") || t.includes("oil")) return "Diesel/Oil";
  if (t.includes("nuclear")) return "Nuclear";
  return raw || "Other";
}

function normaliseStatus(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s.includes("connect") && !s.includes("accept") && !s.includes("offer") && !s.includes("enquir")) return "Connected";
  if (s.includes("accept")) return "Accepted";
  if (s.includes("offer")) return "Offered";
  if (s.includes("enquir") || s.includes("inquiry")) return "Enquired";
  if (s.includes("built") || s.includes("commission")) return "Connected";
  if (s === "") return "Unknown";
  return raw;
}

export async function getGenerationRegister(bypassCache = false): Promise<NGEDGenerationRegisterResult> {
  if (!bypassCache && cacheGenReg && Date.now() - cacheGenRegTime < MEM_TTL) return cacheGenReg;

  // --- TEMPORARY DIAGNOSTIC LOGGING ---
  const apiKeyPresent = !!(process.env.NGED_API_KEY || process.env.NATIONAL_GRID_API_KEY);
  console.log(`[NGED-DEBUG] getGenerationRegister called (bypassCache=${bypassCache})`);
  console.log(`[NGED-DEBUG] NGED_API_KEY present: ${apiKeyPresent}`);
  console.log(`[NGED-DEBUG] resource_show URL: ${CKAN_RESOURCE_SHOW}?id=${RESOURCE_IDS.generationRegister}`);
  // --- END TEMPORARY LOGGING ---

  const csv = await fetchAuthenticatedCSV(RESOURCE_IDS.generationRegister, "gcr.csv", bypassCache);
  const rows = parseCSVLines(csv);
  if (rows.length < 2) {
    return {
      generators: [], totalCount: 0, fetchedAt: new Date().toISOString(),
      summary: { totalCapacityMW: 0, byStatus: {}, byTechnology: {}, byLicenceArea: {} },
    };
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());

  // The GCR CSV uses underscored headers and values in kVA
  // e.g. "Latest_Connected_Export_Capacity_kVA", "Generator_Technology", "Licence_Area"
  const isKva = headers.some((h) => h.includes("kva"));
  const kvaToMw = isKva ? 1000 : 1; // divisor: kVA ÷ 1000 = MW

  const iGsp      = findCol(headers, "gsp");
  const iGenName  = findCol(headers, "bsp", "generator name", "gen name", "scheme name", "development name");
  const iSiteName = findCol(headers, "primary", "substation", "connection point", "site name");
  const iArea     = findCol(headers, "licence_area", "licence area", "license area", "area");
  const iTech     = findCol(headers, "generator_technology", "technology", "fuel", "energy source");
  const iVoltage  = findCol(headers, "voltage", "kv");

  // Four separate capacity-by-status columns (all in kVA when isKva)
  const iCapConn  = findCol(headers, "latest_connected_export_capacity", "connected_export_capacity", "installed capacity", "capacity mw");
  const iCapAcc   = findCol(headers, "latest_accepted_not_yet", "accepted_not_yet_connected");
  const iCapOff   = findCol(headers, "latest_offered_not_yet", "offered_not_yet_accepted");
  const iCapEnq   = findCol(headers, "latest_enquired_not_yet", "enquired_not_yet_offered");

  const generators: NGEDGenerator[] = [];
  let totalCap = 0;
  const byStatus: Record<string, { count: number; capacityMW: number }> = {};
  const byTech: Record<string, { count: number; capacityMW: number }> = {};
  const byArea: Record<string, { count: number; capacityMW: number }> = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 3) continue;

    const gsp       = (iGsp >= 0 ? r[iGsp] : "") || "";
    const genName   = (iGenName >= 0 ? r[iGenName] : "") || `Record ${i}`;
    const siteName  = (iSiteName >= 0 ? r[iSiteName] : "") || "";
    const area      = (iArea >= 0 ? r[iArea] : "") || "Unknown";
    const rawTech   = (iTech >= 0 ? r[iTech] : "") || "Other";
    const tech      = simplifyTech(rawTech);
    const voltage   = (iVoltage >= 0 ? r[iVoltage] : "") || "";

    // Read each status capacity in native unit, convert to MW
    const connKva = iCapConn >= 0 ? (toNum(r[iCapConn]) ?? 0) : 0;
    const accKva  = iCapAcc  >= 0 ? (toNum(r[iCapAcc])  ?? 0) : 0;
    const offKva  = iCapOff  >= 0 ? (toNum(r[iCapOff])  ?? 0) : 0;
    const enqKva  = iCapEnq  >= 0 ? (toNum(r[iCapEnq])  ?? 0) : 0;

    const connMW = connKva / kvaToMw;
    const accMW  = accKva  / kvaToMw;
    const offMW  = offKva  / kvaToMw;
    const enqMW  = enqKva  / kvaToMw;
    const capMW  = connMW + accMW + offMW + enqMW;

    // Determine primary status by hierarchy
    let status = "Unknown";
    if (connKva > 0)      status = "Connected";
    else if (accKva > 0)  status = "Accepted";
    else if (offKva > 0)  status = "Offered";
    else if (enqKva > 0)  status = "Enquired";

    generators.push({
      id: `nged-gen-${i}`,
      generatorName: genName,
      siteName,
      gsp,
      voltage,
      licenceArea: area,
      technology: tech,
      installedCapacityMW: capMW,
      connectionStatus: status,
      exportCapacityMW: null,
    });

    totalCap += capMW;

    // Count row once under dominant status; MW split across each status bucket
    if (!byStatus[status]) byStatus[status] = { count: 0, capacityMW: 0 };
    byStatus[status].count++;

    // Accumulate MW into each status bucket separately
    const accumulateStatus = (s: string, mw: number) => {
      if (mw <= 0) return;
      if (!byStatus[s]) byStatus[s] = { count: 0, capacityMW: 0 };
      byStatus[s].capacityMW += mw;
    };
    accumulateStatus("Connected", connMW);
    accumulateStatus("Accepted",  accMW);
    accumulateStatus("Offered",   offMW);
    accumulateStatus("Enquired",  enqMW);

    if (!byTech[tech]) byTech[tech] = { count: 0, capacityMW: 0 };
    byTech[tech].count++;
    byTech[tech].capacityMW += capMW;

    if (!byArea[area]) byArea[area] = { count: 0, capacityMW: 0 };
    byArea[area].count++;
    byArea[area].capacityMW += capMW;
  }

  const result: NGEDGenerationRegisterResult = {
    generators,
    totalCount: generators.length,
    fetchedAt: new Date().toISOString(),
    summary: {
      totalCapacityMW: Math.round(totalCap),
      byStatus,
      byTechnology: byTech,
      byLicenceArea: byArea,
    },
  };

  cacheGenReg = result;
  cacheGenRegTime = Date.now();
  console.log(`[NGED] Generation register: ${generators.length} generators, ${Math.round(totalCap)} MW total`);
  return result;
}

export interface NGEDGCRSummaryByTechnology {
  rows: Array<{
    licenceArea: string;
    technology: string;
    count: number;
    totalCapacityMW: number;
  }>;
  fetchedAt: string;
}

let cacheGCRSummary: NGEDGCRSummaryByTechnology | null = null;
let cacheGCRSummaryTime = 0;

export async function getGCRSummaryByTechnology(): Promise<NGEDGCRSummaryByTechnology> {
  if (cacheGCRSummary && Date.now() - cacheGCRSummaryTime < MEM_TTL) return cacheGCRSummary;

  const csv = await fetchAuthenticatedCSV(RESOURCE_IDS.gcrSummaryByTechnology, "gcr_summarybytechnology.csv");
  const rows = parseCSVLines(csv);
  if (rows.length < 2) {
    return { rows: [], fetchedAt: new Date().toISOString() };
  }

  const headers = rows[0].map((h) => h.toLowerCase());
  const iArea = findCol(headers, "licence area", "license area", "area", "licence");
  const iTech = findCol(headers, "technology", "fuel type", "generation type");
  const iCount = findCol(headers, "count", "number", "total count");
  const iCap = findCol(headers, "capacity", "total capacity", "installed capacity", "mw");

  const summaryRows: NGEDGCRSummaryByTechnology["rows"] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const area = (iArea >= 0 ? r[iArea] : "") || "Unknown";
    const tech = iTech >= 0 ? simplifyTech(r[iTech] || "Other") : "Other";
    const count = iCount >= 0 ? toNum(r[iCount]) ?? 0 : 0;
    const cap = iCap >= 0 ? toNum(r[iCap]) ?? 0 : 0;

    summaryRows.push({
      licenceArea: area,
      technology: tech,
      count,
      totalCapacityMW: cap,
    });
  }

  const result: NGEDGCRSummaryByTechnology = {
    rows: summaryRows,
    fetchedAt: new Date().toISOString(),
  };

  cacheGCRSummary = result;
  cacheGCRSummaryTime = Date.now();
  console.log(`[NGED] GCR Summary by Technology: ${summaryRows.length} rows parsed`);
  return result;
}

export interface NGEDEmbeddedCapacityRegisterResult {
  rows: Array<Record<string, string>>;
  headers: string[];
  totalCount: number;
  fetchedAt: string;
}

let cacheECR: NGEDEmbeddedCapacityRegisterResult | null = null;
let cacheECRTime = 0;

export async function getEmbeddedCapacityRegister(): Promise<NGEDEmbeddedCapacityRegisterResult> {
  if (cacheECR && Date.now() - cacheECRTime < MEM_TTL) return cacheECR;

  const csv = await fetchPublicCSV(ECR_DIRECT_URL, "nged_ecr.csv");
  const parsed = parseCSVLines(csv);
  if (parsed.length < 2) {
    return { rows: [], headers: [], totalCount: 0, fetchedAt: new Date().toISOString() };
  }

  const headers = parsed[0];
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < parsed.length; i++) {
    const r = parsed[i];
    if (r.length < 2) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = r[j] || "";
    }
    rows.push(row);
  }

  const result: NGEDEmbeddedCapacityRegisterResult = {
    rows,
    headers,
    totalCount: rows.length,
    fetchedAt: new Date().toISOString(),
  };

  cacheECR = result;
  cacheECRTime = Date.now();
  console.log(`[NGED] Embedded Capacity Register: ${rows.length} rows parsed`);
  return result;
}

export { NGEDApiKeyMissingError };
