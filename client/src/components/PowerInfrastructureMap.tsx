import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, AlertTriangle, ZoomIn, ZoomOut, Factory,
  ChevronDown, X, Zap, Server, MapPin, Clock,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { CENTROIDS, INTERCONNECTORS } from "@/lib/gridConstants";
import UKPNDistributionLayer from "./UKPNDistributionLayer";
import NGEDNetworkLayer from "./NGEDNetworkLayer";

// ── euNetworks static reference data ────────────────────────────────────────
// Source: eunetworks.com public network documentation (2024)
// 18 dense metro fibre networks + long-haul backbone PoPs across 17 countries
const EU_NETWORKS_METROS: { name: string; lat: number; lng: number; dcs: number }[] = [
  { name: "London",     lat: 51.505,  lng: -0.090,  dcs: 140 },
  { name: "Manchester", lat: 53.481,  lng: -2.242,  dcs: 28  },
  { name: "Dublin",     lat: 53.349,  lng: -6.260,  dcs: 35  },
  { name: "Amsterdam",  lat: 52.374,  lng:  4.898,  dcs: 65  },
  { name: "Rotterdam",  lat: 51.921,  lng:  4.477,  dcs: 18  },
  { name: "Utrecht",    lat: 52.093,  lng:  5.119,  dcs: 12  },
  { name: "Frankfurt",  lat: 50.110,  lng:  8.682,  dcs: 95  },
  { name: "Cologne",    lat: 50.938,  lng:  6.960,  dcs: 22  },
  { name: "Düsseldorf", lat: 51.227,  lng:  6.773,  dcs: 20  },
  { name: "Hamburg",    lat: 53.550,  lng:  9.993,  dcs: 24  },
  { name: "Berlin",     lat: 52.520,  lng: 13.405,  dcs: 30  },
  { name: "Stuttgart",  lat: 48.775,  lng:  9.182,  dcs: 15  },
  { name: "Munich",     lat: 48.137,  lng: 11.575,  dcs: 28  },
  { name: "Paris",      lat: 48.856,  lng:  2.352,  dcs: 75  },
  { name: "Brussels",   lat: 50.850,  lng:  4.351,  dcs: 5   },
  { name: "Vienna",     lat: 48.208,  lng: 16.373,  dcs: 20  },
  { name: "Milan",      lat: 45.464,  lng:  9.189,  dcs: 35  },
  { name: "Madrid",     lat: 40.416,  lng: -3.703,  dcs: 22  },
];

const EU_NETWORKS_POPS: { name: string; lat: number; lng: number; note: string }[] = [
  { name: "Oslo",        lat: 59.913, lng:  10.752, note: "Long-haul PoP" },
  { name: "Copenhagen",  lat: 55.676, lng:  12.568, note: "Long-haul PoP" },
  { name: "Stockholm",   lat: 59.332, lng:  18.064, note: "Long-haul PoP" },
  { name: "Helsinki",    lat: 60.169, lng:  24.939, note: "Long-haul PoP" },
  { name: "Warsaw",      lat: 52.229, lng:  21.012, note: "Long-haul PoP (3 diverse routes)" },
  { name: "Zurich",      lat: 47.378, lng:   8.540, note: "Long-haul PoP" },
  { name: "Geneva",      lat: 46.204, lng:   6.143, note: "Long-haul PoP" },
  { name: "Lyon",        lat: 45.748, lng:   4.847, note: "Long-haul PoP" },
  { name: "Marseille",   lat: 43.296, lng:   5.369, note: "Subsea landing · Super Highway hub" },
  { name: "Lisbon",      lat: 38.717, lng:  -9.142, note: "Long-haul PoP" },
  { name: "Barcelona",   lat: 41.385, lng:   2.173, note: "Long-haul PoP" },
  { name: "Prague",      lat: 50.075, lng:  14.437, note: "Long-haul PoP" },
  { name: "Strasbourg",  lat: 48.574, lng:   7.752, note: "Long-haul PoP" },
  { name: "Bratislava",  lat: 48.148, lng:  17.107, note: "Long-haul PoP" },
];

// Key confirmed backbone routes [from, to] using city names
const EU_NETWORKS_ROUTES: [string, string][] = [
  // UK / Ireland
  ["London", "Manchester"],
  ["London", "Dublin"],       // Rockabill subsea cable
  ["London", "Amsterdam"],    // Scylla subsea cable
  // Benelux core
  ["Amsterdam", "Rotterdam"],
  ["Amsterdam", "Utrecht"],
  ["Amsterdam", "Brussels"],
  ["Amsterdam", "Frankfurt"],
  ["Amsterdam", "Hamburg"],
  ["Amsterdam", "Cologne"],
  ["Brussels", "Paris"],
  // Germany internal
  ["Frankfurt", "Cologne"],
  ["Frankfurt", "Düsseldorf"],
  ["Frankfurt", "Hamburg"],
  ["Frankfurt", "Berlin"],
  ["Frankfurt", "Stuttgart"],
  ["Frankfurt", "Munich"],
  ["Frankfurt", "Strasbourg"],
  ["Frankfurt", "Paris"],
  ["Hamburg", "Berlin"],
  ["Hamburg", "Copenhagen"],
  ["Cologne", "Düsseldorf"],
  // Central / Eastern Europe
  ["Frankfurt", "Prague"],
  ["Frankfurt", "Vienna"],
  ["Munich", "Vienna"],
  ["Vienna", "Bratislava"],
  ["Vienna", "Warsaw"],
  ["Berlin", "Warsaw"],
  ["Prague", "Vienna"],
  // Nordic
  ["Copenhagen", "Stockholm"],
  ["Stockholm", "Oslo"],
  ["Stockholm", "Helsinki"],
  // Southern Europe
  ["Frankfurt", "Zurich"],
  ["Stuttgart", "Zurich"],
  ["Zurich", "Geneva"],
  ["Zurich", "Milan"],
  ["Geneva", "Lyon"],
  ["Lyon", "Paris"],
  ["Lyon", "Marseille"],
  ["Milan", "Vienna"],
  // Iberia
  ["Paris", "Madrid"],
  ["Madrid", "Lisbon"],
  ["Madrid", "Barcelona"],
  ["Barcelona", "Lyon"],
];

// Build a lookup map for route coordinate resolution
function buildEuNetworksLookup() {
  const map = new Map<string, [number, number]>();
  EU_NETWORKS_METROS.forEach(c => map.set(c.name, [c.lat, c.lng]));
  EU_NETWORKS_POPS.forEach(c => map.set(c.name, [c.lat, c.lng]));
  return map;
}
const EU_NETWORKS_COORDS = buildEuNetworksLookup();

// ── Major city labels ─────────────────────────────────────────────────────
const MAJOR_CITIES: { name: string; lat: number; lng: number; size: "xl" | "lg" | "md" | "sm" }[] = [
  // Capital / tier-1 cities
  { name: "London",       lat: 51.505,  lng: -0.090,  size: "xl" },
  { name: "Paris",        lat: 48.856,  lng:  2.352,  size: "xl" },
  { name: "Berlin",       lat: 52.520,  lng: 13.405,  size: "xl" },
  { name: "Madrid",       lat: 40.416,  lng: -3.703,  size: "xl" },
  { name: "Rome",         lat: 41.902,  lng: 12.496,  size: "xl" },
  { name: "Amsterdam",    lat: 52.374,  lng:  4.897,  size: "xl" },
  { name: "Brussels",     lat: 50.850,  lng:  4.352,  size: "lg" },
  { name: "Warsaw",       lat: 52.230,  lng: 21.012,  size: "xl" },
  { name: "Dublin",       lat: 53.344,  lng: -6.267,  size: "xl" },
  { name: "Stockholm",    lat: 59.334,  lng: 18.063,  size: "xl" },
  { name: "Oslo",         lat: 59.913,  lng: 10.752,  size: "xl" },
  { name: "Copenhagen",   lat: 55.676,  lng: 12.568,  size: "xl" },
  { name: "Helsinki",     lat: 60.169,  lng: 24.938,  size: "xl" },
  { name: "Zürich",       lat: 47.378,  lng:  8.540,  size: "lg" },
  { name: "Lisbon",       lat: 38.716,  lng: -9.139,  size: "xl" },
  // Tier-2 cities
  { name: "Frankfurt",    lat: 50.111,  lng:  8.682,  size: "lg" },
  { name: "Munich",       lat: 48.137,  lng: 11.576,  size: "lg" },
  { name: "Hamburg",      lat: 53.550,  lng:  9.993,  size: "lg" },
  { name: "Düsseldorf",   lat: 51.225,  lng:  6.776,  size: "md" },
  { name: "Barcelona",    lat: 41.386,  lng:  2.170,  size: "lg" },
  { name: "Milan",        lat: 45.464,  lng:  9.189,  size: "lg" },
  { name: "Rotterdam",    lat: 51.922,  lng:  4.480,  size: "md" },
  { name: "Lyon",         lat: 45.748,  lng:  4.847,  size: "md" },
  { name: "Geneva",       lat: 46.205,  lng:  6.143,  size: "md" },
  { name: "Porto",        lat: 41.157,  lng: -8.629,  size: "md" },
  { name: "Gothenburg",   lat: 57.707,  lng: 11.967,  size: "md" },
  // UK regional cities
  { name: "Edinburgh",    lat: 55.953,  lng: -3.188,  size: "md" },
  { name: "Glasgow",      lat: 55.864,  lng: -4.252,  size: "md" },
  { name: "Manchester",   lat: 53.480,  lng: -2.242,  size: "md" },
  { name: "Birmingham",   lat: 52.483,  lng: -1.890,  size: "md" },
  { name: "Leeds",        lat: 53.801,  lng: -1.548,  size: "sm" },
  { name: "Bristol",      lat: 51.455,  lng: -2.587,  size: "sm" },
  { name: "Newcastle",    lat: 54.978,  lng: -1.617,  size: "sm" },
  { name: "Sheffield",    lat: 53.383,  lng: -1.470,  size: "sm" },
  { name: "Cardiff",      lat: 51.481,  lng: -3.180,  size: "sm" },
  { name: "Aberdeen",     lat: 57.149,  lng: -2.094,  size: "sm" },
  { name: "Reading",      lat: 51.454,  lng: -0.978,  size: "sm" },
  { name: "Southampton",  lat: 50.909,  lng: -1.405,  size: "sm" },
  { name: "Nottingham",   lat: 52.954,  lng: -1.158,  size: "sm" },
  { name: "Belfast",      lat: 54.597,  lng: -5.930,  size: "sm" },
];

// City → country mapping for euNetworks nodes
const EU_NETWORKS_CITY_COUNTRY: Record<string, string> = {
  London: "United Kingdom", Manchester: "United Kingdom", Dublin: "Ireland",
  Amsterdam: "Netherlands", Rotterdam: "Netherlands", Utrecht: "Netherlands",
  Frankfurt: "Germany", Cologne: "Germany", Düsseldorf: "Germany",
  Hamburg: "Germany", Berlin: "Germany", Stuttgart: "Germany", Munich: "Germany",
  Paris: "France", Lyon: "France", Marseille: "France", Strasbourg: "France",
  Brussels: "Belgium", Vienna: "Austria", Milan: "Italy", Madrid: "Spain",
  Barcelona: "Spain", Lisbon: "Portugal", Oslo: "Norway", Copenhagen: "Denmark",
  Stockholm: "Sweden", Helsinki: "Finland", Warsaw: "Poland", Zurich: "Switzerland",
  Geneva: "Switzerland", Prague: "Czech Republic", Bratislava: "Slovakia",
};

// Approximate bounding boxes [minLat, maxLat, minLng, maxLng] per country
const COUNTRY_BBOXES: Record<string, [number, number, number, number]> = {
  "United Kingdom":  [49.8, 60.9,  -8.2,   2.0],
  "Ireland":         [51.4, 55.4, -10.5,  -6.0],
  "Norway":          [57.9, 71.2,   4.6,  31.3],
  "Sweden":          [55.3, 69.1,  10.9,  24.2],
  "Finland":         [59.7, 70.1,  20.0,  31.6],
  "Denmark":         [54.6, 57.8,   8.0,  15.2],
  "Estonia":         [57.5, 59.7,  21.8,  28.2],
  "Latvia":          [55.7, 58.1,  20.8,  28.3],
  "Lithuania":       [53.9, 56.5,  20.9,  26.9],
  "Germany":         [47.3, 55.1,   5.9,  15.0],
  "Netherlands":     [50.7, 53.6,   3.3,   7.2],
  "Belgium":         [49.5, 51.5,   2.5,   6.4],
  "Luxembourg":      [49.4, 50.2,   5.7,   6.5],
  "France":          [41.3, 51.1,  -5.1,   9.6],
  "Switzerland":     [45.8, 47.8,   5.9,  10.5],
  "Austria":         [46.4, 49.0,   9.5,  17.2],
  "Spain":           [36.0, 43.8,  -9.3,   3.3],
  "Portugal":        [36.9, 42.2,  -9.5,  -6.2],
  "Poland":          [49.0, 54.9,  14.1,  24.1],
  "Czech Republic":  [48.5, 51.1,  12.1,  18.9],
  "Slovakia":        [47.7, 49.6,  16.8,  22.6],
  "Hungary":         [45.7, 48.6,  16.1,  22.9],
  "Italy":           [35.5, 47.1,   6.6,  18.5],
  "Slovenia":        [45.4, 46.9,  13.4,  16.6],
  "Croatia":         [42.4, 46.6,  13.5,  19.4],
  "Greece":          [34.8, 41.8,  19.4,  28.2],
  "Romania":         [43.6, 48.3,  22.0,  29.7],
  "Bulgaria":        [41.2, 44.2,  22.4,  28.6],
  "Serbia":          [42.2, 46.2,  18.8,  23.0],
  "Bosnia":          [42.5, 45.3,  15.7,  19.7],
  "Montenegro":      [41.8, 43.6,  18.4,  20.4],
  "North Macedonia": [40.8, 42.4,  20.4,  23.1],
  "Albania":         [39.6, 42.7,  19.3,  21.1],
  "Moldova":         [45.5, 48.5,  26.6,  30.1],
  "Turkey":          [36.0, 42.1,  25.7,  44.8],
};

function getCountryFromLatLng(lat: number, lng: number): string | null {
  // Check smaller/more specific countries first to reduce overlap mismatches
  const priority = [
    "Luxembourg", "Slovenia", "Montenegro", "North Macedonia", "Albania",
    "Moldova", "Bosnia", "Slovakia", "Belgium", "Netherlands", "Switzerland",
    "Croatia", "Austria", "Serbia", "Bulgaria", "Hungary", "Czech Republic",
    "Latvia", "Lithuania", "Estonia", "Denmark", "Ireland", "Portugal",
    "Greece", "Romania", "Poland", "Finland", "Sweden", "Norway",
    "United Kingdom", "Germany", "France", "Spain", "Italy", "Turkey",
  ];
  for (const country of priority) {
    const bbox = COUNTRY_BBOXES[country];
    if (!bbox) continue;
    const [minLat, maxLat, minLng, maxLng] = bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return country;
    }
  }
  return null;
}

interface GridPrimarySite {
  id: string;
  siteName: string;
  siteType: string;
  siteVoltage: number | null;
  licenceArea: string;
  maxDemandSummer: number | null;
  maxDemandWinter: number | null;
  transRatingSummer: string | null;
  siteClassification: string | null;
  county: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
}

