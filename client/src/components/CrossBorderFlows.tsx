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

// ── EU types ──────────────────────────────────────────────────────────────────

interface CrossBorderFlow {
  from: string;
  to: string;
  netMw: number;
  inMw: number;
  outMw: number;
  updatedAt: string;
}

// ── US types ──────────────────────────────────────────────────────────────────

interface InterchangeResult {
  data: Array<{ fromBA: string; fromBAName: string; toBA: string; toBAName: string }>;
  byPair: Record<string, number>;
  latestPeriod: string | null;
  fetchedAt: string;
}

// ── Unified arc type ──────────────────────────────────────────────────────────

interface FlowArc {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  netMw: number;
  fromLabel: string;
  toLabel: string;
  /** Key used for filter-selection matching (country name or BA code) */
  fromKey: string;
  toKey: string;
  source: "eu" | "us";
  extraLine?: string;
}

// ── EU constants ──────────────────────────────────────────────────────────────

function getNetDirection(flow: CrossBorderFlow) {
  return flow.netMw > 0
    ? { exporterName: flow.to, importerName: flow.from }
    : { exporterName: flow.from, importerName: flow.to };
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildHourOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  for (let i = 0; i <= 36; i++) {
    const h = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hh = h.getUTCHours().toString().padStart(2, "0");
    options.push({
      value: String(i),
      label: `${h.getUTCDate()} ${MONTH_SHORT[h.getUTCMonth()]} ${h.getUTCFullYear()}, ${hh}:00 UTC`,
    });
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

// ── US BA centres ─────────────────────────────────────────────────────────────

const BA_CENTRES: Record<string, [number, number]> = {
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

// ── Colour & weight (EU convention: positive = green export, negative = blue import) ──

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
  if (abs < 100)  return 2;
  if (abs < 500)  return 3;
  if (abs < 1500) return 4;
  if (abs < 3000) return 6;
  return 8;
}

// ── Bézier arc points ─────────────────────────────────────────────────────────

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

// ── SVG flow layer ────────────────────────────────────────────────────────────

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
  private selected: string | null = null;
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

  setSelected(key: string | null) {
    this.selected = key;
    this._updateStyles();
  }

  private _isRelevant(arc: FlowArc): boolean {
    if (!this.selected) return true;
    return arc.fromKey === this.selected || arc.toKey === this.selected;
  }

  private _draw() {
    for (const arc of this.arcs) {
      if (Math.abs(arc.netMw) < 10) continue;
      const relevant = this._isRelevant(arc);
      const color = mwToColorHex(arc.netMw);
      const weight = lineWeight(arc.netMw);
      const pts = bezierLatLngPoints(arc.originLat, arc.originLng, arc.destLat, arc.destLng);

      const ghost = L.polyline(pts, {
        color, weight: Math.max(1, weight - 1),
        opacity: relevant ? 0.25 : 0.08,
        interactive: false, bubblingMouseEvents: false,
      }).addTo(this.map);

      const anim = L.polyline(pts, {
        color, weight,
        opacity: relevant ? 0.85 : 0.15,
        interactive: false, bubblingMouseEvents: false,
      }).addTo(this.map);

      const hit = L.polyline(pts, {
        color, weight: Math.max(12, weight + 8),
        opacity: 0, interactive: true, bubblingMouseEvents: false,
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
        // Fixed dash pattern so animation is visible at any zoom level.
        // The original len-relative formula produced gap ≤ 0 on short arcs
        // (e.g. EU country pairs at zoom 2), rendering them as solid lines.
        el.style.strokeDasharray = "8 12";          // 8px dash, 12px gap
        el.style.setProperty("--flow-anim-len", "-20px"); // one pattern repeat
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

  destroy() { this.clear(); }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CrossBorderFlows() {
  const mapRef = useRef<L.Map | null>(null);
  const flowLayerRef = useRef<FlowSVGLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredArc, setHoveredArc] = useState<FlowArc | null>(null);
  const [tooltipLatLng, setTooltipLatLng] = useState<L.LatLng | null>(null);
  const [hourOffset, setHourOffset] = useState("0");
  const [searchStatus, setSearchStatus] = useState<"loading" | "refining" | "searching" | "done" | "exhausted">("loading");
  const refinedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hourOptions = buildHourOptions();

  // ── ENTSO-E query ────────────────────────────────────────────────────────────
  const {
    data: flows, isLoading: euLoading, error: euError,
    refetch: refetchEu, isFetching: euFetching,
  } = useQuery<CrossBorderFlow[]>({
    queryKey: ["/api/entsoe/cross-border-flows", hourOffset],
    queryFn: () =>
      fetch(`/api/entsoe/cross-border-flows?hourOffset=${hourOffset}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  // ── EIA interchange query ────────────────────────────────────────────────────
  const {
    data: interchange, isLoading: usLoading, isError: usError, error: usErrorObj,
    refetch: refetchUs, isFetching: usFetching,
  } = useQuery<InterchangeResult>({
    queryKey: ["/api/eia/interchange"],
    queryFn: async () => {
      const res = await fetch("/api/eia/interchange", { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[EIA interchange] HTTP ${res.status}:`, text.slice(0, 200));
        throw new Error(`${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      console.log("[EIA interchange] received:", {
        latestPeriod: data.latestPeriod,
        pairs: Object.keys(data.byPair ?? {}).length,
        rows: data.data?.length,
      });
      return data;
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  // ── ENTSO-E smart fallback (step forward to find most recent, or back if empty) ──
  useEffect(() => {
    if (flows === undefined) return;
    if (refinedRef.current) return;
    refinedRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const currentOffset = parseInt(hourOffset);
    const hasData = flows.some(f => Math.abs(f.netMw) >= 10);

    async function run() {
      if (hasData) {
        setSearchStatus("refining");
        let bestOffset = currentOffset;
        for (let offset = currentOffset - 1; offset >= 0; offset--) {
          if (controller.signal.aborted) return;
          try {
            const r = await fetch(`/api/entsoe/cross-border-flows?hourOffset=${offset}`, {
              credentials: "include", signal: controller.signal,
            });
            if (!r.ok) break;
            const data: CrossBorderFlow[] = await r.json();
            if (data.some(f => Math.abs(f.netMw) >= 10)) { bestOffset = offset; } else { break; }
          } catch { break; }
        }
        if (!controller.signal.aborted) {
          if (bestOffset !== currentOffset) {
            refinedRef.current = false;
            setHourOffset(String(bestOffset));
          }
          setSearchStatus("done");
        }
      } else {
        setSearchStatus("searching");
        for (let offset = currentOffset + 1; offset <= 36; offset++) {
          if (controller.signal.aborted) return;
          try {
            const r = await fetch(`/api/entsoe/cross-border-flows?hourOffset=${offset}`, {
              credentials: "include", signal: controller.signal,
            });
            if (!r.ok) continue;
            const data: CrossBorderFlow[] = await r.json();
            if (data.some(f => Math.abs(f.netMw) >= 10)) {
              if (!controller.signal.aborted) {
                refinedRef.current = false;
                setHourOffset(String(offset));
                setSearchStatus("done");
              }
              return;
            }
          } catch { return; }
        }
        if (!controller.signal.aborted) setSearchStatus("exhausted");
      }
    }

    run();
    return () => { controller.abort(); };
  }, [flows]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timestamp labels ─────────────────────────────────────────────────────────

  const euHourLabel = (() => {
    const now = new Date();
    now.setUTCMinutes(0, 0, 0);
    const h = new Date(now.getTime() - parseInt(hourOffset) * 60 * 60 * 1000);
    const hh = h.getUTCHours().toString().padStart(2, "0");
    return `${h.getUTCDate()} ${MONTH_SHORT[h.getUTCMonth()]} ${h.getUTCFullYear()}, ${hh}:00 UTC`;
  })();

  const usHourLabel = (() => {
    if (!interchange?.latestPeriod) return null;
    const [datePart, hourPart] = interchange.latestPeriod.split("T");
    if (!datePart) return interchange.latestPeriod;
    const [yyyy, mm, dd] = datePart.split("-").map(Number);
    const month = MONTH_SHORT[(mm ?? 1) - 1] ?? "";
    const hh = (hourPart ?? "0").padStart(2, "0");
    return `${dd} ${month} ${yyyy}, ${hh}:00 UTC`;
  })();

  // ── Map init ─────────────────────────────────────────────────────────────────

  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, {
      center: [45, -30],
      zoom: 2,
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

  // ── Build and draw combined arcs ─────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !flowLayerRef.current) return;

    const arcs: FlowArc[] = [];

    // EU arcs from ENTSO-E
    if (flows) {
      const flowMap = new Map<string, CrossBorderFlow>();
      for (const flow of flows) flowMap.set(`${flow.from}-${flow.to}`, flow);

      for (const ic of INTERCONNECTORS) {
        const flow = flowMap.get(`${ic.from}-${ic.to}`) || flowMap.get(`${ic.to}-${ic.from}`);
        const fromCoord = CAPITALS[ic.from] ?? CENTROIDS[ic.from];
        const toCoord = CAPITALS[ic.to] ?? CENTROIDS[ic.to];
        if (!fromCoord || !toCoord || !flow) continue;

        const { exporterName, importerName } = getNetDirection(flow);
        const exporterCoord = CAPITALS[exporterName] ?? CENTROIDS[exporterName] ?? fromCoord;
        const importerCoord = CAPITALS[importerName] ?? CENTROIDS[importerName] ?? toCoord;

        arcs.push({
          originLat: exporterCoord[0], originLng: exporterCoord[1],
          destLat: importerCoord[0], destLng: importerCoord[1],
          netMw: flow.netMw,
          fromLabel: exporterName, toLabel: importerName,
          fromKey: ic.from, toKey: ic.to,
          source: "eu",
          extraLine: `${ic.from}→${ic.to}: ${flow.outMw.toLocaleString()} MW · ${ic.to}→${ic.from}: ${flow.inMw.toLocaleString()} MW`,
        });
      }
    }

    // US arcs from EIA
    if (interchange) {
      for (const [pairKey, valueMW] of Object.entries(interchange.byPair)) {
        if (Math.abs(valueMW) < 50) continue;
        const [fromBA, toBA] = pairKey.split("->");
        if (!fromBA || !toBA) continue;
        const fromCoord = BA_CENTRES[fromBA];
        const toCoord = BA_CENTRES[toBA];
        if (!fromCoord || !toCoord) continue;

        const fromPoint = interchange.data.find(p => p.fromBA === fromBA);
        const toPoint = interchange.data.find(p => p.toBA === toBA);

        arcs.push({
          originLat: fromCoord[0], originLng: fromCoord[1],
          destLat: toCoord[0], destLng: toCoord[1],
          netMw: valueMW,
          fromLabel: fromPoint?.fromBAName ?? fromBA,
          toLabel: toPoint?.toBAName ?? toBA,
          fromKey: fromBA, toKey: toBA,
          source: "us",
        });
      }
    }

    flowLayerRef.current.setArcs(arcs);
    flowLayerRef.current.setSelected(selected);
  }, [mapReady, flows, interchange]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild label markers ────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !markerLayerRef.current) return;
    const markerLayer = markerLayerRef.current;
    markerLayer.clearLayers();

    // EU country labels
    for (const [country, coord] of Object.entries(CAPITALS)) {
      const isSelected = selected === country;
      const label = COUNTRY_CODE[country] ?? country.slice(0, 2).toUpperCase();
      const icon = L.divIcon({
        html: `<div style="display:inline-block;transform:translate(-50%,-50%);background:${isSelected ? "#1e40af" : "white"};border:1.5px solid ${isSelected ? "#1e40af" : "#475569"};border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;color:${isSelected ? "white" : "#1e293b"};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);cursor:pointer;line-height:1.4">${label}</div>`,
        className: "", iconSize: [0, 0], iconAnchor: [0, 0],
      });
      const marker = L.marker(coord, { icon });
      marker.on("click", () => setSelected(prev => prev === country ? null : country));
      markerLayer.addLayer(marker);
    }

    // US BA labels — only for BAs that appear in the current data
    if (interchange) {
      const activeBASet = new Set<string>();
      for (const key of Object.keys(interchange.byPair)) {
        const [f, t] = key.split("->");
        if (f && BA_CENTRES[f]) activeBASet.add(f);
        if (t && BA_CENTRES[t]) activeBASet.add(t);
      }
      for (const ba of activeBASet) {
        const coord = BA_CENTRES[ba];
        if (!coord) continue;
        const isSelected = selected === ba;
        const icon = L.divIcon({
          html: `<div style="display:inline-block;transform:translate(-50%,-50%);background:${isSelected ? "#1e40af" : "#f8fafc"};border:1.5px solid ${isSelected ? "#1e40af" : "#94a3b8"};border-radius:4px;padding:2px 6px;font-size:9px;font-weight:700;color:${isSelected ? "white" : "#334155"};white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.12);cursor:pointer;line-height:1.4">${ba}</div>`,
          className: "", iconSize: [0, 0], iconAnchor: [0, 0],
        });
        const marker = L.marker(coord, { icon });
        marker.on("click", () => setSelected(prev => prev === ba ? null : ba));
        markerLayer.addLayer(marker);
      }
    }
  }, [mapReady, selected, flows, interchange]);

  // Propagate selection to layer
  useEffect(() => {
    flowLayerRef.current?.setSelected(selected);
  }, [selected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flowLayerRef.current?.destroy();
      flowLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Tooltip pixel position
  const tooltipPx = (() => {
    if (!hoveredArc || !tooltipLatLng || !mapRef.current) return null;
    try {
      const pt = mapRef.current.latLngToContainerPoint(tooltipLatLng);
      return { x: pt.x, y: pt.y };
    } catch { return null; }
  })();

  // Show full loading overlay only when both sources have no data yet
  const bothLoading = euLoading && !flows && usLoading && !interchange;
  const eitherFetching = euFetching || usFetching;
  const euUpdatedAt = flows?.[0]?.updatedAt;

  return (
    <Card className="border-none shadow-md mb-0 overflow-hidden mt-6">
      <CardHeader className="pb-2 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-cross-border-title">
              <ArrowRightLeft className="w-4 h-4 text-blue-500" />
              Cross-border Physical Flows
              {flows && flows.length > 0 && !euError && (
                <Badge variant="outline" className="text-xs font-normal border-blue-200 text-blue-600 gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />
                  ENTSO-E Live
                </Badge>
              )}
              {euLoading && !flows && (
                <Badge variant="outline" className="text-xs font-normal border-slate-200 text-slate-400 gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  ENTSO-E
                </Badge>
              )}
              {interchange && !usError && (
                <Badge variant="outline" className="text-xs font-normal border-green-200 text-green-700 gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />
                  EIA Live
                </Badge>
              )}
              {usLoading && !interchange && (
                <Badge variant="outline" className="text-xs font-normal border-slate-200 text-slate-400 gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  EIA
                </Badge>
              )}
            </CardTitle>

            <p className="text-sm text-slate-500 mt-0.5">
              Net power flows between European countries and US Balancing Authorities
              {selected && (
                <span className="ml-1 text-blue-500 font-medium">· Viewing {selected}'s perspective</span>
              )}
            </p>

            {/* ENTSO-E timestamp / search status */}
            <p className="text-xs text-slate-400 mt-0.5">
              <span className="font-semibold text-slate-500">ENTSO-E: </span>
              {searchStatus === "searching"
                ? <span className="italic">Searching for latest available data…</span>
                : searchStatus === "exhausted"
                ? <span className="text-amber-500">No recent A11 data available</span>
                : <span className="font-medium text-slate-500">{euHourLabel}</span>
              }
            </p>

            {/* EIA timestamp */}
            {(interchange || usError) && (
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="font-semibold text-slate-500">EIA: </span>
                {usError
                  ? <span className="text-amber-500">Unavailable — {usErrorObj instanceof Error ? usErrorObj.message.slice(0, 80) : "fetch failed"}</span>
                  : usHourLabel
                  ? <span className="font-medium text-slate-500">{usHourLabel}</span>
                  : <span className="italic text-slate-400">Loading…</span>
                }
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Select
              value={hourOffset}
              onValueChange={(v) => {
                refinedRef.current = true;
                setHourOffset(v);
              }}
            >
              <SelectTrigger className="w-[210px] h-8 text-xs" data-testid="select-hour-offset">
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
            <Button
              size="sm" variant="outline"
              onClick={() => { refetchEu(); refetchUs(); }}
              disabled={eitherFetching}
              className="gap-1.5 h-8"
              data-testid="button-refresh-flows"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${eitherFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-5 h-1.5 rounded-sm" style={{ background: "rgb(22,163,74)" }} />
            Export / Outflow
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-5 h-1.5 rounded-sm" style={{ background: "rgb(37,99,235)" }} />
            Import / Inflow
          </span>
          <span className="text-slate-400">Animated arcs · arc thickness = magnitude · click label to filter</span>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="text-blue-500 hover:text-blue-700 underline"
              data-testid="button-clear-selection"
            >
              Clear selection
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        {bothLoading && (
          <div className="absolute inset-x-0 top-0 h-[560px] z-[2000] flex flex-col items-center justify-center bg-slate-50 gap-3" data-testid="loading-cross-border">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Loading cross-border flow data…</p>
          </div>
        )}
        {eitherFetching && (flows || interchange) && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2000] bg-white/90 rounded-full p-2 shadow-md" data-testid="refetching-cross-border">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
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
                left: Math.min(tooltipPx.x + 14, (containerRef.current?.clientWidth ?? 600) - 220),
                top: Math.max(tooltipPx.y - 70, 8),
              }}
            >
              <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[170px]">
                <div className="font-bold text-slate-800 mb-1">
                  {hoveredArc.fromLabel} → {hoveredArc.toLabel}
                </div>
                <div className="text-lg font-black mb-1" style={{ color: mwToColorHex(hoveredArc.netMw) }}>
                  {Math.abs(hoveredArc.netMw).toLocaleString()} MW
                </div>
                {hoveredArc.extraLine && (
                  <div className="text-slate-500 text-[10px]">{hoveredArc.extraLine}</div>
                )}
                <div className="text-slate-400 text-[10px] mt-0.5">
                  {hoveredArc.source === "eu" ? "ENTSO-E" : "EIA Form 930"}
                </div>
              </div>
            </div>
          )}

          <div ref={initMap} style={{ height: "560px", width: "100%" }} data-testid="map-cross-border-flows" />
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-400">
          <span>
            ENTSO-E Transparency Platform · Document A11
            {interchange && <span className="ml-2 pl-2 border-l border-slate-200">EIA Form 930 · Hourly BA Interchange</span>}
          </span>
          {euUpdatedAt && (
            <span className="text-slate-500" data-testid="text-flows-timestamp">
              ENTSO-E: {new Date(euUpdatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
