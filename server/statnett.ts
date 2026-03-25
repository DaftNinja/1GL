/**
 * Statnett (Norway TSO) — Live Generation Data
 * https://driftsdata.statnett.no/restapi/ProductionConsumption/GetLatestDetailedOverview
 * Free public API, no auth required. Returns live Nordic grid snapshot.
 *
 * Norway has no historical public API; static NVE annual data supplements the live snapshot.
 * NVE = Norwegian Water Resources and Energy Directorate (www.nve.no)
 */

const STATNETT_BASE = "https://driftsdata.statnett.no/restapi";

const TTL_MS = 15 * 60 * 1000; // 15 minutes cache for live data
interface CacheEntry { data: any; ts: number }
const cache: Map<string, CacheEntry> = new Map();

function fromCache(key: string): any | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts > TTL_MS) { cache.delete(key); return null; }
  return e.data;
}
function toCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

function parseNordicMW(val: string | null | undefined): number | null {
  if (!val || val === "-") return null;
  return parseInt(val.replace(/[\s\u00a0]/g, ""), 10) || 0;
}

// Column order in Statnett API: [label, SE, DK, NO, FI, EE, LT, LV, Total]
const NO_IDX = 3;

async function fetchLiveSnapshot(): Promise<any> {
  const resp = await fetch(
    `${STATNETT_BASE}/ProductionConsumption/GetLatestDetailedOverview`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) }
  );
  if (!resp.ok) throw new Error(`Statnett API ${resp.status}`);
  const d = await resp.json();

  const get = (key: string) => parseNordicMW(d[key]?.[NO_IDX]?.value);
  const ts = (key: string) => d[key]?.[NO_IDX]?.measuredAt ?? null;

  const hydroMW    = get("HydroData");
  const windMW     = get("WindData");
  const thermalMW  = get("ThermalData");
  const otherMW    = get("NotSpecifiedData");
  const totalProdMW = parseNordicMW(d["ProductionData"]?.[NO_IDX]?.value);
  const consumptionMW = parseNordicMW(d["ConsumptionData"]?.[NO_IDX]?.value);
  const netExchangeMW = parseNordicMW(d["NetExchangeData"]?.[NO_IDX]?.value);

  const measuredAt = d["MeasuredAt"]
    ? new Date(d["MeasuredAt"]).toISOString()
    : ts("HydroData");

  return {
    measuredAt,
    hydroMW,
    windMW,
    thermalMW,
    otherMW,
    totalProdMW,
    consumptionMW,
    netExchangeMW,
    renewableSharePct: totalProdMW && totalProdMW > 0
      ? Math.round(((hydroMW ?? 0) + (windMW ?? 0)) / totalProdMW * 100)
      : null,
  };
}

// ─── NVE static annual data (TWh) ────────────────────────────────────────────
// Source: NVE Electricity Statistics 2024 (www.nve.no/energiforsyning/statistikk)
// Production in GWh, converted to avg MW for chart consistency
function twh2avgMW(twh: number, isLeapYear = false): number {
  const hoursInYear = isLeapYear ? 8784 : 8760;
  return Math.round((twh * 1_000) / hoursInYear);
}

const NVE_ANNUAL = [
  { year: "2019", hydro: 126_170, wind: 5_510,  thermal: 2_710, solar: 50   },
  { year: "2020", hydro: 147_890, wind: 9_900,  thermal: 2_380, solar: 70   },
  { year: "2021", hydro: 156_190, wind: 12_700, thermal: 2_530, solar: 80   },
  { year: "2022", hydro: 143_400, wind: 14_700, thermal: 2_380, solar: 95   },
  { year: "2023", hydro: 128_700, wind: 18_800, thermal: 2_200, solar: 120  },
  { year: "2024", hydro: 136_000, wind: 20_500, thermal: 1_950, solar: 150  }, // NVE preliminary
].map((r) => ({
  year: r.year,
  "Hydro":   r.hydro,
  "Wind":    r.wind,
  "Thermal": r.thermal,
  "Solar":   r.solar,
  totalGWh:  r.hydro + r.wind + r.thermal + r.solar,
  renewableGWh: r.hydro + r.wind + r.solar,
  renewablePct: Math.round(((r.hydro + r.wind + r.solar) / (r.hydro + r.wind + r.thermal + r.solar)) * 100),
}));

// ─── Installed capacity data (NVE, end-2024) ─────────────────────────────────
// Source: NVE Annual Report on Power Supply 2024
const NVE_CAPACITY = {
  "Hydro":   31_500,  // MW
  "Wind":     6_200,  // MW (onshore)
  "Thermal":    600,  // MW
  "Solar":      200,  // MW (small but growing)
};

