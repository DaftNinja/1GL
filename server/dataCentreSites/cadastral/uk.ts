/**
 * UK — HM Land Registry cadastral connector.
 *
 * ── Available APIs ────────────────────────────────────────────────────────────
 *
 * 1. INSPIRE Index Polygons (WFS) — FREE, no API key
 *    Returns registered freehold and leasehold land boundaries as GML polygons.
 *    Endpoint: https://inspire.landregistry.gov.uk/inspire/owp/wfs
 *    Params:   service=WFS&version=2.0.0&request=GetFeature
 *              &typeNames=inspire:RegisteredFreehold,inspire:RegisteredLeasedland
 *              &bbox={west},{south},{east},{north},EPSG:4326&count=200
 *    Format:   GML 3.2 (XML) — requires GML→GeoJSON conversion
 *
 * 2. Price Paid Data — FREE bulk download
 *    CSV of all property transactions. Not suitable for on-demand API use.
 *    URL: https://use-land-property-data.service.gov.uk/datasets/ppd
 *
 * 3. Land Registry API (title number lookup) — FREE, no key
 *    GET https://api.land-registry-property-checker.service.gov.uk/titles/{titleNumber}
 *    Returns ownership type, proprietor, last sale price.
 *
 * ── Implementation status ─────────────────────────────────────────────────────
 *
 * The WFS endpoint is reachable and returns valid GML, but parsing GML 3.2
 * requires an XML parser such as @xmldom/xmldom + a GML→GeoJSON converter
 * (e.g. @turf/turf, terraformer-wkt-parser, or a custom sax-based parser).
 *
 * To complete this connector:
 *   1. npm install @xmldom/xmldom
 *   2. Implement parseGml() below to extract coordinates from
 *      gml:MultiSurface / gml:Polygon elements
 *   3. Optionally enrich each parcel with the title number lookup API
 *
 * ── Rate limits ────────────────────────────────────────────────────────────────
 *   Reasonable use; no stated hard limit for the INSPIRE WFS.
 *   Avoid parallel requests — the server is not high-capacity.
 */

import type { BoundingBox, CadastralParcel } from "../types";

const INSPIRE_WFS =
  "https://inspire.landregistry.gov.uk/inspire/owp/wfs";

/**
 * Fetches UK Land Registry INSPIRE polygons for the given bounding box.
 *
 * Currently returns an empty array because GML parsing is not yet implemented.
 * See the file header for instructions on completing the integration.
 */
export async function fetchUKCadastral(
  bbox: BoundingBox,
): Promise<CadastralParcel[]> {
  const { south, west, north, east } = bbox;

  const url =
    `${INSPIRE_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=inspire:RegisteredFreehold,inspire:RegisteredLeasedland` +
    `&bbox=${west},${south},${east},${north},EPSG:4326&count=200`;

  console.info(
    "[Cadastral/UK] INSPIRE WFS reachable at:", url,
    "\n  → GML parser not yet implemented. Returning empty array.",
    "\n  → Install @xmldom/xmldom and implement parseGml() to complete.",
  );

  // TODO: implement parseGml()
  // const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  // if (!res.ok) throw new Error(`INSPIRE WFS HTTP ${res.status}`);
  // const gml = await res.text();
  // return parseGml(gml);

  return [];
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// function parseGml(gml: string): CadastralParcel[] {
//   // Use @xmldom/xmldom to parse GML 3.2 and extract Polygon coordinates.
//   // Each <inspire:RegisteredFreehold> or <inspire:RegisteredLeasedland>
//   // element has a <gml:MultiSurface> child with the boundary coordinates.
//   throw new Error("Not implemented");
// }
