export interface ScrapingTarget {
  operatorName: string;
  website: string;
  scrapingUrl: string;
  region?: string;
  country: string;
  dataType: "capacity" | "pricing" | "occupancy" | "expansion_news" | "facility_list";
  extractionHints: {
    keywords?: string[];
    selectors?: string[];
    patterns?: string[];
  };
  parserType: "html" | "js" | "manual";
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  render?: boolean;
}

export const SCRAPING_TARGETS: ScrapingTarget[] = [
  // === MAJOR OPERATORS (9) ===
  {
    operatorName: "Equinix",
    website: "equinix.com",
    scrapingUrl: "https://www.equinix.com/data-centers/",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["MW", "capacity", "megawatt", "power", "facility"],
      selectors: [
        "[class*='facility']",
        "[class*='datacenter']",
        "[class*='capacity']",
        "[class*='power']",
        "[data-capacity]",
        ".card",
        ".location-card",
      ],
      patterns: [
        "[\\d.]+\\s*MW",
        "capacity[:\\s]+[\\d.]+",
        "power[:\\s]+[\\d.]+",
      ],
    },
    parserType: "js",
    frequency: "monthly",
    render: true,
  },
  {
    operatorName: "Digital Realty",
    website: "digitalrealty.com",
    scrapingUrl: "https://www.digitalrealty.com/data-centers",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["MW", "capacity", "power"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Interxion",
    website: "interxion.com",
    scrapingUrl: "https://www.interxion.com/en/data-centres",
    country: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data centre", "facility", "location"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Iron Mountain",
    website: "ironmountain.com",
    scrapingUrl: "https://www.ironmountain.com/data-centers",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data center", "facility", "capacity"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Cologix",
    website: "cologix.com",
    scrapingUrl: "https://cologix.com/data-centers/",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data center", "availability"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Lumen",
    website: "lumen.com",
    scrapingUrl: "https://www.lumen.com/en-us/business/enterprise/data-centers.html",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data center", "colocation"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Rackspace",
    website: "rackspace.com",
    scrapingUrl: "https://www.rackspace.com/data-centers",
    country: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "location", "region"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Colt",
    website: "colt.net",
    scrapingUrl: "https://www.colt.net/en/colocation-data-centre",
    country: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["colocation", "data center"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Zenlayer",
    website: "zenlayer.com",
    scrapingUrl: "https://www.zenlayer.com/locations",
    country: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["location", "data center"],
    },
    parserType: "html",
    frequency: "monthly",
  },

  // === NORDIC/BENELUX (7) ===
  {
    operatorName: "Verne Global",
    website: "verneglobal.com",
    scrapingUrl: "https://www.verneglobal.com/data-centre/",
    country: "Iceland",
    region: "Reykjavik",
    dataType: "pricing",
    extractionHints: {
      keywords: ["€/kWh", "power", "renewable", "capacity", "MW", "PUE"],
      selectors: [
        "[class*='price']",
        "[class*='cost']",
        "[class*='euro']",
        "[class*='capacity']",
        "[class*='power']",
        "h2, h3, p",
      ],
      patterns: [
        "€[\\d.]+/kWh",
        "[\\d.]+\\s*MW",
        "PUE[:\\s]+[\\d.]+",
        "[\\d.]+\\s*power",
      ],
    },
    parserType: "js",
    frequency: "monthly",
    render: true,
  },
  {
    operatorName: "Green Mountain",
    website: "greenmountain.no",
    scrapingUrl: "https://greenmountain.no/data-centre/",
    country: "Norway",
    region: "Stavanger",
    dataType: "pricing",
    extractionHints: {
      keywords: ["€/kWh", "NOK", "capacity", "MW", "power", "renewable", "pricing"],
      selectors: [
        "[class*='price']",
        "[class*='cost']",
        "[class*='capacity']",
        "[class*='power']",
        ".pricing",
        ".rates",
        "h2, h3",
      ],
      patterns: [
        "€[\\d.]+/kWh",
        "[\\d.]+\\s*NOK",
        "[\\d.]+\\s*MW",
        "PUE[:\\s]+[\\d.]+",
      ],
    },
    parserType: "js",
    frequency: "monthly",
    render: true,
  },
  {
    operatorName: "EvoSwitch",
    website: "evoswitch.com",
    scrapingUrl: "https://www.evoswitch.com/en/locations",
    country: "Netherlands",
    region: "Amsterdam",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["Amsterdam", "facility", "location", "colocation"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "NorthC",
    website: "northc.se",
    scrapingUrl: "https://www.northc.se/en/data-centres/",
    country: "Sweden",
    region: "Stockholm",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data centre", "facility", "capacity"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Echelon",
    website: "echelon.nl",
    scrapingUrl: "https://echelon.nl/data-centres/",
    country: "Netherlands",
    region: "Amsterdam/Zwolle",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["Amsterdam", "Zwolle", "facility", "colocation"],
    },
    parserType: "html",
    frequency: "quarterly",
  },
  {
    operatorName: "atNorth",
    website: "atnorth.com",
    scrapingUrl: "https://atnorth.com/data-center/",
    country: "Iceland",
    region: "Hafnir",
    dataType: "capacity",
    extractionHints: {
      keywords: ["power", "renewable", "capacity"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "DigiPlex",
    website: "digiplex.com",
    scrapingUrl: "https://www.digiplex.com/en/locations/",
    country: "Nordic",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["facility", "location", "data center"],
    },
    parserType: "html",
    frequency: "monthly",
  },

  // === GERMANY (3) ===
  {
    operatorName: "e-Shelter",
    website: "e-shelter.de",
    scrapingUrl: "https://www.e-shelter.de/data-center/",
    country: "Germany",
    region: "Frankfurt/Berlin",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["Rechenzentrum", "Standort", "Kapazität"],
    },
    parserType: "html",
    frequency: "quarterly",
  },
  {
    operatorName: "QTS",
    website: "qtsdatacenters.com",
    scrapingUrl: "https://www.qtsdatacenters.com/locations",
    country: "Germany",
    region: "Frankfurt",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data center", "location", "MW", "capacity", "power", "Frankfurt"],
      selectors: [
        "[class*='location']",
        "[class*='facility']",
        "[class*='capacity']",
        "[class*='power']",
        "[data-location]",
        ".center-card",
        ".datacenter-item",
      ],
      patterns: [
        "[\\d.]+\\s*MW",
        "capacity[:\\s]+[\\d.]+",
        "Frankfurt.*[\\d.]+",
      ],
    },
    parserType: "js",
    frequency: "monthly",
    render: true,
  },

  // === FRANCE (3) ===
  {
    operatorName: "Telehouse",
    website: "telehouse.net",
    scrapingUrl: "https://www.telehouse.net/en/locations",
    country: "France",
    region: "Paris",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "location", "facility"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Scaleway",
    website: "scaleway.com",
    scrapingUrl: "https://www.scaleway.com/en/locations/",
    country: "France",
    region: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["availability zone", "region", "data center"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "OVHcloud",
    website: "ovhcloud.com",
    scrapingUrl: "https://www.ovhcloud.com/en/bare-metal/locations/",
    country: "France",
    region: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "location", "region"],
    },
    parserType: "html",
    frequency: "monthly",
  },

  // === SPAIN/PORTUGAL (2) ===
  {
    operatorName: "Solucom",
    website: "solucom.com",
    scrapingUrl: "https://www.solucom.com/data-center/",
    country: "Spain",
    region: "Madrid",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "centro de datos"],
    },
    parserType: "html",
    frequency: "quarterly",
  },
  {
    operatorName: "Nuovamacom",
    website: "nuovamacom.com",
    scrapingUrl: "https://www.nuovamacom.com/data-centers/",
    country: "Spain",
    region: "Barcelona",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "ubicación"],
    },
    parserType: "html",
    frequency: "quarterly",
  },

  // === POLAND (2) ===
  {
    operatorName: "AtlaNet",
    website: "atlas.pl",
    scrapingUrl: "https://www.atlas.pl/data-center/",
    country: "Poland",
    region: "Warsaw",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "centrum danych"],
    },
    parserType: "html",
    frequency: "quarterly",
  },

  // === UK/IRELAND (3) ===
  {
    operatorName: "Kao Data",
    website: "kaodata.com",
    scrapingUrl: "https://www.kaodata.com/data-centre/",
    country: "UK",
    region: "London",
    dataType: "capacity",
    extractionHints: {
      keywords: ["power", "cooling", "capacity", "MW", "PUE", "efficiency"],
      selectors: [
        "[class*='power']",
        "[class*='cooling']",
        "[class*='capacity']",
        "[class*='efficiency']",
        "[class*='pue']",
        ".metrics",
        ".specs",
      ],
      patterns: [
        "[\\d.]+\\s*MW",
        "PUE[:\\s]+[\\d.]+",
        "power[:\\s]+[\\d.]+",
        "efficiency[:\\s]+[\\d.]+",
      ],
    },
    parserType: "js",
    frequency: "monthly",
    render: true,
  },
  {
    operatorName: "CenturyLink",
    website: "centurylink.com",
    scrapingUrl: "https://www.centurylink.com/business/enterprise/data-centers.html",
    country: "UK",
    region: "London",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "location"],
    },
    parserType: "html",
    frequency: "monthly",
  },

  // === LEGACY/ARCHIVE (1) ===
  {
    operatorName: "TeleCity",
    website: "telecitygroup.com",
    scrapingUrl: "https://web.archive.org/web/20230101000000*/telecitygroup.com/",
    country: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "location"],
    },
    parserType: "html",
    frequency: "quarterly",
  },
];
