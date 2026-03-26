import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Radio, AlertTriangle, ZoomIn, ZoomOut, RefreshCw, ArrowRightLeft } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTROIDS, INTERCONNECTORS } from "@/lib/gridConstants";

interface CrossBorderFlow {
  from: string;
  to: string;
  netMw: number;
  inMw: number;
  outMw: number;
  updatedAt: string;
}

interface FlowArc {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  netMw: number;
  fromName: string;
  toName: string;
  icFrom: string;
  icTo: string;
  outMw: number;
  inMw: number;
}

function getNetDirection(flow: CrossBorderFlow) {
  return flow.netMw > 0
    ? { exporterName: flow.to, importerName: flow.from }
    : { exporterName: flow.from, importerName: flow.to };
}

function buildHourOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24; i++) {
    const endHour = new Date(now.getTime() - i * 60 * 60 * 1000);
    const startHour = new Date(endHour.getTime() - 60 * 60 * 1000);
    const fmt = (d: Date) => ({
      hh: d.getUTCHours().toString().padStart(2, "0"),
      dd: d.getUTCDate().toString().padStart(2, "0"),
      mm: (d.getUTCMonth() + 1).toString().padStart(2, "0"),
    });
    const s = fmt(startHour);
    const e = fmt(endHour);
    const datePrefix = i === 0 ? "Latest" : `${s.dd}/${s.mm}`;
    options.push({ value: String(i), label: `${datePrefix} ${s.hh}:00–${e.hh}:00 UTC` });
  }
  return options;
}

const COUNTRY_CODE: Record<string, string> = {
  "Norway": "NO", "Sweden": "SE", "Finland": "FI", "Denmark": "DK",
  "United Kingdom": "UK", "Ireland": "IE", "Estonia": "EE", "Latvia": "LV",
  "Lithuania": "LT", "Germany": "DE", "Netherlands": "NL", "Belgium": "BE",
  "Luxembourg": "LU", "France": "FR", "Switzerland": "CH", "Austria": "AT",
  "Spain": "ES", "Portugal": "PT", "Poland": "PL", "Czech Republic": "CZ",
  "Slovakia": "SK", "Hungary": "HU", "Italy": "IT", "Slovenia": "SI",
  "Croatia": "HR", "Greece": "GR", "Romania": "RO", "Bulgaria": "BG",
  "Serbia": "RS", "Bosnia": "BA", "Montenegro": "ME", "North Macedonia": "MK",
  "Albania": "AL", "Moldova": "MD", "Turkey": "TR",
};

const CAPITALS: Record<string, [number, number]> = {
  "Norway":          [59.9139,  10.7522],
  "Sweden":          [59.3293,  18.0686],
  "Finland":         [60.1699,  24.9384],
  "Denmark":         [55.6761,  12.5683],
  "United Kingdom":  [51.5074,  -0.1278],
  "Ireland":         [53.3498,  -6.2603],
  "Estonia":         [59.4370,  24.7536],
  "Latvia":          [56.9460,  24.1059],
  "Lithuania":       [54.6872,  25.2797],
  "Germany":         [52.5200,  13.4050],
  "Netherlands":     [52.3676,   4.9041],
  "Belgium":         [50.8503,   4.3517],
  "Luxembourg":      [49.6116,   6.1319],
  "France":          [48.8566,   2.3522],
  "Switzerland":     [46.9481,   7.4474],
  "Austria":         [48.2082,  16.3738],
  "Spain":           [40.4168,  -3.7038],
  "Portugal":        [38.7169,  -9.1399],
  "Poland":          [52.2297,  21.0122],
  "Czech Republic":  [50.0755,  14.4378],
  "Slovakia":        [48.1486,  17.1077],
  "Hungary":         [47.4979,  19.0402],
  "Italy":           [41.9028,  12.4964],
  "Slovenia":        [46.0569,  14.5058],
  "Croatia":         [45.8150,  15.9819],
  "Greece":          [37.9838,  23.7275],
  "Romania":         [44.4268,  26.1025],
  "Bulgaria":        [42.6977,  23.3219],
  "Serbia":          [44.7866,  20.4489],
  "Bosnia":          [43.8563,  18.4131],
  "Montenegro":      [42.4304,  19.2594],
  "North Macedonia": [41.9981,  21.4254],
  "Albania":         [41.3275,  19.8187],
  "Moldova":         [47.0105,  28.8638],
  "Turkey":          [39.9334,  32.8597],
};

