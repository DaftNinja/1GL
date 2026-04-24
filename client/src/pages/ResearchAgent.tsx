import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserMenu } from "@/components/UserMenu";
import logoUrl from "@/assets/1giglabs-logo.png";
import {
  BookOpen, Mail, ArrowLeft, Zap, Leaf, Clock, DollarSign,
  CheckCircle2, Loader2, AlertCircle, MapPin, Star, ChevronDown, ChevronUp,
  BarChart3, Shield, Globe, X,
} from "lucide-react";
import { GIGLABS_COUNTRIES } from "@shared/schema";
import type { SiteSelectionContent, SiteRecommendation, AgentStep } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentEvent {
  type: string;
  step?: number;
  title?: string;
  description?: string;
  outputSummary?: string;
  durationMs?: number;
  reportId?: number;
  message?: string;
  countries?: string[];
  scopeLabel?: string;
}

interface FormValues {
  targetCountries: string[];
  powerRequirementMW: number;
  sustainabilityTarget: number;
  timelineMonths: number;
  budgetSensitivity: "Low" | "Medium" | "High";
  additionalRequirements: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-500";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-50 border-emerald-200";
  if (score >= 60) return "bg-blue-50 border-blue-200";
  if (score >= 40) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function rankLabel(rank: number) {
  if (rank === 1) return "🥇 Top Pick";
  if (rank === 2) return "🥈 Runner-up";
  if (rank === 3) return "🥉 Third";
  return `#${rank}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentStepRow({ step, isActive }: { step: AgentStep; isActive: boolean }) {
  return (
    <div className={`flex gap-3 p-3 rounded-lg border transition-all duration-300 ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="mt-0.5 shrink-0">
        {isActive ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{step.title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
        {!isActive && step.outputSummary && (
          <p className="text-xs text-slate-600 mt-1 italic">{step.outputSummary}</p>
        )}
      </div>
      {!isActive && step.durationMs > 0 && (
        <span className="ml-auto shrink-0 text-xs text-slate-400 mt-0.5">
          {(step.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function SiteCard({ site, highlighted }: { site: SiteRecommendation; highlighted: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      id={`site-card-${site.rank}`}
      className={`border ${scoreBg(site.overallScore)} shadow-sm transition-shadow duration-500 ${highlighted ? "ring-2 ring-blue-400 shadow-blue-100 shadow-md" : ""}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-slate-500">{rankLabel(site.rank)}</span>
              <Badge variant="outline" className="text-xs">{site.country}</Badge>
              {site.liveDataSnapshot?.renewableSharePercent != null && (
                <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300 bg-emerald-50">
                  {site.liveDataSnapshot.renewableSharePercent.toFixed(0)}% renewable
                </Badge>
              )}
            </div>
            <CardTitle className="text-base text-slate-800">{site.location}</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">{site.region}</p>
          </div>
          <div className={`text-2xl font-bold tabular-nums shrink-0 ${scoreColor(site.overallScore)}`}>
            {site.overallScore}
            <span className="text-xs font-normal text-slate-400">/100</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-5 gap-1 mb-3">
          {(["power", "renewable", "cost", "regulatory", "risk"] as const).map((k) => (
            <div key={k} className="text-center">
              <div className={`text-sm font-bold tabular-nums ${scoreColor(site.scoreBreakdown[k])}`}>
                {site.scoreBreakdown[k]}
              </div>
              <div className="text-[10px] text-slate-400 capitalize">{k}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
          <div className="flex items-center gap-1 text-slate-600">
            <Zap className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
            <span>{site.gridCapacityMW.toLocaleString()} MW</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600">
            <Leaf className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{site.renewableAccessPercent}% renewable</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600">
            <DollarSign className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>€{site.estimatedPriceMWh}/MWh</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span>{site.connectionTimelineMonths}mo connect</span>
          </div>
        </div>

        {site.liveDataSnapshot?.currentPriceMWh != null && (
          <p className="text-[11px] text-slate-400 mb-3">
            Live: €{site.liveDataSnapshot.currentPriceMWh.toFixed(2)}/MWh
            {site.liveDataSnapshot.dominantFuel && ` · ${site.liveDataSnapshot.dominantFuel}`}
            {site.liveDataSnapshot.dataFetchedAt && ` · ${new Date(site.liveDataSnapshot.dataFetchedAt).toLocaleDateString()}`}
          </p>
        )}

        <p className="text-sm text-slate-700 mb-3 leading-relaxed">{site.recommendation}</p>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Less detail" : "More detail"}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Key Strengths
                </p>
                <ul className="space-y-0.5">
                  {site.keyStrengths.map((s, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-start gap-1">
                      <span className="text-emerald-500 mt-0.5">·</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Key Risks
                </p>
                <ul className="space-y-0.5">
                  {site.keyRisks.map((r, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-start gap-1">
                      <span className="text-red-400 mt-0.5">·</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Avg PUE: {site.averagePUE.toFixed(2)}</span>
              <span>·</span>
              <span>{site.coolingAdvantage}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Country multi-select ──────────────────────────────────────────────────────

function CountryPicker({
  selected,
  onChange,
  error,
}: {
  selected: string[];
  onChange: (countries: string[]) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = (GIGLABS_COUNTRIES as readonly string[]).filter(
    (c) => c.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(country: string) {
    if (selected.includes(country)) {
      onChange(selected.filter((c) => c !== country));
    } else {
      onChange([...selected, country]);
    }
  }

  return (
    <div className="space-y-2" ref={ref}>
      <Label className="flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-blue-500" />
        Countries to Research
        <span className="text-red-500 ml-0.5">*</span>
      </Label>

      {/* Selected badges */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <Badge
              key={c}
              variant="secondary"
              className="flex items-center gap-1 pr-1 cursor-pointer"
              onClick={() => toggle(c)}
            >
              {c}
              <X className="w-3 h-3 text-slate-400 hover:text-slate-700" />
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md border bg-white text-left ${error ? "border-red-400" : "border-slate-300"} hover:border-slate-400 transition-colors`}
        >
          <span className={selected.length === 0 ? "text-slate-400" : "text-slate-700"}>
            {selected.length === 0
              ? "Select one or more countries…"
              : `${selected.length} country${selected.length > 1 ? " countries" : ""} selected`}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
            <div className="p-2 border-b border-slate-100">
              <Input
                autoFocus
                placeholder="Search countries…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-slate-400 px-3 py-2">No matches</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-slate-50 transition-colors ${selected.includes(c) ? "text-blue-600 font-medium" : "text-slate-700"}`}
                  >
                    {c}
                    {selected.includes(c) && <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {selected.length === 0 && !error && (
        <p className="text-xs text-slate-400">
          Which country or countries would you like to research for data centre site selection?
        </p>
      )}
    </div>
  );
}

// ── Site map ─────────────────────────────────────────────────────────────────

function markerColor(score: number) {
  if (score >= 80) return "#10b981"; // emerald
  if (score >= 60) return "#3b82f6"; // blue
  if (score >= 40) return "#f59e0b"; // amber
  return "#ef4444";                  // red
}

function SiteMap({
  sites,
  onSiteClick,
}: {
  sites: SiteRecommendation[];
  onSiteClick: (rank: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSiteClickRef = useRef(onSiteClick);
  onSiteClickRef.current = onSiteClick;

  const plotted = sites.filter((s) => s.lat != null && s.lng != null);

  useEffect(() => {
    if (!containerRef.current || plotted.length === 0) return;

    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      // Destroy any existing instance
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = (L as any).map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      });
      mapRef.current = map;

      (L as any).tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const bounds: [number, number][] = [];

      plotted.forEach((site) => {
        const lat = site.lat!;
        const lng = site.lng!;
        bounds.push([lat, lng]);

        const color = markerColor(site.overallScore);

        const tooltipHtml = `
          <div style="min-width:175px;font-family:system-ui,sans-serif">
            <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${site.rank} ${site.location}</div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${site.country} · Score ${site.overallScore}/100</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px">
              <span style="color:#6b7280">⚡ MW avail.</span><span style="font-weight:600">${site.gridCapacityMW.toLocaleString()} MW</span>
              <span style="color:#6b7280">🌿 Renewable</span><span style="font-weight:600">${site.renewableAccessPercent}%</span>
              <span style="color:#6b7280">💶 Cost</span><span style="font-weight:600">€${site.estimatedPriceMWh}/MWh</span>
              <span style="color:#6b7280">⏱ Connect</span><span style="font-weight:600">${site.connectionTimelineMonths} mo</span>
            </div>
            <div style="margin-top:6px;font-size:11px;color:#3b82f6">Click to view details ↓</div>
          </div>`;

        const marker = (L as any).circleMarker([lat, lng], {
          radius: 13,
          fillColor: color,
          color: "#fff",
          weight: 2.5,
          opacity: 1,
          fillOpacity: 0.9,
        });

        // Rank label inside marker using divIcon overlay
        const labelIcon = (L as any).divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;pointer-events:none">${site.rank}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const labelMarker = (L as any).marker([lat, lng], { icon: labelIcon, interactive: false });

        marker.bindTooltip(tooltipHtml, {
          sticky: false,
          direction: "top",
          offset: [0, -14],
          opacity: 1,
        });

        marker.on("click", () => onSiteClickRef.current(site.rank));
        marker.on("mouseover", function (this: any) {
          this.setStyle({ radius: 16, weight: 3 });
        });
        marker.on("mouseout", function (this: any) {
          this.setStyle({ radius: 13, weight: 2.5 });
        });

        marker.addTo(map);
        labelMarker.addTo(map);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 9);
      } else {
        map.fitBounds((L as any).latLngBounds(bounds).pad(0.2));
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [plotted.map((s) => s.rank).join(",")]);

  if (plotted.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-slate-700">Site Locations</span>
        <span className="text-xs text-slate-400 ml-1">— hover to preview, click to jump to details</span>
      </div>
      <div ref={containerRef} style={{ height: 420, width: "100%", zIndex: 0 }} />
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-3">
        {[
          { label: "Score ≥ 80", color: "#10b981" },
          { label: "60–79",      color: "#3b82f6" },
          { label: "40–59",      color: "#f59e0b" },
          { label: "< 40",       color: "#ef4444" },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span style={{ background: color }} className="inline-block w-3 h-3 rounded-full" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResearchAgent() {
  const { toast } = useToast();

  const [form, setForm] = useState<FormValues>({
    targetCountries: [],
    powerRequirementMW: 50,
    sustainabilityTarget: 60,
    timelineMonths: 24,
    budgetSensitivity: "Medium",
    additionalRequirements: "",
  });
  const [countryError, setCountryError] = useState("");

  // Agent state
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<AgentStep[]>([]);
  const [activeStep, setActiveStep] = useState<{ title: string; description: string } | null>(null);
  const [activeScope, setActiveScope] = useState<string | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [highlightedRank, setHighlightedRank] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleMapSiteClick = useCallback((rank: number) => {
    const el = document.getElementById(`site-card-${rank}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedRank(rank);
      setTimeout(() => setHighlightedRank(null), 2000);
    }
  }, []);

  const { data: report } = useQuery<{ content: SiteSelectionContent }>({
    queryKey: ["research-agent-report", reportId],
    queryFn: () =>
      apiRequest("GET", `/api/research-agent/report/${reportId}`).then((r) => r.json()),
    enabled: reportId !== null,
  });

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  function connectSSE(jid: string) {
    const es = new EventSource(`/api/research-agent/stream/${jid}`, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);

        if (event.type === "scope") {
          setActiveScope(event.scopeLabel ?? null);
        } else if (event.type === "step_start") {
          setActiveStep({ title: event.title ?? "", description: event.description ?? "" });
        } else if (event.type === "step_complete") {
          const step: AgentStep = {
            step: event.step ?? 0,
            title: event.title ?? "",
            description: event.description ?? "",
            durationMs: event.durationMs ?? 0,
            outputSummary: event.outputSummary ?? "",
          };
          setCompletedSteps((prev) => [...prev, step]);
          setActiveStep(null);
        } else if (event.type === "complete") {
          setReportId(event.reportId ?? null);
          setIsRunning(false);
          setActiveStep(null);
          es.close();
        } else if (event.type === "error") {
          setAgentError(event.message ?? "Agent error");
          setIsRunning(false);
          setActiveStep(null);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      if (isRunning) {
        setAgentError("Connection lost. The analysis may still be running — please refresh and check your reports.");
        setIsRunning(false);
      }
      es.close();
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate country selection
    if (form.targetCountries.length === 0) {
      setCountryError("Please select at least one country to research.");
      return;
    }
    setCountryError("");

    setJobId(null);
    setCompletedSteps([]);
    setActiveStep(null);
    setActiveScope(null);
    setReportId(null);
    setAgentError(null);
    setIsRunning(true);

    try {
      const res = await apiRequest("POST", "/api/research-agent/run", form);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Failed to start agent" }));
        throw new Error(body.message || "Failed to start agent");
      }
      const { jobId: jid } = await res.json();
      setJobId(jid);
      connectSSE(jid);
    } catch (err: any) {
      setAgentError(err.message || "Failed to start agent");
      setIsRunning(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function handleReset() {
    eventSourceRef.current?.close();
    setJobId(null);
    setCompletedSteps([]);
    setActiveStep(null);
    setActiveScope(null);
    setReportId(null);
    setAgentError(null);
    setIsRunning(false);
    setHighlightedRank(null);
  }

  const content: SiteSelectionContent | undefined = report?.content;
  const isDone = reportId !== null && content !== undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Nav */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="https://1giglabs.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white p-1.5 rounded-lg hover:opacity-90 transition-opacity">
              <img src={logoUrl} alt="1GigLabs" className="h-7 w-auto object-contain" />
            </a>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-500" />
              <h1 className="text-sm font-semibold text-slate-700">Site Finder</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Power Trends</span>
              </button>
            </Link>
            <Link href="/methodology">
              <button className="flex items-center gap-1.5 text-sm font-medium methodology-glow hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Methodology</span>
              </button>
            </Link>
            <a href="https://www.1giglabs.com/#contact" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Contact</span>
            </a>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        <div>
          <h2 className="text-2xl font-bold text-slate-900">Data Centre Site Finder</h2>
          <p className="text-slate-500 mt-1 text-sm">
            AI-powered analysis for any country or combination of countries. Select your target market(s),
            set requirements, and the agent screens regions, fetches live grid data, and ranks the best locations.
          </p>
        </div>

        {/* Requirements form */}
        {!isRunning && !isDone && !agentError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                Site Requirements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Country selection — required */}
                <CountryPicker
                  selected={form.targetCountries}
                  onChange={(countries) => {
                    setForm((f) => ({ ...f, targetCountries: countries }));
                    if (countries.length > 0) setCountryError("");
                  }}
                  error={countryError}
                />

                {/* Power requirement */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-500" />
                      Power Requirement
                    </Label>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{form.powerRequirementMW} MW</span>
                  </div>
                  <Slider
                    min={1}
                    max={500}
                    step={1}
                    value={[form.powerRequirementMW]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, powerRequirementMW: v }))}
                  />
                  <p className="text-xs text-slate-400">IT load in MW (1–500 MW)</p>
                </div>

                {/* Sustainability target */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                      Sustainability Target
                    </Label>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{form.sustainabilityTarget}% renewable</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[form.sustainabilityTarget]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, sustainabilityTarget: v }))}
                  />
                </div>

                {/* Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-violet-500" />
                      Grid Connection Timeline
                    </Label>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{form.timelineMonths} months</span>
                  </div>
                  <Slider
                    min={6}
                    max={60}
                    step={6}
                    value={[form.timelineMonths]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, timelineMonths: v }))}
                  />
                  <p className="text-xs text-slate-400">Maximum acceptable grid connection timeline</p>
                </div>

                {/* Budget sensitivity */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-blue-500" />
                    Budget Sensitivity
                  </Label>
                  <Select
                    value={form.budgetSensitivity}
                    onValueChange={(v) => setForm((f) => ({ ...f, budgetSensitivity: v as FormValues["budgetSensitivity"] }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low — cost is secondary</SelectItem>
                      <SelectItem value="Medium">Medium — balanced</SelectItem>
                      <SelectItem value="High">High — cost-critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional requirements */}
                <div className="space-y-2">
                  <Label htmlFor="additional">Additional Requirements (optional)</Label>
                  <Input
                    id="additional"
                    placeholder="e.g. Tier III+ facility, proximity to financial hub, specific connectivity requirements…"
                    value={form.additionalRequirements}
                    onChange={(e) => setForm((f) => ({ ...f, additionalRequirements: e.target.value }))}
                  />
                </div>

                <Button type="submit" className="w-full sm:w-auto">
                  <Star className="w-4 h-4 mr-2" />
                  Run Site Analysis
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Active scope banner */}
        {(isRunning || isDone) && activeScope && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <Globe className="w-4 h-4 shrink-0 text-blue-500" />
            <span>
              <span className="font-medium">Researching data centre sites in: </span>
              {activeScope}
            </span>
          </div>
        )}

        {/* Agent progress */}
        {(isRunning || (completedSteps.length > 0 && !isDone)) && !agentError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                Analysing{activeScope ? ` ${activeScope}` : "…"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedSteps.map((step) => (
                <AgentStepRow key={step.step} step={step} isActive={false} />
              ))}
              {activeStep && (
                <AgentStepRow
                  step={{
                    step: completedSteps.length + 1,
                    title: activeStep.title,
                    description: activeStep.description,
                    durationMs: 0,
                    outputSummary: "",
                  }}
                  isActive
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {agentError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Analysis failed</p>
                  <p className="text-sm text-red-600 mt-0.5">{agentError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={handleReset}>
                    Try again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {isDone && content && (
          <>
            {/* Scope confirmation */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>
                <span className="font-medium">Research scope: </span>
                {content.shortlistedCountries.join(", ")}
              </span>
            </div>

            {/* Agent steps recap */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Analysis Complete
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.agentSteps.map((step) => (
                  <AgentStepRow key={step.step} step={step} isActive={false} />
                ))}
              </CardContent>
            </Card>

            {/* Executive summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Executive Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {content.executiveSummary}
                </p>
              </CardContent>
            </Card>

            {/* Map */}
            <SiteMap sites={content.rankedSites} onSiteClick={handleMapSiteClick} />

            {/* Ranked sites */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                Ranked Site Recommendations
              </h3>
              <div className="space-y-4">
                {content.rankedSites.map((site) => (
                  <SiteCard key={site.rank} site={site} highlighted={highlightedRank === site.rank} />
                ))}
              </div>
            </div>

            {/* Data sources */}
            {content.dataSources && content.dataSources.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-slate-600 font-medium">Data Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {content.dataSources.map((ds, i) => (
                      <li key={i} className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{ds.source}</span> — {ds.publisher} ({ds.year}). {ds.description}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="text-center pb-4">
              <Button variant="outline" onClick={handleReset}>
                Run a new analysis
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
