import * as fs from "fs/promises";
import * as path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "ukpn");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const ODS_BASE = "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets";
const DATASET = "ukpn-data-centre-demand-profiles";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export interface UKPNDataCentre {
  name: string;
  dcType: string;
  voltageLevel: string;
  avgUtilisation: number;
  maxUtilisation: number;
  readings: number;
}

export interface UKPNDataCentreResult {
  dataCentres: UKPNDataCentre[];
  totalCount: number;
  summary: {
    coLocated: number;
    enterprise: number;
    byVoltage: Record<string, number>;
    avgUtilisation: number;
  };
  licenceArea: string;
  source: string;
  fetchedAt: string;
}

async function ensureCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export function isUkpnConfigured(): boolean {
  return !!process.env.UKPN_API_KEY;
}

function normaliseDcType(raw: string): string {
  const lower = (raw || "").trim().toLowerCase();
  if (lower.includes("co-located") || lower.includes("colocated") || lower.includes("colocation")) return "Co-located";
  if (lower.includes("enterprise")) return "Enterprise";
  return raw || "Unknown";
}

async function fetchPage(apiKey: string, offset: number): Promise<{ records: any[]; totalCount: number }> {
  const url = `${ODS_BASE}/${DATASET}/records?` + new URLSearchParams({
    select: "anonymised_data_centre_name,dc_type,cleansed_voltage_level,avg(hh_utilisation_ratio) as avg_util,max(hh_utilisation_ratio) as max_util,count(*) as readings",
    group_by: "anonymised_data_centre_name,dc_type,cleansed_voltage_level",
    limit: String(PAGE_SIZE),
    offset: String(offset),
    apikey: apiKey,
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`UKPN API returned ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  return { records: json.results || [], totalCount: json.total_count || 0 };
}

export async function getUKPNDataCentres(): Promise<UKPNDataCentreResult | null> {
  const apiKey = process.env.UKPN_API_KEY;
  if (!apiKey) return null;

  await ensureCache();
  const cacheFile = path.join(CACHE_DIR, "dc-profiles.json");

  try {
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      const raw = await fs.readFile(cacheFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}

  try {
    const allRecords: any[] = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { records, totalCount } = await fetchPage(apiKey, offset);
      allRecords.push(...records);
      if (allRecords.length >= totalCount || records.length < PAGE_SIZE) break;
      offset += records.length;
    }

    if (!allRecords.length) return null;

    const dataCentres: UKPNDataCentre[] = allRecords
      .map((r: any) => ({
        name: r.anonymised_data_centre_name || "Unknown",
        dcType: normaliseDcType(r.dc_type),
        voltageLevel: r.cleansed_voltage_level || "Unknown",
        avgUtilisation: r.avg_util ?? 0,
        maxUtilisation: r.max_util ?? 0,
        readings: r.readings ?? 0,
      }))
      .sort((a: UKPNDataCentre, b: UKPNDataCentre) => {
        const numA = parseInt(a.name.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.name.replace(/\D/g, "")) || 0;
        return numA - numB;
      });

    const coLocated = dataCentres.filter(dc => dc.dcType === "Co-located").length;
    const enterprise = dataCentres.filter(dc => dc.dcType === "Enterprise").length;

    const byVoltage: Record<string, number> = {};
    for (const dc of dataCentres) {
      byVoltage[dc.voltageLevel] = (byVoltage[dc.voltageLevel] || 0) + 1;
    }

    const activeDCs = dataCentres.filter(dc => dc.avgUtilisation > 0);
    const avgUtilisation = activeDCs.length
      ? activeDCs.reduce((s, dc) => s + dc.avgUtilisation, 0) / activeDCs.length
      : 0;

    const result: UKPNDataCentreResult = {
      dataCentres,
      totalCount: dataCentres.length,
      summary: { coLocated, enterprise, byVoltage, avgUtilisation },
      licenceArea: "London, South East & East England",
      source: "UK Power Networks Open Data — Data Centre Demand Profiles",
      fetchedAt: new Date().toISOString(),
    };

    await fs.writeFile(cacheFile, JSON.stringify(result));
    return result;
  } catch (err: any) {
    console.error("UKPN data centre fetch error:", err.message);
    try {
      const raw = await fs.readFile(path.join(CACHE_DIR, "dc-profiles.json"), "utf-8");
      return JSON.parse(raw);
    } catch {}
    return null;
  }
}
