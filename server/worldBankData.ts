/**
 * World Bank Open Data API
 *
 * Fetches country-level energy and digital infrastructure indicators.
 * No API key required — fully open.
 *
 * Base URL: https://api.worldbank.org/v2
 * Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

const WB_BASE = "https://api.worldbank.org/v2";
const FETCH_TIMEOUT_MS = 20_000;
const TTL_24H = 24 * 60 * 60 * 1_000;

// ── Indicators ────────────────────────────────────────────────────────────────

export const INDICATORS: Record<string, { label: string; unit: string }> = {
  "EG.ELC.RNEW.ZS":   { label: "Renewable electricity output",    unit: "% of total" },
  "EG.ELC.LOSS.ZS":   { label: "Transmission & distribution losses", unit: "% of output" },
  "EG.USE.ELEC.KH.PC": { label: "Electricity consumption per capita", unit: "kWh" },
  "EN.ATM.CO2E.PC":   { label: "CO₂ emissions per capita",         unit: "metric tons" },
  "IT.NET.BBND.P2":   { label: "Fixed broadband subscriptions",    unit: "per 100 people" },
  "IT.NET.USER.ZS":   { label: "Internet users",                   unit: "% of population" },
};

// ISO 3166-1 alpha-2 codes mapped from display names used in GIGLABS_COUNTRIES
// and any additional countries that may appear in Power Trends
const COUNTRY_CODE_MAP: Record<string, string> = {
  "United Kingdom":  "GB",
  "United States":   "US",
  "Brazil":          "BR",
  "France":          "FR",
  "Netherlands":     "NL",
  "Sweden":          "SE",
  "Ireland":         "IE",
  "Spain":           "ES",
  "Portugal":        "PT",
  "Belgium":         "BE",
  "Germany":         "DE",
  "Norway":          "NO",
  "Denmark":         "DK",
  "Finland":         "FI",
  "Italy":           "IT",
  "Poland":          "PL",
  "Switzerland":     "CH",
  "Austria":         "AT",
  "Japan":           "JP",
  "South Korea":     "KR",
  "Australia":       "AU",
  "Canada":          "CA",
  "Singapore":       "SG",
  "India":           "IN",
};

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface IndicatorValue {
  code: string;
  label: string;
  unit: string;
  value: number | null;
  year: string | null;
}

export interface WorldBankIndicatorsResult {
  country: string;
  countryCode: string;
  indicators: IndicatorValue[];
  fetchedAt: string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry<any>>();

function fromCache<T>(key: string, ttlMs: number): T | null {
  const e = _cache.get(key) as CacheEntry<T> | undefined;
  if (!e || Date.now() - e.fetchedAt > ttlMs) return null;
  return e.data;
}

function toCache<T>(key: string, data: T): T {
  _cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

/**
 * Fetch a single indicator for a country, returning the most recent
 * non-null observation from the last 5 years.
 */
async function fetchIndicator(
  countryCode: string,
  indicatorCode: string,
): Promise<{ value: number | null; year: string | null }> {
  const url =
    `${WB_BASE}/country/${encodeURIComponent(countryCode)}` +
    `/indicator/${encodeURIComponent(indicatorCode)}` +
    `?format=json&mrv=5&per_page=5`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`World Bank API ${res.status} for ${indicatorCode}/${countryCode}`);
  }

  // Response is a 2-element array: [metadata, dataArray]
  const json: any = await res.json();
  const rows: any[] = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];

  // Find most-recent row with a non-null value
  for (const row of rows) {
    if (row.value !== null && row.value !== undefined) {
      return { value: typeof row.value === "number" ? row.value : parseFloat(row.value), year: row.date ?? null };
    }
  }

  return { value: null, year: null };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all World Bank energy & digital indicators for a given country name.
 * Returns null if the country name is not in the mapping.
 */
export async function getCountryIndicators(
  country: string,
): Promise<WorldBankIndicatorsResult | null> {
  const countryCode = COUNTRY_CODE_MAP[country];
  if (!countryCode) return null;

  const cacheKey = `wb:indicators:${countryCode}`;
  const cached = fromCache<WorldBankIndicatorsResult>(cacheKey, TTL_24H);
  if (cached) return cached;

  const indicatorCodes = Object.keys(INDICATORS);

  const results = await Promise.allSettled(
    indicatorCodes.map(code => fetchIndicator(countryCode, code)),
  );

  const indicators: IndicatorValue[] = indicatorCodes.map((code, i) => {
    const meta = INDICATORS[code];
    const r = results[i];
    const { value, year } =
      r.status === "fulfilled" ? r.value : { value: null, year: null };
    return { code, label: meta.label, unit: meta.unit, value, year };
  });

  return toCache(cacheKey, {
    country,
    countryCode,
    indicators,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * Render World Bank indicators as a concise text block suitable for
 * injection into an AI system prompt.
 */
export function formatIndicatorsForPrompt(result: WorldBankIndicatorsResult): string {
  const lines = result.indicators.map(ind => {
    if (ind.value === null) return `  ${ind.label}: N/A`;
    const val = Number.isInteger(ind.value)
      ? ind.value.toLocaleString()
      : ind.value.toFixed(2);
    return `  ${ind.label}: ${val} ${ind.unit}${ind.year ? ` (${ind.year})` : ""}`;
  });

  return (
    `WORLD BANK MACRO INDICATORS — ${result.country} (fetched ${result.fetchedAt.slice(0, 10)}):\n` +
    lines.join("\n")
  );
}
