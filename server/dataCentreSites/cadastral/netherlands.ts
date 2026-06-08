/**
 * Netherlands — Kadaster PDOK cadastral connector.
 *
 * ── API ────────────────────────────────────────────────────────────────────────
 *   PDOK (Publieke Dienstverlening Op de Kaart) — FREE, no API key required.
 *   Attribution required: "Kadaster — PDOK"
 *
 *   WFS endpoint:
 *     https://geodata.nationaalgeoregister.nl/kadastralekaart/wfs
 *     TypeName: kadastralekaart:Perceel (land parcels)
 *     Format: application/json (GeoJSON native — no XML parsing needed)
 *
 *   Full API docs: https://www.pdok.nl/introductie/-/article/basisregistratie-kadaster-bg-
 *   PDOK viewer: https://www.pdok.nl/viewer/
 *
 * ── Rate limits ────────────────────────────────────────────────────────────────
 *   Fair use; no stated hard limit.
 *   Requests over large bounding boxes may be slow — use count=200 cap.
 *   24h cache in cache.ts handles repeat requests.
 *
 * ── Fields returned ────────────────────────────────────────────────────────────
 *   perceelnummer:   Cadastral parcel number
 *   oppervlakte:     Area in m²
 *   soortGrootte:    Size classification
 *   kadastraleGrootte: Cadastral area in m²
 */

import type { BoundingBox, CadastralParcel } from "../types";

const PDOK_WFS = "https://geodata.nationaalgeoregister.nl/kadastralekaart/wfs";

interface PdokProperties {
  identificatieNummer?: string;
  perceelnummer?: string;
  oppervlakte?: number | string;
  soortGrootte?: string;
  kadastraleGrootte?: number | string;
  [key: string]: unknown;
}

interface PdokFeature {
  type: "Feature";
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: PdokProperties;
}

export async function fetchNetherlandsCadastral(
  bbox: BoundingBox,
): Promise<CadastralParcel[]> {
  const { south, west, north, east } = bbox;

  const url =
    `${PDOK_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=kadastralekaart:Perceel&outputFormat=application/json` +
    `&bbox=${west},${south},${east},${north}&count=200`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kadaster PDOK HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: { features?: PdokFeature[] } = await res.json();
  const fetchedAt = new Date().toISOString();

  return (data.features ?? []).map((f): CadastralParcel => {
    const p = f.properties;
    const area =
      p.oppervlakte != null
        ? Number(p.oppervlakte)
        : p.kadastraleGrootte != null
          ? Number(p.kadastraleGrootte)
          : undefined;

    return {
      type: "Feature",
      id: `kadaster:${f.id}`,
      geometry: {
        type: f.geometry.type as any,
        coordinates: f.geometry.coordinates as any,
      },
      properties: {
        reference: p.perceelnummer ?? f.id,
        country: "Netherlands",
        areaM2: area != null && !isNaN(area) ? Math.round(area) : undefined,
        landUse: p.soortGrootte,
        dataSource: "Kadaster PDOK (CC0 — Attribution: Kadaster)",
        fetchedAt,
      },
    };
  });
}
