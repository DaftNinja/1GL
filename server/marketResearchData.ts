export interface CountryMarketData {
  country: string;
  marketSizeUSD?: string;
  marketSizeGBP?: string;
  tamRangeMinGBP: number;
  tamRangeMaxGBP: number;
  cagr?: string;
  forecastPeriod?: string;
  keyMetrics: string[];
  competitiveLandscape: string[];
  majorCities: string[];
  keyDrivers: string[];
  challenges: string[];
}

export interface MarketResearchSource {
  name: string;
  publisher: string;
  year: number;
  keyFindings: string[];
}

export const MARKET_RESEARCH_SOURCES: MarketResearchSource[] = [
  {
    name: "Europe Data Center Colocation Market Report",
    publisher: "Mordor Intelligence / Market Research Future",
    year: 2025,
    keyFindings: [
      "Europe Data Center Colocation Market valued at USD 19,527.86 million in 2025",
      "Projected to reach USD 81,694.34 million by 2035 at CAGR of 15.32%",
      "Western Europe leads, with Germany, Netherlands, France, and UK as major hubs",
      "Central and Eastern Europe emerging as growth regions due to improving connectivity and cost advantages",
    ],
  },
  {
    name: "Grand View Research - Europe Data Center Colocation",
    publisher: "Grand View Research",
    year: 2023,
    keyFindings: [
      "Global Europe data center colocation market valued at USD 15.9 billion in 2022",
      "Expected CAGR of 15.2% from 2023-2030",
      "FLAP markets (Frankfurt, London, Amsterdam, Paris) historically dominant but facing capacity constraints",
      "Expansion into secondary markets: Oslo, Berlin, Zurich, Reykjavik, Milan, Warsaw, Prague, Vienna, Madrid",
      "Edge computing and 5G driving new colocation demand patterns",
    ],
  },
  {
    name: "DC Byte / EMEA Data Centre Index 2024",
    publisher: "DC Byte",
    year: 2024,
    keyFindings: [
      "EMEA Live Supply grew from 4.6GW in 2018 to 8.8GW in 2023",
      "Demand exceeds supply across EMEA, increasing colocation rental rates",
      "FLAP-D markets (Frankfurt, London, Amsterdam, Paris, Dublin) added average 450MW of Live Supply each",
      "Secondary markets (Belgium, Denmark, Poland, Spain, Sweden, UAE) recorded 100MW+ of Live Supply growth",
      "AI driving data centre growth with operators expanding outside established clusters for land and power",
      "Rising build costs further exacerbating colocation pricing pressure",
    ],
  },
  {
    name: "Verified Market Research - Europe Data Center Colocation",
    publisher: "Verified Market Research",
    year: 2024,
    keyFindings: [
      "Europe Data Center Colocation Market Size USD 16.38 Billion in 2022",
      "Growing at CAGR of 16.2% from 2022 to 2032",
      "Expected to reach USD 73.89 Billion by 2032",
      "Cloud service companies driving demand for large-scale colocation",
      "Evolving regulations around cloud storage requirements creating market fluidity",
    ],
  },
  {
    name: "IMARC / Reports and Insights - Europe Data Center Colocation",
    publisher: "Reports and Insights",
    year: 2024,
    keyFindings: [
      "Europe Data Center Colocation Market USD 19,849.01 million in 2023",
      "Projected to reach USD 50,905.37 million by 2032 at CAGR of 10.94%",
      "UK, Germany, and France leading markets by revenue",
      "Netherlands, Ireland, and Nordic countries supported by favourable environmental and economic factors",
      "5G networks and edge computing accelerating colocation demand",
    ],
  },
  {
    name: "Knight Frank - Data Centres: The EMEA Report Q2 2024",
    publisher: "Knight Frank",
    year: 2024,
    keyFindings: [
      "EMEA data centre investment reached record levels in 2023-2024",
      "Frankfurt, London, Amsterdam remain top-tier European markets",
      "Dublin, Paris emerging as significant secondary markets",
      "Sustainability mandates driving operational efficiency investments",
      "Power availability becoming primary constraint for new development",
    ],
  },
  {
    name: "Knight Frank - Data Centres Global Report 2025",
    publisher: "Knight Frank",
    year: 2025,
    keyFindings: [
      "Global data centre market investment exceeding $300 billion annually",
      "European markets commanding premium rents due to supply constraints",
      "AI workloads requiring higher power density per rack (15-50kW+)",
      "Green energy availability becoming key differentiator for site selection",
      "Secondary European markets offering 20-40% cost advantage over primary markets",
    ],
  },
  {
    name: "CBRE - 2025 Global Data Center Market Comparison",
    publisher: "CBRE",
    year: 2025,
    keyFindings: [
      "London is Europe's largest colocation market with 1,000+ MW operational capacity",
      "Frankfurt leads continental Europe with strong connectivity ecosystem",
      "Amsterdam facing regulatory constraints on new data centre development",
      "Paris and Dublin growing rapidly with government-supported digital strategies",
      "Colocation pricing in primary European markets: £120-180 per kW/month",
      "Secondary markets offering rates of £80-120 per kW/month",
    ],
  },
  {
    name: "Cushman & Wakefield - Europe Data Centres 2025 Outlook",
    publisher: "Cushman & Wakefield",
    year: 2025,
    keyFindings: [
      "European data centre market expected to grow 15-18% annually through 2028",
      "Total European market capacity approaching 10GW by end of 2025",
      "UK remains largest European market by revenue and capacity",
      "Germany and Netherlands following closely in pipeline development",
      "Edge computing creating demand for 50-200+ new micro data centres across Europe",
      "Sustainability reporting (EU Taxonomy, CSRD) driving operational transparency",
    ],
  },
  {
    name: "Gleeds - Global Market Report: Data Centres",
    publisher: "Gleeds",
    year: 2024,
    keyFindings: [
      "European data centre construction costs ranging £8-15 million per MW",
      "UK construction costs averaging £10-12 million per MW",
      "Nordic markets offering lower construction and energy costs",
      "Build-to-suit projects commanding 15-25% premium over standard colocation",
      "Mechanical and electrical systems representing 60-70% of total build cost",
    ],
  },
];

