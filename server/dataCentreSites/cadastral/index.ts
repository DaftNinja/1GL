/**
 * Cadastral data router — dispatches to the appropriate country connector.
 *
 * ── Supported countries ────────────────────────────────────────────────────────
 *   France       IGN / DGFIP Cadastre WFS (fully implemented)
 *   Netherlands  Kadaster PDOK WFS        (fully implemented)
 *   UK           HM Land Registry INSPIRE WFS (stub — GML parser TODO)
 *
 * ── Adding a new country ───────────────────────────────────────────────────────
 *   1. Create server/dataCentreSites/cadastral/{countryCode}.ts
 *   2. Export fetchXxxCadastral(bbox): Promise<CadastralParcel[]>
 *   3. Add the country name → import mapping in CONNECTORS below
 *   4. Remove the country from the OSM-fallback set
 *
 * ── Fallback behaviour ────────────────────────────────────────────────────────
 *   Countries without a connector return dataAvailable: false with a descriptive
 *   note.  The caller (routes.ts) already has OSM industrial zones and can set
 *   cadastralDataAvailable: false on each SiteFeature.
 */

import type { BoundingBox, CadastralParcel } from "../types";
import { fetchFranceCadastral } from "./france";
import { fetchNetherlandsCadastral } from "./netherlands";
import { fetchUKCadastral } from "./uk";

export interface CadastralResult {
  parcels: CadastralParcel[];
  dataAvailable: boolean;
  notes: string;
}

/** Countries with a real (non-stub) connector */
const IMPLEMENTED = new Set(["France", "Netherlands"]);

/** Countries with a stub connector (reachable API, incomplete parsing) */
const STUB = new Set(["United Kingdom"]);

/**
 * Fetches cadastral land parcel data for the given country and bounding box.
 *
 * @param country  Canonical country name (matches SiteProperties.country)
 * @param bbox     WGS-84 bounding box
 */
export async function getCadastralParcels(
  country: string,
  bbox: BoundingBox,
): Promise<CadastralResult> {
  try {
    if (country === "France") {
      const parcels = await fetchFranceCadastral(bbox);
      return {
        parcels,
        dataAvailable: parcels.length > 0,
        notes:
          parcels.length > 0
            ? `IGN/DGFIP Cadastre: ${parcels.length} parcels fetched.`
            : "IGN/DGFIP Cadastre returned no parcels for this bounding box.",
      };
    }

    if (country === "Netherlands") {
      const parcels = await fetchNetherlandsCadastral(bbox);
      return {
        parcels,
        dataAvailable: parcels.length > 0,
        notes:
          parcels.length > 0
            ? `Kadaster PDOK: ${parcels.length} parcels fetched.`
            : "Kadaster PDOK returned no parcels for this bounding box.",
      };
    }

    if (country === "United Kingdom") {
      // Stub: fetchUKCadastral always returns [] until GML parser is implemented
      const parcels = await fetchUKCadastral(bbox);
      return {
        parcels,
        dataAvailable: false,
        notes:
          "UK INSPIRE WFS is reachable but GML parsing is not yet implemented. " +
          "Install @xmldom/xmldom and implement parseGml() in cadastral/uk.ts to enable. " +
          "Site boundaries are approximated from OSM industrial zones.",
      };
    }

    // ── Unsupported country ──────────────────────────────────────────────────
    const isEu =
      IMPLEMENTED.has(country) || STUB.has(country)
        ? true
        : ["Germany", "Belgium", "Denmark", "Sweden", "Norway", "Finland",
           "Spain", "Portugal", "Italy", "Poland", "Czechia", "Romania",
           "Ireland", "Austria", "Switzerland"].includes(country);

    const suggestion = isEu
      ? `To add cadastral support for ${country}, create server/dataCentreSites/cadastral/${country.toLowerCase().replace(/\s+/g, "-")}.ts and add it to the CONNECTORS map in cadastral/index.ts.`
      : `${country} has no national cadastral API connector implemented.`;

    return {
      parcels: [],
      dataAvailable: false,
      notes: `No cadastral connector for ${country}. ${suggestion} Site boundaries use OSM industrial zone polygons as a proxy.`,
    };
  } catch (err: any) {
    console.error(`[Cadastral] Error fetching parcels for ${country}:`, err.message);
    return {
      parcels: [],
      dataAvailable: false,
      notes: `Cadastral fetch failed for ${country}: ${err.message}. Falling back to OSM boundaries.`,
    };
  }
}
