/**
 * 1GigLabs Validated Data Centre Dataset
 *
 * Primary data source for the Power Infrastructure Map.
 * 2,764 validated records across Europe — sourced and geo-validated by 1GigLabs analysts.
 * Data stored as a static JSON bundle; Baxtel API serves as supplementary fallback.
 *
 * Fields: id, name, lat, lng, geo_region, operator, capacity_mw, tier,
 *         validation, validation_notes, geo_checked
 */

import * as fs from "fs";
import * as path from "path";

export interface DcInsightsRecord {
  id: number;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  operator: string | null;
  capacityMW: number | null;
  tier: string | null;
  geoRegion: string | null;
  validation: string | null;
  validationNotes: string | null;
  source: "1gl";
  websiteUrl: null;
  scrapedAt: null;
  baxtelId: string;
}

let _cache: DcInsightsRecord[] | null = null;

function resolveDataPath(): string {
  const candidates = [
    path.join(__dirname, "data", "dc-insights.json"),
    path.join(process.cwd(), "server", "data", "dc-insights.json"),
    path.join(process.cwd(), "dist", "data", "dc-insights.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function getDcInsightsRecords(): DcInsightsRecord[] {
  if (_cache) return _cache;

  const filePath = resolveDataPath();
  const raw = fs.readFileSync(filePath, "utf-8");
  const rows: any[] = JSON.parse(raw);

  _cache = rows.map((r) => ({
    id: r.id,
    name: r.name ?? "Unknown",
    lat: r.lat,
    lng: r.lng,
    country: r.geo_region ?? r.country ?? null,
    operator: r.operator ?? null,
    capacityMW: r.capacity_mw ?? null,
    tier: r.tier ?? null,
    geoRegion: r.geo_region ?? null,
    validation: r.validation ?? null,
    validationNotes: r.validation_notes ?? null,
    source: "1gl" as const,
    websiteUrl: null,
    scrapedAt: null,
    baxtelId: `1gl-${r.id}`,
  }));

  return _cache;
}

export function isDcInsightsAvailable(): boolean {
  try {
    return fs.existsSync(resolveDataPath());
  } catch {
    return false;
  }
}
