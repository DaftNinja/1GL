import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, AlertTriangle, ZoomIn, ZoomOut, Zap, Leaf, X, Factory, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTROIDS, INTERCONNECTORS } from "@/lib/gridConstants";
import { DataSourceStatus } from "./DataSourceStatus";

interface DataSourceMeta {
  source: "live" | "stale_cache";
  dataAge: string | null;
  apiStatus: "ok" | "unavailable";
  lastSuccessfulFetch: string | null;
  message: string | null;
}

interface CountrySummary {
  country: string;
  code: string;
  latestMonthAvg: number | null;
  latestMonthLabel: string | null;
  annualAvg: Record<string, number>;
  eicCode: string;
  estimated?: boolean;
  estimatedNote?: string;
}

interface GenTimePoint { dt: string; mw: number }
interface FuelSeriesResult {
  fuelType: string; color: string;
  points: GenTimePoint[];
  avgMw: number; peakMw: number; totalGwh: number;
  isRenewable: boolean;
}
interface GenerationTimeSeriesResult {
  country: string; period: string;
  fuels: FuelSeriesResult[];
  renewableSharePct: number; fetchedAt: string;
  dataUnit?: "MW" | "pct";
  source?: string;
  carbonIntensityAvg?: number;
  totalAvgMw?: number;
}

interface PowerPlant {
  gppd_idnr: string;
  name: string;
  country_long: string;
  primary_fuel: string;
  capacity_mw: number;
  latitude: number;
  longitude: number;
  owner: string | null;
}

const FUEL_COLORS: Record<string, string> = {
  Solar: "#eab308",
  Wind: "#06b6d4",
  Nuclear: "#a855f7",
  Gas: "#f97316",
  Coal: "#4b5563",
  Hydro: "#3b82f6",
  Biomass: "#22c55e",
  Oil: "#92400e",
  Other: "#d1d5db",
  Petcoke: "#4b5563",
  Cogeneration: "#f97316",
  Waste: "#84cc16",
  Geothermal: "#ef4444",
  Wave_and_Tidal: "#0ea5e9",
  Storage: "#8b5cf6",
};

const FUEL_TYPES = ["Solar", "Wind", "Nuclear", "Gas", "Coal", "Hydro", "Biomass", "Oil", "Other"] as const;

function getFuelColor(fuel: string): string {
  return FUEL_COLORS[fuel] || FUEL_COLORS.Other;
}