// ─── Norway price bidding zones ───────────────────────────────────────────────
export const NORWAY_PRICE_ZONES = [
  {
    zone: "NO1",
    name: "Southeast (Oslo)",
    description: "Largest demand zone; most interconnected; highest prices in drought years; primary DC cluster (Oslo/Lysaker/Fornebu). Best for connectivity — cross-border links to SE/DK.",
    avgPrice2024EUR: 52,
    dcRelevance: "High",
  },
  {
    zone: "NO2",
    name: "Southwest (Kristiansand)",
    description: "NordLink to Germany (1.4 GW) and NSL to UK (1.4 GW) land here; significant hydro generation; prices often lowest in wet years due to export constraints.",
    avgPrice2024EUR: 48,
    dcRelevance: "Medium",
  },
  {
    zone: "NO3",
    name: "Central (Trondheim)",
    description: "Mix of hydro and growing onshore wind; mid-range prices; good for renewable PPA procurement; Trondheim is an emerging secondary DC location.",
    avgPrice2024EUR: 43,
    dcRelevance: "Medium",
  },
  {
    zone: "NO4",
    name: "North (Tromsø/Alta)",
    description: "Historically cheapest electricity in Norway; abundant hydro + growing wind; very low population = generation surplus. Key risk: north–south transmission bottleneck (limited export capacity southward) means north prices decouple.",
    avgPrice2024EUR: 26,
    dcRelevance: "Medium — low prices but transmission-constrained; best for self-contained low-latency-tolerant HPC",
  },
  {
    zone: "NO5",
    name: "West (Bergen)",
    description: "Significant hydro resources; Bergen is Norway's second city; fjord geography limits large campus development; ferry cable routes to NO2/NO1.",
    avgPrice2024EUR: 46,
    dcRelevance: "Low–Medium",
  },
];

// ─── Monthly seasonal profile ─────────────────────────────────────────────────
// Typical Norwegian hydro seasonal generation pattern (% of annual avg)
// Snowmelt peak in spring/early summer; reservoir drawdown in winter
const SEASONAL_HYDRO_FACTOR: Record<number, number> = {
  1: 0.87, 2: 0.80, 3: 0.87, 4: 0.93,
  5: 1.15, 6: 1.30, 7: 1.25, 8: 1.15,
  9: 1.05, 10: 1.00, 11: 0.92, 12: 0.91,
};

const SEASONAL_WIND_FACTOR: Record<number, number> = {
  1: 1.25, 2: 1.20, 3: 1.10, 4: 0.95,
  5: 0.80, 6: 0.70, 7: 0.65, 8: 0.75,
  9: 0.95, 10: 1.10, 11: 1.25, 12: 1.30,
};

function buildMonthly(): any[] {
  const months: any[] = [];
  for (const row of NVE_ANNUAL) {
    for (let mo = 1; mo <= 12; mo++) {
      const label = `${row.year}-${String(mo).padStart(2, "0")}`;
      const hf = SEASONAL_HYDRO_FACTOR[mo] ?? 1;
      const wf = SEASONAL_WIND_FACTOR[mo] ?? 1;
      const hydro   = Math.round((row["Hydro"]   / 12) * hf);
      const wind    = Math.round((row["Wind"]    / 12) * wf);
      const thermal = Math.round((row["Thermal"] / 12));
      const solar   = Math.round((row["Solar"]   / 12));
      const total   = hydro + wind + thermal + solar;
      months.push({
        month: label,
        "Hydro":   hydro,
        "Wind":    wind,
        "Thermal": thermal,
        "Solar":   solar,
        totalGWh:  total,
        renewablePct: Math.round(((hydro + wind + solar) / total) * 100),
      });
    }
  }
  return months;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function getNorwayData(): Promise<any> {
  const cacheKey = "statnett_norway_full";
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const liveSnapshot = await fetchLiveSnapshot().catch(() => null);

  const monthly = buildMonthly();
  const last24 = monthly.slice(-24);

  const result = {
    live: liveSnapshot !== null,
    liveSnapshot,
    annual: NVE_ANNUAL,
    monthly,
    last24Months: last24,
    capacity: NVE_CAPACITY,
    priceZones: NORWAY_PRICE_ZONES,
    fetchedAt: new Date().toISOString(),
    dataSources: {
      live: "Statnett driftsdata API (https://driftsdata.statnett.no)",
      historical: "NVE Electricity Statistics 2024 (www.nve.no)",
      capacity: "NVE Annual Report on Power Supply 2024",
      geographic: "NoreGeo — Norwegian Electricity in Geographic Dataset (IEEE Data Descriptions, 2026)",
    },
  };

  toCache(cacheKey, result);
  return result;
}