function mwToColorHex(netMw: number): string {
  if (Math.abs(netMw) < 10) return "#94a3b8";
  const abs = Math.abs(netMw);
  const intensity = Math.min(1, abs / 4000);
  if (netMw < 0) {
    const r = Math.round(37 + intensity * 20);
    const g = Math.round(99 + intensity * 57);
    const b = Math.round(235 - intensity * 10);
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(22 + intensity * 10);
  const g = Math.round(163 - intensity * 40);
  const b = Math.round(74 - intensity * 30);
  return `rgb(${r},${g},${b})`;
}

function lineWeight(netMw: number): number {
  const abs = Math.abs(netMw);
  if (abs < 100) return 2;
  if (abs < 500) return 3;
  if (abs < 1500) return 4;
  if (abs < 3000) return 6;
  return 8;
}

// Approximate a geographic Bezier arc with N lat/lng points.
// The control point is perpendicular to the midpoint of the chord.
function bezierLatLngPoints(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  n = 32,
): L.LatLngExpression[] {
  const dLng = toLng - fromLng;
  const dLat = toLat - fromLat;
  const dist = Math.sqrt(dLng * dLng + dLat * dLat);
  const bulge = Math.min(3.5, 1.4 / Math.max(dist, 0.1)) * dist;
  const mx = (fromLng + toLng) / 2;
  const my = (fromLat + toLat) / 2;
  const perpLng = (-dLat / Math.max(dist, 0.001)) * bulge;
  const perpLat = (dLng / Math.max(dist, 0.001)) * bulge;
  const clng = mx + perpLng;
  const clat = my + perpLat;

  const pts: L.LatLngExpression[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const lat = mt * mt * fromLat + 2 * mt * t * clat + t * t * toLat;
    const lng = mt * mt * fromLng + 2 * mt * t * clng + t * t * toLng;
    pts.push([lat, lng]);
  }
  return pts;
}

// ── SVG-based flow layer using Leaflet's native polyline renderer ──────────
// L.Polyline handles ALL coordinate management during pan and zoom.
// Animation is done via CSS stroke-dashoffset on the SVG <path> element.
// ──────────────────────────────────────────────────────────────────────────

interface ArcLayer {
  ghost: L.Polyline;
  anim: L.Polyline;
  hit: L.Polyline;
  arc: FlowArc;
  weight: number;
  color: string;
}

class FlowSVGLayer {
  private map: L.Map;
  private arcLayers: ArcLayer[] = [];
  private arcs: FlowArc[] = [];
  private selectedCountry: string | null = null;
  private animTimers: ReturnType<typeof setTimeout>[] = [];
  private onArcHover?: (arc: FlowArc | null, latlng?: L.LatLng) => void;

  constructor(map: L.Map) {
    this.map = map;
    // Raise the existing overlayPane above the markerPane (600) so arcs
    // render on top of country-label markers for this map instance only.
    const overlayPane = map.getPane("overlayPane");
    if (overlayPane) overlayPane.style.zIndex = "625";
  }

  setOnArcHover(cb: (arc: FlowArc | null, latlng?: L.LatLng) => void) {
    this.onArcHover = cb;
  }

  setArcs(arcs: FlowArc[]) {
    this.clear();
    this.arcs = arcs;
    this._draw();
  }

  setSelectedCountry(country: string | null) {
    this.selectedCountry = country;
    this._updateStyles();
  }

  private _isRelevant(arc: FlowArc): boolean {
    if (!this.selectedCountry) return true;
    return arc.icFrom === this.selectedCountry || arc.icTo === this.selectedCountry;
  }

  private _draw() {
    for (const arc of this.arcs) {
      const active = Math.abs(arc.netMw) >= 10;
      const relevant = this._isRelevant(arc);
      const color = mwToColorHex(arc.netMw);
      const weight = lineWeight(arc.netMw);
      const pts = bezierLatLngPoints(arc.originLat, arc.originLng, arc.destLat, arc.destLng);

      if (!active) continue; // flow < 10 MW — skip rather than show a blank line

      // 1. Ghost line — thin solid track so the path is always visible
      const ghost = L.polyline(pts, {
        color,
        weight: Math.max(1, weight - 1),
        opacity: relevant ? 0.25 : 0.08,
        interactive: false,
        bubblingMouseEvents: false,
      }).addTo(this.map);

      // 2. Animated dash line — purely visual, no interaction
      const anim = L.polyline(pts, {
        color,
        weight,
        opacity: relevant ? 0.85 : 0.15,
        interactive: false,
        bubblingMouseEvents: false,
      }).addTo(this.map);

      // 3. Hit zone — wide transparent line on top; captures hover
      const hit = L.polyline(pts, {
        color,
        weight: Math.max(12, weight + 8),
        opacity: 0,
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(this.map);

      hit.on("mouseover", (e: L.LeafletMouseEvent) => {
        this.onArcHover?.(arc, e.latlng);
        ghost.setStyle({ opacity: 0.7, weight: weight + 1 });
        anim.setStyle({ opacity: 1 });
      });
      hit.on("mouseout", () => {
        this.onArcHover?.(null);
        const rel = this._isRelevant(arc);
        ghost.setStyle({ opacity: rel ? 0.25 : 0.08, weight: Math.max(1, weight - 1) });
        anim.setStyle({ opacity: rel ? 0.85 : 0.15 });
      });

      this.arcLayers.push({ ghost, anim, hit, arc, weight, color });

      // CSS dash animation on the anim polyline's SVG element
      const timer = setTimeout(() => {
        const el = anim.getElement() as SVGPathElement | null;
        if (!el) return;
        const len = el.getTotalLength ? Math.ceil(el.getTotalLength()) : 300;
        const dashLen = Math.max(10, Math.round(len * 0.07));
        const gap = len - dashLen;
        el.style.strokeDasharray = `${dashLen} ${gap}`;
        el.style.setProperty("--flow-anim-len", `${-len}px`);
        el.style.animation = "crossBorderFlowAnim 500ms linear infinite";
      }, 60);
      this.animTimers.push(timer);
    }
  }

  private _updateStyles() {
    for (const al of this.arcLayers) {
      const relevant = this._isRelevant(al.arc);
      al.ghost.setStyle({ opacity: relevant ? 0.25 : 0.08 });
      al.anim.setStyle({ opacity: relevant ? 0.85 : 0.15 });
    }
  }

  clear() {
    this.animTimers.forEach(clearTimeout);
    this.animTimers = [];
    const removed = new Set<L.Polyline>();
    for (const al of this.arcLayers) {
      for (const l of [al.ghost, al.anim, al.hit]) {
        if (!removed.has(l)) { l.remove(); removed.add(l); }
      }
    }
    this.arcLayers = [];
    this.arcs = [];
  }

  destroy() {
    this.clear();
  }
}

export default function CrossBorderFlows() {
  const mapRef = useRef<L.Map | null>(null);
  const flowLayerRef = useRef<FlowSVGLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hoveredArc, setHoveredArc] = useState<FlowArc | null>(null);
  const [tooltipLatLng, setTooltipLatLng] = useState<L.LatLng | null>(null);
  const [hourOffset, setHourOffset] = useState("0");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hourOptions = buildHourOptions();

  const { data: flows, isLoading, error, refetch, isFetching } = useQuery<CrossBorderFlow[]>({
    queryKey: ["/api/entsoe/cross-border-flows", hourOffset],
    queryFn: () =>
      fetch(`/api/entsoe/cross-border-flows?hourOffset=${hourOffset}`, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, {
      center: [54, 10],
      zoom: 4,
      zoomControl: false,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 10,
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    flowLayerRef.current = new FlowSVGLayer(map);
    flowLayerRef.current.setOnArcHover((arc, latlng) => {
      setHoveredArc(arc);
      setTooltipLatLng(latlng ?? null);
    });

    mapRef.current = map;
    setMapReady(true);
  }, []);

  // Build and draw arcs whenever flow data changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !flows || !flowLayerRef.current) return;

    const flowMap = new Map<string, CrossBorderFlow>();
    for (const flow of flows) {
      flowMap.set(`${flow.from}-${flow.to}`, flow);
    }

    const arcs: FlowArc[] = [];
    for (const ic of INTERCONNECTORS) {
      const flow = flowMap.get(`${ic.from}-${ic.to}`) || flowMap.get(`${ic.to}-${ic.from}`);
      const fromCoord = CAPITALS[ic.from] ?? CENTROIDS[ic.from];
      const toCoord = CAPITALS[ic.to] ?? CENTROIDS[ic.to];
      if (!fromCoord || !toCoord) continue;

      if (!flow) continue; // no ENTSO-E data for this border — skip entirely

      const { exporterName, importerName } = getNetDirection(flow);
      const exporterCoord = CAPITALS[exporterName] ?? CENTROIDS[exporterName] ?? fromCoord;
      const importerCoord = CAPITALS[importerName] ?? CENTROIDS[importerName] ?? toCoord;

      arcs.push({
        originLat: exporterCoord[0], originLng: exporterCoord[1],
        destLat: importerCoord[0], destLng: importerCoord[1],
        netMw: flow.netMw,
        fromName: exporterName, toName: importerName,
        icFrom: ic.from, icTo: ic.to,
        outMw: flow.outMw, inMw: flow.inMw,
      });
    }

    flowLayerRef.current.setArcs(arcs);
    flowLayerRef.current.setSelectedCountry(selectedCountry);
  }, [mapReady, flows]);

  // Rebuild country label markers whenever flows or selectedCountry changes
  useEffect(() => {
    if (!mapReady || !markerLayerRef.current) return;
    const markerLayer = markerLayerRef.current;
    markerLayer.clearLayers();

    for (const [country, coord] of Object.entries(CAPITALS)) {
      const isSelected = country === selectedCountry;
      const label = COUNTRY_CODE[country] ?? country.slice(0, 2).toUpperCase();
      const icon = L.divIcon({
        html: `<div style="display:inline-block;transform:translate(-50%,-50%);background:${isSelected ? "#1e40af" : "white"};border:1.5px solid ${isSelected ? "#1e40af" : "#475569"};border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;color:${isSelected ? "white" : "#1e293b"};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);cursor:pointer;line-height:1.4">${label}</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker(coord, { icon });
      marker.on("click", () => setSelectedCountry(prev => prev === country ? null : country));
      markerLayer.addLayer(marker);
    }
  }, [mapReady, selectedCountry, flows]);

  // Propagate selectedCountry to the flow layer
  useEffect(() => {
    flowLayerRef.current?.setSelectedCountry(selectedCountry);
  }, [selectedCountry]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flowLayerRef.current?.destroy();
      flowLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Convert hovered arc tooltip position from LatLng to container pixels
  const tooltipPx = (() => {
    if (!hoveredArc || !tooltipLatLng || !mapRef.current) return null;
    try {
      const pt = mapRef.current.latLngToContainerPoint(tooltipLatLng);
      return { x: pt.x, y: pt.y };
    } catch { return null; }
  })();

  const hasError = !isLoading && error;
  const noData = !isLoading && !error && (!flows || flows.length === 0);
  const updatedAt = flows?.[0]?.updatedAt;

  const largestFlow = flows && flows.length > 0
    ? flows.reduce((max, f) => Math.abs(f.netMw) > Math.abs(max.netMw) ? f : max, flows[0])
    : null;

  return (
    <Card className="border-none shadow-md mb-0 overflow-hidden mt-6">
      <CardHeader className="pb-2 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-cross-border-title">
              <ArrowRightLeft className="w-4 h-4 text-blue-500" />
              Cross-border Physical Flows
              {!isLoading && !hasError && flows && flows.length > 0 && (
                <Badge variant="outline" className="text-xs font-normal border-blue-200 text-blue-600 gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />
                  ENTSO-E Live
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">
              Net power flows between adjacent European countries
              {selectedCountry && (
                <span className="ml-1 text-blue-500 font-medium">· Viewing {selectedCountry}'s perspective</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Select value={hourOffset} onValueChange={setHourOffset}>
              <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-hour-offset">
                <SelectValue placeholder="Select hour" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {hourOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} data-testid={`select-hour-${opt.value}`}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}
              className="gap-1.5 h-8" data-testid="button-refresh-flows">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-5 h-1.5 rounded-sm" style={{ background: "rgb(22,163,74)" }} />
            Export (green)
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-5 h-1.5 rounded-sm" style={{ background: "rgb(37,99,235)" }} />
            Import (blue)
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="inline-block w-5 h-0 border-t-2 border-dashed border-slate-400" />
            No ENTSO-E data
          </span>
          <span className="text-slate-400">Animated arcs · flow direction · click label to filter</span>
          {selectedCountry && (
            <button onClick={() => setSelectedCountry(null)}
              className="text-blue-500 hover:text-blue-700 underline" data-testid="button-clear-selection">
              Clear selection
            </button>
          )}
        </div>

        {largestFlow && Math.abs(largestFlow.netMw) > 0 && (
          <div className="flex gap-3 mt-2">
            <div className="text-center px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs" data-testid="text-largest-flow">
              <div className="text-blue-700 font-semibold">Largest flow</div>
              <div className="text-blue-600 font-bold">
                {getNetDirection(largestFlow).exporterName} → {getNetDirection(largestFlow).importerName}
              </div>
              <div className="text-blue-500">{Math.abs(largestFlow.netMw).toLocaleString()} MW</div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 relative">
        {isLoading && !flows && (
          <div className="absolute inset-x-0 top-0 h-[520px] z-[2000] flex flex-col items-center justify-center bg-slate-50 gap-3" data-testid="loading-cross-border">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Loading cross-border flow data…</p>
          </div>
        )}
        {isFetching && flows && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2000] bg-white/90 rounded-full p-2 shadow-md" data-testid="refetching-cross-border">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          </div>
        )}
        {hasError && (
          <div className="absolute inset-x-0 top-0 h-[520px] z-[2000] flex flex-col items-center justify-center bg-slate-50 gap-3" data-testid="error-cross-border">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-slate-500">Could not load cross-border flow data.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-2" data-testid="button-retry-flows">
              Try Again
            </Button>
          </div>
        )}
        {noData && !hasError && (
          <div className="absolute inset-x-0 top-0 h-[520px] z-[2000] flex flex-col items-center justify-center bg-slate-50 gap-3" data-testid="nodata-cross-border">
            <ArrowRightLeft className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-500">No cross-border flow data available.</p>
          </div>
        )}

        <div className="relative" ref={containerRef}>
          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm"
              onClick={() => mapRef.current?.zoomIn()} data-testid="button-flows-zoom-in">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm"
              onClick={() => mapRef.current?.zoomOut()} data-testid="button-flows-zoom-out">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>

          {hoveredArc && tooltipPx && (
            <div
              className="absolute z-[2000] pointer-events-none"
              style={{
                left: Math.min(tooltipPx.x + 14, (containerRef.current?.clientWidth ?? 600) - 210),
                top: Math.max(tooltipPx.y - 70, 8),
              }}
            >
              <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[160px]">
                <div className="font-bold text-slate-800 mb-1">{hoveredArc.fromName} → {hoveredArc.toName}</div>
                <div className="text-lg font-black mb-1" style={{ color: mwToColorHex(hoveredArc.netMw) }}>
                  {Math.abs(hoveredArc.netMw).toLocaleString()} MW
                </div>
                <div className="text-slate-500 text-[10px]">
                  {hoveredArc.icFrom}→{hoveredArc.icTo}: {hoveredArc.outMw.toLocaleString()} MW
                </div>
                <div className="text-slate-500 text-[10px]">
                  {hoveredArc.icTo}→{hoveredArc.icFrom}: {hoveredArc.inMw.toLocaleString()} MW
                </div>
              </div>
            </div>
          )}

          <div ref={initMap} style={{ height: "520px", width: "100%" }} data-testid="map-cross-border-flows" />
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-400">
          <span>Source: ENTSO-E Transparency Platform · Document A11 · 1-hour cache</span>
          {updatedAt && (() => {
            const dataDate = new Date(updatedAt);
            const ageMs = Date.now() - dataDate.getTime();
            const ageHours = Math.round(ageMs / (1000 * 60 * 60));
            const isStale = ageHours >= 2;
            return (
              <span
                className={isStale ? "text-amber-500" : "text-slate-500"}
                title={isStale ? `ENTSO-E data is ${ageHours}h old — some TSOs publish with delay` : undefined}
                data-testid="text-flows-timestamp"
              >
                {isStale && "⚠ "}Data as of {dataDate.toLocaleString()}
              </span>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}
