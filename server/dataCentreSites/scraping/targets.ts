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
  frequency: "daily" | "weekly" | "monthly";
  render?: boolean;
}

export const SCRAPING_TARGETS: ScrapingTarget[] = [
  // Major operators (9)
  {
    operatorName: "Equinix",
    website: "equinix.com",
    scrapingUrl: "https://www.equinix.com/data-centers/",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["MW", "capacity", "megawatt", "power"],
      selectors: [".facility-card", ".dc-card", "[data-capacity]"],
    },
    parserType: "html",
    frequency: "monthly",
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
    dataType: "capacity",
    extractionHints: {
      keywords: ["MW", "capacity"],
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
    operatorName: "Verne Global",
    website: "verneglobal.com",
    scrapingUrl: "https://www.verneglobal.com/about/data-centers",
    country: "Iceland",
    dataType: "capacity",
    extractionHints: {
      keywords: ["MW", "power", "renewable"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Green Mountain",
    website: "greenmountain.no",
    scrapingUrl: "https://greenmountain.no/data-centre/",
    country: "Norway",
    dataType: "capacity",
    extractionHints: {
      keywords: ["MW", "capacity", "power"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "NorthC",
    website: "northc.com",
    scrapingUrl: "https://www.northc.se/en/data-centres/",
    country: "Sweden",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data centre", "facility"],
    },
    parserType: "html",
    frequency: "monthly",
  },

  // Regional operators (11)
  {
    operatorName: "EvoSwitch",
    website: "evoswitch.com",
    scrapingUrl: "https://www.evoswitch.com/en/locations",
    country: "Netherlands",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["Amsterdam", "facility", "location"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Echelon",
    website: "echelon.nl",
    scrapingUrl: "https://echelon.nl/en/locations",
    country: "Netherlands",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["Amsterdam", "Zwolle", "facility"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Telehouse",
    website: "telehouse.net",
    scrapingUrl: "https://www.telehouse.net/en/locations",
    country: "Multi",
    dataType: "facility_list",
    extractionHints: {
      keywords: ["data center", "location"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Scaleway",
    website: "scaleway.com",
    scrapingUrl: "https://www.scaleway.com/en/locations/",
    country: "Multi",
    dataType: "capacity",
    extractionHints: {
      keywords: ["availability zone", "region"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "QTS",
    website: "qtsdatacenters.com",
    scrapingUrl: "https://www.qtsdatacenters.com/locations",
    country: "USA",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data center", "location", "MW"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "Kao Data",
    website: "kaodata.com",
    scrapingUrl: "https://www.kaodata.com/data-centre/",
    country: "UK",
    dataType: "capacity",
    extractionHints: {
      keywords: ["power", "cooling"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "CyrusOne",
    website: "cyrusone.com",
    scrapingUrl: "https://cyrusone.com/data-centers/",
    country: "USA",
    dataType: "capacity",
    extractionHints: {
      keywords: ["data center", "facility"],
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
    operatorName: "atNorth",
    website: "atnorth.com",
    scrapingUrl: "https://atnorth.com/data-center/",
    country: "Iceland",
    dataType: "capacity",
    extractionHints: {
      keywords: ["power", "renewable"],
    },
    parserType: "html",
    frequency: "monthly",
  },
  {
    operatorName: "DigiPlex",
    website: "digiplex.com",
    scrapingUrl: "https://www.digiplex.com/en/locations/",
    country: "Nordic",
    dataType: "capacity",
    extractionHints: {
      keywords: ["facility", "location"],
    },
    parserType: "html",
    frequency: "monthly",
  },
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
    frequency: "monthly",
  },
];
