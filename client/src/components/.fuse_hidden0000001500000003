import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Map, Layers, AlertTriangle, Flame } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface SSEPData {
  onshore: GeoJSON.FeatureCollection;
  offshore: GeoJSON.FeatureCollection;
  economic: GeoJSON.FeatureCollection;
  fetchedAt: string;
}

const ZONE_COLORS = {
  onshore:      { fill: "#1976D2", stroke: "#0D47A1", fillOpacity: 0.25 },
  offshore:     { fill: "#00ACC1", stroke: "#00838F", fillOpacity: 0.2  },
  economic:     { fill: "#7B1FA2", stroke: "#4A148C", fillOpacity: 0.15 },
  heatStrategic:{ fill: "#e55039", stroke: "#c0392b", fillOpacity: 0.35 },
  heatOther:    { fill: "#f39c12", stroke: "#d68910", fillOpacity: 0.28 },
};

type LayerType = "onshore" | "offshore" | "economic" | "heatNetworks";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function SSEPMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<Record<string, L.LayerGroup | L.GeoJSON>>({});
  const [activeLayers, setActiveLayers] = useState<Set<LayerType>>(
    new Set(["onshore", "offshore"])
  );
  const [mapReady, setMapReady] = useState(false);

  const { data, isLoading, error } = useQuery<SSEPData>({
    queryKey: ["/api/neso/ssep-zones"],
    queryFn: async () => {
      const res = await fetch("/api/neso/ssep-zones", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: 1,
    staleTime: 4 * 60 * 60 * 1000,
  });

  const [heatData, setHeatData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  useEffect(() => {
    setHeatLoading(true);
    fetch("/uk-heat-network-zones.geojson")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: GeoJSON.FeatureCollection) => { setHeatData(json); setHeatLoading(false); })
      .catch(err => { console.error("[SSEPMap] heat GeoJSON fetch error:", err); setHeatLoading(false); });
  }, []);

  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;

    const map = L.map(node, {
      center: [54.5, -2],
      zoom: 5,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    mapContainerRef.current = node;
    setMapReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // SSEP layers
  useEffect(() => {
    if (!data || !mapRef.current || !mapReady) return;
    const map = mapRef.current;

    (["onshore", "offshore", "economic"] as const).forEach(t => {
      if (layerGroupsRef.current[t]) map.removeLayer(layerGroupsRef.current[t]);
    });

    const addSSEPLayer = (
      geojson: GeoJSON.FeatureCollection,
      type: "onshore" | "offshore" | "economic"
    ) => {
      const colors = ZONE_COLORS[type];
      const layer = L.geoJSON(geojson, {
        style: () => ({
          color: colors.stroke,
          weight: 2,
          fillColor: colors.fill,
          fillOpacity: colors.fillOpacity,
          opacity: 0.8,
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const name = escapeHtml(
            props.ssep_pubzn ||
            props.PUB_ZN_ID ||
            props.SSEP_Zone ||
            props.Label_Str ||
            props.Region ||
            `Zone ${type}`
          );
          const region = props.Region ? escapeHtml(props.Region) : "";
          const area = props.Zn_Area_Ha
            ? `<br/>Area: ${escapeHtml(Number(props.Zn_Area_Ha).toLocaleString())} ha`
            : props.Shape_Area
            ? `<br/>Area: ${escapeHtml((Number(props.Shape_Area) / 1e6).toFixed(0))} km²`
            : "";

          layer.bindPopup(
            `<div style="font-family:system-ui;font-size:13px;max-width:220px">
              <strong>${name}</strong>
              ${region ? `<br/><span style="color:#64748b">${region}</span>` : ""}
              ${area}
              <br/><span style="color:#94a3b8;font-size:11px;">${escapeHtml(type.charAt(0).toUpperCase() + type.slice(1))} Zone</span>
            </div>`
          );
          layer.on("mouseover", function (this: L.Layer) {
            (this as L.Path).setStyle({ fillOpacity: colors.fillOpacity + 0.25, weight: 3 });
          });
          layer.on("mouseout", function (this: L.Layer) {
            (this as L.Path).setStyle({ fillOpacity: colors.fillOpacity, weight: 2 });
          });
        },
      });

      layerGroupsRef.current[type] = layer;
      if (activeLayers.has(type)) layer.addTo(map);
    };

    if (data.onshore?.features?.length) addSSEPLayer(data.onshore, "onshore");
    if (data.offshore?.features?.length) addSSEPLayer(data.offshore, "offshore");
    if (data.economic?.features?.length) addSSEPLayer(data.economic, "economic");
  }, [data, mapReady]);

  // Heat network zones layer — owns full add/remove lifecycle
  const heatNetworksActive = activeLayers.has("heatNetworks");
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    // Always remove the previous group first
    if (layerGroupsRef.current["heatNetworks"]) {
      map.removeLayer(layerGroupsRef.current["heatNetworks"]);
      delete layerGroupsRef.current["heatNetworks"];
    }

    if (!heatNetworksActive || !heatData) return;

    const group = L.layerGroup();

    // Polygon / MultiPolygon zones
    const polygonFeatures: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: heatData.features.filter(
        f => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
      ),
    };

    L.geoJSON(polygonFeatures, {
      style: (feature) => {
        const isStrategic =
          (feature?.properties?.zone_type ?? "").includes("Strategic");
        const c = isStrategic ? ZONE_COLORS.heatStrategic : ZONE_COLORS.heatOther;
        return {
          color: c.stroke,
          weight: 1.5,
          fillColor: c.fill,
          fillOpacity: c.fillOpacity,
          opacity: 0.9,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const isStrategic = (p.zone_type ?? "").includes("Strategic");
        const c = isStrategic ? ZONE_COLORS.heatStrategic : ZONE_COLORS.heatOther;

        const name = escapeHtml(p.zone_name ?? p.zone_id ?? "Heat Network Zone");
        const region = escapeHtml(p.region ?? "");
        const zoneType = escapeHtml(p.zone_type ?? "");
        const area = p.approximate_area_ha
          ? `<br/><span style="color:#64748b">Area: ~${Number(p.approximate_area_ha).toLocaleString()} ha</span>`
          : "";
        const desc = p.description
          ? `<br/><span style="color:#475569;font-size:11px;line-height:1.4">${escapeHtml(p.description)}</span>`
          : "";

        layer.bindPopup(
          `<div style="font-family:system-ui;font-size:13px;max-width:260px">
            <strong>${name}</strong>
            ${region ? `<br/><span style="color:#64748b;font-size:12px">${region}</span>` : ""}
            <br/><span style="background:${c.fill};color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px">${zoneType}</span>
            ${area}${desc}
          </div>`,
          { maxWidth: 280 }
        );

        layer.on("mouseover", function (this: L.Layer) {
          (this as L.Path).setStyle({ fillOpacity: c.fillOpacity + 0.2, weight: 2.5 });
        });
        layer.on("mouseout", function (this: L.Layer) {
          (this as L.Path).setStyle({ fillOpacity: c.fillOpacity, weight: 1.5 });
        });
      },
    }).addTo(group);

    // Point energy centres
    const pointFeatures = heatData.features.filter(
      f => f.geometry && f.geometry.type === "Point"
    );
    for (const feature of pointFeatures) {
      const geom = feature.geometry as GeoJSON.Point;
      const [lng, lat] = geom.coordinates;
      const p = feature.properties || {};
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#7b241c",
        weight: 1.5,
        fillColor: "#e74c3c",
        fillOpacity: 0.9,
      });
      const name = escapeHtml(p.zone_name ?? p.zone_id ?? "Energy Centre");
      const region = escapeHtml(p.region ?? "");
      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:13px;max-width:220px">
          <strong>${name}</strong>
          ${region ? `<br/><span style="color:#64748b;font-size:12px">${region}</span>` : ""}
          <br/><span style="background:#c0392b;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px">Energy Centre</span>
        </div>`
      );
      marker.addTo(group);
    }

    layerGroupsRef.current["heatNetworks"] = group;
    group.addTo(map);
  }, [heatData, mapReady, heatNetworksActive]);

  // Toggle SSEP layers on/off (heatNetworks handled above)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    (["onshore", "offshore", "economic"] as const).forEach(type => {
      const layer = layerGroupsRef.current[type];
      if (!layer) return;
      if (activeLayers.has(type)) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
  }, [activeLayers]);

  const toggleLayer = (type: LayerType) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const heatZoneCount = heatData?.features?.filter(
    f => f.geometry && f.geometry.type !== "Point"
  ).length ?? 0;
  const energyCentreCount = heatData?.features?.filter(
    f => f.geometry && f.geometry.type === "Point"
  ).length ?? 0;

  if (error) {
    return (
      <Card className="border-none shadow-md mb-8" data-testid="card-ssep-map-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">
              Unable to load SSEP energy zone data. The map will be available when the data source is reachable.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ssepLayers: { type: "onshore" | "offshore" | "economic"; label: string }[] = [
    { type: "onshore",  label: "Onshore" },
    { type: "offshore", label: "Offshore" },
    { type: "economic", label: "Economic" },
  ];

  return (
    <Card className="border-none shadow-md mb-8" data-testid="card-ssep-map">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Map className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">UK SSEP Zones & Heat Network Zones</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                NESO Strategic Spatial Energy Plan · DESNZ Heat Network Zoning Pilot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-slate-400" />
            {ssepLayers.map(({ type, label }) => (
              <Button
                key={type}
                variant={activeLayers.has(type) ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => toggleLayer(type)}
                data-testid={`btn-toggle-${type}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full mr-1.5 inline-block"
                  style={{ backgroundColor: ZONE_COLORS[type].fill }}
                />
                {label}
              </Button>
            ))}

            <Button
              variant={activeLayers.has("heatNetworks") ? "default" : "outline"}
              size="sm"
              className={`text-xs h-7 px-2 gap-1.5 ${activeLayers.has("heatNetworks") ? "bg-orange-600 hover:bg-orange-700 border-orange-600" : "border-orange-300 text-orange-700 hover:bg-orange-50"}`}
              onClick={() => toggleLayer("heatNetworks")}
              disabled={heatLoading}
              data-testid="btn-toggle-heat-networks"
            >
              {heatLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Flame className="w-3 h-3" />}
              Heat Networks
              {heatZoneCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5 bg-white/20 text-inherit border-0">
                  {heatZoneCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Legend row for heat network zones */}
        {activeLayers.has("heatNetworks") && heatZoneCount > 0 && (
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap pl-0.5">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-3 rounded-sm border border-[#c0392b]" style={{ background: "#e55039", opacity: 0.75 }} />
              Strategic HNZ
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-3 rounded-sm border border-[#d68910]" style={{ background: "#f39c12", opacity: 0.75 }} />
              Other HNZ
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border border-[#7b241c]" style={{ background: "#e74c3c" }} />
              Energy Centre ({energyCentreCount})
            </span>
            <span className="text-slate-400">Source: DESNZ HNZ Pilot · boundaries approximate</span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <div className="relative">
          <div
            ref={initMap}
            className="w-full rounded-lg overflow-hidden border border-slate-200"
            style={{ height: "500px" }}
            data-testid="map-ssep-zones"
          />
          {(isLoading || (heatLoading && activeLayers.has("heatNetworks"))) && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg z-[1000]">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-2" />
              <span className="text-sm text-slate-500">
                {isLoading ? "Loading SSEP zone data from NESO…" : "Loading heat network zones…"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
          <p className="text-xs text-slate-400">
            Supported by National Energy SO Open Data · DESNZ Heat Network Zoning Pilot
          </p>
          {data?.fetchedAt && (
            <p className="text-xs text-slate-400">
              SSEP data: {new Date(data.fetchedAt).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