function getPlantRadius(capacityMw: number): number {
  if (capacityMw < 50) return 3;
  if (capacityMw < 200) return 5;
  if (capacityMw < 500) return 7;
  if (capacityMw < 1000) return 9;
  return 12;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function normalizeFuel(fuel: string): string {
  if (FUEL_COLORS[fuel]) return fuel;
  const lower = fuel.toLowerCase();
  if (lower.includes("solar")) return "Solar";
  if (lower.includes("wind")) return "Wind";
  if (lower.includes("nuclear")) return "Nuclear";
  if (lower.includes("gas") || lower === "natural gas") return "Gas";
  if (lower.includes("coal") || lower.includes("lignite")) return "Coal";
  if (lower.includes("hydro")) return "Hydro";
  if (lower.includes("biomass")) return "Biomass";
  if (lower.includes("oil") || lower.includes("petrol") || lower.includes("diesel")) return "Oil";
  return "Other";
}

function applyPlantFilters(
  layerGroup: L.LayerGroup,
  markers: L.CircleMarker[],
  enabledFuels: Set<string>,
  minCapacity: number
) {
  for (const marker of markers) {
    const data = (marker as any)._ppData as { fuel: string; capacity: number };
    if (!data) continue;
    const visible = enabledFuels.has(data.fuel) && data.capacity >= minCapacity;
    if (visible) {
      if (!layerGroup.hasLayer(marker)) {
        marker.addTo(layerGroup);
      }
    } else {
      if (layerGroup.hasLayer(marker)) {
        layerGroup.removeLayer(marker);
      }
    }
  }
}


function priceToColor(price: number | null): string {
  if (price === null) return "#94a3b8";
  if (price < 20)  return "#166534";
  if (price < 40)  return "#16a34a";
  if (price < 60)  return "#4ade80";
  if (price < 80)  return "#fbbf24";
  if (price < 100) return "#f97316";
  if (price < 130) return "#ef4444";
  return "#b91c1c";
}

function priceLabel(price: number | null): string {
  if (price === null) return "No data";
  return `€${price.toFixed(1)}/MWh`;
}

const LEGEND = [
  { color: "#166534", label: "<20" },
  { color: "#16a34a", label: "20–40" },
  { color: "#4ade80", label: "40–60" },
  { color: "#fbbf24", label: "60–80" },
  { color: "#f97316", label: "80–100" },
  { color: "#ef4444", label: "100–130" },
  { color: "#b91c1c", label: ">130" },
  { color: "#94a3b8", label: "N/A" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${(d.getUTCMonth() + 1).toString().padStart(2, "0")}/${d.getUTCDate().toString().padStart(2, "0")} ${d.getUTCHours().toString().padStart(2, "0")}h`;
}

function FuelChart({ fuel, dataUnit = "MW" }: { fuel: FuelSeriesResult; dataUnit?: "MW" | "pct" }) {
  const isPct = dataUnit === "pct";
  const data = fuel.points.map(p => ({ t: p.dt, v: p.mw }));
  const gradId = `grad-${fuel.fuelType.replace(/\s+/g, "")}`;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
      <div className="flex items-start justify-between mb-1 gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: fuel.color }} />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{fuel.fuelType}</span>
            {fuel.isRenewable && <Leaf className="w-3 h-3 text-green-500 shrink-0" />}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 ml-4">
            {isPct
              ? `avg ${fuel.avgMw.toFixed(1)}% · peak ${fuel.peakMw.toFixed(1)}%`
              : `avg ${fuel.avgMw.toLocaleString()} MW · peak ${fuel.peakMw.toLocaleString()} MW`}
          </div>
        </div>
        {!isPct && (
          <div className="text-right shrink-0">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{fuel.totalGwh.toLocaleString()} GWh</div>
            <div className="text-[10px] text-slate-400">7-day total</div>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuel.color} stopOpacity={0.6} />
              <stop offset="95%" stopColor={fuel.color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tickFormatter={(v) => fmtDate(v)}
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(data.length / 4)}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={isPct ? 28 : 38}
            tickFormatter={(v) => isPct ? `${v}%` : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString())}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: "4px 8px", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", borderRadius: 6 }}
            formatter={(v: number) => [isPct ? `${v.toFixed(1)}%` : `${v.toLocaleString()} MW`, fuel.fuelType]}
            labelFormatter={(l) => fmtDate(l as string)}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={fuel.color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ENTSOETransmissionMap() {
  const mapRef = useRef<L.Map | null>(null);
  const dataLayersRef = useRef<L.Layer[]>([]);
  const selectedLayerRef = useRef<L.Path | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showPowerPlants, setShowPowerPlants] = useState(false);
  const [powerPlantFiltersOpen, setPowerPlantFiltersOpen] = useState(true);
  const [enabledFuels, setEnabledFuels] = useState<Set<string>>(new Set(FUEL_TYPES));
  const [minCapacity, setMinCapacity] = useState(0);
  const powerPlantLayerRef = useRef<L.LayerGroup | null>(null);
  const powerPlantMarkersRef = useRef<L.CircleMarker[]>([]);

  // Keep a stable ref to the setter so Leaflet callbacks don't get stale closures
  const setSelectedRef = useRef(setSelectedCountry);
  setSelectedRef.current = setSelectedCountry;
  const setHoveredRef = useRef(setHoveredCountry);
  setHoveredRef.current = setHoveredCountry;

  const { data: pricesResponse, isLoading: isPricesLoading, error: pricesError } = useQuery<{ _meta: DataSourceMeta; data: CountrySummary[] }>({
    queryKey: ["/api/entsoe/all-prices"],
    queryFn: () => fetch("/api/entsoe/all-prices", { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const prices = pricesResponse?.data;

  // Log API response details
  useEffect(() => {
    if (pricesResponse) {
      console.group("📊 [Price Map] /api/entsoe/all-prices response");
      console.log("Meta:", pricesResponse._meta);
      console.log("Countries:", pricesResponse.data.length);
      console.log("Sample countries (first 5):", pricesResponse.data.slice(0, 5).map(c => ({
        country: c.country,
        price: c.latestMonthAvg,
        label: c.latestMonthLabel
      })));
      console.groupEnd();
    }
  }, [pricesResponse]);

  const { data: geoData, isLoading: isGeoLoading, error: geoError } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ["/api/geo/europe"],
    queryFn: () => fetch("/api/geo/europe", { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
    staleTime: 7 * 24 * 60 * 60 * 1000,
    retry: 2,
  });

  const { data: genData, isLoading: isGenLoading } = useQuery<GenerationTimeSeriesResult>({
    queryKey: ["/api/entsoe/generation-timeseries", selectedCountry],
    queryFn: () =>
      fetch(`/api/entsoe/generation-timeseries?country=${encodeURIComponent(selectedCountry!)}`, {
        credentials: "include",
      }).then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
    enabled: !!selectedCountry,
    staleTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  const { data: powerPlants, isLoading: isPowerPlantsLoading } = useQuery<PowerPlant[]>({
    queryKey: ["/api/powerplants"],
    queryFn: () => fetch("/api/powerplants", { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
    enabled: showPowerPlants,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const priceMap = new Map<string, number | null>();
  const estimatedMap = new Map<string, { estimated: boolean; note?: string }>();
  if (prices) {
    for (const c of prices) {
      priceMap.set(c.country, c.latestMonthAvg);
      estimatedMap.set(c.country, { estimated: !!c.estimated, note: c.estimatedNote });
    }
  }

  const latestMonthLabel = prices?.find(p => p.latestMonthLabel)?.latestMonthLabel ?? null;

  const geoLayerRef = useRef<L.GeoJSON | null>(null);

  const initMap = (node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, {
      center: [57, 12],
      zoom: 4,
      zoomControl: false,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 10,
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
  };

  useEffect(() => {
    if (!mapReady || !mapRef.current || !geoData || !prices) return;
    const map = mapRef.current;

    dataLayersRef.current.forEach(l => map.removeLayer(l));
    dataLayersRef.current = [];
    selectedLayerRef.current = null;

    // ── Price map audit (DevTools → Console, filter "[price map]") ─────────────
    const priceApiCountries = prices ? [...priceMap.entries()].map(([k, v]) => `${k}=${v != null ? `€${v.toFixed(1)}` : "null"}`) : [];
    console.log(`[price map] API countries (${priceApiCountries.length}): ${priceApiCountries.join(", ")}`);

    const geoNames = ((geoData as GeoJSON.FeatureCollection).features || []).map(f => f.properties?.country as string);
    console.log(`[price map] GeoJSON features (${geoNames.length}): ${geoNames.sort().join(", ")}`);

    const priceMatched: string[] = [];
    const priceNoGeo: string[] = [];
    const geoNoPrice: string[] = [];
    for (const [country] of priceMap) {
      if (geoNames.includes(country)) priceMatched.push(country);
      else priceNoGeo.push(country);
    }
    for (const name of geoNames) {
      if (!priceMap.has(name)) geoNoPrice.push(name);
    }
    console.log(`[price map] Matched (${priceMatched.length}): ${priceMatched.sort().join(", ")}`);
    if (priceNoGeo.length)  console.log(`[price map] API price but NO geo feature (${priceNoGeo.length}): ${priceNoGeo.join(", ")}`);
    if (geoNoPrice.length)  console.log(`[price map] Geo feature but NO price entry (${geoNoPrice.length}): ${geoNoPrice.join(", ")}`);
    // ────────────────────────────────────────────────────────────────────────────

    const geoLayer = L.geoJSON(geoData as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const name = feature?.properties?.country as string;
        const price = priceMap.get(name) ?? null;
        return {
          fillColor: priceToColor(price),
          fillOpacity: 0.72,
          color: "#1e3a5f",
          weight: 1.2,
          opacity: 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.country as string;
        const price = priceMap.get(name) ?? null;
        const est = estimatedMap.get(name);
        const isEst = est?.estimated ?? false;
        const summary = prices?.find(p => p.country === name);
        const prevYears = summary
          ? Object.entries(summary.annualAvg).sort(([a], [b]) => a.localeCompare(b)).slice(-3)
          : [];
        const histRows = prevYears
          .map(([yr, v]) => `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#64748b">${yr}</span><span style="font-weight:600">€${v.toFixed(1)}/MWh</span></div>`)
          .join("");
        const displayPrice = price != null ? `${isEst ? "~" : ""}€${price.toFixed(1)}/MWh` : "No data";
        const estBanner = isEst
          ? `<div style="font-size:10px;color:#6366f1;background:#eef2ff;border-radius:3px;padding:3px 6px;margin-bottom:6px">
               Estimate · Elexon APX 7-day avg (GBP×1.175)
             </div>`
          : "";
        layer.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:190px;padding:2px">
            <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">${name}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:4px">${isEst ? "Day-ahead estimate" : "Day-ahead"} · ${summary?.latestMonthLabel ?? "latest month"}</div>
            ${estBanner}
            <div style="font-size:22px;font-weight:800;color:${priceToColor(price)};margin-bottom:8px">${displayPrice}</div>
            ${prevYears.length ? `<div style="font-size:11px;border-top:1px solid #e2e8f0;padding-top:6px">${histRows}</div>` : ""}
            <div style="font-size:10px;color:#3b82f6;margin-top:6px;font-style:italic">Click to load generation data</div>
          </div>`,
          { maxWidth: 230 }
        );
        layer.on("mouseover", () => {
          if (selectedLayerRef.current !== layer) {
            (layer as L.Path).setStyle({ fillOpacity: 0.92, weight: 2.5, color: "#1d4ed8" });
          }
          setHoveredRef.current(name);
        });
        layer.on("mouseout", () => {
          if (selectedLayerRef.current !== layer) {
            geoLayer.resetStyle(layer);
          }
          setHoveredRef.current(null);
        });
        layer.on("click", () => {
          // Deselect previous
          if (selectedLayerRef.current && selectedLayerRef.current !== layer) {
            geoLayer.resetStyle(selectedLayerRef.current as L.Layer);
          }
          selectedLayerRef.current = layer as L.Path;
          (layer as L.Path).setStyle({ fillOpacity: 0.95, weight: 3, color: "#2563eb" });
          setSelectedRef.current(name);
        });
      },
    });
    geoLayer.addTo(map);
    geoLayerRef.current = geoLayer;
    dataLayersRef.current.push(geoLayer);

    for (const ic of INTERCONNECTORS) {
      const a = CENTROIDS[ic.from];
      const b = CENTROIDS[ic.to];
      if (!a || !b) continue;
      const weight = Math.max(1.5, Math.min(5, ic.capacityMw / 1000));
      const line = L.polyline([a, b], {
        color: "#3b82f6",
        weight,
        opacity: 0.55,
        dashArray: "5 4",
      });
      line.bindTooltip(
        `<strong>${ic.label}</strong><br/>NTC ≈ ${ic.capacityMw.toLocaleString()} MW`,
        { sticky: true, className: "leaflet-tooltip-ic" }
      );
      line.addTo(map);
      dataLayersRef.current.push(line);
    }

    for (const [country, [lat, lng]] of Object.entries(CENTROIDS)) {
      const price = priceMap.get(country) ?? null;
      const isEst = estimatedMap.get(country)?.estimated ?? false;
      const est = estimatedMap.get(country);
      const color = priceToColor(price);
      const text = price != null ? `${isEst ? "~" : ""}€${price.toFixed(0)}` : "—";
      const dataSource = country === "United Kingdom"
        ? "Elexon N2EX (7-day avg, GBP→EUR)"
        : "ENTSO-E bidding zone";
      const tooltipText = price != null
        ? `<strong>${country}</strong><br/>€${price.toFixed(2)}/MWh<br/><span style="font-size:9px;color:#666">${dataSource}</span>${isEst ? `<br/><span style="font-size:9px;color:#3b82f6">${est?.note}</span>` : ""}`
        : `<strong>${country}</strong><br/><span style="color:#999">No data</span>`;
      const icon = L.divIcon({
        html: `<div style="display:inline-block;transform:translate(-50%,-50%);background:white;border:1.5px solid ${color};border-radius:5px;padding:2px 7px;font-size:11px;font-weight:700;color:${color};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);cursor:help;line-height:1.4">${text}</div>`,
        className: "",
        iconAnchor: [0, 0],
      });
      const marker = L.marker([lat, lng], { icon, interactive: false });
      marker.bindTooltip(tooltipText, { sticky: true, className: "leaflet-tooltip-price" });
      marker.addTo(map);
      dataLayersRef.current.push(marker);
    }
  }, [mapReady, geoData, prices]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!showPowerPlants || !powerPlants) {
      if (powerPlantLayerRef.current) {
        map.removeLayer(powerPlantLayerRef.current);
        powerPlantLayerRef.current = null;
        powerPlantMarkersRef.current = [];
      }
      return;
    }

    if (!powerPlantLayerRef.current) {
      powerPlantLayerRef.current = L.layerGroup().addTo(map);
    }
    const layerGroup = powerPlantLayerRef.current;
    layerGroup.clearLayers();
    const markers: L.CircleMarker[] = [];

    for (const plant of powerPlants) {
      if (plant.latitude == null || plant.longitude == null) continue;
      const fuel = normalizeFuel(plant.primary_fuel);
      const color = getFuelColor(fuel);
      const radius = getPlantRadius(plant.capacity_mw);
      const marker = L.circleMarker([plant.latitude, plant.longitude], {
        radius,
        fillColor: color,
        fillOpacity: 0.7,
        color: "#fff",
        weight: 1,
        opacity: 0.9,
      });
      const safeName = escapeHtml(plant.name);
      const safeCountry = escapeHtml(plant.country_long);
      const safeOwner = plant.owner ? escapeHtml(plant.owner) : null;
      marker.bindTooltip(
        `<div style="font-family:system-ui,sans-serif;min-width:160px;padding:2px">
          <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px">${safeName}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${safeCountry}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="font-size:12px;font-weight:600">${fuel}</span>
          </div>
          <div style="font-size:12px;font-weight:700;color:#1e293b">${plant.capacity_mw.toLocaleString()} MW</div>
          ${safeOwner ? `<div style="font-size:11px;color:#64748b;margin-top:2px">Owner: ${safeOwner}</div>` : ""}
        </div>`,
        { sticky: true }
      );
      (marker as any)._ppData = { fuel, capacity: plant.capacity_mw };
      markers.push(marker);
    }
    powerPlantMarkersRef.current = markers;
    applyPlantFilters(layerGroup, markers, enabledFuels, minCapacity);
  }, [mapReady, showPowerPlants, powerPlants]);

  useEffect(() => {
    if (!powerPlantLayerRef.current) return;
    applyPlantFilters(powerPlantLayerRef.current, powerPlantMarkersRef.current, enabledFuels, minCapacity);
  }, [enabledFuels, minCapacity]);

  const toggleFuel = useCallback((fuel: string) => {
    setEnabledFuels(prev => {
      const next = new Set(prev);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const isLoading = isPricesLoading || isGeoLoading;
  const hasError = !isLoading && (pricesError || geoError);

  const cheapest = prices
    ?.filter(p => p.latestMonthAvg != null)
    .sort((a, b) => (a.latestMonthAvg ?? 0) - (b.latestMonthAvg ?? 0))[0];
  const mostExpensive = prices
    ?.filter(p => p.latestMonthAvg != null)
    .sort((a, b) => (b.latestMonthAvg ?? 0) - (a.latestMonthAvg ?? 0))[0];

  const totalAvg = genData?.fuels.reduce((s, f) => s + f.avgMw, 0) ?? 0;

  return (
    <div>
      <Card className="border-none shadow-md mb-0 overflow-hidden">
        <CardHeader className="pb-2 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                European Transmission System — Price Map
                {!isLoading && !hasError && (
                  <Badge variant="outline" className="text-xs font-normal border-blue-200 text-blue-600 gap-1">
                    <Radio className="w-3 h-3 animate-pulse" />
                    ENTSO-E Live
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                Day-ahead electricity prices{latestMonthLabel ? ` · ${latestMonthLabel}` : ""} · Interconnector capacities (NTC)
                <span className="ml-2 text-blue-500">· Click a country to view generation by type</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                <span className="font-medium text-slate-500">ℹ️ Bidding zone prices</span> (may differ from national average due to transmission congestion) · Updated hourly · Negative prices indicate excess renewable generation
              </p>
            </div>

            {cheapest && mostExpensive && (
              <div className="flex gap-3 text-xs shrink-0">
                <div className="text-center px-3 py-1.5 bg-green-50 border border-green-100 rounded-lg">
                  <div className="text-green-700 font-semibold">{cheapest.country}</div>
                  <div className="text-green-600 font-bold">€{cheapest.latestMonthAvg!.toFixed(1)}/MWh</div>
                  <div className="text-green-500">Cheapest</div>
                </div>
                <div className="text-center px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg">
                  <div className="text-red-700 font-semibold">{mostExpensive.country}</div>
                  <div className="text-red-600 font-bold">€{mostExpensive.latestMonthAvg!.toFixed(1)}/MWh</div>
                  <div className="text-red-500">Most expensive</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-slate-500 shrink-0">€/MWh:</span>
            {LEGEND.map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="inline-block w-3.5 h-3.5 rounded-sm border border-black/10" style={{ background: color }} />
                {label}
              </span>
            ))}
            <span className="ml-2 text-xs text-slate-400 hidden sm:inline">— — Interconnector (width = NTC capacity)</span>
          </div>

          <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-xs text-blue-900 leading-relaxed">
              <span className="font-semibold">❄️ Negative prices?</span> When renewable generation exceeds demand (high wind/solar output), prices go negative. Power generators PAY to avoid shutting down, and consumers GET PAID to consume. Common in France (nuclear excess), Germany/Belgium (renewable peaks), and windy Nordic regions.
            </p>
          </div>

          <DataSourceStatus
            meta={pricesResponse?._meta}
            sourceName="ENTSO-E"
            hasData={!!prices?.length}
          />
        </CardHeader>

        <CardContent className="p-0 relative">
          {isLoading && (
            <div className="h-[520px] flex flex-col items-center justify-center bg-slate-50 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-400">Loading European grid data…</p>
            </div>
          )}

          {hasError && (
            <div className="h-[520px] flex flex-col items-center justify-center bg-slate-50 gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-sm text-slate-500">Could not load map data. Check server logs.</p>
            </div>
          )}

          {!isLoading && !hasError && (
            <>
              <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 bg-white/90 shadow-sm"
                  onClick={() => mapRef.current?.zoomIn()}
                  data-testid="button-map-zoom-in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 bg-white/90 shadow-sm"
                  onClick={() => mapRef.current?.zoomOut()}
                  data-testid="button-map-zoom-out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant={showPowerPlants ? "default" : "outline"}
                  className={`h-7 w-7 shadow-sm ${showPowerPlants ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-white/90"}`}
                  onClick={() => setShowPowerPlants(prev => !prev)}
                  title="Toggle Power Plants"
                  data-testid="button-toggle-powerplants"
                >
                  <Factory className="w-3.5 h-3.5" />
                </Button>
              </div>

              {showPowerPlants && (
                <div className="absolute top-3 left-3 z-[1000] bg-white/95 rounded-lg shadow-lg border border-slate-200 max-w-[220px]" data-testid="panel-powerplant-filters">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
                    onClick={() => setPowerPlantFiltersOpen(prev => !prev)}
                    data-testid="button-toggle-pp-filters"
                  >
                    <div className="flex items-center gap-1.5">
                      <Factory className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-semibold text-slate-700">Power Plants</span>
                      {isPowerPlantsLoading && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                    </div>
                    {powerPlantFiltersOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </div>

                  {powerPlantFiltersOpen && (
                    <div className="px-3 pb-3 border-t border-slate-100 pt-2">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">Fuel Type</div>
                      <div className="space-y-1">
                        {FUEL_TYPES.map(fuel => (
                          <label key={fuel} className="flex items-center gap-1.5 cursor-pointer" data-testid={`checkbox-fuel-${fuel.toLowerCase()}`}>
                            <Checkbox
                              checked={enabledFuels.has(fuel)}
                              onCheckedChange={() => toggleFuel(fuel)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getFuelColor(fuel) }} />
                            <span className="text-xs text-slate-600">{fuel}</span>
                          </label>
                        ))}
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">Min Capacity</div>
                        <Slider
                          value={[minCapacity]}
                          onValueChange={([v]) => setMinCapacity(v)}
                          min={0}
                          max={500}
                          step={10}
                          className="w-full"
                          data-testid="slider-min-capacity"
                        />
                        <div className="text-[10px] text-slate-500 mt-1 text-center">{minCapacity} MW</div>
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Legend</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                          {[
                            { label: "<50 MW", r: 3 },
                            { label: "50–200", r: 5 },
                            { label: "200–500", r: 7 },
                            { label: "500–1k", r: 9 },
                            { label: ">1,000", r: 12 },
                          ].map(s => (
                            <div key={s.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span
                                className="inline-block rounded-full bg-slate-400 shrink-0"
                                style={{ width: s.r * 2, height: s.r * 2 }}
                              />
                              {s.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div
                ref={initMap}
                style={{ height: "520px", width: "100%" }}
                data-testid="map-entsoe-transmission"
              />
            </>
          )}

          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-400">
            <span>Prices: ENTSO-E day-ahead bidding zones (UK via Elexon N2EX) · Boundaries: EU GISCO (60M){showPowerPlants ? " · Plants: WRI Global" : ""} · Updated hourly · Negative prices indicate renewable generation excess</span>
            {hoveredCountry && (
              <span className="font-medium text-slate-600">
                {hoveredCountry}: {priceLabel(priceMap.get(hoveredCountry) ?? null)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generation by Type Panel */}
      {selectedCountry && (
        <Card className="border-none shadow-md mt-4 overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  {selectedCountry} — Actual Generation by Fuel Type
                  {!isGenLoading && genData && (
                    <Badge variant="outline" className="text-xs font-normal border-blue-200 text-blue-600 gap-1">
                      <Radio className="w-3 h-3 animate-pulse" />
                      ENTSO-E Live
                    </Badge>
                  )}
                </CardTitle>
                {genData && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    7-day rolling window · {genData.period} ·{" "}
                    <span className="text-green-600 font-medium">{genData.renewableSharePct}% renewable</span>
                    {genData.dataUnit !== "pct" && (
                      <> · total avg {(genData.totalAvgMw ?? totalAvg).toLocaleString()} MW</>
                    )}
                    {genData.carbonIntensityAvg != null && genData.carbonIntensityAvg > 0 && (
                      <span className="ml-1 text-slate-500">
                        · <span className="font-medium">{genData.carbonIntensityAvg} gCO₂/kWh</span>
                      </span>
                    )}
                    {genData.source && (
                      <span className="ml-1 text-slate-400">· {genData.source}</span>
                    )}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setSelectedCountry(null);
                  selectedLayerRef.current = null;
                }}
                data-testid="button-close-generation"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Renewable vs Fossil summary bar */}
            {genData && genData.fuels.length > 0 && (
              <div className="mt-3">
                <div className="flex rounded-full overflow-hidden h-3">
                  {genData.fuels.map(f => (
                    <div
                      key={f.fuelType}
                      title={`${f.fuelType}: ${f.avgMw.toLocaleString()} MW`}
                      style={{
                        width: `${(f.avgMw / totalAvg) * 100}%`,
                        background: f.color,
                        minWidth: f.avgMw > 0 ? 2 : 0,
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {genData.fuels.map(f => (
                    <span key={f.fuelType} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: f.color }} />
                      {f.fuelType} ({Math.round((f.avgMw / totalAvg) * 100)}%)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-4">
            {isGenLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-slate-400">
                  Fetching generation data{selectedCountry === "United Kingdom" ? " from Carbon Intensity API" : " from ENTSO-E"}…
                </p>
              </div>
            )}

            {!isGenLoading && !genData && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <p className="text-sm text-slate-500">No generation data available for {selectedCountry}</p>
              </div>
            )}

            {!isGenLoading && genData && genData.fuels.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {genData.fuels.map(fuel => (
                  <FuelChart
                    key={fuel.fuelType}
                    fuel={fuel}
                    dataUnit={genData.dataUnit ?? "MW"}
                    data-testid={`fuel-chart-${fuel.fuelType.replace(/\s+/g, "-").toLowerCase()}`}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
