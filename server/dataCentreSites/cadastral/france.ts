/**
 * France — IGN / DGFIP Cadastre connector.
 *
 * ── APIs ───────────────────────────────────────────────────────────────────────
 *
 * 1. IGN Géoplateforme WFS (PRIMARY — used here) — FREE, no API key
 *    TypeName: CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle
 *    Endpoint: https://data.geopf.fr/wfs/ows
 *    Format:   GeoJSON native
 *    Attribution: "Source : IGN-DGFIP-Cadastre"
 *    Docs: https://geoservices.ign.fr/documentation/services/api-et-services-ogc/wfs
 *
 * 2. Etalab Cadastre (alternative, by commune) — FREE, no key
 *    https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/{code}/geojson/parcelles.json
 *    Requires an INSEE commune code — not usable for bbox queries without a
 *    reverse geocoder step.
 *
 * ── Rate limits ────────────────────────────────────────────────────────────────
 *   IGN Géoplateforme: fair use. No stated hard limit for small bbox queries.
 *   Avoid streaming entire département datasets — use count cap of 200.
 *
 * ── Fields returned ────────────────────────────────────────────────────────────
 *   commune:    INSEE commune code
 *   prefixe:    Cadastral section prefix
 *   section:    Section letter(s)
 *   numero:     Parcel number within section
 *   contenance: Area in m²
 */

import type { BoundingBox, CadastralParcel } from "../types";

const IGN_WFS = "https://data.geopf.fr/wfs/ows";

interface IgnProperties {
  commune?: string;
  prefixe?: string;
  section?: string;
  numero?: string;
  contenance?: number | string;  // area in m²
  [key: string]: unknown;
}

interface IgnFeature {
  type: "Feature";
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: IgnProperties;
}

export async function fetchFranceCadastral(
  bbox: BoundingBox,
): Promise<CadastralParcel[]> {
  const { south, west, north, east } = bbox;

  const params = new URLSearchParams({
    service:       "WFS",
    version:       "2.0.0",
    request:       "GetFeature",
    typeName:      "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
    bbox:          `${west},${south},${east},${north},EPSG:4326`,
    outputFormat:  "application/json",
    count:         "200",
  });

  const res = await fetch(`${IGN_WFS}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IGN Cadastre HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: { features?: IgnFeature[] } = await res.json();
  const fetchedAt = new Date().toISOString();

  return (data.features ?? []).map((f): CadastralParcel => {
    const p = f.properties;
    const ref = [p.commune, p.prefixe, p.section, p.numero]
      .filter(Boolean)
      .join("-");
    const area = p.contenance != null ? Number(p.contenance) : undefined;

    return {
      type: "Feature",
      id: `cadastre-fr:${f.id ?? ref}`,
      geometry: {
        type: f.geometry.type as any,
        coordinates: f.geometry.coordinates as any,
      },
      properties: {
        reference: ref || f.id,
        country: "France",
        areaM2: area != null && !isNaN(area) ? Math.round(area) : undefined,
        dataSource: "IGN/DGFIP Cadastre — Source : IGN-DGFIP-Cadastre",
        fetchedAt,
      },
    };
  });
}
