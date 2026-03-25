import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";

interface NGEDSubstation {
  id: string;
  name: string;
  substationType: string;
  licenceArea: string;
  demandHeadroomMW: number | null;
  generationHeadroomMW: number | null;
  demandMW: number | null;
  firmCapacityMW: number | null;
  lat: number;
  lng: number;
}

interface NGEDNetworkCapacityResult {
  substations: NGEDSubstation[];
  totalCount: number;
  fetchedAt: string;
  summary: {
    byLicenceArea: Record<string, number>;
    byType: Record<string, number>;
    avgDemandHeadroom: number | null;
    avgGenHeadroom: number | null;
  };
}

interface NGEDOpportunitySite {
  id: string;
  name: string;
  connectionType: string;
  licenceArea: string;
  headroomMW: number | null;
  voltage: string;
  lat: number;
  lng: number;
}

interface NGEDOpportunityMapResult {
  sites: NGEDOpportunitySite[];
  totalCount: number;
  fetchedAt: string;
}

const NGED_AREA_COLORS: Record<string, string> = {
  "East Midlands": "#e11d48",
  "West Midlands": "#db2777",
  "South West": "#c026d3",
  "South Wales": "#9333ea",
};

function getAreaColor(area: string): string {
  for (const [key, color] of Object.entries(NGED_AREA_COLORS)) {
    if (area.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#be185d";
}

function headroomColor(mw: number | null): string {
  if (mw == null) return "#94a3b8";
  if (mw <= 0) return "#dc2626";
  if (mw < 10) return "#f59e0b";
  return "#16a34a";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Props {
  map: L.Map | null;
  showNetworkCapacity: boolean;
  showOpportunityMap: boolean;
}

export default function NGEDNetworkLayer({
  map,
  showNetworkCapacity,
  showOpportunityMap,
}: Props) {
  const capacityLayerRef = useRef<L.LayerGroup | null>(null);
  const opportunityLayerRef = useRef<L.LayerGroup | null>(null);

  const { data: capacityData } = useQuery<NGEDNetworkCapacityResult>({
    queryKey: ["/api/nged/network-capacity"],
    staleTime: 12 * 60 * 60 * 1000,
    enabled: showNetworkCapacity,
    retry: 1,
  });

  const { data: opportunityData } = useQuery<NGEDOpportunityMapResult>({
    queryKey: ["/api/nged/opportunity-map"],
    staleTime: 12 * 60 * 60 * 1000,
    enabled: showOpportunityMap,
    retry: 1,
  });

  const ensureLayer = useCallback(
    (ref: React.MutableRefObject<L.LayerGroup | null>) => {
      if (!map) return null;
      if (!ref.current) {
        ref.current = L.layerGroup();
      }
      return ref.current;
    },
    [map]
  );

  useEffect(() => {
    if (!map) return;
    const layer = ensureLayer(capacityLayerRef);
    if (!layer) return;

    layer.clearLayers();

    if (showNetworkCapacity && capacityData?.substations) {
      for (const s of capacityData.substations) {
        const color = getAreaColor(s.licenceArea);
        const hColor = headroomColor(s.demandHeadroomMW);
        const isBSP = s.substationType.toLowerCase().includes("bsp") || s.substationType.toLowerCase().includes("bulk");
        const radius = isBSP ? 7 : 5;

        const marker = L.circleMarker([s.lat, s.lng], {
          radius,
          fillColor: color,
          fillOpacity: 0.8,
          color: "#fff",
          weight: 1.5,
          opacity: 0.9,
        });

        const fmtMW = (v: number | null) => v != null ? `${v.toFixed(1)} MW` : "–";

        const headroomBar = s.demandHeadroomMW != null
          ? `<div style="margin-top:6px">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:2px">
                <span>Demand headroom</span>
                <span style="font-weight:700;color:${hColor}">${fmtMW(s.demandHeadroomMW)}</span>
              </div>
              <div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden">
                <div style="background:${hColor};height:100%;width:${Math.min(Math.max((s.demandHeadroomMW / 50) * 100, 5), 100)}%;border-radius:3px"></div>
              </div>
            </div>`
          : "";

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:220px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(s.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:5px">${escapeHtml(s.licenceArea)} · ${escapeHtml(s.substationType)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span style="font-size:12px;font-weight:600;color:#374151">NGED Substation</span>
            </div>
            ${s.firmCapacityMW != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Firm capacity:</strong> ${fmtMW(s.firmCapacityMW)}</div>` : ""}
            ${s.demandMW != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Peak demand:</strong> ${fmtMW(s.demandMW)}</div>` : ""}
            ${s.generationHeadroomMW != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Gen headroom:</strong> ${fmtMW(s.generationHeadroomMW)}</div>` : ""}
            ${headroomBar}
            ${(s as any).coordinateSource === "inferred" ? `<div style="font-size:10px;color:#f59e0b;margin-top:4px">⚠ Approximate location (coordinates inferred)</div>` : ""}
          </div>`,
          { maxWidth: 300 }
        );

        marker.addTo(layer);
      }
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }, [map, showNetworkCapacity, capacityData, ensureLayer]);

  useEffect(() => {
    if (!map) return;
    const layer = ensureLayer(opportunityLayerRef);
    if (!layer) return;

    layer.clearLayers();

    if (showOpportunityMap && opportunityData?.sites) {
      for (const s of opportunityData.sites) {
        const color = getAreaColor(s.licenceArea);
        const hColor = headroomColor(s.headroomMW);

        const marker = L.circleMarker([s.lat, s.lng], {
          radius: 5,
          fillColor: color,
          fillOpacity: 0.5,
          color,
          weight: 2,
          opacity: 0.7,
          dashArray: "4 3",
        });

        const fmtMW = (v: number | null) => v != null ? `${v.toFixed(1)} MW` : "–";

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(s.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:5px">${escapeHtml(s.licenceArea)} · Opportunity Map</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span style="font-size:12px;font-weight:600;color:#374151">${escapeHtml(s.connectionType)}</span>
            </div>
            <div style="font-size:12px;margin-bottom:2px"><strong>Voltage:</strong> ${escapeHtml(s.voltage)}</div>
            <div style="font-size:12px;margin-bottom:2px">
              <strong>Headroom:</strong>
              <span style="color:${hColor};font-weight:700">${fmtMW(s.headroomMW)}</span>
            </div>
            ${(s as any).coordinateSource === "inferred" ? `<div style="font-size:10px;color:#f59e0b;margin-top:4px">⚠ Approximate location (coordinates inferred)</div>` : ""}
          </div>`,
          { maxWidth: 280 }
        );

        marker.addTo(layer);
      }
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }, [map, showOpportunityMap, opportunityData, ensureLayer]);

  useEffect(() => {
    return () => {
      if (map) {
        if (capacityLayerRef.current) map.removeLayer(capacityLayerRef.current);
        if (opportunityLayerRef.current) map.removeLayer(opportunityLayerRef.current);
      }
    };
  }, [map]);

  return null;
}
