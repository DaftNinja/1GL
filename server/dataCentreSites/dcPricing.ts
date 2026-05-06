/**
 * Data Centre Electricity Pricing — Curated Dataset
 *
 * Regional averages + operator callouts sourced from:
 * - Cushman & Wakefield EMEA Data Centre Market Overview
 * - JLL Data Centre Investment Outlook
 * - Public pricing pages (Equinix IBX, Digital Realty)
 * - Typical industry benchmarks
 *
 * Updated Q2 2026; prices in EUR/kWh unless noted
 */

export interface DataCentrePricing {
  region: string;          // City/metropolitan area
  country: string;
  operator: string | null; // null = regional average; otherwise operator name
  pricePerKwh: number;     // EUR/kWh
  gridPricePerKwh: number; // Wholesale equivalent for premium calculation
  premiumPercent: number;  // (DC - grid) / grid × 100
  vintage: string;         // "Q2 2026", etc. — when this was published
  source: string;          // Attribution for auditability
  confidence: "high" | "medium" | "low";
}

const DC_PRICING_DATA: DataCentrePricing[] = [
  // ─── Western Europe ───────────────────────────────────────────────
  {
    region: "Frankfurt",
    country: "Germany",
    operator: null,
    pricePerKwh: 0.14,
    gridPricePerKwh: 0.084,
    premiumPercent: 66.7,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield EMEA DC Market Overview; ENTSO-E A44",
    confidence: "high",
  },
  {
    region: "Frankfurt",
    country: "Germany",
    operator: "Equinix",
    pricePerKwh: 0.145,
    gridPricePerKwh: 0.084,
    premiumPercent: 72.6,
    vintage: "Q2 2026",
    source: "Equinix IBX published pricing",
    confidence: "high",
  },
  {
    region: "Frankfurt",
    country: "Germany",
    operator: "Digital Realty",
    pricePerKwh: 0.135,
    gridPricePerKwh: 0.084,
    premiumPercent: 60.7,
    vintage: "Q2 2026",
    source: "Digital Realty published rates",
    confidence: "high",
  },
  {
    region: "Amsterdam",
    country: "Netherlands",
    operator: null,
    pricePerKwh: 0.12,
    gridPricePerKwh: 0.078,
    premiumPercent: 53.8,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; ENTSO-E",
    confidence: "high",
  },
  {
    region: "Amsterdam",
    country: "Netherlands",
    operator: "Equinix",
    pricePerKwh: 0.128,
    gridPricePerKwh: 0.078,
    premiumPercent: 64.1,
    vintage: "Q2 2026",
    source: "Equinix AMS published rates",
    confidence: "high",
  },
  {
    region: "London",
    country: "United Kingdom",
    operator: null,
    pricePerKwh: 0.16,
    gridPricePerKwh: 0.095,
    premiumPercent: 68.4,
    vintage: "Q2 2026",
    source: "JLL UK Data Centre Investment Outlook; Elexon",
    confidence: "medium",
  },
  {
    region: "London",
    country: "United Kingdom",
    operator: "Digital Realty",
    pricePerKwh: 0.165,
    gridPricePerKwh: 0.095,
    premiumPercent: 73.7,
    vintage: "Q2 2026",
    source: "Digital Realty London published rates",
    confidence: "medium",
  },
  {
    region: "Paris",
    country: "France",
    operator: null,
    pricePerKwh: 0.11,
    gridPricePerKwh: 0.072,
    premiumPercent: 52.8,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; ENTSO-E A44",
    confidence: "high",
  },
  {
    region: "Dublin",
    country: "Ireland",
    operator: null,
    pricePerKwh: 0.15,
    gridPricePerKwh: 0.098,
    premiumPercent: 53.1,
    vintage: "Q2 2026",
    source: "JLL Ireland; EirGrid",
    confidence: "medium",
  },
  {
    region: "Madrid",
    country: "Spain",
    operator: null,
    pricePerKwh: 0.125,
    gridPricePerKwh: 0.082,
    premiumPercent: 52.4,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; ENTSO-E",
    confidence: "medium",
  },
  // ─── Central Europe ───────────────────────────────────────────────
  {
    region: "Warsaw",
    country: "Poland",
    operator: null,
    pricePerKwh: 0.105,
    gridPricePerKwh: 0.068,
    premiumPercent: 54.4,
    vintage: "Q2 2026",
    source: "JLL CEE; PSE spot prices",
    confidence: "medium",
  },
  {
    region: "Vienna",
    country: "Austria",
    operator: null,
    pricePerKwh: 0.115,
    gridPricePerKwh: 0.075,
    premiumPercent: 53.3,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; ENTSO-E",
    confidence: "medium",
  },
  // ─── Northern Europe ──────────────────────────────────────────────
  {
    region: "Stockholm",
    country: "Sweden",
    operator: null,
    pricePerKwh: 0.095,
    gridPricePerKwh: 0.06,
    premiumPercent: 58.3,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; Nordpool",
    confidence: "medium",
  },
  {
    region: "Copenhagen",
    country: "Denmark",
    operator: null,
    pricePerKwh: 0.105,
    gridPricePerKwh: 0.065,
    premiumPercent: 61.5,
    vintage: "Q2 2026",
    source: "JLL Nordic; ENTSO-E",
    confidence: "medium",
  },
  {
    region: "Helsinki",
    country: "Finland",
    operator: null,
    pricePerKwh: 0.092,
    gridPricePerKwh: 0.058,
    premiumPercent: 58.6,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; ENTSO-E",
    confidence: "medium",
  },
  // ─── Southern Europe ──────────────────────────────────────────────
  {
    region: "Milan",
    country: "Italy",
    operator: null,
    pricePerKwh: 0.135,
    gridPricePerKwh: 0.088,
    premiumPercent: 53.4,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; ENTSO-E",
    confidence: "medium",
  },
  {
    region: "Lisbon",
    country: "Portugal",
    operator: null,
    pricePerKwh: 0.12,
    gridPricePerKwh: 0.076,
    premiumPercent: 57.9,
    vintage: "Q2 2026",
    source: "JLL; ENTSO-E",
    confidence: "low",
  },
  {
    region: "Zurich",
    country: "Switzerland",
    operator: null,
    pricePerKwh: 0.11,
    gridPricePerKwh: 0.068,
    premiumPercent: 61.8,
    vintage: "Q2 2026",
    source: "Cushman & Wakefield; SwissGrid",
    confidence: "medium",
  },
  // ─── APAC ─────────────────────────────────────────────────────────
  {
    region: "Singapore",
    country: "Singapore",
    operator: null,
    pricePerKwh: 0.085,
    gridPricePerKwh: 0.065,
    premiumPercent: 30.8,
    vintage: "Q2 2026",
    source: "JLL APAC; EMA spot average",
    confidence: "medium",
  },
  {
    region: "Singapore",
    country: "Singapore",
    operator: "Equinix",
    pricePerKwh: 0.089,
    gridPricePerKwh: 0.065,
    premiumPercent: 36.9,
    vintage: "Q2 2026",
    source: "Equinix SG published rates",
    confidence: "medium",
  },
  {
    region: "Tokyo",
    country: "Japan",
    operator: null,
    pricePerKwh: 0.12,
    gridPricePerKwh: 0.078,
    premiumPercent: 53.8,
    vintage: "Q2 2026",
    source: "JLL Japan; TEPCO",
    confidence: "medium",
  },
  {
    region: "Sydney",
    country: "Australia",
    operator: null,
    pricePerKwh: 0.105,
    gridPricePerKwh: 0.068,
    premiumPercent: 54.4,
    vintage: "Q2 2026",
    source: "JLL ANZ; NEM average",
    confidence: "medium",
  },
  {
    region: "Mumbai",
    country: "India",
    operator: null,
    pricePerKwh: 0.065,
    gridPricePerKwh: 0.048,
    premiumPercent: 35.4,
    vintage: "Q2 2026",
    source: "Industry benchmark; state utility average",
    confidence: "low",
  },
];

/**
 * Get all DC pricing entries for a country (regional average + operator callouts)
 */
export function getDcPricing(country: string): DataCentrePricing[] {
  return DC_PRICING_DATA.filter((p) => p.country === country);
}

/**
 * Get the best-match DC pricing entry for a country (returns regional average if no specific region given)
 */
export function getDcPricingForRegion(
  country: string,
  region?: string
): DataCentrePricing | null {
  const entries = getDcPricing(country);
  if (entries.length === 0) return null;

  if (region) {
    const regional = entries.find((e) => e.region === region && e.operator === null);
    if (regional) return regional;
  }

  return entries.find((e) => e.operator === null) ?? entries[0] ?? null;
}
