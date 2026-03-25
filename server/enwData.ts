import * as https from "https";

export interface ENWSubstation {
  number: string;
  substationType: "BSP" | "PRY";
  voltageKV: number | null;
  circuitMVA: number | null;
  demHrFirmMW: number | null;
  demHrNonFirmMW: number | null;
  genHrInverterMW: number | null;
  genHrSynchronousMW: number | null;
  battStorageHrMW: number | null;
  demandBand: "Green" | "Amber" | "Red";
  bspNumber: string | null;
  gspNumber: string | null;
  lat: number;
  lng: number;
}

export interface ENWHeadroomResult {
  substations: ENWSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    green: number;
    amber: number;
    red: number;
    bspCount: number;
    pryCount: number;
  };
}

const BASE_URL = "https://electricitynorthwest.opendatasoft.com/api/explore/v2.1/catalog/datasets";
const BSP_DATASET = "enwl-bsp-heatmap";
const PRY_DATASET = "enwl-pry-heatmap";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let cache: { data: ENWHeadroomResult; ts: number } | null = null;

function fetchJSON(url: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const opts = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        "Authorization": `Apikey ${apiKey}`,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EnergyDashboard/1.0)",
      },
    };

    https.get(opts, (res) => {
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        fetchJSON(res.headers.location, apiKey).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => reject(new Error(`HTTP ${res.statusCode} from ENW API: ${body.substring(0, 200)}`)));
        return;
      }
      let data = "";
      res.on("data", (c: Buffer) => (data += c.toString()));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error("Failed to parse ENW API response")); }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function demandBand(mw: number | null): "Green" | "Amber" | "Red" {
  if (mw == null) return "Amber";
  if (mw >= 20) return "Green";
  if (mw >= 5) return "Amber";
  return "Red";
}

async function fetchDataset(apiKey: string, dataset: string, substationType: "BSP" | "PRY"): Promise<ENWSubstation[]> {
  const limit = 100;
  let offset = 0;
  const results: ENWSubstation[] = [];

  while (true) {
    const url = `${BASE_URL}/${dataset}/records?limit=${limit}&offset=${offset}&select=*`;
    const resp = await fetchJSON(url, apiKey);
    if (!resp.results || resp.results.length === 0) break;

    for (const r of resp.results) {
      const gp = r.geo_point_2d ?? r.geopoint ?? null;
      if (!gp || gp.lat == null || gp.lon == null) continue;
      const lat = Number(gp.lat);
      const lng = Number(gp.lon);
      if (isNaN(lat) || isNaN(lng)) continue;

      const number = substationType === "BSP"
        ? String(r.bsp_number ?? "")
        : String(r.pry_number ?? "");

      const rawVolt = r.voltage_kv ?? r.voltage_mw ?? null;
      const voltageKV = rawVolt != null ? parseFloat(String(rawVolt)) : null;
      const circuitMVA = r.circuit_mva != null ? parseFloat(String(r.circuit_mva)) : null;
      const demFirm = r.dem_hr_firm_mw != null ? parseFloat(String(r.dem_hr_firm_mw)) : null;
      const demNonFirm = r.dem_hr_non_firm_mw != null ? parseFloat(String(r.dem_hr_non_firm_mw)) : null;
      const genInverter = r.gen_hr_inverter_mw != null ? parseFloat(String(r.gen_hr_inverter_mw)) : null;

      let genSync: number | null = null;
      if (substationType === "BSP") {
        genSync = r.gen_hr_synchronous_mw != null ? parseFloat(String(r.gen_hr_synchronous_mw)) : null;
      } else {
        const lv = r.gen_hr_lv_synchronous_mw != null ? parseFloat(String(r.gen_hr_lv_synchronous_mw)) : 0;
        const hv = r.gen_hr_hv_synchronous_mw != null ? parseFloat(String(r.gen_hr_hv_synchronous_mw)) : 0;
        genSync = lv + hv;
      }

      const batt = r.batt_storage_hr_mw != null ? parseFloat(String(r.batt_storage_hr_mw)) : null;

      const firmMW = demFirm != null && !isNaN(demFirm) ? demFirm : null;

      results.push({
        number,
        substationType,
        voltageKV: voltageKV != null && !isNaN(voltageKV) ? voltageKV : null,
        circuitMVA: circuitMVA != null && !isNaN(circuitMVA) ? circuitMVA : null,
        demHrFirmMW: firmMW,
        demHrNonFirmMW: demNonFirm != null && !isNaN(demNonFirm) ? demNonFirm : null,
        genHrInverterMW: genInverter != null && !isNaN(genInverter) ? genInverter : null,
        genHrSynchronousMW: genSync != null && !isNaN(genSync) ? genSync : null,
        battStorageHrMW: batt != null && !isNaN(batt) ? batt : null,
        demandBand: demandBand(firmMW),
        bspNumber: r.bsp_number != null ? String(r.bsp_number) : null,
        gspNumber: r.gsp_number != null ? String(r.gsp_number) : null,
        lat,
        lng,
      });
    }

    offset += limit;
    if (resp.results.length < limit) break;
  }

  return results;
}

export async function getENWHeadroom(): Promise<ENWHeadroomResult> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  const apiKey = process.env.ENW_API_KEY;
  if (!apiKey) throw new Error("ENW_API_KEY not configured");

  const [bspSites, prySites] = await Promise.all([
    fetchDataset(apiKey, BSP_DATASET, "BSP"),
    fetchDataset(apiKey, PRY_DATASET, "PRY"),
  ]);

  const substations = [...bspSites, ...prySites];
  const summary = { green: 0, amber: 0, red: 0, bspCount: bspSites.length, pryCount: prySites.length };
  for (const s of substations) {
    summary[s.demandBand.toLowerCase() as "green" | "amber" | "red"]++;
  }

  const result: ENWHeadroomResult = { substations, totalCount: substations.length, fetchedAt: new Date().toISOString(), summary };
  cache = { data: result, ts: Date.now() };
  return result;
}
