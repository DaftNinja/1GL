// CARTO basemap tile URLs. CARTO now requires a free API key, supplied at
// build time via VITE_CARTO_API_KEY (get one at https://carto.com/basemaps/apikey/).
// Without the key the tiles render an "API KEY REQUIRED" watermark.
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined;

export type CartoStyle =
  | "light_all"
  | "light_nolabels"
  | "light_only_labels";

export function cartoTileUrl(style: CartoStyle): string {
  const base = `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png`;
  return CARTO_KEY ? `${base}?key=${encodeURIComponent(CARTO_KEY)}` : base;
}
