import https from "https";
import fs from "fs";
import path from "path";

export interface SSENSubstation {
  assetId: string;
  substation: string;
  substationType: "GSP" | "BSP" | "Primary";
  voltage: string;
  area: string;
  upstreamGSP: string;
  upstreamBSP: string;
  lat: number;
  lng: number;
  maxDemand: number | null;
  minDemand: number | null;
  contractedDemand: number | null;
  demandHeadroom: number | null;
  demandRAG: "Green" | "Amber" | "Red";
  demandConstraint: string;
  connectedGeneration: number | null;
  contractedGeneration: number | null;
  genHeadroom: number | null;
  genRAG: "Green" | "Amber" | "Red";
  genConstraint: string;
  transformerRatings: string;
  faultRating: number | null;
  faultLevel: number | null;
  upstreamWorks: string;
  upstreamWorksDate: string;
  substationWorks: string;
  substationWorksDate: string;
  comment: string;
}

export interface SSENHeadroomResult {
  substations: SSENSubstation[];
  totalCount: number;
  fetchedAt: string;
  dataDate: string;
  summary: {
    green: number;
    amber: number;
    red: number;
    byType: Record<string, number>;
  };
}

let cache: { data: SSENHeadroomResult; ts: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const HEADROOM_CSV_URL =
  "https://data-api.ssen.co.uk/dataset/93f6890a-4bd4-4b75-9955-6deace56decb/resource/52e9a305-ad90-4c81-9175-20a40ef57894/download/headroom-dashboard-data-march-2026.csv";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseNum(s: string): number | null {
  const v = parseFloat(s.trim());
  return isNaN(v) ? null : v;
}

function parseRAG(s: string): "Green" | "Amber" | "Red" {
  const t = s.trim();
  if (t === "Green") return "Green";
  if (t === "Amber") return "Amber";
  return "Red";
}

function getHostname(u: string): string {
  try { return new URL(u).hostname; } catch { return ""; }
}

function fetchText(url: string, apiKey: string): Promise<string> {
  const originHost = getHostname(url);

  return new Promise((resolve, reject) => {
    function doRequest(u: string, redirects = 0): void {
      const isSameOrigin = getHostname(u) === originHost;
      const headers: Record<string, string> = {
        "User-Agent": BROWSER_UA,
        Accept: "text/csv,text/plain,*/*",
        Referer: "https://data.ssen.co.uk/",
        "Accept-Language": "en-GB,en;q=0.9",
      };
      if (isSameOrigin) {
        headers["Authorization"] = apiKey;
      }

      const mod = u.startsWith("https") ? https : require("http");
      mod.get(u, { headers }, (res: any) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          doRequest(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from SSEN`));
          return;
        }
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      }).on("error", reject);
    }

    doRequest(url);
  });
}

function parseCSV(raw: string): SSENSubstation[] {
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const results: SSENSubstation[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (cols[idx] || "").trim() : "";
    };

    const lat = parseNum(get("Location Latitude"));
    const lng = parseNum(get("Location Longitude"));
    if (lat == null || lng == null) continue;

    const rawType = get("Substation Type").trim();
    const substationType: SSENSubstation["substationType"] =
      rawType === "GSP" ? "GSP" : rawType === "BSP" ? "BSP" : "Primary";

    results.push({
      assetId: get("AssetID"),
      substation: get("Substation"),
      substationType,
      voltage: get("Voltage (kV)"),
      area: get("Map / License Area"),
      upstreamGSP: get("Upstream GSP"),
      upstreamBSP: get("Upstream BSP"),
      lat,
      lng,
      maxDemand: parseNum(get("Maximum Observed Gross Demand (MVA)")),
      minDemand: parseNum(get("Minimum Observed Gross Demand (MVA)")),
      contractedDemand: parseNum(get("Contracted Demand Excl BESS (MVA)")),
      demandHeadroom: parseNum(get("Estimated Demand Headroom (MVA)")),
      demandRAG: parseRAG(get("Substation Demand RAG Status")),
      demandConstraint: get("Demand Constraint"),
      connectedGeneration: parseNum(get("Connected Generation (MW)")),
      contractedGeneration: parseNum(get("Contracted Generation (MW)")),
      genHeadroom: parseNum(get("Estimated Generation Headroom (MW)")),
      genRAG: parseRAG(get("Substation Generation RAG Status")),
      genConstraint: get("Generation Constraint"),
      transformerRatings: get("Transformer Nameplate Ratings"),
      faultRating: parseNum(get("3-Phase Break Fault Rating (kA)")),
      faultLevel: parseNum(get("3-Phase Break Fault Level (kA)")),
      upstreamWorks: get("Upstream Reinforcement Works"),
      upstreamWorksDate: get("Upstream Reinforcement Completion Date"),
      substationWorks: get("Substation Reinforcement Works"),
      substationWorksDate: get("Substation Reinforcement Completion Date"),
      comment: get("Substation Comment"),
    });
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ─── DC Probability Scoring ───────────────────────────────────────────────────

export interface SSENDCSite {
  substation: string;
  substationType: "GSP" | "BSP" | "Primary";
  voltage: string;
  area: string;
  lat: number;
  lng: number;
  score: number;
  grade: "High" | "Medium";
  signals: string[];
  contractedDemand: number | null;
  maxDemand: number | null;
  demandRAG: "Green" | "Amber" | "Red";
  demandHeadroom: number | null;
  upstreamGSP: string;
  upstreamBSP: string;
  upstreamWorks: string;
  substationWorks: string;
  dieselAssetsNearby: number;
  nearestCluster: string | null;
}

export interface SSENDCProbabilityResult {
  sites: SSENDCSite[];
  totalCount: number;
  highCount: number;
  mediumCount: number;
  fetchedAt: string;
}

const DC_CLUSTERS = [
  { name: "Reading / Winnersh", lat: 51.43, lng: -0.93, radiusKm: 10 },
  { name: "Farnborough / Cove", lat: 51.31, lng: -0.83, radiusKm: 8 },
  { name: "Basingstoke", lat: 51.27, lng: -1.09, radiusKm: 8 },
  { name: "Southampton", lat: 50.91, lng: -1.40, radiusKm: 10 },
  { name: "Portsmouth", lat: 50.80, lng: -1.07, radiusKm: 10 },
  { name: "Oxford", lat: 51.75, lng: -1.26, radiusKm: 10 },
  { name: "Swindon", lat: 51.55, lng: -1.79, radiusKm: 8 },
  { name: "Edinburgh Park", lat: 55.93, lng: -3.36, radiusKm: 12 },
  { name: "Glasgow", lat: 55.86, lng: -4.22, radiusKm: 15 },
  { name: "Dundee", lat: 56.47, lng: -2.97, radiusKm: 10 },
  { name: "Perth", lat: 56.40, lng: -3.44, radiusKm: 10 },
  { name: "Aberdeen", lat: 57.15, lng: -2.10, radiusKm: 12 },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestCluster(lat: number, lng: number): string | null {
  for (const c of DC_CLUSTERS) {
    if (haversineKm(lat, lng, c.lat, c.lng) <= c.radiusKm) return c.name;
  }
  return null;
}

interface EcrDieselEntry { lat: number; lng: number; mwExport: number; }

const ECR_1MW_URL =
  "https://data-api.ssen.co.uk/dataset/655eb750-7b3f-4c55-93b6-9bc4c26a57ab/resource/bbae6797-364a-4b2d-a01a-8395e21bee76/download/ssen_ecr_part_1_1mw_march_2026_csv.csv";

let ecrCache: { data: EcrDieselEntry[]; ts: number } | null = null;

async function fetchECRDieselEntries(apiKey: string): Promise<EcrDieselEntry[]> {
  if (ecrCache && Date.now() - ecrCache.ts < CACHE_TTL_MS) return ecrCache.data;

  const raw = await fetchText(ECR_1MW_URL, apiKey);
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/[\r\n]+/g, " ").toLowerCase());

  const colIdx = (keyword: string) =>
    headers.findIndex(h => h.includes(keyword.toLowerCase()));

  const techIdx = [
    colIdx("energy conversion technology 1"),
    colIdx("energy conversion technology 2"),
    colIdx("energy conversion technology 3"),
  ];
  const latIdx = colIdx("latitude");
  const lngIdx = colIdx("longitude");
  const exportIdx = headers.findIndex(
    h => h.includes("maximum export capacity") && h.includes("(mw)") && !h.includes("mva")
  );

  const dieselKw = ["engine", "reciprocating", "diesel", "combustion"];
  const results: EcrDieselEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);

    const tech = techIdx.map(idx => (cols[idx] || "").toLowerCase()).join(" ");
    if (!dieselKw.some(k => tech.includes(k))) continue;

    const lat = parseFloat(cols[latIdx] || "");
    const lng = parseFloat(cols[lngIdx] || "");
    if (isNaN(lat) || isNaN(lng) || lat === 0) continue;

    const mwExport = parseFloat(cols[exportIdx] || "") || 0;
    results.push({ lat, lng, mwExport });
  }

  ecrCache = { data: results, ts: Date.now() };
  return results;
}

let dcProbCache: { data: SSENDCProbabilityResult; ts: number } | null = null;

export async function getSSENDCProbability(): Promise<SSENDCProbabilityResult> {
  if (dcProbCache && Date.now() - dcProbCache.ts < CACHE_TTL_MS) return dcProbCache.data;

  const apiKey = process.env.SSEN_NERDA_API_KEY;
  if (!apiKey) throw new Error("SSEN_NERDA_API_KEY not configured");

  const [headroom, dieselEntries] = await Promise.all([
    getSSENHeadroom(),
    fetchECRDieselEntries(apiKey),
  ]);

  const sites: SSENDCSite[] = [];

  for (const s of headroom.substations) {
    let score = 0;
    const signals: string[] = [];

    // Signal 1: Large contracted demand (≥10 MVA — DC scale)
    if (s.contractedDemand != null && s.contractedDemand >= 10) {
      score += 2;
      signals.push(`Large contracted demand (${s.contractedDemand.toFixed(1)} MVA)`);
    }

    // Signal 2: Contracted significantly above observed max (new/ramping customer)
    if (
      s.contractedDemand != null &&
      s.maxDemand != null &&
      s.maxDemand > 2 &&
      s.contractedDemand / s.maxDemand >= 1.4
    ) {
      score += 2;
      signals.push(
        `Contracted ${Math.round((s.contractedDemand / s.maxDemand) * 100)}% of observed max (capacity reserved ahead of ramp-up)`
      );
    }

    // Signal 3: Red demand RAG with reinforcement works planned
    if (s.demandRAG === "Red" && (s.upstreamWorks || s.substationWorks)) {
      score += 1;
      signals.push("Constrained (Red RAG) with reinforcement works planned");
    }

    // Signal 4: EHV connection level (BSP or GSP — large DCs connect here)
    if (s.substationType !== "Primary") {
      score += 1;
      signals.push(`${s.substationType} level (EHV — large demand connections)`);
    }

    // Signal 5: Diesel/engine ECR assets registered nearby (≤2 km) — backup generation
    const nearbyDiesel = dieselEntries.filter(
      d => haversineKm(s.lat, s.lng, d.lat, d.lng) <= 2
    );
    if (nearbyDiesel.length > 0) {
      const totalMw = nearbyDiesel.reduce((sum, d) => sum + d.mwExport, 0);
      score += 3;
      signals.push(
        `${nearbyDiesel.length} diesel/engine asset(s) registered nearby in ECR (${totalMw.toFixed(1)} MW total — likely backup generation)`
      );
    }

    // Signal 6: Geographic proximity to known DC cluster
    const cluster = findNearestCluster(s.lat, s.lng);
    if (cluster) {
      score += 2;
      signals.push(`Within known DC geography: ${cluster}`);
    }

    if (score < 4) continue;

    const grade: "High" | "Medium" = score >= 6 ? "High" : "Medium";

    sites.push({
      substation: s.substation,
      substationType: s.substationType,
      voltage: s.voltage,
      area: s.area,
      lat: s.lat,
      lng: s.lng,
      score,
      grade,
      signals,
      contractedDemand: s.contractedDemand,
      maxDemand: s.maxDemand,
      demandRAG: s.demandRAG,
      demandHeadroom: s.demandHeadroom,
      upstreamGSP: s.upstreamGSP,
      upstreamBSP: s.upstreamBSP,
      upstreamWorks: s.upstreamWorks,
      substationWorks: s.substationWorks,
      dieselAssetsNearby: nearbyDiesel.length,
      nearestCluster: cluster,
    });
  }

  sites.sort((a, b) => b.score - a.score);

  const result: SSENDCProbabilityResult = {
    sites,
    totalCount: sites.length,
    highCount: sites.filter(s => s.grade === "High").length,
    mediumCount: sites.filter(s => s.grade === "Medium").length,
    fetchedAt: new Date().toISOString(),
  };

  dcProbCache = { data: result, ts: Date.now() };
  return result;
}

export async function getSSENHeadroom(): Promise<SSENHeadroomResult> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  let raw: string;
  const localPath = path.join(process.cwd(), "data", "ssen", "headroom-dashboard-data.csv");
  if (fs.existsSync(localPath)) {
    raw = fs.readFileSync(localPath, "utf-8");
  } else {
    const apiKey = process.env.SSEN_NERDA_API_KEY;
    if (!apiKey) {
      throw new Error("SSEN_NERDA_API_KEY not configured");
    }
    raw = await fetchText(HEADROOM_CSV_URL, apiKey);
  }
  const substations = parseCSV(raw);

  const summary = {
    green: 0,
    amber: 0,
    red: 0,
    byType: { GSP: 0, BSP: 0, Primary: 0 } as Record<string, number>,
  };

  for (const s of substations) {
    if (s.demandRAG === "Green") summary.green++;
    else if (s.demandRAG === "Amber") summary.amber++;
    else summary.red++;
    summary.byType[s.substationType] = (summary.byType[s.substationType] || 0) + 1;
  }

  const result: SSENHeadroomResult = {
    substations,
    totalCount: substations.length,
    fetchedAt: new Date().toISOString(),
    dataDate: "March 2026",
    summary,
  };

  cache = { data: result, ts: Date.now() };
  return result;
}
