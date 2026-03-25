const EMBER_API_BASE = "https://api.ember-energy.org/v1";
const EMBER_API_KEY = process.env.EMBER_API_KEY || "";

export const COUNTRY_CODE_MAP: Record<string, string> = {
  "United Kingdom": "GBR",
  "Ireland": "IRL",
  "Netherlands": "NLD",
  "Germany": "DEU",
  "France": "FRA",
  "Belgium": "BEL",
  "Sweden": "SWE",
  "Norway": "NOR",
  "Denmark": "DNK",
  "Spain": "ESP",
  "Italy": "ITA",
  "Poland": "POL",
  "Switzerland": "CHE",
};

export interface GenerationDataPoint {
  year: string;
  Wind: number;
  Solar: number;
  Hydro: number;
  Nuclear: number;
  Bioenergy: number;
  Gas: number;
  Coal: number;
  "Other fossil": number;
  "Other renewables": number;
  "Net imports": number;
  renewablesPct: number;
  fossilPct: number;
  lowCarbonPct: number;
}

export interface CarbonIntensityPoint {
  year: string;
  gco2PerKwh: number;
}

export interface EmberCountryData {
  entityCode: string;
  entityName: string;
  generation: GenerationDataPoint[];
  carbonIntensity: CarbonIntensityPoint[];
  latestYear: string;
  latestRenewablesPct: number;
  latestCarbonIntensity: number;
  carbonIntensityChange5yr: number;
}

const SOURCES = ["Wind", "Solar", "Hydro", "Nuclear", "Bioenergy", "Gas", "Coal", "Other fossil", "Other renewables", "Net imports"] as const;
const RENEWABLE_SOURCES = new Set(["Wind", "Solar", "Hydro", "Bioenergy", "Other renewables"]);
const FOSSIL_SOURCES = new Set(["Gas", "Coal", "Other fossil"]);

const cache = new Map<string, { data: EmberCountryData; cachedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchEmber(endpoint: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, api_key: EMBER_API_KEY }).toString();
  const res = await fetch(`${EMBER_API_BASE}/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`Ember API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getCountryEmberData(countryName: string): Promise<EmberCountryData | null> {
  const entityCode = COUNTRY_CODE_MAP[countryName];
  if (!entityCode) return null;

  const cached = cache.get(entityCode);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.data;

  try {
    const [genRaw, ciRaw] = await Promise.all([
      fetchEmber("electricity-generation/yearly", {
        entity_code: entityCode,
        is_aggregate_series: "false",
        min_date: "2010",
        limit: "500",
      }),
      fetchEmber("carbon-intensity/yearly", {
        entity_code: entityCode,
        min_date: "2010",
        limit: "100",
      }),
    ]);

    const byYear: Record<string, Record<string, number>> = {};
    for (const row of genRaw.data as any[]) {
      byYear[row.date] = byYear[row.date] || {};
      byYear[row.date][row.series] = row.share_of_generation_pct ?? 0;
    }

    const generation: GenerationDataPoint[] = Object.keys(byYear)
      .sort()
      .map((year) => {
        const yr = byYear[year];
        const row: any = { year };
        let renewablesPct = 0;
        let fossilPct = 0;
        let lowCarbonPct = 0;
        for (const src of SOURCES) {
          const v = Math.max(0, yr[src] ?? 0);
          row[src] = parseFloat(v.toFixed(1));
          if (RENEWABLE_SOURCES.has(src)) renewablesPct += v;
          if (FOSSIL_SOURCES.has(src)) fossilPct += v;
          if (src === "Nuclear") lowCarbonPct += v;
        }
        row.renewablesPct = parseFloat(renewablesPct.toFixed(1));
        row.fossilPct = parseFloat(fossilPct.toFixed(1));
        row.lowCarbonPct = parseFloat((renewablesPct + lowCarbonPct).toFixed(1));
        return row as GenerationDataPoint;
      });

    const carbonIntensity: CarbonIntensityPoint[] = (ciRaw.data as any[])
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((r: any) => ({
        year: r.date,
        gco2PerKwh: parseFloat((r.emissions_intensity_gco2_per_kwh ?? 0).toFixed(1)),
      }));

    const latest = generation[generation.length - 1];
    const ci = carbonIntensity[carbonIntensity.length - 1];
    const ci5ago = carbonIntensity.length >= 6 ? carbonIntensity[carbonIntensity.length - 6] : null;

    const data: EmberCountryData = {
      entityCode,
      entityName: countryName,
      generation,
      carbonIntensity,
      latestYear: latest?.year ?? "",
      latestRenewablesPct: latest?.renewablesPct ?? 0,
      latestCarbonIntensity: ci?.gco2PerKwh ?? 0,
      carbonIntensityChange5yr: ci5ago ? parseFloat((ci.gco2PerKwh - ci5ago.gco2PerKwh).toFixed(1)) : 0,
    };

    cache.set(entityCode, { data, cachedAt: Date.now() });
    return data;
  } catch (err) {
    console.error("Ember API fetch error:", err);
    return null;
  }
}