interface SSENSubstation {
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

interface SSENHeadroomResult {
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

interface SSENDCSite {
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

interface SSENDCProbabilityResult {
  sites: SSENDCSite[];
  totalCount: number;
  highCount: number;
  mediumCount: number;
  fetchedAt: string;
}

interface NPGUtilisationSite {
  siteName: string;
  region: string;
  primarySubstation: string;
  postcode: string;
  transformerRatingKVA: number | null;
  currentUtilisationPct: number | null;
  utilisationBand: "Green" | "Amber" | "Red";
  lat: number;
  lng: number;
}

interface NPGUtilisationResult {
  sites: NPGUtilisationSite[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    green: number;
    amber: number;
    red: number;
  };
}

interface NPGConnectionQueueResult {
  items: { gsp: string; technologyType: string; queuedMW: number; lat: number | null; lng: number | null }[];
  totalCount: number;
  fetchedAt: string;
  byGSP: Record<string, { totalMW: number; technologies: { type: string; mw: number }[] }>;
}

interface ENWSubstation {
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

interface ENWHeadroomResult {
  substations: ENWSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: { green: number; amber: number; red: number; bspCount: number; pryCount: number };
}

interface NPGNDPSubstation {
  substationName: string;
  licenceArea: "NPgY" | "NPgN";
  substationType: "BSP" | "Primary";
  bspGroup: string;
  gspGroup: string;
  postcode: string;
  demandHeadroom2025: number;
  demandHeadroom2030: number;
  demandHeadroom2035: number;
  genHeadroom2025: number;
  genHeadroom2030: number;
  genHeadroom2035: number;
  demandBand: "Green" | "Amber" | "Red";
  lat: number;
  lng: number;
}

interface NPGNDPHeadroomResult {
  substations: NPGNDPSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: { yorkshire: number; northeast: number; green: number; amber: number; red: number };
}

interface UKPNDFESSubstation {
  substationName: string;
  licenceArea: "LPN" | "EPN" | "SPN";
  voltageKV: number | null;
  bspName: string;
  gspName: string;
  siteId: string;
  demandHeadroom2025: number;
  demandHeadroom2030: number;
  demandHeadroom2035: number;
  genInverterHeadroom2025: number;
  genSynchHeadroom2025: number;
  demandBand: "Green" | "Amber" | "Red";
  lat: number;
  lng: number;
}

interface UKPNDFESHeadroomResult {
  substations: UKPNDFESSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: { lpn: number; epn: number; spn: number; green: number; amber: number; red: number };
}

interface OneGLDatacentre {
  id: number;
  oneGLId: string;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  operator: string | null;
  capacityMW: number | null;
  tier: string | null;
  websiteUrl: string | null;
  scrapedAt: string | null;
  geoRegion: string | null;
  validation: string | null;
  source: "1gl" | null;
}

interface UKPNDataCentre {
  name: string;
  dcType: string;
  voltageLevel: string;
  avgUtilisation: number;
  maxUtilisation: number;
  readings: number;
}

interface UKPNDataCentreResult {
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

const UKPN_AREA_COORDS: [number, number][] = [
  [51.58, -0.25], [51.62, 0.05], [51.55, 0.20], [51.48, -0.10],
  [51.42, 0.12], [51.50, 0.35], [51.35, 0.50], [51.30, -0.05],
  [51.38, -0.30], [51.25, 0.25], [51.70, -0.15], [51.65, 0.30],
  [51.75, 0.10], [51.45, 0.45], [51.52, -0.40], [51.68, 0.45],
  [51.32, 0.35], [51.40, -0.20], [51.55, 0.55], [51.28, 0.10],
  [51.72, 0.25], [51.60, -0.35], [51.47, 0.60], [51.35, -0.15],
  [51.80, -0.05], [51.63, 0.50], [51.22, 0.30], [51.50, -0.50],
  [51.78, 0.35], [51.43, 0.70], [51.33, 0.55], [51.57, 0.65],
  [51.85, 0.15], [51.20, 0.45], [51.67, -0.40], [51.40, 0.50],
  [51.53, 0.75], [51.75, 0.55], [51.30, 0.65], [51.45, -0.35],
  [51.60, 0.40], [51.37, 0.15], [51.82, 0.30], [51.27, -0.05],
  [51.70, 0.60], [51.50, 0.80], [51.42, 0.30], [51.65, -0.20],
  [51.58, 0.10], [51.35, 0.75], [51.73, 0.40], [51.48, 0.55],
  [51.55, -0.15], [51.40, 0.65], [51.63, 0.15], [51.32, 0.45],
  [51.77, 0.20], [51.45, 0.40], [51.52, 0.30], [51.68, -0.10],
  [51.38, 0.55], [51.83, 0.05], [51.25, 0.55], [51.57, 0.45],
  [51.70, 0.50], [51.43, -0.25], [51.60, 0.60], [51.33, 0.20],
  [51.50, 0.65], [51.78, -0.15], [51.22, 0.15], [51.65, 0.70],
  [51.47, 0.20], [51.55, 0.50], [51.40, 0.80], [51.72, -0.30],
  [51.35, 0.30], [51.80, 0.45], [51.28, 0.40], [51.62, 0.35],
  [51.53, -0.05], [51.45, 0.75], [51.30, 0.50], [51.75, 0.30],
  [51.42, 0.45], [51.67, 0.55], [51.58, 0.70], [51.37, 0.40],
  [51.50, 0.50], [51.73, 0.15], [51.85, 0.25], [51.25, 0.20],
  [51.63, 0.65], [51.48, 0.35], [51.55, 0.40], [51.40, 0.10],
];

function getUtilColor(util: number): string {
  if (util >= 0.5) return "#dc2626";
  if (util >= 0.3) return "#f59e0b";
  if (util >= 0.1) return "#22c55e";
  return "#94a3b8";
}

interface PowerPlant {
  gppd_idnr: string;
  name: string;
  country_long: string;
  primary_fuel: string;
  capacity_mw: number;
  latitude: number;
  longitude: number;
  owner: string | null;
  generation_gwh: number | null;
  generation_year: number | null;
  capacity_factor: number | null;
}

const FUEL_COLORS: Record<string, string> = {
  Solar: "#eab308",
  Wind: "#06b6d4",
  Nuclear: "#a855f7",
  Gas: "#f97316",
  Coal: "#4b5563",
  Hydro: "#3b82f6",
  Biomass: "#22c55e",
  Oil: "#92400e",
  Other: "#d1d5db",
  Petcoke: "#4b5563",
  Cogeneration: "#f97316",
  Waste: "#84cc16",
  Geothermal: "#ef4444",
  Wave_and_Tidal: "#0ea5e9",
  Storage: "#8b5cf6",
};

const FUEL_TYPES = ["Solar", "Wind", "Nuclear", "Gas", "Coal", "Hydro", "Biomass", "Oil", "Other"] as const;

const ALL_COUNTRIES = Object.keys(CENTROIDS);

function getFuelColor(fuel: string): string {
  return FUEL_COLORS[fuel] || FUEL_COLORS.Other;
}

function getPlantRadius(capacityMw: number): number {
  if (capacityMw < 50) return 3;
  if (capacityMw < 200) return 5;
  if (capacityMw < 500) return 7;
  if (capacityMw < 1000) return 9;
  return 12;
}

interface PlantMeta {
  fuel: string;
  capacity: number;
  country: string;
}

const markerMeta = new WeakMap<L.CircleMarker, PlantMeta>();

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff; const ag = (ah >> 8) & 0xff; const ab2 = ah & 0xff;
  const br = (bh >> 16) & 0xff; const bg = (bh >> 8) & 0xff; const bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab2 + (bb - ab2) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b2).toString(16).slice(1)}`;
}

const PRICE_STOPS: [number, string][] = [
  [0,   "#0f6e26"],
  [40,  "#22a63f"],
  [80,  "#d4c000"],
  [130, "#d07800"],
  [200, "#c03010"],
  [280, "#a01460"],
  [400, "#780888"],
];

function priceToColor(price: number | null): string {
  if (price === null) return "#4b5563";
  if (price <= 0) return PRICE_STOPS[0][1];
  if (price >= 400) return PRICE_STOPS[PRICE_STOPS.length - 1][1];
  for (let i = 0; i < PRICE_STOPS.length - 1; i++) {
    const [p0, c0] = PRICE_STOPS[i];
    const [p1, c1] = PRICE_STOPS[i + 1];
    if (price >= p0 && price < p1) return lerpColor(c0, c1, (price - p0) / (p1 - p0));
  }
  return "#4b5563";
}

type MapSignal = "price" | "dc-density";

function normalizeFuel(fuel: string): string {
  if (FUEL_COLORS[fuel]) return fuel;
  const lower = fuel.toLowerCase();
  if (lower.includes("solar")) return "Solar";
  if (lower.includes("wind")) return "Wind";
  if (lower.includes("nuclear")) return "Nuclear";
  if (lower.includes("gas") || lower === "natural gas") return "Gas";
  if (lower.includes("coal") || lower.includes("lignite")) return "Coal";
  if (lower.includes("hydro")) return "Hydro";
  if (lower.includes("biomass")) return "Biomass";
  if (lower.includes("oil") || lower.includes("petrol") || lower.includes("diesel")) return "Oil";
  return "Other";
}

export default function PowerInfrastructureMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const dataLayersRef = useRef<L.Layer[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [enabledFuels, setEnabledFuels] = useState<Set<string>>(new Set(FUEL_TYPES));
  const [minCapacity, setMinCapacity] = useState(0);
  const [enabledCountries, setEnabledCountries] = useState<Set<string>>(
    new Set(["United Kingdom", "France", "Netherlands", "Sweden"])
  );

  const [ukpnGridSubs, setUkpnGridSubs] = useState(false);
  const [ukpnConnQueue, setUkpnConnQueue] = useState(false);
  const [ukpnFaultLevels, setUkpnFaultLevels] = useState(false);
  const [showGridPrimary, setShowGridPrimary] = useState(false);

  const powerPlantLayerRef = useRef<L.LayerGroup | null>(null);
  const powerPlantMarkersRef = useRef<L.CircleMarker[]>([]);

  const [showUkpnLayer, setShowUkpnLayer] = useState(false);
  const [showSSENLayer, setShowSSENLayer] = useState(false);
  const [showNPGLayer, setShowNPGLayer] = useState(false);
  const [showNPGQueue, setShowNPGQueue] = useState(false);
  const [showNGEDCapacity, setShowNGEDCapacity] = useState(false);
  const [showNGEDOpportunity, setShowNGEDOpportunity] = useState(false);
  const [showENWLayer, setShowENWLayer] = useState(false);
  const [showNDPLayer, setShowNDPLayer] = useState(false);
  const [showDFESLayer, setShowDFESLayer] = useState(false);
  const [showSSENDCLayer, setShowSSENDCLayer] = useState(false);
  const [showOneGLLayer, setShowOneGLLayer] = useState(true);
  const [showEuNetworksLayer, setShowEuNetworksLayer] = useState(false);
  const [showEmodnetWindLayer, setShowEmodnetWindLayer] = useState(false);
  const [showEmodnetCablesLayer, setShowEmodnetCablesLayer] = useState(true);
  const [showSubmarineCablesLayer, setShowSubmarineCablesLayer] = useState(true);
  const [showCityLabelsLayer, setShowCityLabelsLayer] = useState(true);
  const ukpnLayerRef = useRef<L.LayerGroup | null>(null);
  const gridPrimaryLayerRef = useRef<L.LayerGroup | null>(null);
  const ssenLayerRef = useRef<L.LayerGroup | null>(null);
  const ssenDCLayerRef = useRef<L.LayerGroup | null>(null);
  const npgLayerRef = useRef<L.LayerGroup | null>(null);
  const npgQueueLayerRef = useRef<L.LayerGroup | null>(null);
  const enwLayerRef = useRef<L.LayerGroup | null>(null);
  const ndpLayerRef = useRef<L.LayerGroup | null>(null);
  const dfesLayerRef = useRef<L.LayerGroup | null>(null);
  const oneGLLayerRef = useRef<L.LayerGroup | null>(null);
  const euNetworksLayerRef = useRef<L.LayerGroup | null>(null);
  const emodnetWindLayerRef = useRef<L.LayerGroup | null>(null);
  const emodnetCablesLayerRef = useRef<L.LayerGroup | null>(null);
  const submarineCablesLayerRef = useRef<L.LayerGroup | null>(null);
  const cityLabelsLayerRef = useRef<L.LayerGroup | null>(null);

  // Choropleth / signal state
  const [activeSignal, setActiveSignal] = useState<MapSignal>("price");
  const choroplethLayerRef = useRef<L.LayerGroup | null>(null);
  const priceLabelLayerRef = useRef<L.LayerGroup | null>(null);

  // Isochrone tool state
  const [isochroneMode, setIsochroneMode] = useState(false);
  const [isochroneProfile, setIsochroneProfile] = useState<"driving-car" | "driving-hgv" | "cycling-regular" | "foot-walking">("driving-car");
  const [isochroneRanges, setIsochroneRanges] = useState([900, 1800, 3600]); // 15/30/60 min
  const [isochroneLoading, setIsochroneLoading] = useState(false);
  const [isochroneError, setIsochroneError] = useState<string | null>(null);
  const [isochronePoint, setIsochronePoint] = useState<{ lat: number; lng: number } | null>(null);
  const isochroneLayerRef = useRef<L.LayerGroup | null>(null);
  const isochronePinRef = useRef<L.Marker | null>(null);

  const { data: ukpnData, isLoading: isUkpnLoading, error: ukpnError } = useQuery<UKPNDataCentreResult>({
    queryKey: ["/api/ukpn/datacentres"],
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
    enabled: showUkpnLayer,
  });

  const { data: gridPrimaryData, isLoading: isGridPrimaryLoading, error: gridPrimaryError } = useQuery<GridPrimarySite[]>({
    queryKey: ["/api/ukpn/grid-primary-sites"],
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
    enabled: showGridPrimary,
  });

  const { data: ssenData, isLoading: isSSENLoading, error: ssenError } = useQuery<SSENHeadroomResult>({
    queryKey: ["/api/ssen/headroom"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showSSENLayer,
  });

  const { data: ssenDCData, isLoading: isSSENDCLoading, error: ssenDCError } = useQuery<SSENDCProbabilityResult>({
    queryKey: ["/api/ssen/dc-probability"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showSSENDCLayer,
  });

  const { data: npgData, isLoading: isNPGLoading, error: npgError } = useQuery<NPGUtilisationResult>({
    queryKey: ["/api/npg/utilisation"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showNPGLayer,
  });

  const { data: npgQueueData, isLoading: isNPGQueueLoading, error: npgQueueError } = useQuery<NPGConnectionQueueResult>({
    queryKey: ["/api/npg/connection-queue"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showNPGQueue,
  });

  const { data: enwData, isLoading: isENWLoading, error: enwError } = useQuery<ENWHeadroomResult>({
    queryKey: ["/api/enw/headroom"],
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
    enabled: showENWLayer,
  });

  const { data: ndpData, isLoading: isNDPLoading, error: ndpError } = useQuery<NPGNDPHeadroomResult>({
    queryKey: ["/api/npg/ndp-headroom"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showNDPLayer,
  });

  const { data: dfesData, isLoading: isDFESLoading, error: dfesError } = useQuery<UKPNDFESHeadroomResult>({
    queryKey: ["/api/ukpn/dfes-headroom"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showDFESLayer,
  });

  const { isLoading: isNGEDCapLoading, error: ngedCapError } = useQuery({
    queryKey: ["/api/nged/network-capacity"],
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
    enabled: showNGEDCapacity,
  });

  const { isLoading: isNGEDOppLoading, error: ngedOppError } = useQuery({
    queryKey: ["/api/nged/opportunity-map"],
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
    enabled: showNGEDOpportunity,
  });

  const { data: oneGLData, isLoading: isOneGLLoading, error: oneGLError } = useQuery<OneGLDatacentre[]>({
    queryKey: ["/api/1gl/datacentres?v=9"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 1,
    enabled: showOneGLLayer,
  });

  const { data: emodnetWindData, isLoading: isEmodnetWindLoading, error: emodnetWindError } = useQuery<any>({
    queryKey: ["/api/emodnet/windfarms"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showEmodnetWindLayer,
  });

  const { data: emodnetCablesData, isLoading: isEmodnetCablesLoading, error: emodnetCablesError } = useQuery<any>({
    queryKey: ["/api/emodnet/powercables"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showEmodnetCablesLayer,
  });

  const { data: subCablesGeoData, isLoading: isSubCablesLoading, error: subCablesError } = useQuery<any>({
    queryKey: ["/api/submarine-cables/cables"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showSubmarineCablesLayer,
  });

  const { data: subLandingGeoData, isLoading: isSubLandingLoading, error: subLandingError } = useQuery<any>({
    queryKey: ["/api/submarine-cables/landing-points"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: showSubmarineCablesLayer,
  });

  const { data: powerPlants, isLoading: isPlantsLoading, error: plantsError } = useQuery<PowerPlant[]>({
    queryKey: ["/api/powerplants"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const { data: allPricesData } = useQuery<{ country: string; latestMonthAvg: number | null; code: string }[]>({
    queryKey: ["/api/entsoe/all-prices"],
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const { data: euroGeoData } = useQuery<any>({
    queryKey: ["/api/geo/europe"],
    staleTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const filteredPlants = useMemo(() => {
    if (!powerPlants) return [];
    return powerPlants.filter(p => {
      if (p.latitude == null || p.longitude == null) return false;
      const fuel = normalizeFuel(p.primary_fuel);
      return enabledFuels.has(fuel) && p.capacity_mw >= minCapacity && enabledCountries.has(p.country_long);
    });
  }, [powerPlants, enabledFuels, minCapacity, enabledCountries]);

  const capacitySummary = useMemo(() => {
    const summary: Record<string, number> = {};
    for (const p of filteredPlants) {
      const fuel = normalizeFuel(p.primary_fuel);
      summary[fuel] = (summary[fuel] || 0) + p.capacity_mw;
    }
    return Object.entries(summary)
      .sort(([, a], [, b]) => b - a)
      .map(([fuel, mw]) => ({ fuel, mw }));
  }, [filteredPlants]);

  const totalCapacity = useMemo(() => capacitySummary.reduce((s, c) => s + c.mw, 0), [capacitySummary]);

  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    mapContainerRef.current = node;
    const map = L.map(node, {
      center: [52.5, 4],
      zoom: 5,
      minZoom: 3,
      maxZoom: 19,
      zoomControl: false,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    // Create a dedicated pane for the choropleth, below the default overlayPane (400) but above tiles (200)
    map.createPane("choroplethPane");
    map.getPane("choroplethPane")!.style.zIndex = "250";
    map.getPane("choroplethPane")!.style.pointerEvents = "auto";

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Labels overlay — fades in at zoom ≥ 10 to show street/place names at higher zoom levels
    const labelsLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      attribution: '',
      maxZoom: 19,
      pane: "overlayPane",
      opacity: 0,
    }).addTo(map);

    const updateLabelsOpacity = () => {
      const z = map.getZoom();
      labelsLayer.setOpacity(z >= 10 ? 1 : 0);
    };
    map.on("zoomend", updateLabelsOpacity);

    // City labels — permanent base layer, hidden when tile labels take over at high zoom
    const cityLabelMarkers: L.Marker[] = [];
    const CITY_LABELS: { name: string; lat: number; lng: number; tier: 1 | 2 | 3 }[] = [
      // Tier 1: country capitals + major DC metros
      { name: "London",     lat: 51.505,  lng: -0.09,   tier: 1 },
      { name: "Paris",      lat: 48.856,  lng: 2.352,   tier: 1 },
      { name: "Berlin",     lat: 52.52,   lng: 13.405,  tier: 1 },
      { name: "Madrid",     lat: 40.416,  lng: -3.703,  tier: 1 },
      { name: "Rome",       lat: 41.902,  lng: 12.496,  tier: 1 },
      { name: "Amsterdam",  lat: 52.374,  lng: 4.898,   tier: 1 },
      { name: "Brussels",   lat: 50.85,   lng: 4.351,   tier: 1 },
      { name: "Warsaw",     lat: 52.229,  lng: 21.012,  tier: 1 },
      { name: "Dublin",     lat: 53.349,  lng: -6.26,   tier: 1 },
      { name: "Stockholm",  lat: 59.332,  lng: 18.064,  tier: 1 },
      { name: "Oslo",       lat: 59.913,  lng: 10.752,  tier: 1 },
      { name: "Copenhagen", lat: 55.676,  lng: 12.568,  tier: 1 },
      { name: "Helsinki",   lat: 60.169,  lng: 24.939,  tier: 1 },
      { name: "Zürich",     lat: 47.378,  lng: 8.540,   tier: 1 },
      { name: "Lisbon",     lat: 38.717,  lng: -9.142,  tier: 1 },
      // Tier 2: major regional & DC hub cities
      { name: "Frankfurt",  lat: 50.11,   lng: 8.682,   tier: 2 },
      { name: "Munich",     lat: 48.137,  lng: 11.575,  tier: 2 },
      { name: "Hamburg",    lat: 53.55,   lng: 9.993,   tier: 2 },
      { name: "Düsseldorf", lat: 51.227,  lng: 6.773,   tier: 2 },
      { name: "Barcelona",  lat: 41.385,  lng: 2.173,   tier: 2 },
      { name: "Milan",      lat: 45.464,  lng: 9.189,   tier: 2 },
      { name: "Rotterdam",  lat: 51.921,  lng: 4.477,   tier: 2 },
      { name: "Lyon",       lat: 45.748,  lng: 4.847,   tier: 2 },
      { name: "Geneva",     lat: 46.204,  lng: 6.143,   tier: 2 },
      { name: "Porto",      lat: 41.157,  lng: -8.629,  tier: 2 },
      { name: "Gothenburg", lat: 57.706,  lng: 11.967,  tier: 2 },
      { name: "Edinburgh",  lat: 55.953,  lng: -3.188,  tier: 2 },
      { name: "Glasgow",    lat: 55.861,  lng: -4.251,  tier: 2 },
      { name: "Manchester", lat: 53.481,  lng: -2.242,  tier: 2 },
      { name: "Birmingham", lat: 52.480,  lng: -1.903,  tier: 2 },
      // Tier 3: UK regional & DC-relevant cities
      { name: "Leeds",       lat: 53.800,  lng: -1.549, tier: 3 },
      { name: "Bristol",     lat: 51.454,  lng: -2.587, tier: 3 },
      { name: "Newcastle",   lat: 54.978,  lng: -1.618, tier: 3 },
      { name: "Sheffield",   lat: 53.381,  lng: -1.470, tier: 3 },
      { name: "Cardiff",     lat: 51.483,  lng: -3.179, tier: 3 },
      { name: "Aberdeen",    lat: 57.149,  lng: -2.097, tier: 3 },
      { name: "Reading",     lat: 51.454,  lng: -0.973, tier: 3 },
      { name: "Southampton", lat: 50.909,  lng: -1.404, tier: 3 },
      { name: "Nottingham",  lat: 52.954,  lng: -1.158, tier: 3 },
      { name: "Belfast",     lat: 54.597,  lng: -5.930, tier: 3 },
    ];

    CITY_LABELS.forEach(({ name, lat, lng, tier }) => {
      const fs = tier === 1 ? "11px" : tier === 2 ? "10px" : "9px";
      const fw = tier === 1 ? "600" : "500";
      const color = tier === 1 ? "#1e293b" : tier === 2 ? "#374151" : "#4b5563";
      const icon = L.divIcon({
        className: "",
        iconSize: [1, 1],
        iconAnchor: [0, 0],
        html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-family:system-ui,sans-serif;font-size:${fs};font-weight:${fw};color:${color};text-shadow:0 0 3px rgba(255,255,255,1),0 0 6px rgba(255,255,255,0.8);pointer-events:none;user-select:none;letter-spacing:0.03em">${name}</span>`,
      });
      const m = L.marker([lat, lng], { icon, interactive: false, keyboard: false, zIndexOffset: -1000 }).addTo(map);
      cityLabelMarkers.push(m);
    });

    // Hide custom city label markers when zoomed in — tile labels take over at zoom ≥ 10
    const updateCityLabels = () => {
      const z = map.getZoom();
      cityLabelMarkers.forEach(m => {
        const el = m.getElement();
        if (el) el.style.display = z >= 10 ? "none" : "";
      });
    };
    map.on("zoomend", updateCityLabels);

    mapRef.current = map;
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    dataLayersRef.current.forEach(l => map.removeLayer(l));
    dataLayersRef.current = [];

    for (const ic of INTERCONNECTORS) {
      const a = CENTROIDS[ic.from];
      const b = CENTROIDS[ic.to];
      if (!a || !b) continue;
      const weight = Math.max(1.5, Math.min(5, ic.capacityMw / 1000));
      const line = L.polyline([a, b], {
        color: "#3b82f6",
        weight,
        opacity: 0.55,
        dashArray: "5 4",
      });
      line.bindTooltip(
        `<strong>${ic.label}</strong><br/>NTC ≈ ${ic.capacityMw.toLocaleString()} MW`,
        { sticky: true, className: "leaflet-tooltip-ic" }
      );
      line.on("click", () => {
        line.openTooltip();
      });
      line.addTo(map);
      dataLayersRef.current.push(line);
    }
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!ukpnLayerRef.current) {
      ukpnLayerRef.current = L.layerGroup();
    }
    const layerGroup = ukpnLayerRef.current;
    layerGroup.clearLayers();

    if (showUkpnLayer && enabledCountries.has("United Kingdom") && ukpnData?.dataCentres) {
      layerGroup.addTo(map);
      ukpnData.dataCentres.forEach((dc, i) => {
        const coords = UKPN_AREA_COORDS[i % UKPN_AREA_COORDS.length];
        const utilPct = Math.round(dc.avgUtilisation * 100);
        const maxPct = Math.round(dc.maxUtilisation * 100);
        const color = getUtilColor(dc.avgUtilisation);

        const dcIcon = L.divIcon({
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -12],
          html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:#f59e0b;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
              <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
            </svg>
          </div>`,
        });

        const marker = L.marker(coords, { icon: dcIcon });

        const utilBar = `<div style="margin-top:6px">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:2px">
            <span>Avg utilisation</span>
            <span style="font-weight:700;color:${color}">${utilPct}%</span>
          </div>
          <div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden">
            <div style="background:${color};height:100%;width:${Math.min(utilPct, 100)}%;border-radius:3px"></div>
          </div>
        </div>`;

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(dc.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">UKPN Licence Area</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b"></span>
              <span style="font-size:12px;font-weight:600">${escapeHtml(dc.dcType)}</span>
            </div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Voltage:</strong> ${escapeHtml(dc.voltageLevel)}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Max utilisation:</strong> ${maxPct}%</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Readings:</strong> ${dc.readings.toLocaleString()}</div>
            ${utilBar}
          </div>`,
          { maxWidth: 280 }
        );

        marker.addTo(layerGroup);
      });
    } else {
      map.removeLayer(layerGroup);
    }
  }, [mapReady, showUkpnLayer, ukpnData, enabledCountries]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!oneGLLayerRef.current) {
      oneGLLayerRef.current = L.layerGroup();
    }
    const layer = oneGLLayerRef.current;
    layer.clearLayers();

    if (showOneGLLayer && oneGLData?.length) {
      layer.addTo(map);
      for (const dc of oneGLData) {
        if (dc.lat == null || dc.lng == null) continue;
        const dcCountry = getCountryFromLatLng(dc.lat, dc.lng);
        if (dcCountry && !enabledCountries.has(dcCountry)) continue;

        const oneGLIcon = L.divIcon({
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -12],
          html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:#7c3aed;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
              <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
              <line x1="6" x2="6.01" y1="6" y2="6"/>
              <line x1="6" x2="6.01" y1="18" y2="18"/>
            </svg>
          </div>`,
        });

        const marker = L.marker([dc.lat, dc.lng], { icon: oneGLIcon });

        const details: string[] = [];
        if (dc.operator) details.push(`<div style="font-size:12px;margin-bottom:2px"><strong>Operator:</strong> ${escapeHtml(dc.operator)}</div>`);
        if (dc.capacityMW != null) details.push(`<div style="font-size:12px;margin-bottom:2px"><strong>Capacity:</strong> ${dc.capacityMW} MW</div>`);
        if (dc.tier) details.push(`<div style="font-size:12px;margin-bottom:2px"><strong>Status:</strong> ${escapeHtml(dc.tier)}</div>`);
        const region = dc.geoRegion || dc.country;
        if (region) details.push(`<div style="font-size:12px;margin-bottom:2px"><strong>Region:</strong> ${escapeHtml(region)}</div>`);
        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(dc.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">1GigLabs DC Dataset</div>
            ${details.join("")}
          </div>`,
          { maxWidth: 280 }
        );

        marker.addTo(layer);
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showOneGLLayer, oneGLData, enabledCountries]);

  // ── euNetworks fibre overlay ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!euNetworksLayerRef.current) {
      euNetworksLayerRef.current = L.layerGroup();
    }
    const layer = euNetworksLayerRef.current;
    layer.clearLayers();

    if (showEuNetworksLayer) {
      layer.addTo(map);

      const ROUTE_COLOR = "#6366f1";   // indigo
      const METRO_COLOR = "#4f46e5";   // indigo-700
      const POP_COLOR   = "#a5b4fc";   // indigo-300

      // Backbone routes — show if at least one endpoint is in an enabled country
      EU_NETWORKS_ROUTES.forEach(([fromName, toName]) => {
        const fromCoord = EU_NETWORKS_COORDS.get(fromName);
        const toCoord   = EU_NETWORKS_COORDS.get(toName);
        if (!fromCoord || !toCoord) return;
        const fromCountry = EU_NETWORKS_CITY_COUNTRY[fromName];
        const toCountry   = EU_NETWORKS_CITY_COUNTRY[toName];
        const fromEnabled = !fromCountry || enabledCountries.has(fromCountry);
        const toEnabled   = !toCountry   || enabledCountries.has(toCountry);
        if (!fromEnabled && !toEnabled) return;
        L.polyline([fromCoord, toCoord], {
          color: ROUTE_COLOR,
          weight: 1.5,
          opacity: 0.55,
          dashArray: undefined,
        }).addTo(layer);
      });

      // Metro city markers — filtered by enabled countries
      EU_NETWORKS_METROS.forEach(city => {
        const cityCountry = EU_NETWORKS_CITY_COUNTRY[city.name];
        if (cityCountry && !enabledCountries.has(cityCountry)) return;
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:12px;height:12px;border-radius:3px;
            background:${METRO_COLOR};border:2px solid white;
            box-shadow:0 1px 4px rgba(79,70,229,0.6);
          "></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const marker = L.marker([city.lat, city.lng], { icon });
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:160px">
            <div style="font-size:12px;font-weight:700;color:#4f46e5;margin-bottom:4px">
              euNetworks Metro — ${city.name}
            </div>
            <div style="font-size:11px;color:#374151;margin-bottom:2px">
              <b>Type:</b> Dense Fibre Metro Network
            </div>
            <div style="font-size:11px;color:#374151;margin-bottom:6px">
              <b>Connected DCs:</b> ~${city.dcs}+
            </div>
            <div style="font-size:10px;color:#6b7280">
              eunetworks.com · Reference data 2024
            </div>
          </div>
        `);
        marker.addTo(layer);
      });

      // Backbone PoP markers — filtered by enabled countries
      EU_NETWORKS_POPS.forEach(pop => {
        const popCountry = EU_NETWORKS_CITY_COUNTRY[pop.name];
        if (popCountry && !enabledCountries.has(popCountry)) return;
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:8px;height:8px;border-radius:50%;
            background:${POP_COLOR};border:1.5px solid #6366f1;
            box-shadow:0 1px 3px rgba(99,102,241,0.4);
          "></div>`,
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        });
        const marker = L.marker([pop.lat, pop.lng], { icon });
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:160px">
            <div style="font-size:12px;font-weight:700;color:#6366f1;margin-bottom:4px">
              euNetworks PoP — ${pop.name}
            </div>
            <div style="font-size:11px;color:#374151;margin-bottom:2px">
              <b>Type:</b> Long-Haul Backbone Node
            </div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${pop.note}</div>
            <div style="font-size:10px;color:#6b7280">
              eunetworks.com · Reference data 2024
            </div>
          </div>
        `);
        marker.addTo(layer);
      });
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showEuNetworksLayer, enabledCountries]);

  // ── EMODnet offshore wind farms ───────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    if (!emodnetWindLayerRef.current) emodnetWindLayerRef.current = L.layerGroup();
    const layer = emodnetWindLayerRef.current;
    layer.clearLayers();

    if (showEmodnetWindLayer && emodnetWindData?.features?.length) {
      layer.addTo(map);
      const STATUS_COLOR: Record<string, string> = {
        Production:  "#16a34a",
        Construction:"#f59e0b",
        Approved:    "#0ea5e9",
        Planned:     "#6366f1",
        Dismantled:  "#94a3b8",
      };
      emodnetWindData.features.forEach((f: any) => {
        const p = f.properties;
        const coords = f.geometry?.coordinates;
        if (!coords) return;
        const [lng, lat] = coords;
        const windCountry = getCountryFromLatLng(lat, lng);
        if (windCountry && !enabledCountries.has(windCountry)) return;
        const status = p.status || "Unknown";
        const color = STATUS_COLOR[status] || "#94a3b8";
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:10px;height:10px;border-radius:50%;
            background:${color};border:2px solid white;
            box-shadow:0 1px 3px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        const marker = L.marker([lat, lng], { icon });
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:180px">
            <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:4px">
              ${p.name || "Unnamed Wind Farm"}
            </div>
            <div style="margin-bottom:6px">
              <span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:600;color:white;background:${color}">
                ${status}
              </span>
            </div>
            <table style="font-size:11px;color:#374151;border-collapse:collapse;width:100%">
              ${p.country ? `<tr><td style="padding:1px 4px 1px 0;color:#6b7280">Country</td><td><b>${p.country}</b></td></tr>` : ""}
              ${p.power_mw ? `<tr><td style="padding:1px 4px 1px 0;color:#6b7280">Capacity</td><td><b>${p.power_mw} MW</b></td></tr>` : ""}
              ${p.n_turbines ? `<tr><td style="padding:1px 4px 1px 0;color:#6b7280">Turbines</td><td><b>${p.n_turbines}</b></td></tr>` : ""}
              ${p.type_inst ? `<tr><td style="padding:1px 4px 1px 0;color:#6b7280">Type</td><td>${p.type_inst}</td></tr>` : ""}
              ${p.year ? `<tr><td style="padding:1px 4px 1px 0;color:#6b7280">Year</td><td>${p.year}</td></tr>` : ""}
              ${p.dist_coast ? `<tr><td style="padding:1px 4px 1px 0;color:#6b7280">Dist. coast</td><td>${Math.round(p.dist_coast / 1000)} km</td></tr>` : ""}
            </table>
            <div style="font-size:10px;color:#6b7280;margin-top:6px">EMODnet Human Activities · ${new Date().getFullYear()}</div>
          </div>
        `);
        marker.addTo(layer);
      });
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showEmodnetWindLayer, emodnetWindData, enabledCountries]);

  // ── EMODnet submarine power cables ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    if (!emodnetCablesLayerRef.current) emodnetCablesLayerRef.current = L.layerGroup();
    const layer = emodnetCablesLayerRef.current;
    layer.clearLayers();

    if (showEmodnetCablesLayer && emodnetCablesData?.features?.length) {
      layer.addTo(map);
      const SOURCE_COLOR: Record<string, string> = {
        pcablesbshcontis: "#f59e0b",
        pcablesshom:      "#f59e0b",
        pcablesrijks:     "#f59e0b",
        pcablesnve:       "#f59e0b",
      };
      emodnetCablesData.features.forEach((f: any) => {
        if (!f.geometry) return;
        const p = f.properties;
        const color = SOURCE_COLOR[p.source] ?? "#f59e0b";
        const line = L.geoJSON(f, {
          style: {
            color,
            weight: 2,
            opacity: 0.7,
          },
        });
        if (p.name || p.featuretyp) {
          line.bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">
                Submarine Power Cable
              </div>
              ${p.name ? `<div style="font-size:11px;color:#374151;margin-bottom:2px"><b>${p.name}</b></div>` : ""}
              ${p.featuretyp ? `<div style="font-size:11px;color:#6b7280;margin-bottom:2px">${p.featuretyp.replace(/_/g," ")}</div>` : ""}
              ${p.status ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">Status: ${p.status}</div>` : ""}
              <div style="font-size:10px;color:#6b7280">EMODnet Human Activities · ${new Date().getFullYear()}</div>
            </div>
          `);
        }
        line.addTo(layer);
      });
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showEmodnetCablesLayer, emodnetCablesData]);

  // ── Isochrone tool: click handler & map cursor ────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const container = map.getContainer();
    container.style.cursor = isochroneMode ? "crosshair" : "";

    const handleClick = async (e: L.LeafletMouseEvent) => {
      if (!isochroneMode) return;
      const { lat, lng } = e.latlng;
      setIsochronePoint({ lat, lng });
      setIsochroneError(null);
      setIsochroneLoading(true);

      // Clear old layers
      if (isochroneLayerRef.current) {
        isochroneLayerRef.current.clearLayers();
      } else {
        isochroneLayerRef.current = L.layerGroup().addTo(map);
      }
      if (isochronePinRef.current) {
        map.removeLayer(isochronePinRef.current);
      }

      // Place pin
      const pinIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:#1d4ed8;border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      isochronePinRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);

      try {
        const resp = await fetch("/api/ors/isochrones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ lng, lat, ranges: isochroneRanges, profile: isochroneProfile }),
        });
        if (!resp.ok) throw new Error((await resp.json()).message || "ORS error");
        const geojson = await resp.json();

        // Colour per zone (outermost first so inner sits on top)
        const ZONE_COLORS = ["#bfdbfe", "#93c5fd", "#3b82f6", "#1d4ed8"];
        const sorted = [...(geojson.features || [])].sort(
          (a: any, b: any) => b.properties.value - a.properties.value
        );
        const layer = isochroneLayerRef.current!;
        layer.clearLayers();
        sorted.forEach((feature: any, i: number) => {
          const mins = Math.round(feature.properties.value / 60);
          const color = ZONE_COLORS[i] ?? "#3b82f6";
          const area = feature.properties.area ? `${Math.round(feature.properties.area)} km²` : "";
          L.geoJSON(feature, {
            style: {
              fillColor: color,
              fillOpacity: 0.18,
              color: color,
              weight: 1.5,
              opacity: 0.7,
            },
          })
          .bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:4px">
                ${mins}-minute drive zone
              </div>
              ${area ? `<div style="font-size:11px;color:#374151">Approx. area: <b>${area}</b></div>` : ""}
              <div style="font-size:11px;color:#374151">Profile: ${isochroneProfile.replace("-", " ")}</div>
              <div style="font-size:10px;color:#6b7280;margin-top:4px">OpenRouteService · HEIGit</div>
            </div>
          `)
          .addTo(layer);
        });
      } catch (err: any) {
        setIsochroneError(err.message || "Failed to generate isochrones");
      } finally {
        setIsochroneLoading(false);
      }
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); container.style.cursor = ""; };
  }, [mapReady, isochroneMode, isochroneProfile, isochroneRanges]);

  // Clear isochrone layer when mode turned off
  useEffect(() => {
    if (!isochroneMode && mapRef.current) {
      if (isochroneLayerRef.current) {
        isochroneLayerRef.current.clearLayers();
        mapRef.current.removeLayer(isochroneLayerRef.current);
        isochroneLayerRef.current = null;
      }
      if (isochronePinRef.current) {
        mapRef.current.removeLayer(isochronePinRef.current);
        isochronePinRef.current = null;
      }
      setIsochronePoint(null);
      setIsochroneError(null);
    }
  }, [isochroneMode]);

  // ── Submarine telecom cables (submarinecablemap.com) ──────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    if (!submarineCablesLayerRef.current) submarineCablesLayerRef.current = L.layerGroup();
    const layer = submarineCablesLayerRef.current;
    layer.clearLayers();

    if (showSubmarineCablesLayer && (subCablesGeoData?.features?.length || subLandingGeoData?.features?.length)) {
      layer.addTo(map);

      if (subCablesGeoData?.features?.length) {
        subCablesGeoData.features.forEach((f: any) => {
          if (!f.geometry) return;
          const p = f.properties;
          const color = p.color || "#3b82f6";
          const line = L.geoJSON(f, {
            style: { color, weight: 2, opacity: 0.6 },
          });
          line.bindPopup(() => {
            const container = document.createElement("div");
            container.style.fontFamily = "system-ui";
            container.style.minWidth = "180px";
            const nameDiv = document.createElement("div");
            nameDiv.style.cssText = "font-size:12px;font-weight:700;color:#1e40af;margin-bottom:4px";
            nameDiv.textContent = p.name || "Submarine Cable";
            container.appendChild(nameDiv);
            const detailDiv = document.createElement("div");
            detailDiv.style.cssText = "font-size:10px;color:#6b7280;margin-bottom:4px";
            detailDiv.setAttribute("data-detail", "loading");
            detailDiv.textContent = "Loading details…";
            container.appendChild(detailDiv);
            const sourceDiv = document.createElement("div");
            sourceDiv.style.cssText = "font-size:10px;color:#6b7280";
            sourceDiv.textContent = "submarinecablemap.com";
            container.appendChild(sourceDiv);
            if (p.id) {
              fetch(`/api/submarine-cables/cable/${encodeURIComponent(p.id)}`, { credentials: "include" })
                .then(r => r.ok ? r.json() : null)
                .then(detail => {
                  const el = container.querySelector("[data-detail]");
                  if (!el || !detail) { if (el) el.textContent = ""; return; }
                  const frag = document.createDocumentFragment();
                  const rowStyle = "font-size:11px;color:#374151;margin-bottom:2px";
                  function addRow(label: string, value: string) {
                    const d = document.createElement("div");
                    d.setAttribute("style", rowStyle);
                    const b = document.createElement("b");
                    b.textContent = label;
                    d.appendChild(b);
                    d.appendChild(document.createTextNode(value));
                    frag.appendChild(d);
                  }
                  if (detail.owners?.length) {
                    addRow("Operators: ", detail.owners.map((o: any) => o.name).join(", "));
                  }
                  if (detail.rfs) {
                    addRow("RFS: ", String(detail.rfs));
                  }
                  if (detail.length) {
                    addRow("Length: ", String(detail.length));
                  }
                  if (detail.landing_points?.length) {
                    addRow("Landing points: ", String(detail.landing_points.length));
                  }
                  el.textContent = "";
                  el.appendChild(frag);
                })
                .catch(() => {
                  const el = container.querySelector("[data-detail]");
                  if (el) el.textContent = "";
                });
            }
            return container;
          });
          line.addTo(layer);
        });
      }

      if (subLandingGeoData?.features?.length) {
        subLandingGeoData.features.forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const p = f.properties;
          const [lng, lat] = f.geometry.coordinates;
          const marker = L.circleMarker([lat, lng], {
            radius: 3,
            fillColor: "#1e40af",
            fillOpacity: 0.8,
            color: "#ffffff",
            weight: 1,
          });
          const nameParts = (p.name || "").split(", ");
          const stationName = nameParts[0] || "Landing Station";
          const country = nameParts.slice(1).join(", ") || "";
          marker.bindPopup(`
            <div style="font-family:system-ui;min-width:140px">
              <div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:4px">
                Landing Station
              </div>
              <div style="font-size:11px;color:#374151;margin-bottom:2px"><b>${escapeHtml(stationName)}</b></div>
              ${country ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">${escapeHtml(country)}</div>` : ""}
              <div style="font-size:10px;color:#6b7280">submarinecablemap.com</div>
            </div>
          `);
          marker.addTo(layer);
        });
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showSubmarineCablesLayer, subCablesGeoData, subLandingGeoData]);

  // ── Major city labels ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    if (!cityLabelsLayerRef.current) cityLabelsLayerRef.current = L.layerGroup();
    const layer = cityLabelsLayerRef.current;
    layer.clearLayers();

    if (showCityLabelsLayer) {
      layer.addTo(map);
      const FONT_SIZE: Record<string, string> = { xl: "12px", lg: "11px", md: "10px", sm: "9px" };
      const DOT_SIZE:  Record<string, string> = { xl: "6px",  lg: "5px",  md: "4px",  sm: "3px" };
      const WEIGHT:    Record<string, string> = { xl: "700",  lg: "600",  md: "600",  sm: "500" };
      MAJOR_CITIES.forEach(city => {
        const fs   = FONT_SIZE[city.size];
        const ds   = DOT_SIZE[city.size];
        const fw   = WEIGHT[city.size];
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            display:flex;align-items:center;gap:3px;
            pointer-events:none;white-space:nowrap;
          ">
            <div style="
              width:${ds};height:${ds};border-radius:50%;
              background:#1e3a5f;border:1px solid rgba(255,255,255,0.8);
              flex-shrink:0;
            "></div>
            <span style="
              font-family:system-ui,sans-serif;font-size:${fs};font-weight:${fw};
              color:#1e3a5f;
              text-shadow:
                1px  1px 0 rgba(255,255,255,0.9),
               -1px  1px 0 rgba(255,255,255,0.9),
                1px -1px 0 rgba(255,255,255,0.9),
               -1px -1px 0 rgba(255,255,255,0.9),
                0    1px 0 rgba(255,255,255,0.9),
                0   -1px 0 rgba(255,255,255,0.9);
              letter-spacing:0.01em;
            ">${city.name}</span>
          </div>`,
          iconSize: undefined,
          iconAnchor: [0, 0],
        });
        L.marker([city.lat, city.lng], { icon, interactive: false, zIndexOffset: -100 })
          .addTo(layer);
      });
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showCityLabelsLayer]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!gridPrimaryLayerRef.current) {
      gridPrimaryLayerRef.current = L.layerGroup();
    }
    const layer = gridPrimaryLayerRef.current;
    layer.clearLayers();

    if (showGridPrimary && gridPrimaryData && gridPrimaryData.length > 0) {
      layer.addTo(map);
      for (const site of gridPrimaryData) {
        const isGrid = site.siteType.toLowerCase().includes("grid");
        const color = isGrid ? "#7c3aed" : "#2563eb";
        const radius = isGrid ? 6 : 4;

        const summerDemand = site.maxDemandSummer != null ? `${site.maxDemandSummer} MVA` : "–";
        const winterDemand = site.maxDemandWinter != null ? `${site.maxDemandWinter} MVA` : "–";
        const voltage = site.siteVoltage != null ? `${site.siteVoltage} kV` : "–";
        const classification = site.siteClassification || "–";
        const location = [site.county, site.postcode].filter(Boolean).join(", ") || site.licenceArea;

        const marker = L.circleMarker([site.lat, site.lng], {
          radius,
          fillColor: color,
          fillOpacity: 0.8,
          color: "#fff",
          weight: 1,
          opacity: 0.9,
        });

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:210px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(site.siteName)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">${escapeHtml(location)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span style="font-size:12px;font-weight:600;color:#374151">${escapeHtml(site.siteType)}</span>
            </div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Voltage:</strong> ${voltage}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>DNO Area:</strong> ${escapeHtml(site.licenceArea)}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Max demand (summer):</strong> ${summerDemand}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Max demand (winter):</strong> ${winterDemand}</div>
            <div style="font-size:11px;color:#64748b"><strong>Classification:</strong> ${classification}</div>
          </div>`,
          { maxWidth: 300 }
        );

        marker.addTo(layer);
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showGridPrimary, gridPrimaryData]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!ssenLayerRef.current) {
      ssenLayerRef.current = L.layerGroup();
    }
    const layer = ssenLayerRef.current;
    layer.clearLayers();

    if (showSSENLayer && enabledCountries.has("United Kingdom") && ssenData?.substations?.length) {
      layer.addTo(map);

      const ragColor = (rag: string) =>
        rag === "Green" ? "#22c55e" : rag === "Amber" ? "#f59e0b" : "#ef4444";
      const typeRadius = (t: string) =>
        t === "GSP" ? 8 : t === "BSP" ? 6 : 4;

      for (const s of ssenData.substations) {
        const color = ragColor(s.demandRAG);
        const radius = typeRadius(s.substationType);

        const marker = L.circleMarker([s.lat, s.lng], {
          radius,
          fillColor: color,
          fillOpacity: 0.85,
          color: "#fff",
          weight: 1,
          opacity: 0.9,
        });

        const fmtMva = (v: number | null) => v != null ? `${v.toFixed(1)} MVA` : "–";
        const fmtMw = (v: number | null) => v != null ? `${v.toFixed(1)} MW` : "–";
        const ragBadge = (rag: string) => {
          const c = ragColor(rag);
          return `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:${c}20;color:${c};font-size:10px;font-weight:700;border:1px solid ${c}40">${rag}</span>`;
        };

        const upstream = s.substationType === "GSP"
          ? ""
          : `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Upstream GSP:</strong> ${escapeHtml(s.upstreamGSP)}</div>`;
        const bspLine = s.substationType === "Primary" && s.upstreamBSP !== "N/A"
          ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Upstream BSP:</strong> ${escapeHtml(s.upstreamBSP)}</div>`
          : "";
        const reinforceBlock = s.upstreamWorks || s.substationWorks
          ? `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #f1f5f9">
              <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:2px">Reinforcement Works</div>
              ${s.upstreamWorks ? `<div style="font-size:10px;color:#374151">${escapeHtml(s.upstreamWorks)}${s.upstreamWorksDate ? ` (${escapeHtml(s.upstreamWorksDate)})` : ""}</div>` : ""}
              ${s.substationWorks ? `<div style="font-size:10px;color:#374151">${escapeHtml(s.substationWorks)}${s.substationWorksDate ? ` (${escapeHtml(s.substationWorksDate)})` : ""}</div>` : ""}
            </div>`
          : "";

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:230px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:1px">${escapeHtml(s.substation)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:5px">${escapeHtml(s.area)} · ${escapeHtml(s.substationType)} · ${escapeHtml(s.voltage)} kV</div>
            ${upstream}${bspLine}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:5px">
              <div style="background:#f8fafc;border-radius:6px;padding:5px">
                <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:2px">DEMAND</div>
                <div style="margin-bottom:2px">${ragBadge(s.demandRAG)}</div>
                <div style="font-size:10px;color:#374151">Headroom: <strong>${fmtMva(s.demandHeadroom)}</strong></div>
                <div style="font-size:10px;color:#64748b">Max: ${fmtMva(s.maxDemand)}</div>
                ${s.demandConstraint ? `<div style="font-size:9px;color:#94a3b8;margin-top:2px">${escapeHtml(s.demandConstraint)}</div>` : ""}
              </div>
              <div style="background:#f8fafc;border-radius:6px;padding:5px">
                <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:2px">GENERATION</div>
                <div style="margin-bottom:2px">${ragBadge(s.genRAG)}</div>
                <div style="font-size:10px;color:#374151">Headroom: <strong>${fmtMw(s.genHeadroom)}</strong></div>
                <div style="font-size:10px;color:#64748b">Connected: ${fmtMw(s.connectedGeneration)}</div>
                ${s.genConstraint ? `<div style="font-size:9px;color:#94a3b8;margin-top:2px">${escapeHtml(s.genConstraint)}</div>` : ""}
              </div>
            </div>
            ${s.transformerRatings ? `<div style="font-size:10px;color:#64748b;margin-bottom:2px"><strong>Transformers:</strong> ${escapeHtml(s.transformerRatings)}</div>` : ""}
            ${s.faultLevel != null ? `<div style="font-size:10px;color:#64748b;margin-bottom:2px"><strong>Fault level:</strong> ${s.faultLevel} kA (rating: ${s.faultRating ?? "–"} kA)</div>` : ""}
            ${reinforceBlock}
          </div>`,
          { maxWidth: 320 }
        );

        marker.addTo(layer);
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showSSENLayer, ssenData, enabledCountries]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!ssenDCLayerRef.current) ssenDCLayerRef.current = L.layerGroup();
    const layer = ssenDCLayerRef.current;
    layer.clearLayers();

    if (showSSENDCLayer && enabledCountries.has("United Kingdom") && ssenDCData?.sites?.length) {
      layer.addTo(map);

      for (const s of ssenDCData.sites) {
        const bandColor = (grade: string) =>
          grade === "High" ? "#7c3aed" : "#a78bfa";
        const bg = bandColor(s.grade);

        const dcIcon = L.divIcon({
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -13],
          html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:${bg};border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
              <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
            </svg>
          </div>`,
        });

        const fmtMva = (v: number | null) => v != null ? `${v.toFixed(1)} MVA` : "–";
        const ragColor = (r: string) =>
          r === "Green" ? "#22c55e" : r === "Amber" ? "#f59e0b" : "#ef4444";
        const ragBadge = (rag: string) => {
          const c = ragColor(rag);
          return `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:${c}20;color:${c};font-size:10px;font-weight:700;border:1px solid ${c}40">${rag}</span>`;
        };

        const signalsList = s.signals
          .map(sig => `<li style="margin-bottom:2px">${escapeHtml(sig)}</li>`)
          .join("");

        const reinforceBlock = s.upstreamWorks || s.substationWorks
          ? `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #f1f5f9">
              <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:2px">Reinforcement Works</div>
              ${s.upstreamWorks ? `<div style="font-size:10px;color:#374151">${escapeHtml(s.upstreamWorks)}</div>` : ""}
              ${s.substationWorks ? `<div style="font-size:10px;color:#374151">${escapeHtml(s.substationWorks)}</div>` : ""}
            </div>`
          : "";

        const marker = L.marker([s.lat, s.lng], { icon: dcIcon });
        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:250px;padding:2px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <div style="font-size:13px;font-weight:700;color:#1e293b">${escapeHtml(s.substation)}</div>
              <span style="display:inline-block;padding:1px 7px;border-radius:10px;background:${bg}20;color:${bg};font-size:10px;font-weight:700;border:1px solid ${bg}60">${s.grade} probability</span>
            </div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">${escapeHtml(s.area)} · ${escapeHtml(s.substationType)} · ${escapeHtml(s.voltage)} kV · Score: ${s.score}/9</div>
            ${s.upstreamGSP ? `<div style="font-size:10px;color:#64748b;margin-bottom:2px"><strong>GSP:</strong> ${escapeHtml(s.upstreamGSP)}</div>` : ""}
            ${s.upstreamBSP && s.upstreamBSP !== "N/A" ? `<div style="font-size:10px;color:#64748b;margin-bottom:4px"><strong>BSP:</strong> ${escapeHtml(s.upstreamBSP)}</div>` : ""}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px">
              <div style="background:#f8fafc;border-radius:5px;padding:5px">
                <div style="font-size:9px;font-weight:600;color:#94a3b8;margin-bottom:2px">DEMAND RAG</div>
                ${ragBadge(s.demandRAG)}
                <div style="font-size:10px;color:#374151;margin-top:2px">Headroom: <strong>${fmtMva(s.demandHeadroom)}</strong></div>
              </div>
              <div style="background:#f8fafc;border-radius:5px;padding:5px">
                <div style="font-size:9px;font-weight:600;color:#94a3b8;margin-bottom:2px">CONTRACTED</div>
                <div style="font-size:12px;font-weight:700;color:#1e293b">${fmtMva(s.contractedDemand)}</div>
                <div style="font-size:10px;color:#64748b">Max obs: ${fmtMva(s.maxDemand)}</div>
              </div>
            </div>
            <div style="margin-bottom:5px">
              <div style="font-size:10px;font-weight:700;color:#7c3aed;margin-bottom:4px">DC Likelihood Signals</div>
              <ul style="margin:0;padding-left:14px;font-size:10px;color:#374151;line-height:1.6">${signalsList}</ul>
            </div>
            ${reinforceBlock}
            <div style="font-size:9px;color:#94a3b8;margin-top:5px;padding-top:4px;border-top:1px solid #f1f5f9">
              Inferred from SSEN headroom + ECR data. Unverified.
            </div>
          </div>`,
          { maxWidth: 340 }
        );
        marker.addTo(layer);
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showSSENDCLayer, ssenDCData, enabledCountries]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!npgLayerRef.current) {
      npgLayerRef.current = L.layerGroup();
    }
    const layer = npgLayerRef.current;
    layer.clearLayers();

    if (showNPGLayer && enabledCountries.has("United Kingdom") && npgData?.sites?.length) {
      layer.addTo(map);

      const bandColor = (band: string) =>
        band === "Green" ? "#22c55e" : band === "Amber" ? "#f59e0b" : "#ef4444";

      for (const site of npgData.sites) {
        const color = bandColor(site.utilisationBand);

        const marker = L.circleMarker([site.lat, site.lng], {
          radius: 5,
          fillColor: color,
          fillOpacity: 0.85,
          color: "#fff",
          weight: 1,
          opacity: 0.9,
        });

        const utilPct = site.currentUtilisationPct != null ? `${site.currentUtilisationPct.toFixed(1)}%` : "–";
        const ratingKVA = site.transformerRatingKVA != null ? `${site.transformerRatingKVA.toLocaleString()} kVA` : "–";
        const bandBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:${color}20;color:${color};font-size:10px;font-weight:700;border:1px solid ${color}40">${site.utilisationBand}</span>`;

        const utilBar = site.currentUtilisationPct != null
          ? `<div style="margin-top:6px">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:2px">
                <span>Current utilisation</span>
                <span style="font-weight:700;color:${color}">${utilPct}</span>
              </div>
              <div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden">
                <div style="background:${color};height:100%;width:${Math.min(site.currentUtilisationPct, 100)}%;border-radius:3px"></div>
              </div>
            </div>`
          : "";

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:210px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:1px">${escapeHtml(site.siteName)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:5px">${escapeHtml(site.region)} · Northern Power Grid</div>
            <div style="margin-bottom:5px">${bandBadge}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Transformer rating:</strong> ${ratingKVA}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Current utilisation:</strong> ${utilPct}</div>
            ${site.primarySubstation ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Primary substation:</strong> ${escapeHtml(site.primarySubstation)}</div>` : ""}
            ${site.postcode ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Postcode:</strong> ${escapeHtml(site.postcode)}</div>` : ""}
            ${utilBar}
          </div>`,
          { maxWidth: 300 }
        );

        marker.addTo(layer);
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showNPGLayer, npgData, enabledCountries]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!npgQueueLayerRef.current) {
      npgQueueLayerRef.current = L.layerGroup();
    }
    const layer = npgQueueLayerRef.current;
    layer.clearLayers();

    if (showNPGQueue && npgQueueData?.byGSP) {
      layer.addTo(map);

      const gspEntries = Object.entries(npgQueueData.byGSP);
      const maxMW = Math.max(...gspEntries.map(([, v]) => v.totalMW), 1);

      const gspCoords: Record<string, { lat: number; lng: number }> = {};
      for (const item of npgQueueData.items) {
        if (item.lat != null && item.lng != null && !gspCoords[item.gsp]) {
          gspCoords[item.gsp] = { lat: item.lat, lng: item.lng };
        }
      }

      for (const [gspName, gspInfo] of gspEntries) {
        const coords = gspCoords[gspName];
        if (!coords) continue;

        const radius = Math.max(4, Math.min(14, (gspInfo.totalMW / maxMW) * 14));

        const marker = L.circleMarker([coords.lat, coords.lng], {
          radius,
          fillColor: "#8b5cf6",
          fillOpacity: 0.7,
          color: "#fff",
          weight: 1.5,
          opacity: 0.9,
        });

        const techRows = gspInfo.technologies
          .sort((a, b) => b.mw - a.mw)
          .map(t => `<div style="display:flex;justify-content:space-between;font-size:11px;padding:1px 0"><span>${escapeHtml(t.type)}</span><span style="font-weight:600">${t.mw.toFixed(1)} MW</span></div>`)
          .join("");

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:1px">${escapeHtml(gspName)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:5px">NPg Connection Queue</div>
            <div style="font-size:12px;font-weight:600;margin-bottom:4px">Total queued: ${gspInfo.totalMW.toFixed(1)} MW</div>
            <div style="border-top:1px solid #e2e8f0;padding-top:4px;margin-top:4px">
              <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:3px">BY TECHNOLOGY</div>
              ${techRows}
            </div>
          </div>`,
          { maxWidth: 300 }
        );

        marker.addTo(layer);
      }
    } else {
      map.removeLayer(layer);
    }
  }, [mapReady, showNPGQueue, npgQueueData]);

  // ENW Network Headroom layer
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!enwLayerRef.current) enwLayerRef.current = L.layerGroup();
    const layer = enwLayerRef.current;
    layer.clearLayers();

    const bandColor = (band: string) =>
      band === "Green" ? "#22c55e" : band === "Amber" ? "#f59e0b" : "#ef4444";

    if (showENWLayer && enabledCountries.has("United Kingdom") && enwData?.substations?.length) {
      for (const sub of enwData.substations) {
        const color = bandColor(sub.demandBand);
        const isBSP = sub.substationType === "BSP";
        const mw = sub.demHrFirmMW ?? 0;
        const radius = isBSP
          ? Math.max(7, Math.min(20, 7 + Math.log1p(mw) * 1.8))
          : Math.max(4, Math.min(12, 4 + Math.log1p(mw) * 1.3));

        const marker = L.circleMarker([sub.lat, sub.lng], {
          radius,
          color,
          fillColor: color,
          fillOpacity: 0.75,
          weight: isBSP ? 2 : 1.5,
          opacity: 1,
        });

        const fmt = (v: number | null, unit = "MW") =>
          v != null ? `${v.toFixed(1)} ${unit}` : "N/A";
        const bandBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:${color}20;color:${color};font-size:10px;font-weight:700;border:1px solid ${color}40">${sub.demandBand}</span>`;
        const voltLabel = sub.voltageKV != null ? `${sub.voltageKV}kV` : "";

        marker.bindPopup(`
          <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:220px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${sub.substationType} ${sub.number} ${voltLabel}</div>
            <div style="margin-bottom:8px">${bandBadge}</div>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="color:#64748b;padding:2px 0">Demand HR (Firm)</td><td style="text-align:right;font-weight:600">${fmt(sub.demHrFirmMW)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Demand HR (Non-Firm)</td><td style="text-align:right;font-weight:600">${fmt(sub.demHrNonFirmMW)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR (Inverter)</td><td style="text-align:right;font-weight:600">${fmt(sub.genHrInverterMW)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR (Synchronous)</td><td style="text-align:right;font-weight:600">${fmt(sub.genHrSynchronousMW)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Battery Storage HR</td><td style="text-align:right;font-weight:600">${fmt(sub.battStorageHrMW)}</td></tr>
              ${sub.circuitMVA != null ? `<tr><td style="color:#64748b;padding:2px 0">Circuit Rating</td><td style="text-align:right;font-weight:600">${fmt(sub.circuitMVA, "MVA")}</td></tr>` : ""}
            </table>
            <div style="font-size:10px;color:#94a3b8;margin-top:6px;border-top:1px solid #f1f5f9;padding-top:4px">Electricity North West · NW England</div>
          </div>
        `);

        marker.addTo(layer);
      }
      layer.addTo(mapRef.current);
    } else {
      mapRef.current.removeLayer(layer);
    }
  }, [mapReady, showENWLayer, enwData, enabledCountries]);

  // NPg NDP Headroom layer (Yorkshire + Northeast, public data)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!ndpLayerRef.current) ndpLayerRef.current = L.layerGroup();
    const layer = ndpLayerRef.current;
    layer.clearLayers();

    const bandColor = (band: string) =>
      band === "Green" ? "#22c55e" : band === "Amber" ? "#f59e0b" : "#ef4444";

    if (showNDPLayer && ndpData?.substations?.length) {
      const fmt = (v: number) => `${v.toFixed(1)} MW`;
      for (const sub of ndpData.substations) {
        const color = bandColor(sub.demandBand);
        const isBSP = sub.substationType === "BSP";
        const radius = isBSP
          ? Math.max(8, Math.min(22, 8 + Math.log1p(sub.demandHeadroom2025) * 2))
          : Math.max(5, Math.min(14, 5 + Math.log1p(sub.demandHeadroom2025) * 1.5));

        const marker = L.circleMarker([sub.lat, sub.lng], {
          radius,
          color: "#fff",
          weight: isBSP ? 2 : 1,
          fillColor: color,
          fillOpacity: 0.8,
        });

        const areaLabel = sub.licenceArea === "NPgY" ? "Yorkshire" : "NE England";
        marker.bindPopup(`
          <div style="min-width:200px;font-family:sans-serif">
            <div style="font-size:12px;font-weight:700;margin-bottom:4px">${sub.substationName}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:6px">${sub.substationType} · ${areaLabel} · ${sub.postcode}</div>
            <div style="font-size:10px;margin-bottom:4px;color:#64748b">BSP: ${sub.bspGroup} · GSP: ${sub.gspGroup}</div>
            <table style="font-size:11px;width:100%;border-collapse:collapse">
              <tr><td style="color:#64748b;padding:2px 0">Demand HR 2025</td><td style="text-align:right;font-weight:600">${fmt(sub.demandHeadroom2025)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Demand HR 2030</td><td style="text-align:right;font-weight:600">${fmt(sub.demandHeadroom2030)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Demand HR 2035</td><td style="text-align:right;font-weight:600">${fmt(sub.demandHeadroom2035)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR 2025</td><td style="text-align:right;font-weight:600">${fmt(sub.genHeadroom2025)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR 2030</td><td style="text-align:right;font-weight:600">${fmt(sub.genHeadroom2030)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR 2035</td><td style="text-align:right;font-weight:600">${fmt(sub.genHeadroom2035)}</td></tr>
            </table>
            <div style="font-size:10px;color:#94a3b8;margin-top:6px;border-top:1px solid #f1f5f9;padding-top:4px">Northern Power Grid NDP · Reference Scenario</div>
          </div>
        `);
        marker.addTo(layer);
      }
      layer.addTo(mapRef.current);
    } else {
      mapRef.current.removeLayer(layer);
    }
  }, [mapReady, showNDPLayer, ndpData]);

  // UKPN DFES Headroom layer (London, Eastern, South Eastern)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!dfesLayerRef.current) dfesLayerRef.current = L.layerGroup();
    const layer = dfesLayerRef.current;
    layer.clearLayers();

    const bandColor = (band: string) =>
      band === "Green" ? "#22c55e" : band === "Amber" ? "#f59e0b" : "#ef4444";

    const areaLabel: Record<string, string> = { LPN: "London", EPN: "Eastern", SPN: "South Eastern" };

    if (showDFESLayer && dfesData?.substations?.length) {
      const fmt = (v: number) => `${v.toFixed(1)} MW`;
      for (const sub of dfesData.substations) {
        const color = bandColor(sub.demandBand);
        const radius = Math.max(5, Math.min(18, 5 + Math.log1p(sub.demandHeadroom2025) * 1.8));

        const marker = L.circleMarker([sub.lat, sub.lng], {
          radius,
          color: "#fff",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.82,
        });

        const area = areaLabel[sub.licenceArea] ?? sub.licenceArea;
        const kv = sub.voltageKV != null ? `${sub.voltageKV} kV` : "";
        marker.bindPopup(`
          <div style="min-width:210px;font-family:sans-serif">
            <div style="font-size:12px;font-weight:700;margin-bottom:4px">${sub.substationName}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:6px">${area} · ${kv}</div>
            <div style="font-size:10px;margin-bottom:4px;color:#64748b">BSP: ${sub.bspName} · GSP: ${sub.gspName}</div>
            <table style="font-size:11px;width:100%;border-collapse:collapse">
              <tr><td style="color:#64748b;padding:2px 0">Demand HR 2025</td><td style="text-align:right;font-weight:600">${fmt(sub.demandHeadroom2025)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Demand HR 2030</td><td style="text-align:right;font-weight:600">${fmt(sub.demandHeadroom2030)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Demand HR 2035</td><td style="text-align:right;font-weight:600">${fmt(sub.demandHeadroom2035)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR (Inverter)</td><td style="text-align:right;font-weight:600">${fmt(sub.genInverterHeadroom2025)}</td></tr>
              <tr><td style="color:#64748b;padding:2px 0">Gen HR (Synch)</td><td style="text-align:right;font-weight:600">${fmt(sub.genSynchHeadroom2025)}</td></tr>
            </table>
            <div style="font-size:10px;color:#94a3b8;margin-top:6px;border-top:1px solid #f1f5f9;padding-top:4px">UKPN DFES · Electric Engagement · 2025</div>
          </div>
        `);
        marker.addTo(layer);
      }
      layer.addTo(mapRef.current);
    } else {
      mapRef.current.removeLayer(layer);
    }
  }, [mapReady, showDFESLayer, dfesData]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !powerPlants) return;
    const map = mapRef.current;

    if (!powerPlantLayerRef.current) {
      powerPlantLayerRef.current = L.layerGroup().addTo(map);
    }
    const layerGroup = powerPlantLayerRef.current;
    layerGroup.clearLayers();
    const markers: L.CircleMarker[] = [];

    for (const plant of powerPlants) {
      if (plant.latitude == null || plant.longitude == null) continue;
      const fuel = normalizeFuel(plant.primary_fuel);
      const color = getFuelColor(fuel);
      const radius = getPlantRadius(plant.capacity_mw);
      const marker = L.circleMarker([plant.latitude, plant.longitude], {
        radius,
        fillColor: color,
        fillOpacity: 0.7,
        color: "#fff",
        weight: 1,
        opacity: 0.9,
      });
      const safeName = escapeHtml(plant.name);
      const safeCountry = escapeHtml(plant.country_long);
      const safeOwner = plant.owner ? escapeHtml(plant.owner) : null;

      // Capacity factor bar
      const cf = plant.capacity_factor ?? null;
      const genGwh = plant.generation_gwh ?? null;
      const genYear = plant.generation_year ?? null;
      const cfPct = cf != null ? Math.round(cf * 100) : null;
      const cfColor = cf == null ? "#94a3b8"
        : cf >= 0.7 ? "#16a34a"
        : cf >= 0.4 ? "#ca8a04"
        : "#dc2626";
      const cfBar = cfPct != null
        ? `<div style="margin-top:6px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:2px">
              <span>Capacity factor (${genYear})</span>
              <span style="font-weight:700;color:${cfColor}">${cfPct}%</span>
            </div>
            <div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden">
              <div style="background:${cfColor};height:100%;width:${Math.min(cfPct,100)}%;border-radius:3px"></div>
            </div>
          </div>`
        : `<div style="font-size:10px;color:#94a3b8;margin-top:4px">No generation data available</div>`;
      const genLine = genGwh != null
        ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Generation (${genYear}):</strong> ${genGwh.toLocaleString()} GWh/yr</div>`
        : "";

      marker.bindPopup(
        `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px">${safeName}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${safeCountry}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="font-size:12px;font-weight:600">${fuel}</span>
          </div>
          <div style="font-size:12px;margin-bottom:2px"><strong>Installed capacity:</strong> ${plant.capacity_mw.toLocaleString()} MW</div>
          ${genLine}
          ${safeOwner ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Owner:</strong> ${safeOwner}</div>` : ""}
          ${cfBar}
        </div>`,
        { maxWidth: 280 }
      );
      markerMeta.set(marker, { fuel, capacity: plant.capacity_mw, country: plant.country_long });
      markers.push(marker);
    }
    powerPlantMarkersRef.current = markers;
    applyFilters(layerGroup, markers, enabledFuels, minCapacity, enabledCountries);
  }, [mapReady, powerPlants]);

  useEffect(() => {
    if (!powerPlantLayerRef.current) return;
    applyFilters(powerPlantLayerRef.current, powerPlantMarkersRef.current, enabledFuels, minCapacity, enabledCountries);
  }, [enabledFuels, minCapacity, enabledCountries]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Choropleth + price labels ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !euroGeoData) return;

    // Build price lookup by country name
    const priceByCountry: Record<string, number | null> = {};
    if (allPricesData) {
      for (const entry of allPricesData) {
        priceByCountry[entry.country] = entry.latestMonthAvg;
      }
    }

    // Remove existing choropleth + label layers
    if (choroplethLayerRef.current) {
      map.removeLayer(choroplethLayerRef.current);
      choroplethLayerRef.current = null;
    }
    if (priceLabelLayerRef.current) {
      map.removeLayer(priceLabelLayerRef.current);
      priceLabelLayerRef.current = null;
    }

    const choroplethGroup = L.layerGroup().addTo(map);
    choroplethLayerRef.current = choroplethGroup;

    L.geoJSON(euroGeoData, {
      pane: "choroplethPane",
      style: (feature: any) => {
        const country = feature?.properties?.country as string;
        const price = priceByCountry[country] ?? null;
        const fill = priceToColor(price);
        return {
          fillColor: fill,
          fillOpacity: price !== null ? 0.60 : 0.25,
          color: "#1a1a2e",
          weight: 0.8,
          opacity: 0.7,
          pane: "choroplethPane",
        };
      },
      onEachFeature: (feature: any, layer: L.Layer) => {
        const country = feature?.properties?.country as string;
        const price = priceByCountry[country] ?? null;
        (layer as L.Path).bindTooltip(
          `<div style="font-family:system-ui;font-size:12px;font-weight:600;color:#f1f5f9">${country}</div>` +
          `<div style="font-size:11px;color:#94a3b8">${price !== null ? `€${price.toFixed(0)}/MWh` : "No price data"}</div>`,
          { sticky: true, className: "dark-map-tooltip" }
        );
      },
    }).addTo(choroplethGroup);

    // Price labels at centroids
    const labelGroup = L.layerGroup().addTo(map);
    priceLabelLayerRef.current = labelGroup;

    for (const [country, [lat, lng]] of Object.entries(CENTROIDS)) {
      const price = priceByCountry[country];
      if (price == null) continue;
      const label = L.divIcon({
        className: "",
        html: `<div style="
          font-family:system-ui,sans-serif;font-size:11px;font-weight:700;
          color:#ffffff;text-shadow:0 1px 3px rgba(0,0,0,0.8),0 0 6px rgba(0,0,0,0.6);
          white-space:nowrap;pointer-events:none;letter-spacing:0.02em;
        ">€${Math.round(price)}</div>`,
        iconSize: [44, 16],
        iconAnchor: [22, 8],
      });
      L.marker([lat, lng], { icon: label, interactive: false, zIndexOffset: -50 }).addTo(labelGroup);
    }

    return () => {
      if (choroplethLayerRef.current) {
        map.removeLayer(choroplethLayerRef.current);
        choroplethLayerRef.current = null;
      }
      if (priceLabelLayerRef.current) {
        map.removeLayer(priceLabelLayerRef.current);
        priceLabelLayerRef.current = null;
      }
    };
  }, [mapReady, euroGeoData, allPricesData, activeSignal]);

  const toggleFuel = useCallback((fuel: string) => {
    setEnabledFuels(prev => {
      const next = new Set(prev);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return next;
    });
  }, []);

  const toggleCountry = useCallback((country: string) => {
    setEnabledCountries(prev => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  }, []);

  const isLoading = isPlantsLoading;
  const hasError = !isLoading && plantsError;

  return (
    <div className="relative w-full h-full flex" data-testid="power-infrastructure-map">
      {sidebarOpen && (
        <div className="w-72 shrink-0 bg-[#111827] border-r border-slate-800 overflow-y-auto z-10 flex flex-col" data-testid="panel-infra-sidebar">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-slate-200">Infrastructure</span>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-200" onClick={() => setSidebarOpen(false)} data-testid="button-close-sidebar">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Capacity Summary</div>
            {capacitySummary.length === 0 && (
              <p className="text-xs text-slate-400">No plants match filters</p>
            )}
            {capacitySummary.map(({ fuel, mw }) => (
              <div key={fuel} className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getFuelColor(fuel) }} />
                  <span className="text-xs text-slate-300">{fuel}</span>
                </div>
                <span className="text-xs font-semibold text-slate-200" data-testid={`text-capacity-${fuel.toLowerCase()}`}>
                  {mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw.toFixed(0)} MW`}
                </span>
              </div>
            ))}
            {totalCapacity > 0 && (
              <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-200">Total</span>
                <span className="text-xs font-bold text-blue-600" data-testid="text-total-capacity">
                  {(totalCapacity / 1000).toFixed(1)} GW
                </span>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Fuel Type</div>
            <div className="space-y-1">
              {FUEL_TYPES.map(fuel => (
                <label key={fuel} className="flex items-center gap-1.5 cursor-pointer" data-testid={`checkbox-fuel-${fuel.toLowerCase()}`}>
                  <Checkbox
                    checked={enabledFuels.has(fuel)}
                    onCheckedChange={() => toggleFuel(fuel)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getFuelColor(fuel) }} />
                  <span className="text-xs text-slate-300">{fuel}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Min Capacity</div>
            <Slider
              value={[minCapacity]}
              onValueChange={([v]) => setMinCapacity(v)}
              min={0}
              max={1000}
              step={10}
              className="w-full"
              data-testid="slider-min-capacity"
            />
            <div className="text-[10px] text-slate-500 mt-1 text-center">{minCapacity} MW</div>
          </div>

          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Countries</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COUNTRIES.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCountry(c)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    enabledCountries.has(c)
                      ? "bg-blue-900/40 border-blue-600 text-blue-300"
                      : "bg-slate-800 border-slate-700 text-slate-500"
                  }`}
                  data-testid={`chip-country-${c.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setEnabledCountries(new Set(ALL_COUNTRIES))}
                className="text-[10px] text-blue-400 hover:text-blue-200"
                data-testid="button-select-all-countries"
              >
                Select All
              </button>
              <button
                onClick={() => setEnabledCountries(new Set())}
                className="text-[10px] text-blue-400 hover:text-blue-200"
                data-testid="button-clear-all-countries"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Data Layers</div>
            <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ukpn-datacentres">
              <Checkbox
                checked={showUkpnLayer}
                onCheckedChange={() => setShowUkpnLayer(prev => !prev)}
                className="h-3.5 w-3.5"
              />
              <Server className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-slate-300">UKPN Data Centres</span>
            </label>
            {showUkpnLayer && isUkpnLoading && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading UKPN data…</span>
              </div>
            )}
            {showUkpnLayer && ukpnError && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-500" data-testid="text-ukpn-error">
                <AlertTriangle className="w-3 h-3" />
                <span>{(ukpnError as any)?.message?.includes("not configured") ? "UKPN_API_KEY not configured" : "Failed to load UKPN data"}</span>
              </div>
            )}
            {showUkpnLayer && ukpnData && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Total DCs</span>
                  <span className="text-[10px] font-semibold text-slate-200" data-testid="text-ukpn-total">{ukpnData.totalCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Co-located</span>
                  <span className="text-[10px] font-semibold text-slate-200">{ukpnData.summary.coLocated}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Enterprise</span>
                  <span className="text-[10px] font-semibold text-slate-200">{ukpnData.summary.enterprise}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Avg utilisation</span>
                  <span className="text-[10px] font-semibold text-amber-600">{Math.round(ukpnData.summary.avgUtilisation * 100)}%</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{ukpnData.licenceArea}</div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-1gl-datacentres">
                <Checkbox
                  checked={showOneGLLayer}
                  onCheckedChange={() => setShowOneGLLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Server className="w-3 h-3 text-violet-500" />
                <span className="text-xs text-slate-300">DC Insights</span>
              </label>
              {showOneGLLayer && isOneGLLoading && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading DC Insights…</span>
                </div>
              )}
              {showOneGLLayer && oneGLError && (
                <div className="mt-2 text-[10px] text-red-500" data-testid="text-1gl-error">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>Failed to load DC Insights data</span>
                  </div>
                  <button
                    className="mt-1 text-[10px] text-blue-500 underline cursor-pointer"
                    data-testid="button-1gl-retry"
                    onClick={() => queryClient.resetQueries({ queryKey: ["/api/1gl/datacentres"] })}
                  >
                    Retry
                  </button>
                </div>
              )}
              {showOneGLLayer && oneGLData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Data Centres</span>
                    <span className="text-[10px] font-semibold text-slate-200" data-testid="text-1gl-total">{oneGLData.length}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">1GigLabs validated dataset</div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-eunetworks">
                <Checkbox
                  checked={showEuNetworksLayer}
                  onCheckedChange={() => setShowEuNetworksLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Server className="w-3 h-3 text-indigo-500" />
                <span className="text-xs text-slate-300">euNetworks Fibre</span>
              </label>
              {showEuNetworksLayer && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Metro cities</span>
                    <span className="text-[10px] font-semibold text-slate-200">{EU_NETWORKS_METROS.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Backbone PoPs</span>
                    <span className="text-[10px] font-semibold text-slate-200">{EU_NETWORKS_POPS.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Routes</span>
                    <span className="text-[10px] font-semibold text-slate-200">{EU_NETWORKS_ROUTES.length}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm bg-indigo-700 border border-white" />
                    <span className="text-[10px] text-slate-500">Metro network</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-300 border border-indigo-500" />
                    <span className="text-[10px] text-slate-500">Long-haul PoP</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">eunetworks.com · Reference data 2024</div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-emodnet-wind">
                <Checkbox
                  checked={showEmodnetWindLayer}
                  onCheckedChange={() => setShowEmodnetWindLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Zap className="w-3 h-3 text-emerald-500" />
                <span className="text-xs text-slate-300">Offshore Wind Farms</span>
              </label>
              {showEmodnetWindLayer && isEmodnetWindLoading && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /><span>Loading wind farm data…</span>
                </div>
              )}
              {showEmodnetWindLayer && emodnetWindError && (
                <div className="mt-1 text-[10px] text-red-500">Failed to load wind farm data</div>
              )}
              {showEmodnetWindLayer && emodnetWindData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Total sites</span>
                    <span className="text-[10px] font-semibold text-slate-200">{emodnetWindData.features?.length ?? 0}</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {[
                      { label: "Production", color: "#16a34a" },
                      { label: "Construction", color: "#f59e0b" },
                      { label: "Approved", color: "#0ea5e9" },
                      { label: "Planned", color: "#6366f1" },
                      { label: "Dismantled", color: "#94a3b8" },
                    ].map(s => {
                      const cnt = emodnetWindData.features?.filter((f: any) => f.properties.status === s.label).length ?? 0;
                      return cnt > 0 ? (
                        <div key={s.label} className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <span className="text-[10px] text-slate-500">{s.label}</span>
                          <span className="text-[10px] font-semibold text-slate-600 ml-auto">{cnt}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">EMODnet Human Activities · emodnet.ec.europa.eu</div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-emodnet-cables">
                <Checkbox
                  checked={showEmodnetCablesLayer}
                  onCheckedChange={() => setShowEmodnetCablesLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="text-xs text-slate-300">Submarine Power Cables</span>
              </label>
              {showEmodnetCablesLayer && isEmodnetCablesLoading && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /><span>Loading cable data…</span>
                </div>
              )}
              {showEmodnetCablesLayer && emodnetCablesError && (
                <div className="mt-1 text-[10px] text-red-500">Failed to load cable data</div>
              )}
              {showEmodnetCablesLayer && emodnetCablesData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Cable segments</span>
                    <span className="text-[10px] font-semibold text-slate-200">{emodnetCablesData.features?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-block w-4 h-0.5 bg-amber-500 flex-shrink-0" />
                    <span className="text-[10px] text-slate-500">HV submarine cable</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">EMODnet Human Activities · emodnet.ec.europa.eu</div>
                </div>
              )}
            </div>

            {/* ── Isochrone / Accessibility Tool ─────────────────────── */}
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-isochrone">
                  <Checkbox
                    checked={isochroneMode}
                    onCheckedChange={() => setIsochroneMode(prev => !prev)}
                    className="h-3.5 w-3.5"
                  />
                  <Clock className="w-3 h-3 text-blue-600" />
                  <span className="text-xs text-slate-300">Drive-Time Zones</span>
                </label>
              </div>
              {isochroneMode && (
                <div className="mt-2 space-y-2">
                  <div className="text-[10px] text-blue-700 bg-blue-50 rounded px-2 py-1">
                    Click anywhere on the map to generate accessibility zones
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Travel mode</div>
                    <select
                      className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white"
                      value={isochroneProfile}
                      onChange={e => setIsochroneProfile(e.target.value as typeof isochroneProfile)}
                      data-testid="select-isochrone-profile"
                    >
                      <option value="driving-car">Car</option>
                      <option value="driving-hgv">HGV / Truck</option>
                      <option value="cycling-regular">Cycling</option>
                      <option value="foot-walking">Walking</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Time bands</div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: "10/20/30 min", val: [600,1200,1800] },
                        { label: "15/30/60 min", val: [900,1800,3600] },
                        { label: "20/40/60 min", val: [1200,2400,3600] },
                      ].map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => setIsochroneRanges(opt.val)}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                            JSON.stringify(isochroneRanges) === JSON.stringify(opt.val)
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                          }`}
                          data-testid={`button-isochrone-${opt.label.replace(/\W+/g, "-")}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {isochroneLoading && (
                    <div className="flex items-center gap-1 text-[10px] text-blue-600">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>Calculating zones…</span>
                    </div>
                  )}
                  {isochroneError && (
                    <div className="text-[10px] text-red-500">{isochroneError}</div>
                  )}
                  {isochronePoint && !isochroneLoading && !isochroneError && (
                    <div className="text-[10px] text-slate-400">
                      {isochronePoint.lat.toFixed(4)}°, {isochronePoint.lng.toFixed(4)}°
                    </div>
                  )}
                  <div className="mt-1 flex flex-col gap-0.5">
                    {isochroneRanges.map((r, i) => {
                      const colors = ["#3b82f6", "#93c5fd", "#bfdbfe"];
                      return (
                        <div key={r} className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 rounded flex-shrink-0 border border-white" style={{ background: colors[i] ?? "#3b82f6", opacity: 0.7 }} />
                          <span className="text-[10px] text-slate-500">{Math.round(r / 60)} min zone</span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setIsochroneMode(false)}
                    className="text-[10px] text-blue-400 hover:text-blue-200 underline mt-1"
                    data-testid="button-clear-isochrone"
                  >
                    Clear &amp; exit
                  </button>
                  <div className="text-[10px] text-slate-400">OpenRouteService · HEIGit</div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-submarine-cables">
                <Checkbox
                  checked={showSubmarineCablesLayer}
                  onCheckedChange={() => setShowSubmarineCablesLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Zap className="w-3 h-3 text-blue-600" />
                <span className="text-xs text-slate-300">Submarine Cables</span>
              </label>
              {showSubmarineCablesLayer && (isSubCablesLoading || isSubLandingLoading) && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /><span>Loading submarine cable data…</span>
                </div>
              )}
              {showSubmarineCablesLayer && (subCablesError || subLandingError) && (
                <div className="mt-1 text-[10px] text-red-500">Failed to load submarine cable data</div>
              )}
              {showSubmarineCablesLayer && subCablesGeoData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Cable routes</span>
                    <span className="text-[10px] font-semibold text-slate-200">{subCablesGeoData.features?.length ?? 0}</span>
                  </div>
                  {subLandingGeoData && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Landing stations</span>
                      <span className="text-[10px] font-semibold text-slate-200">{subLandingGeoData.features?.length ?? 0}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-block w-4 h-0.5 bg-blue-500 flex-shrink-0" />
                    <span className="text-[10px] text-slate-500">Cable route</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-800 border border-white flex-shrink-0" />
                    <span className="text-[10px] text-slate-500">Landing station</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">TeleGeography · submarinecablemap.com</div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-city-labels">
                <Checkbox
                  checked={showCityLabelsLayer}
                  onCheckedChange={() => setShowCityLabelsLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <MapPin className="w-3 h-3 text-slate-600" />
                <span className="text-xs text-slate-300">City Labels</span>
              </label>
              {showCityLabelsLayer && (
                <div className="mt-1 text-[10px] text-slate-400">{MAJOR_CITIES.length} major cities</div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ssen-headroom">
                <Checkbox
                  checked={showSSENLayer}
                  onCheckedChange={() => setShowSSENLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Zap className="w-3 h-3 text-green-500" />
                <span className="text-xs text-slate-300">SSEN Network Capacity</span>
              </label>
              {showSSENLayer && isSSENLoading && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading SSEN data…</span>
                </div>
              )}
              {showSSENLayer && ssenError && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-500" data-testid="text-ssen-error">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{(ssenError as any)?.message?.includes("not configured") ? "SSEN_NERDA_API_KEY not configured" : "Failed to load SSEN data"}</span>
                </div>
              )}
              {showSSENLayer && ssenData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Substations</span>
                    <span className="text-[10px] font-semibold text-slate-200">{ssenData.totalCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Green (available)</span>
                    <span className="text-[10px] font-semibold text-green-600">{ssenData.summary.green}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Amber (limited)</span>
                    <span className="text-[10px] font-semibold text-amber-500">{ssenData.summary.amber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Red (constrained)</span>
                    <span className="text-[10px] font-semibold text-red-500">{ssenData.summary.red}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Data: {ssenData.dataDate} · Scotland & South England</div>
                </div>
              )}
              {showSSENLayer && ssenData && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <div className="text-[10px] text-slate-400 mb-1.5">Demand RAG Status</div>
                  <div className="space-y-0.5">
                    {[
                      { label: "GSP (400/275/132 kV)", color: "#6b7280", r: 8 },
                      { label: "BSP (132/66 kV)", color: "#6b7280", r: 6 },
                      { label: "Primary (33/11 kV)", color: "#6b7280", r: 4 },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="inline-block rounded-full bg-slate-300 shrink-0" style={{ width: s.r * 2, height: s.r * 2 }} />
                        {s.label}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {[
                      { label: "Green", color: "#22c55e" },
                      { label: "Amber", color: "#f59e0b" },
                      { label: "Red", color: "#ef4444" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                        {r.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ssen-dc-probability">
                  <Checkbox
                    checked={showSSENDCLayer}
                    onCheckedChange={() => setShowSSENDCLayer(prev => !prev)}
                    className="h-3.5 w-3.5"
                  />
                  <Server className="w-3 h-3 text-violet-500" />
                  <span className="text-xs text-slate-300">SSEN DC Probability</span>
                </label>
                {showSSENDCLayer && isSSENDCLoading && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Scoring substations…</span>
                  </div>
                )}
                {showSSENDCLayer && ssenDCError && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Failed to load DC probability data</span>
                  </div>
                )}
                {showSSENDCLayer && ssenDCData && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Sites flagged</span>
                      <span className="text-[10px] font-semibold text-slate-200">{ssenDCData.totalCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">High probability</span>
                      <span className="text-[10px] font-semibold text-violet-700">{ssenDCData.highCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Medium probability</span>
                      <span className="text-[10px] font-semibold text-violet-400">{ssenDCData.mediumCount}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Inferred · not verified</div>
                  </div>
                )}
                {showSSENDCLayer && ssenDCData && (
                  <div className="mt-2 pt-1">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="inline-block w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: "#7c3aed" }} />
                        High
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="inline-block w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: "#a78bfa" }} />
                        Medium
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-800">
                <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-nged-capacity">
                  <Checkbox
                    checked={showNGEDCapacity}
                    onCheckedChange={() => setShowNGEDCapacity(prev => !prev)}
                    className="h-3.5 w-3.5"
                  />
                  <Zap className="w-3 h-3 text-pink-500" />
                  <span className="text-xs text-slate-300">NGED Network Capacity</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer mt-1.5" data-testid="checkbox-nged-opportunity">
                  <Checkbox
                    checked={showNGEDOpportunity}
                    onCheckedChange={() => setShowNGEDOpportunity(prev => !prev)}
                    className="h-3.5 w-3.5"
                  />
                  <Zap className="w-3 h-3 text-purple-500" />
                  <span className="text-xs text-slate-300">NGED Opportunity Map</span>
                </label>
                {showNGEDCapacity && isNGEDCapLoading && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading NGED capacity data…</span>
                  </div>
                )}
                {showNGEDCapacity && ngedCapError && (
                  <div className="mt-2 text-[10px]" data-testid="text-nged-cap-error">
                    {ngedCapError.message?.includes("503") || ngedCapError.message?.includes("not configured") ? (
                      <div className="flex items-start gap-1.5 text-amber-600">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>NGED API key required. <a href="https://connecteddata.nationalgrid.co.uk" target="_blank" rel="noopener noreferrer" className="underline">Register here</a>, then set <code className="bg-amber-50 px-0.5 rounded">NGED_API_KEY</code> in secrets.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Failed to load NGED capacity data</span>
                      </div>
                    )}
                  </div>
                )}
                {showNGEDOpportunity && isNGEDOppLoading && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading NGED opportunity data…</span>
                  </div>
                )}
                {showNGEDOpportunity && ngedOppError && (
                  <div className="mt-2 text-[10px]" data-testid="text-nged-opp-error">
                    {ngedOppError.message?.includes("503") || ngedOppError.message?.includes("not configured") ? (
                      <div className="flex items-start gap-1.5 text-amber-600">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>NGED API key required. <a href="https://connecteddata.nationalgrid.co.uk" target="_blank" rel="noopener noreferrer" className="underline">Register here</a>, then set <code className="bg-amber-50 px-0.5 rounded">NGED_API_KEY</code> in secrets.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Failed to load NGED opportunity data</span>
                      </div>
                    )}
                  </div>
                )}
                {(showNGEDCapacity || showNGEDOpportunity) && (
                  <div className="mt-2 pt-2 border-t border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-1.5">NGED Licence Areas</div>
                    <div className="space-y-0.5">
                      {[
                        { label: "East Midlands", color: "#e11d48" },
                        { label: "West Midlands", color: "#db2777" },
                        { label: "South West", color: "#c026d3" },
                        { label: "South Wales", color: "#9333ea" },
                      ].map(a => (
                        <div key={a.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                          {a.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-npg-network">
                <Checkbox
                  checked={showNPGLayer}
                  onCheckedChange={() => setShowNPGLayer(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Zap className="w-3 h-3 text-purple-500" />
                <span className="text-xs text-slate-300">NPg Network</span>
              </label>
              {showNPGLayer && isNPGLoading && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading NPg data…</span>
                </div>
              )}
              {showNPGLayer && npgError && (
                <div className="flex flex-col gap-1 mt-2" data-testid="text-npg-error">
                  {(npgError as any)?.message?.includes("503") || (npgError as any)?.message?.includes("not configured") ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span className="font-medium">NPG_API_KEY required</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Register at{" "}
                        <a href="https://northernpowergrid.opendatasoft.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">northernpowergrid.opendatasoft.com</a>
                        {" "}to get an API key, then set <code className="bg-slate-100 px-0.5 rounded">NPG_API_KEY</code> in secrets.
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-red-500">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Failed to load NPg data</span>
                    </div>
                  )}
                </div>
              )}
              {showNPGLayer && npgData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Sites</span>
                    <span className="text-[10px] font-semibold text-slate-200" data-testid="text-npg-total">{npgData.totalCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Green (&lt;40%)</span>
                    <span className="text-[10px] font-semibold text-green-600">{npgData.summary.green}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Amber (40–80%)</span>
                    <span className="text-[10px] font-semibold text-amber-500">{npgData.summary.amber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Red (&gt;80%)</span>
                    <span className="text-[10px] font-semibold text-red-500">{npgData.summary.red}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">NE England & Yorkshire</div>
                </div>
              )}
              {showNPGLayer && npgData && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <div className="text-[10px] text-slate-400 mb-1.5">Utilisation Band</div>
                  <div className="flex items-center gap-3">
                    {[
                      { label: "Green", color: "#22c55e" },
                      { label: "Amber", color: "#f59e0b" },
                      { label: "Red", color: "#ef4444" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                        {r.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-npg-connection-queue">
                <Checkbox
                  checked={showNPGQueue}
                  onCheckedChange={() => setShowNPGQueue(prev => !prev)}
                  className="h-3.5 w-3.5"
                />
                <Server className="w-3 h-3 text-violet-500" />
                <span className="text-xs text-slate-300">NPg Connection Queue</span>
              </label>
              {showNPGQueue && isNPGQueueLoading && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading queue data…</span>
                </div>
              )}
              {showNPGQueue && npgQueueError && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-500" data-testid="text-npg-queue-error">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Failed to load queue data</span>
                </div>
              )}
              {showNPGQueue && npgQueueData && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Queue items</span>
                    <span className="text-[10px] font-semibold text-slate-200" data-testid="text-npg-queue-total">{npgQueueData.totalCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">GSP nodes</span>
                    <span className="text-[10px] font-semibold text-slate-200">{Object.keys(npgQueueData.byGSP).length}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Sized by total queued MW</div>
                </div>
              )}
            </div>
          </div>

          {/* ENW – Electricity North West */}
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-orange-500" />
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Electricity North West</div>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-enw-headroom">
              <Checkbox
                checked={showENWLayer}
                onCheckedChange={() => setShowENWLayer(prev => !prev)}
                className="h-3.5 w-3.5"
              />
              <Server className="w-3 h-3 text-orange-400" />
              <span className="text-xs text-slate-300">ENW Network Headroom</span>
            </label>

            {showENWLayer && isENWLoading && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading ENW data…</span>
              </div>
            )}
            {showENWLayer && enwError && (
              <div className="flex flex-col gap-1 mt-2" data-testid="text-enw-error">
                {(enwError as any)?.message?.includes("503") || (enwError as any)?.message?.includes("not configured") ? (
                  <>
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span className="font-medium">ENW_API_KEY required</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Set <code className="bg-slate-100 px-0.5 rounded">ENW_API_KEY</code> in secrets.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Failed to load ENW data</span>
                  </div>
                )}
              </div>
            )}
            {showENWLayer && enwData && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">BSP sites</span>
                  <span className="text-[10px] font-semibold text-slate-200" data-testid="text-enw-bsp-count">{enwData.summary.bspCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">PRY sites</span>
                  <span className="text-[10px] font-semibold text-slate-200" data-testid="text-enw-pry-count">{enwData.summary.pryCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Green (≥20 MW)</span>
                  <span className="text-[10px] font-semibold text-green-600">{enwData.summary.green}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Amber (5–20 MW)</span>
                  <span className="text-[10px] font-semibold text-amber-500">{enwData.summary.amber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Red (&lt;5 MW)</span>
                  <span className="text-[10px] font-semibold text-red-500">{enwData.summary.red}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Demand headroom · NW England</div>
              </div>
            )}
            {showENWLayer && enwData && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1.5">Headroom Band</div>
                <div className="flex items-center gap-3">
                  {[
                    { label: "Green", color: "#22c55e" },
                    { label: "Amber", color: "#f59e0b" },
                    { label: "Red", color: "#ef4444" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* NPg NDP Headroom – Yorkshire & Northeast */}
          <div className="px-4 py-3 border-b border-slate-800" data-testid="panel-npg-ndp-headroom">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-sky-500" />
              <div className="text-[10px] text-slate-400 uppercase font-semibold">NPg NDP Headroom</div>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-npg-ndp-headroom">
              <Checkbox
                checked={showNDPLayer}
                onCheckedChange={() => setShowNDPLayer(prev => !prev)}
                className="h-3.5 w-3.5"
              />
              <Server className="w-3 h-3 text-sky-400" />
              <span className="text-xs text-slate-300">NPg NDP Demand Headroom</span>
            </label>

            {showNDPLayer && isNDPLoading && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading NDP data…</span>
              </div>
            )}
            {showNDPLayer && ndpError && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-500" data-testid="text-ndp-error">
                <AlertTriangle className="w-3 h-3" />
                <span>Failed to load NDP headroom data</span>
              </div>
            )}
            {showNDPLayer && ndpData && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Total substations</span>
                  <span className="text-[10px] font-semibold text-slate-200" data-testid="text-ndp-total">{ndpData.totalCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Yorkshire (NPgY)</span>
                  <span className="text-[10px] font-semibold text-slate-200">{ndpData.summary.yorkshire}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Northeast (NPgN)</span>
                  <span className="text-[10px] font-semibold text-slate-200">{ndpData.summary.northeast}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Green (≥15 MW)</span>
                  <span className="text-[10px] font-semibold text-green-600">{ndpData.summary.green}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Amber (5–15 MW)</span>
                  <span className="text-[10px] font-semibold text-amber-500">{ndpData.summary.amber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Red (&lt;5 MW)</span>
                  <span className="text-[10px] font-semibold text-red-500">{ndpData.summary.red}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Demand headroom · Reference Scenario · 2025</div>
              </div>
            )}
            {showNDPLayer && ndpData && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1.5">Headroom Band</div>
                <div className="flex items-center gap-3">
                  {[
                    { label: "Green", color: "#22c55e" },
                    { label: "Amber", color: "#f59e0b" },
                    { label: "Red", color: "#ef4444" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* UKPN DFES Headroom – London, Eastern, South Eastern */}
          <div className="px-4 py-3 border-b border-slate-800" data-testid="panel-ukpn-dfes-headroom">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <div className="text-[10px] text-slate-400 uppercase font-semibold">UKPN DFES Headroom</div>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ukpn-dfes-headroom">
              <Checkbox
                checked={showDFESLayer}
                onCheckedChange={() => setShowDFESLayer(prev => !prev)}
                className="h-3.5 w-3.5"
              />
              <Server className="w-3 h-3 text-indigo-400" />
              <span className="text-xs text-slate-300">UKPN DFES Demand Headroom</span>
            </label>

            {showDFESLayer && isDFESLoading && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading DFES data…</span>
              </div>
            )}
            {showDFESLayer && dfesError && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-500" data-testid="text-dfes-error">
                <AlertTriangle className="w-3 h-3" />
                <span>Failed to load DFES headroom data</span>
              </div>
            )}
            {showDFESLayer && dfesData && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Total substations</span>
                  <span className="text-[10px] font-semibold text-slate-200" data-testid="text-dfes-total">{dfesData.totalCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">London (LPN)</span>
                  <span className="text-[10px] font-semibold text-slate-200">{dfesData.summary.lpn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Eastern (EPN)</span>
                  <span className="text-[10px] font-semibold text-slate-200">{dfesData.summary.epn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">South Eastern (SPN)</span>
                  <span className="text-[10px] font-semibold text-slate-200">{dfesData.summary.spn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Green (≥15 MW)</span>
                  <span className="text-[10px] font-semibold text-green-600">{dfesData.summary.green}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Amber (5–15 MW)</span>
                  <span className="text-[10px] font-semibold text-amber-500">{dfesData.summary.amber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Red (&lt;5 MW)</span>
                  <span className="text-[10px] font-semibold text-red-500">{dfesData.summary.red}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Demand headroom · Electric Engagement · 2025</div>
              </div>
            )}
            {showDFESLayer && dfesData && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1.5">Headroom Band</div>
                <div className="flex items-center gap-3">
                  {[
                    { label: "Green", color: "#22c55e" },
                    { label: "Amber", color: "#f59e0b" },
                    { label: "Red", color: "#ef4444" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">Size Legend</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {[
                { label: "<50 MW", r: 3 },
                { label: "50–200", r: 5 },
                { label: "200–500", r: 7 },
                { label: "500–1k", r: 9 },
                { label: ">1,000", r: 12 },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span
                    className="inline-block rounded-full bg-slate-400 shrink-0"
                    style={{ width: s.r * 2, height: s.r * 2 }}
                  />
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3" data-testid="panel-ukpn-distribution">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <div className="text-[10px] text-slate-400 uppercase font-semibold">UK Distribution Network</div>
            </div>
            <div className="text-[10px] text-slate-400 mb-2">UKPN licence area only</div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ukpn-grid-substations">
                <Checkbox
                  checked={ukpnGridSubs}
                  onCheckedChange={() => setUkpnGridSubs(v => !v)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300">Grid Substations</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ukpn-connection-queue">
                <Checkbox
                  checked={ukpnConnQueue}
                  onCheckedChange={() => setUkpnConnQueue(v => !v)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300">Connection Queue</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ukpn-fault-levels">
                <Checkbox
                  checked={ukpnFaultLevels}
                  onCheckedChange={() => setUkpnFaultLevels(v => !v)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300">Fault Levels</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-ukpn-grid-primary">
                <Checkbox
                  checked={showGridPrimary}
                  onCheckedChange={() => setShowGridPrimary(v => !v)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300">Grid & Primary Sites</span>
              </label>
              {showGridPrimary && isGridPrimaryLoading && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pl-5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading sites…</span>
                </div>
              )}
              {showGridPrimary && gridPrimaryError && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-500 pl-5">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Failed to load sites</span>
                </div>
              )}
              {showGridPrimary && gridPrimaryData && (
                <div className="text-[10px] text-slate-400 pl-5">
                  {gridPrimaryData.length.toLocaleString()} sites loaded
                </div>
              )}
            </div>

            {(ukpnGridSubs || ukpnConnQueue || ukpnFaultLevels) && (
              <div className="mt-3 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1">DNO Areas</div>
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { label: "LPN (London)", color: "#3b82f6" },
                    { label: "EPN (Eastern)", color: "#22c55e" },
                    { label: "SPN (South East)", color: "#f97316" },
                  ].map(d => (
                    <div key={d.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      {d.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showGridPrimary && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1">Grid & Primary Sites</div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: "#7c3aed" }} />
                    Grid (132/33 kV)
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#2563eb" }} />
                    Primary (33/11 kV)
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        {!sidebarOpen && (
          <Button
            size="icon"
            variant="outline"
            className="absolute top-3 left-3 z-[1000] h-8 w-8 bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800 shadow-md"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-open-sidebar"
          >
            <ChevronDown className="w-4 h-4 rotate-90" />
          </Button>
        )}

        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800 shadow-md"
            onClick={() => mapRef.current?.zoomIn()}
            data-testid="button-map-zoom-in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800 shadow-md"
            onClick={() => mapRef.current?.zoomOut()}
            data-testid="button-map-zoom-out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1117] gap-3 z-[500]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-slate-400">Loading power plant data…</p>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-3 z-[500]">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-slate-500">Could not load power plant data.</p>
          </div>
        )}

        <div
          ref={initMap}
          className="w-full h-full"
          data-testid="map-power-infrastructure"
        />

        {mapReady && (
          <UKPNDistributionLayer
            map={mapRef.current}
            showGridSubstations={ukpnGridSubs && enabledCountries.has("United Kingdom")}
            showConnectionQueue={ukpnConnQueue && enabledCountries.has("United Kingdom")}
            showFaultLevels={ukpnFaultLevels && enabledCountries.has("United Kingdom")}
          />
        )}

        {mapReady && (
          <NGEDNetworkLayer
            map={mapRef.current}
            showNetworkCapacity={showNGEDCapacity && enabledCountries.has("United Kingdom")}
            showOpportunityMap={showNGEDOpportunity && enabledCountries.has("United Kingdom")}
          />
        )}


        {/* Legend — bottom right */}
        <div className="absolute bottom-14 right-4 z-[499] pointer-events-none" data-testid="panel-legend">
          <div style={{
            background: "rgba(20, 30, 20, 0.90)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "10px",
            padding: "12px 14px",
            minWidth: "200px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#e2e8f0" }}>Electricity price</span>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>€/MWh</span>
            </div>
            <div style={{
              height: "8px", borderRadius: "4px", marginBottom: "5px",
              background: `linear-gradient(to right, ${PRICE_STOPS.map(([, c]) => c).join(", ")})`,
            }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[0, 80, 160, 240, 320, 400].map(v => (
                <span key={v} style={{ fontSize: "9px", color: "#64748b" }}>{v}</span>
              ))}
            </div>
            <div style={{ marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "6px", fontSize: "9px", color: "#475569" }}>
              Month avg · ENTSO-E · {new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 py-1 bg-[#0d1117]/90 backdrop-blur-sm border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 z-[500]">
          <span>WRI · ENTSO-E · UKPN · SSEN · NPg · NGED · ENW · 1GL DC Insights · euNetworks · EMODnet</span>
          <span className="font-medium text-slate-400" data-testid="text-visible-plants">
            {filteredPlants.length.toLocaleString()} plants visible
          </span>
        </div>
      </div>
    </div>
  );
}

function applyFilters(
  layerGroup: L.LayerGroup,
  markers: L.CircleMarker[],
  enabledFuels: Set<string>,
  minCapacity: number,
  enabledCountries: Set<string>
) {
  for (const marker of markers) {
    const data = markerMeta.get(marker);
    if (!data) continue;
    const visible = enabledFuels.has(data.fuel) && data.capacity >= minCapacity && enabledCountries.has(data.country);
    if (visible) {
      if (!layerGroup.hasLayer(marker)) {
        marker.addTo(layerGroup);
      }
    } else {
      if (layerGroup.hasLayer(marker)) {
        layerGroup.removeLayer(marker);
      }
    }
  }
}