export const EUROPEAN_MARKET_DATA: Record<string, CountryMarketData> = {
  "United Kingdom": {
    country: "United Kingdom",
    marketSizeGBP: "4,200-4,800",
    tamRangeMinGBP: 4200,
    tamRangeMaxGBP: 4800,
    cagr: "12-15%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Largest European colocation market with 1,000+ MW operational capacity (CBRE 2025)",
      "London alone accounts for ~60% of UK data centre capacity",
      "UK construction costs averaging £10-12 million per MW (Gleeds 2024)",
      "Colocation pricing: £120-180 per kW/month in London, £80-120 in secondary markets (CBRE 2025)",
      "EMEA Live Supply grew from 4.6GW to 8.8GW (2018-2023), UK leading contributor (DC Byte 2024)",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "CyrusOne", "Vantage Data Centers",
      "NTT Global Data Centers", "Virtus Data Centres", "Kao Data", "DataVita",
    ],
    majorCities: ["London", "Manchester", "Birmingham", "Edinburgh", "Bristol", "Leeds", "Cardiff", "Belfast"],
    keyDrivers: [
      "Financial services sector digital infrastructure demand",
      "Government digital transformation and public sector cloud migration",
      "AI and machine learning workload growth",
      "Post-Brexit data sovereignty requirements",
      "5G network rollout and edge computing",
    ],
    challenges: [
      "Power availability constraints in Greater London",
      "Planning permission complexities",
      "High construction and land costs in primary markets",
      "Competition from established hyperscale providers",
    ],
  },
  "Ireland": {
    country: "Ireland",
    marketSizeGBP: "1,200-1,500",
    tamRangeMinGBP: 1200,
    tamRangeMaxGBP: 1500,
    cagr: "14-17%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Dublin hosts Europe's second largest DC cluster with 1,150 MW in operation (H1 2025), just behind London's 1,189 MW (KPMG 2026)",
      "Data centres consumed 22% (6,969 GWh) of Ireland's total metered electricity in 2024 (CSO MEC02)",
      "DC electricity consumption grew 5.6x from 1,238 GWh (2015) to 6,969 GWh (2024), a 21.2% CAGR (CSO MEC02)",
      "Dublin is a FLAP-D market, added average 450MW Live Supply (DC Byte 2024)",
      "CRU issued Large Energy User (LEU) connection policy decision (CRU/2025/236) establishing new framework for DC grid connections",
      "EirGrid Generation Capacity Statement 2023 projects system adequacy challenges with growing DC demand",
      "Ireland's 2024 total metered electricity consumption was 31,903 GWh, up from 24,599 GWh in 2015 (CSO MEC02)",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "CyrusOne", "Amazon Web Services",
      "Microsoft Azure", "Google Cloud", "Host in Ireland members",
    ],
    majorCities: ["Dublin", "Cork", "Galway", "Limerick", "Drogheda", "Ennis", "Athlone"],
    keyDrivers: [
      "EMEA headquarters for major US tech companies",
      "Favourable corporate tax regime (12.5% CT rate)",
      "Strong connectivity to transatlantic submarine cables",
      "EU data sovereignty and GDPR compliance hub",
      "Growing fintech and pharma sectors",
      "CRU policy reset enabling new DC connections outside moratorium areas",
      "Government recognition of data centres as strategic digital infrastructure",
    ],
    challenges: [
      "CRU moratorium on new data centre connections in Dublin region (since 2021), with phased easing under LEU policy",
      "Renewable energy supply constraints — grid integration of offshore wind lagging targets",
      "Public and political opposition to DC power consumption levels (22% of national electricity)",
      "Limited geographic diversity — vast majority of capacity concentrated in greater Dublin",
      "EirGrid system adequacy concerns with growing non-flexible DC baseload demand",
      "Grid connection queue backlog and long lead times for new HV infrastructure",
      "ESB Networks capacity constraints in Dublin distribution network",
    ],
  },
  "Netherlands": {
    country: "Netherlands",
    marketSizeGBP: "2,800-3,200",
    tamRangeMinGBP: 2800,
    tamRangeMaxGBP: 3200,
    cagr: "10-13%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Amsterdam is a core FLAP-D market with significant existing capacity (DC Byte 2024)",
      "Amsterdam facing regulatory constraints on new data centre development (CBRE 2025)",
      "Strong connectivity hub with AMS-IX internet exchange",
      "Secondary markets offering 20-40% cost advantage over Amsterdam (Knight Frank 2025)",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "NTT Global Data Centers",
      "CyrusOne", "Iron Mountain", "Datacenter.com",
    ],
    majorCities: ["Amsterdam", "Rotterdam", "The Hague", "Eindhoven", "Groningen", "Utrecht"],
    keyDrivers: [
      "World-class internet connectivity infrastructure",
      "Strategic European gateway location",
      "Strong fintech and digital commerce ecosystem",
      "Data sovereignty requirements for EU institutions",
    ],
    challenges: [
      "Amsterdam municipality restrictions on new developments",
      "Power grid capacity constraints in Randstad region",
      "Growing environmental regulations",
      "Land scarcity in primary markets",
    ],
  },
  "Germany": {
    country: "Germany",
    marketSizeGBP: "3,500-4,000",
    tamRangeMinGBP: 3500,
    tamRangeMaxGBP: 4000,
    cagr: "13-16%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Frankfurt leads continental Europe with strong connectivity ecosystem (CBRE 2025)",
      "Frankfurt is a core FLAP-D market, added average 450MW Live Supply (DC Byte 2024)",
      "Largest economy in Europe with significant digitalisation initiatives",
      "DE-CIX Frankfurt is world's largest internet exchange point by peak traffic",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "NTT Global Data Centers",
      "e-shelter / NTT", "Telehouse", "Maincubes", "CloudHQ",
    ],
    majorCities: ["Frankfurt", "Berlin", "Munich", "Hamburg", "Düsseldorf", "Stuttgart", "Cologne"],
    keyDrivers: [
      "DE-CIX internet exchange attracting global connectivity",
      "Strong industrial digitalisation (Industry 4.0)",
      "Automotive sector digital transformation",
      "Government cloud and Gaia-X initiatives",
      "AI and machine learning research centres",
    ],
    challenges: [
      "Energy costs among highest in Europe",
      "Complex federal regulatory environment",
      "Labour shortage in data centre operations",
      "Competition from established operators in Frankfurt",
    ],
  },
  "France": {
    country: "France",
    marketSizeGBP: "2,200-2,600",
    tamRangeMinGBP: 2200,
    tamRangeMaxGBP: 2600,
    cagr: "14-17%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Paris is a core FLAP market with government-supported digital strategies (CBRE 2025)",
      "Paris growing rapidly as key European hub (CBRE 2025)",
      "France is among top Western European markets by colocation revenue",
      "France 2030 national digital plan driving significant investment",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "Data4", "Scaleway",
      "OVHcloud", "Iliad / Free",
    ],
    majorCities: ["Paris", "Marseille", "Lyon", "Lille", "Strasbourg", "Bordeaux", "Toulouse"],
    keyDrivers: [
      "Government France 2030 digital sovereignty plan",
      "Growing cloud and SaaS ecosystem",
      "Mediterranean submarine cable hub (Marseille)",
      "AI research investment and startup ecosystem",
      "European defence and aerospace digitalisation",
    ],
    challenges: [
      "Regulatory complexity for new developments",
      "Energy efficiency regulations (EU Energy Efficiency Directive)",
      "High labour costs",
      "Limited power availability in Île-de-France region",
    ],
  },
  "Belgium": {
    country: "Belgium",
    marketSizeGBP: "500-700",
    tamRangeMinGBP: 500,
    tamRangeMaxGBP: 700,
    cagr: "12-15%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Belgium recorded 100MW+ of Live Supply growth (DC Byte 2024, secondary market)",
      "Brussels hosts key EU institutions driving data sovereignty demand",
      "Strategic location between London, Amsterdam, Frankfurt, and Paris",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "LCL Data Centers",
      "Datacenter United", "Proximus",
    ],
    majorCities: ["Brussels", "Antwerp", "Ghent", "Liège", "Bruges"],
    keyDrivers: [
      "EU institutional presence and data sovereignty requirements",
      "Strategic geographic location in Western Europe",
      "Strong pharmaceutical and chemical industry",
      "NATO headquarters and defence sector demand",
    ],
    challenges: [
      "Relatively small domestic market",
      "Competition from neighbouring Netherlands and Germany",
      "Complex federal/regional regulatory structure",
    ],
  },
  "Sweden": {
    country: "Sweden",
    marketSizeGBP: "600-850",
    tamRangeMinGBP: 600,
    tamRangeMaxGBP: 850,
    cagr: "15-18%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Sweden recorded 100MW+ of Live Supply growth (DC Byte 2024, secondary market)",
      "Nordic markets offering lower construction and energy costs (Gleeds 2024)",
      "Abundant renewable energy (hydroelectric and wind)",
      "Cool climate reducing cooling costs by 30-50%",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "Hydro66", "Node Pole",
      "atNorth", "Bahnhof",
    ],
    majorCities: ["Stockholm", "Gothenburg", "Malmö", "Luleå", "Uppsala", "Västerås"],
    keyDrivers: [
      "Abundant cheap renewable energy (hydroelectric)",
      "Cool climate for natural cooling efficiency",
      "Strong technology and innovation ecosystem",
      "Government support for digital infrastructure",
      "AI and HPC workload demand from research sector",
    ],
    challenges: [
      "Geographic distance from major European business centres",
      "Limited local demand compared to primary markets",
      "Infrastructure development in northern regions",
    ],
  },
  "Norway": {
    country: "Norway",
    marketSizeGBP: "400-600",
    tamRangeMinGBP: 400,
    tamRangeMaxGBP: 600,
    cagr: "16-20%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Oslo identified as emerging colocation market (Grand View Research)",
      "Nordic markets offering lower construction and energy costs (Gleeds 2024)",
      "99%+ renewable electricity generation (hydroelectric)",
      "Cold climate enables highly efficient free cooling",
    ],
    competitiveLandscape: [
      "Green Mountain", "DigiPlex", "Bulk Infrastructure",
      "Equinix", "Hetzner",
    ],
    majorCities: ["Oslo", "Bergen", "Stavanger", "Trondheim", "Kristiansand"],
    keyDrivers: [
      "Cheapest renewable electricity in Europe",
      "Cold climate ideal for cooling-intensive AI/HPC workloads",
      "Submarine cable connectivity (North Sea)",
      "Growing oil and gas sector digitalisation",
      "Government incentives for data centre development",
    ],
    challenges: [
      "Small domestic market",
      "Remote location from major business centres",
      "Limited local skilled workforce",
      "Harsh climate for construction",
    ],
  },
  "Denmark": {
    country: "Denmark",
    marketSizeGBP: "500-700",
    tamRangeMinGBP: 500,
    tamRangeMaxGBP: 700,
    cagr: "14-17%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Denmark recorded 100MW+ of Live Supply growth (DC Byte 2024, secondary market)",
      "Copenhagen emerging as Nordic connectivity hub",
      "Strong wind energy infrastructure for green operations",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "GlobalConnect",
      "TDC NET", "Bulk Infrastructure",
    ],
    majorCities: ["Copenhagen", "Aarhus", "Odense", "Aalborg", "Esbjerg"],
    keyDrivers: [
      "Strategic Nordic gateway location",
      "Strong renewable energy infrastructure (wind)",
      "Advanced digital government services",
      "Life sciences and pharmaceutical sector demand",
      "Connectivity between Nordics and continental Europe",
    ],
    challenges: [
      "Relatively small market size",
      "Competition from Swedish and Norwegian low-cost sites",
      "Energy price volatility",
      "Limited land availability near Copenhagen",
    ],
  },
  "Spain": {
    country: "Spain",
    marketSizeGBP: "1,000-1,400",
    tamRangeMinGBP: 1000,
    tamRangeMaxGBP: 1400,
    cagr: "15-19%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Spain recorded 100MW+ of Live Supply growth (DC Byte 2024, secondary market)",
      "Madrid identified as emerging colocation market (Grand View Research)",
      "Submarine cable hub connecting Europe to Africa and Latin America",
      "Secondary markets offering 20-40% cost advantage over primary European markets (Knight Frank 2025)",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "Nabiax", "Adam",
      "Aire Networks", "Telefónica",
    ],
    majorCities: ["Madrid", "Barcelona", "Bilbao", "Valencia", "Seville", "Málaga"],
    keyDrivers: [
      "Growing digital economy and startup ecosystem",
      "Submarine cable connectivity to Africa and Latin America",
      "Tourism and hospitality sector digitalisation",
      "Government digital transformation programmes",
      "Lower operating costs vs Northern European markets",
    ],
    challenges: [
      "Historically slower data centre market maturity",
      "Regional infrastructure disparities",
      "Water scarcity concerns for cooling in southern regions",
      "Competition from Portugal for submarine cable traffic",
    ],
  },
  "Italy": {
    country: "Italy",
    marketSizeGBP: "900-1,200",
    tamRangeMinGBP: 900,
    tamRangeMaxGBP: 1200,
    cagr: "14-18%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Milan identified as emerging colocation market (Grand View Research)",
      "Italy growing as Mediterranean data centre hub",
      "Secondary markets offering 20-40% cost advantage over primary European markets (Knight Frank 2025)",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "Aruba (Italian)",
      "CDLAN", "Supernap Italia", "TIM / Telecom Italia",
    ],
    majorCities: ["Milan", "Rome", "Turin", "Bologna", "Naples", "Genoa"],
    keyDrivers: [
      "Government PNRR digitalisation investment plan",
      "Growing cloud adoption in SME sector",
      "Financial services hub in Milan",
      "Manufacturing sector Industry 4.0 adoption",
      "Mediterranean connectivity for southern Europe",
    ],
    challenges: [
      "Regional infrastructure disparities (North vs South)",
      "Bureaucratic complexity for permits",
      "Higher energy costs than Northern European markets",
      "Fragmented domestic market",
    ],
  },
  "Poland": {
    country: "Poland",
    marketSizeGBP: "600-900",
    tamRangeMinGBP: 600,
    tamRangeMaxGBP: 900,
    cagr: "18-22%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Poland recorded 100MW+ of Live Supply growth (DC Byte 2024, secondary market)",
      "Warsaw and Prague identified as emerging colocation markets (Grand View Research)",
      "Central and Eastern Europe emerging as growth region due to improving connectivity and cost advantages",
      "Secondary markets offering 20-40% cost advantage over primary European markets (Knight Frank 2025)",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "Atman",
      "Beyond.pl", "Data4", "T-Mobile Poland",
    ],
    majorCities: ["Warsaw", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Katowice"],
    keyDrivers: [
      "Fastest-growing large economy in EU",
      "Cost-competitive vs Western European markets",
      "Growing IT outsourcing and shared services sector",
      "EU funding for digital infrastructure",
      "Strategic bridge between Western and Eastern Europe",
    ],
    challenges: [
      "Energy mix still heavily coal-dependent (sustainability concerns)",
      "Skilled workforce availability",
      "Less established data centre ecosystem",
      "Currency risk (PLN not EUR)",
    ],
  },
  "Switzerland": {
    country: "Switzerland",
    marketSizeGBP: "800-1,100",
    tamRangeMinGBP: 800,
    tamRangeMaxGBP: 1100,
    cagr: "10-13%",
    forecastPeriod: "2024-2030",
    keyMetrics: [
      "Zurich identified as emerging colocation market (Grand View Research)",
      "Premium market with focus on financial services and data sovereignty",
      "Strong renewable energy from hydroelectric power",
      "Neutral jurisdiction attractive for data hosting",
    ],
    competitiveLandscape: [
      "Equinix", "Digital Realty / Interxion", "Green Datacenter",
      "Vantage", "Safe Host", "Mount10",
    ],
    majorCities: ["Zurich", "Geneva", "Basel", "Bern", "Lausanne"],
    keyDrivers: [
      "Financial services sector (banking, insurance, wealth management)",
      "Data sovereignty and privacy-focused regulations",
      "High-quality infrastructure and connectivity",
      "Neutral jurisdiction for international data hosting",
      "Pharmaceutical and life sciences sector demand",
    ],
    challenges: [
      "Highest operating costs in Europe",
      "Not an EU member (regulatory complexity for EU clients)",
      "Limited land availability in urban centres",
      "Small domestic market relative to costs",
    ],
  },
};

