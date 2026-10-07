import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, AlertTriangle, ZoomIn, ZoomOut, ArrowRightLeft } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InterchangePoint {
  period: string;
  fromBA: string;
  fromBAName: string;
  toBA: string;
  toBAName: string;
  valueMW: number;
}

interface InterchangeResult {
  data: InterchangePoint[];
  byPair: Record<string, number>;
  latestPeriod: string | null;
  fetchedAt: string;
}

interface FlowArc {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  valueMW: number;
  fromBA: string;
  fromBAName: string;
  toBA: string;
  toBAName: string;
}

// ── BA geographic centres ─────────────────────────────────────────────────────

const BA_CENTRES: Record<string, [number, number]> = {
  // US major BAs
  PJM:  [39.95, -76.88],
  CISO: [37.77, -121.42],
  ERCO: [31.97, -99.90],
  MISO: [41.88, -93.10],
  NYIS: [42.65, -73.75],
  ISNE: [42.36, -71.06],
  SWPP: [37.69, -97.34],
  SOCO: [33.75, -84.39],
  TVA:  [35.96, -83.92],
  DUK:  [35.23, -80.84],
  FPL:  [27.66, -80.41],
  BPAT: [45.52, -122.68],
  PACW: [45.52, -122.68],
  PACE: [40.76, -111.89],
  WACM: [39.74, -104.99],
  SRP:  [33.45, -111.94],
  AECI: [38.63, -92.57],
  BANC: [38.58, -121.49],
  AVA:  [47.66, -117.43],
  NEVP: [36.17, -115.14],
  WALC: [35.19, -111.65],
  AEC:  [32.38, -86.30],
  SC:   [34.00, -81.03],
  SCEG: [34.00, -81.03],
  LGEE: [38.25, -85.76],
  SEC:  [30.33, -81.66],
  TAL:  [30.44, -84.28],
  // Canada
  IESO: [44.00, -79.50],
  BCHA: [49.28, -123.12],
  HQT:  [46.81, -71.21],
  NBSO: [45.95, -66.64],
  MHEB: [49.90, -97.14],
  // Mexico
  CFE:  [23.63, -102.55],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function mwToColorHex(valueMW: number): string {
  const abs = Math.abs(valueMW);
  const intensity = Math.min(1, abs / 4000);
  // Outflow (positive) → blue; inflow (negative) → orange/amber
  if (valueMW > 0) {
    const r = Math.round(37 + intensity * 20);
    const g = Math.round(99 + intensity * 57);
    const b = Math.round(235 - intensity * 10);
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(251 - intensity * 30);
  const g = Math.round(146 - intensity * 40);
  const b = Math.round(60 - intensity * 20);
  return `rgb(${r},${g},${b})`;
}

function lineWeight(valueMW: number): number {
  const abs = Math.abs(valueMW);
  if (abs < 500)  return 1;
  if (abs < 2000) return 2;
  return 3.5;
}

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

// ── SVG-based flow layer ──────────────────────────────────────────────────────

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
  private selectedBA: string | null = null;
  private animTimers: ReturnType<typeof setTimeout>[] = [];
  private onArcHover?: (arc: FlowArc | null, latlng?: L.LatLng) => void;

  constructor(map: L.Map) {
    this.map = map;
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

  setSelectedBA(ba: string | null) {
    this.selectedBA = ba;
    this._updateStyles();
  }

  private _isRelevant(arc: FlowArc): boolean {
    if (!this.selectedBA) return true;
    return arc.fromBA === this.selectedBA || arc.toBA === this.selectedBA;
  }

  private _draw() {
    for (const arc of this.arcs) {
      const relevant = this._isRelevant(arc);
      const color = mwToColorHex(arc.valueMW);
      const weight = lineWeight(arc.valueMW);
      const pts = bezierLatLngPoints(arc.originLat, arc.originLng, arc.destLat, arc.destLng);

      const ghost = L.polyline(pts, {
        color,
        weight: Math.max(1, weight - 1),
        opacity: relevant ? 0.25 : 0.08,
        interactive: false,
        bubblingMouseEvents: false,
      }).addTo(this.map);

      const anim = L.polyline(pts, {
        color,
        weight,
        opacity: relevant ? 0.85 : 0.15,
        interactive: false,
        bubblingMouseEvents: false,
      }).addTo(this.map);

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function USInterchangeMap() {
  const mapRef = useRef<L.Map | null>(null);
  const flowLayerRef = useRef<FlowSVGLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedBA, setSelectedBA] = useState<string | null>(null);
  const [hoveredArc, setHoveredArc] = useState<FlowArc | null>(null);
  const [tooltipLatLng, setTooltipLatLng] = useState<L.LatLng | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: interchange, isLoading, isError } = useQuery<InterchangeResult>({
    queryKey: ["/api/eia/interchange"],
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  // Human-readable period label from latestPeriod
  const displayPeriodLabel = (() => {
    if (!interchange?.latestPeriod) return null;
    // latestPeriod format: "2024-01-15T18"
    const [datePart, hourPart] = interchange.latestPeriod.split("T");
    if (!datePart) return interchange.latestPeriod;
    const [yyyy, mm, dd] = datePart.split("-").map(Number);
    const month = MONTH_SHORT[(mm ?? 1) - 1] ?? "";
    const hh = (hourPart ?? "0").padStart(2, "0");
    return `${dd} ${month} ${yyyy} ${hh}:00 UTC`;
  })();

  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, {
      center: [39.5, -98.35],
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

  // Build and draw arcs whenever interchange data changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !interchange || !flowLayerRef.current) return;

    const arcs: FlowArc[] = [];
    for (const [pairKey, valueMW] of Object.entries(interchange.byPair)) {
      if (Math.abs(valueMW) < 50) continue; // noise floor

      const [fromBA, toBA] = pairKey.split("->");
      if (!fromBA || !toBA) continue;

      const fromCoord = BA_CENTRES[fromBA];
      const toCoord = BA_CENTRES[toBA];
      if (!fromCoord || !toCoord) continue;

      // Find names from data
      const fromPoint = interchange.data.find(p => p.fromBA === fromBA);
      const toPoint = interchange.data.find(p => p.toBA === toBA);

      arcs.push({
        originLat: fromCoord[0], originLng: fromCoord[1],
        destLat: toCoord[0], destLng: toCoord[1],
        valueMW,
        fromBA,
        fromBAName: fromPoint?.fromBAName ?? fromBA,
        toBA,
        toBAName: toPoint?.toBAName ?? toBA,
      });
    }

    flowLayerRef.current.setArcs(arcs);
    flowLayerRef.current.setSelectedBA(selectedBA);
  }, [mapReady, interchange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild BA label markers whenever data or selectedBA changes
  useEffect(() => {
    if (!mapReady || !markerLayerRef.current || !interchange) return;
    const markerLayer = markerLayerRef.current;
    markerLayer.clearLayers();

    // Collect BAs that have flow data
    const activeBASet = new Set<string>();
    for (const key of Object.keys(interchange.byPair)) {
      const [fromBA, toBA] = key.split("->");
      if (fromBA && BA_CENTRES[fromBA]) activeBASet.add(fromBA);
      if (toBA && BA_CENTRES[toBA]) activeBASet.add(toBA);
    }

    for (const ba of activeBASet) {
      const coord = BA_CENTRES[ba];
      if (!coord) continue;
      const isSelected = ba === selectedBA;
      const icon = L.divIcon({
        html: `<div style="display:inline-block;transform:translate(-50%,-50%);background:${isSelected ? "#1e40af" : "white"};border:1.5px solid ${isSelected ? "#1e40af" : "#475569"};border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;color:${isSelected ? "white" : "#1e293b"};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);cursor:pointer;line-height:1.4">${ba}</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker(coord, { icon });
      marker.on("click", () => setSelectedBA(prev => prev === ba ? null : ba));
      markerLayer.addLayer(marker);
    }
  }, [mapReady, selectedBA, interchange]);

  // Propagate selectedBA to the flow layer
  useEffect(() => {
    flowLayerRef.current?.setSelectedBA(selectedBA);
  }, [selectedBA]);

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

  if (isLoading) {
    return (
      <Card className="border-none shadow-md mb-0 overflow-hidden mt-6">
        <CardContent className="flex items-center justify-center h-[560px]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Loading US interchange flow data…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-none shadow-md mb-0 overflow-hidden mt-6">
        <CardContent className="flex items-center justify-center h-[560px]">
          <div className="flex flex-col items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-slate-500">Could not load US interchange flow data.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPairs = interchange ? Object.keys(interchange.byPair).filter(k => {
    const v = interchange.byPair[k];
    const [fromBA, toBA] = k.split("->");
    return Math.abs(v) >= 50 && fromBA && toBA && BA_CENTRES[fromBA] && BA_CENTRES[toBA];
  }).length : 0;

  return (
    <Card className="border-none shadow-md mb-0 overflow-hidden mt-6">
      <CardHeader className="pb-2 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-500" />
              US BA Interchange Flows
              {interchange && (
                <Badge variant="outline" className="text-xs font-normal border-blue-200 text-blue-600 gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />
                  EIA Live
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">
              Net power flows between US Balancing Authorities
              {selectedBA && (
                <span className="ml-1 text-blue-500 font-medium">· Viewing {selectedBA}'s perspective</span>
              )}
            </p>
            {displayPeriodLabel && (
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="font-medium text-slate-500">Latest data: {displayPeriodLabel}</span>
              </p>
            )}
          </div>

          {selectedBA && (
            <div className="shrink-0">
              <button
                onClick={() => setSelectedBA(null)}
                className="text-blue-500 hover:text-blue-700 underline text-sm"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-5 h-1.5 rounded-sm" style={{ background: "rgb(57,156,245)" }} />
            Outflow (positive)
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-5 h-1.5 rounded-sm" style={{ background: "rgb(221,106,40)" }} />
            Inflow (negative)
          </span>
          <span className="text-slate-400">Animated arcs · arc thickness = magnitude · click label to filter</span>
        </div>

        {totalPairs > 0 && (
          <div className="flex gap-3 mt-2">
            <div className="text-center px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs">
              <div className="text-blue-700 font-semibold">Active pairs</div>
              <div className="text-blue-600 font-bold">{totalPairs}</div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 relative">
        <div className="relative" ref={containerRef}>
          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm"
              onClick={() => mapRef.current?.zoomIn()}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm"
              onClick={() => mapRef.current?.zoomOut()}>
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>

          {hoveredArc && tooltipPx && (
            <div
              className="absolute z-[2000] pointer-events-none"
              style={{
                left: Math.min(tooltipPx.x + 14, (containerRef.current?.clientWidth ?? 600) - 220),
                top: Math.max(tooltipPx.y - 70, 8),
              }}
            >
              <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[170px]">
                <div className="font-bold text-slate-800 mb-1">
                  {hoveredArc.fromBAName} ({hoveredArc.fromBA}) → {hoveredArc.toBAName} ({hoveredArc.toBA})
                </div>
                <div className="text-lg font-black mb-1" style={{ color: mwToColorHex(hoveredArc.valueMW) }}>
                  {Math.abs(hoveredArc.valueMW).toLocaleString()} MW
                </div>
                <div className="text-slate-500 text-[10px]">
                  {hoveredArc.valueMW > 0 ? "Outflow from" : "Inflow to"} {hoveredArc.fromBA}
                </div>
              </div>
            </div>
          )}

          <div ref={initMap} style={{ height: "520px", width: "100%" }} />
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-400">
          <span>Source: US Energy Information Administration · EIA Form 930 · Hourly Interchange</span>
          {interchange?.fetchedAt && (
            <span className="text-slate-500">
              Fetched: {new Date(interchange.fetchedAt).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
