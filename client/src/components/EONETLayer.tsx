import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";

interface EONETEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  categoryTitle: string;
  date: string;
  coordinates: [number, number]; // [lng, lat]
  magnitude: number | null;
  magnitudeUnit: string | null;
  sources: Array<{ id: string; url: string }>;
  closed: string | null;
}

export interface EONETResponse {
  _meta: {
    source: string;
    fetchedAt: string;
    totalEvents: number;
    categories: Record<string, number>;
  };
  events: EONETEvent[];
}

export const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  wildfires:    { color: "#f97316", icon: "🔥" },
  severeStorms: { color: "#7c3aed", icon: "⛈️" },
  earthquakes:  { color: "#92400e", icon: "🌍" },
  floods:       { color: "#0ea5e9", icon: "🌊" },
  volcanoes:    { color: "#be123c", icon: "🌋" },
  tempExtremes: { color: "#ef4444", icon: "🌡️" },
  drought:      { color: "#d97706", icon: "☁️" },
  landslides:   { color: "#78350f", icon: "🏔️" },
};

const DEFAULT_STYLE = { color: "#64748b", icon: "⚠️" };

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function markerRadius(event: EONETEvent): number {
  if (event.category === "earthquakes" && event.magnitude != null) {
    return Math.max(4, Math.min(16, event.magnitude * 2));
  }
  return 6;
}

interface Props {
  map: L.Map | null;
  show: boolean;
  enabledCategories: Set<string>;
}

export default function EONETLayer({ map, show, enabledCategories }: Props) {
  const layerRef = useRef<L.LayerGroup | null>(null);

  const { data, isLoading, error } = useQuery<EONETResponse>({
    queryKey: ["/api/eonet/events"],
    staleTime: 30 * 60 * 1000,
    enabled: show,
    retry: 1,
  });

  const ensureLayer = useCallback(() => {
    if (!map) return null;
    if (!layerRef.current) {
      layerRef.current = L.layerGroup();
    }
    return layerRef.current;
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const layer = ensureLayer();
    if (!layer) return;

    layer.clearLayers();

    if (show && data?.events?.length) {
      for (const event of data.events) {
        if (!enabledCategories.has(event.category)) continue;

        const [lng, lat] = event.coordinates;
        if (!isFinite(lat) || !isFinite(lng)) continue;

        const style = CATEGORY_STYLE[event.category] ?? DEFAULT_STYLE;
        const radius = markerRadius(event);

        const marker = L.circleMarker([lat, lng], {
          radius,
          fillColor: style.color,
          fillOpacity: 0.75,
          color: "#fff",
          weight: 1.5,
          opacity: 0.9,
        });

        const magnitudeRow =
          event.magnitude != null
            ? `<div style="font-size:12px;margin-bottom:2px"><strong>Magnitude:</strong> ${event.magnitude}${event.magnitudeUnit ? ` ${escapeHtml(event.magnitudeUnit)}` : ""}</div>`
            : "";

        const sourceLinks = event.sources
          .filter((s) => s.url)
          .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline">${escapeHtml(s.id)}</a>`)
          .join(" · ");

        const sourceRow = sourceLinks
          ? `<div style="font-size:11px;margin-top:4px"><strong>Source:</strong> ${sourceLinks}</div>`
          : "";

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:210px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:3px">
              ${style.icon} ${escapeHtml(event.title)}
            </div>
            <div style="font-size:11px;color:#64748b;margin-bottom:5px">${escapeHtml(event.categoryTitle)}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Date:</strong> ${formatDate(event.date)}</div>
            ${magnitudeRow}
            ${sourceRow}
            <div style="font-size:10px;color:#94a3b8;margin-top:5px">Source: NASA EONET v3</div>
          </div>`,
          { maxWidth: 300 }
        );

        marker.addTo(layer);
      }
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }, [map, show, data, enabledCategories, ensureLayer]);

  useEffect(() => {
    return () => {
      if (map && layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [map]);

  return null;
}