export function getMarketResearchContext(country: string): string {
  const data = EUROPEAN_MARKET_DATA[country];
  if (!data) return "";

  const sourceSummaries = MARKET_RESEARCH_SOURCES
    .map((s) => `- ${s.name} (${s.publisher}, ${s.year}): ${s.keyFindings.slice(0, 2).join("; ")}`)
    .join("\n");

  return `
VERIFIED MARKET RESEARCH DATA FOR ${country.toUpperCase()}:

Market Size: £${data.marketSizeGBP} million (estimated 2024-2025)
Growth Rate: ${data.cagr} CAGR (${data.forecastPeriod})

Key Market Metrics:
${data.keyMetrics.map((m) => `- ${m}`).join("\n")}

Competitive Landscape in ${country}:
${data.competitiveLandscape.map((c) => `- ${c}`).join("\n")}

Key Cities for Data Centre Operations:
${data.majorCities.join(", ")}

Key Demand Drivers:
${data.keyDrivers.map((d) => `- ${d}`).join("\n")}

Market Challenges:
${data.challenges.map((c) => `- ${c}`).join("\n")}

BROADER EUROPEAN CONTEXT:
- European Data Center Colocation Market valued at USD 19.5 billion (2025), projected to reach USD 50-82 billion by 2032-2035 (multiple sources)
- EMEA Live Supply grew from 4.6GW (2018) to 8.8GW (2023) — DC Byte 2024
- FLAP-D markets added average 450MW Live Supply each — DC Byte 2024
- Demand exceeds supply across EMEA, increasing colocation rental rates — DC Byte 2024
- AI workloads requiring higher power density per rack (15-50kW+) — Knight Frank 2025
- European data centre construction costs: £8-15 million per MW — Gleeds 2024
- Secondary markets offering 20-40% cost advantage over primary markets — Knight Frank 2025

RESEARCH SOURCES (cite these in methodology):
${sourceSummaries}

IMPORTANT INSTRUCTIONS:
- Use the verified data points above as the foundation for your TAM calculations
- Ground all estimates in the market research figures provided
- Reference specific sources in the methodology section
- Ensure country-level estimates are proportional to the overall European market data
- All monetary values must be in GBP millions
`;
}

export function validateAndClampTam(country: string, totalTAM: number): number {
  const data = EUROPEAN_MARKET_DATA[country];
  if (!data) return totalTAM;
  const tolerance = 0.25;
  const min = data.tamRangeMinGBP * (1 - tolerance);
  const max = data.tamRangeMaxGBP * (1 + tolerance);
  if (totalTAM < min) return data.tamRangeMinGBP;
  if (totalTAM > max) return data.tamRangeMaxGBP;
  return totalTAM;
}

export function getDataSourceCitations(): Array<{ source: string; publisher: string; year: number; description: string }> {
  return MARKET_RESEARCH_SOURCES.map((s) => ({
    source: s.name,
    publisher: s.publisher,
    year: s.year,
    description: s.keyFindings[0],
  }));
}
