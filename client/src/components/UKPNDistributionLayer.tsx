import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";

interface GridSubstation {
  id: string;
  siteName: string;
  dnoArea: string;
  operationalVoltage: number | null;
  transformerRatingKVA: number | null;
  lat: number;
  lng: number;
}

interface ConnectionQueueItem {
  id: string;
  primarySubstation: string;
  dnoArea: string;
  demandMW: number | null;
  generationMW: number | null;
  connectionStatus: string;
  lat: number;
  lng: number;
}

interface FaultLevelItem {
  id: string;
  substationName: string;
  dnoArea: string;
  existingFaultLevelKA: number | null;
  ratedFaultLevelKA: number | null;
  headroomKA: number | null;
  headroomPct: number | null;
  lat: number;
  lng: number;
}

const DNO_COLORS: Record<string, string> = {
  LPN: "#3b82f6",
  EPN: "#22c55e",
  SPN: "#f97316",
};

function getDNOColor(dno: string): string {
  return DNO_COLORS[dno] || "#94a3b8";
}

function getSubstationRadius(kva: number | null): number {
  if (kva == null) return 4;
  if (kva < 10000) return 3;
  if (kva < 30000) return 5;
  if (kva < 60000) return 7;
  if (kva < 100000) return 9;
  return 11;
}

function faultHeadroomColor(pct: number | null): string {
  if (pct == null) return "#94a3b8";
  if (pct < 10) return "#dc2626";
  if (pct < 30) return "#f59e0b";
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
  showGridSubstations: boolean;
  showConnectionQueue: boolean;
  showFaultLevels: boolean;
}

export default function UKPNDistributionLayer({
  map,
  showGridSubstations,
  showConnectionQueue,
  showFaultLevels,
}: Props) {
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const connLayerRef = useRef<L.LayerGroup | null>(null);
  const faultLayerRef = useRef<L.LayerGroup | null>(null);

  const { data: gridData } = useQuery<GridSubstation[]>({
    queryKey: ["/api/ukpn/grid-substations"],
    staleTime: 4 * 60 * 60 * 1000,
    enabled: showGridSubstations,
    retry: 1,
  });

  const { data: connData } = useQuery<ConnectionQueueItem[]>({
    queryKey: ["/api/ukpn/connection-queue"],
    staleTime: 4 * 60 * 60 * 1000,
    enabled: showConnectionQueue,
    retry: 1,
  });

  const { data: faultData } = useQuery<FaultLevelItem[]>({
    queryKey: ["/api/ukpn/fault-levels"],
    staleTime: 4 * 60 * 60 * 1000,
    enabled: showFaultLevels,
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
    const layer = ensureLayer(gridLayerRef);
    if (!layer) return;

    layer.clearLayers();

    if (showGridSubstations && gridData) {
      for (const s of gridData) {
        const color = getDNOColor(s.dnoArea);
        const radius = getSubstationRadius(s.transformerRatingKVA);

        const marker = L.circleMarker([s.lat, s.lng], {
          radius,
          fillColor: color,
          fillOpacity: 0.75,
          color: "#fff",
          weight: 1.5,
          opacity: 0.9,
        });

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(s.siteName)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span style="font-size:12px;font-weight:600">${escapeHtml(s.dnoArea)}</span>
              <span style="font-size:10px;color:#94a3b8">Grid Substation</span>
            </div>
            ${s.operationalVoltage != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Voltage:</strong> ${s.operationalVoltage} kV</div>` : ""}
            ${s.transformerRatingKVA != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Rating:</strong> ${s.transformerRatingKVA.toLocaleString()} kVA</div>` : ""}
          </div>`,
          { maxWidth: 280 }
        );

        marker.addTo(layer);
      }
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }, [map, showGridSubstations, gridData, ensureLayer]);

  useEffect(() => {
    if (!map) return;
    const layer = ensureLayer(connLayerRef);
    if (!layer) return;

    layer.clearLayers();

    if (showConnectionQueue && connData) {
      for (const c of connData) {
        const totalMW = (c.demandMW || 0) + (c.generationMW || 0);
        const radius = totalMW > 50 ? 10 : totalMW > 20 ? 7 : totalMW > 5 ? 5 : 4;
        const color = getDNOColor(c.dnoArea);

        const marker = L.circleMarker([c.lat, c.lng], {
          radius,
          fillColor: color,
          fillOpacity: 0.5,
          color,
          weight: 2,
          opacity: 0.8,
          dashArray: "4 3",
        });

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(c.primarySubstation)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span style="font-size:12px;font-weight:600">${escapeHtml(c.dnoArea)}</span>
              <span style="font-size:10px;color:#94a3b8">Connection Queue</span>
            </div>
            ${c.demandMW != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Demand queued:</strong> ${c.demandMW.toFixed(1)} MW</div>` : ""}
            ${c.generationMW != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Generation queued:</strong> ${c.generationMW.toFixed(1)} MW</div>` : ""}
            ${c.connectionStatus ? `<div style="font-size:11px;color:#64748b;margin-top:4px">${escapeHtml(c.connectionStatus)}</div>` : ""}
          </div>`,
          { maxWidth: 280 }
        );

        marker.addTo(layer);
      }
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }, [map, showConnectionQueue, connData, ensureLayer]);

  useEffect(() => {
    if (!map) return;
    const layer = ensureLayer(faultLayerRef);
    if (!layer) return;

    layer.clearLayers();

    if (showFaultLevels && faultData) {
      for (const f of faultData) {
        const headColor = faultHeadroomColor(f.headroomPct);

        const marker = L.circleMarker([f.lat, f.lng], {
          radius: 5,
          fillColor: headColor,
          fillOpacity: 0.7,
          color: "#fff",
          weight: 1,
          opacity: 0.9,
        });

        const headroomBar =
          f.headroomPct != null
            ? `<div style="margin-top:6px">
                <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:2px">
                  <span>Fault level headroom</span>
                  <span style="font-weight:700;color:${headColor}">${Math.round(f.headroomPct)}%</span>
                </div>
                <div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden">
                  <div style="background:${headColor};height:100%;width:${Math.min(f.headroomPct, 100)}%;border-radius:3px"></div>
                </div>
              </div>`
            : "";

        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
            <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px">${escapeHtml(f.substationName)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${getDNOColor(f.dnoArea)}"></span>
              <span style="font-size:12px;font-weight:600">${escapeHtml(f.dnoArea)}</span>
              <span style="font-size:10px;color:#94a3b8">Fault Level</span>
            </div>
            ${f.existingFaultLevelKA != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Existing:</strong> ${f.existingFaultLevelKA.toFixed(2)} kA</div>` : ""}
            ${f.ratedFaultLevelKA != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Rated:</strong> ${f.ratedFaultLevelKA.toFixed(2)} kA</div>` : ""}
            ${f.headroomKA != null ? `<div style="font-size:12px;margin-bottom:2px"><strong>Headroom:</strong> ${f.headroomKA.toFixed(2)} kA</div>` : ""}
            ${headroomBar}
          </div>`,
          { maxWidth: 280 }
        );

        marker.addTo(layer);
      }
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }, [map, showFaultLevels, faultData, ensureLayer]);

  useEffect(() => {
    return () => {
      if (map) {
        if (gridLayerRef.current) map.removeLayer(gridLayerRef.current);
        if (connLayerRef.current) map.removeLayer(connLayerRef.current);
        if (faultLayerRef.current) map.removeLayer(faultLayerRef.current);
      }
    };
  }, [map]);

  return null;
}
