import { useState, useEffect, useRef } from "react";
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
  BarChart3, Shield,
} from "lucide-react";
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
}

interface FormValues {
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
        <span className="ml-auto shrink-0 text-xs text-slate-400 mt-0.5">{(step.durationMs / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

function SiteCard({ site }: { site: SiteRecommendation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border ${scoreBg(site.overallScore)} shadow-sm`}>
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
        {/* Score breakdown */}
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

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
          <div className="flex items-center gap-1 text-slate-600">
            <Zap className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
            <span>{site.gridCapacityMW.toLocaleString()} MW grid</span>
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

        {/* Recommendation */}
        <p className="text-sm text-slate-700 mb-3 leading-relaxed">{site.recommendation}</p>

        {/* Expand/collapse */}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResearchAgent() {
  const { toast } = useToast();

  // Form state
  const [form, setForm] = useState<FormValues>({
    powerRequirementMW: 50,
    sustainabilityTarget: 60,
    timelineMonths: 24,
    budgetSensitivity: "Medium",
    additionalRequirements: "",
  });

  // Agent state
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<AgentStep[]>([]);
  const [activeStep, setActiveStep] = useState<{ title: string; description: string } | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load completed report
  const { data: report } = useQuery<{ content: SiteSelectionContent }>({
    queryKey: ["research-agent-report", reportId],
    queryFn: () => apiRequest("GET", `/api/research-agent/report/${reportId}`).then((r) => r.json()),
    enabled: reportId !== null,
  });

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function connectSSE(jid: string) {
    const es = new EventSource(`/api/research-agent/stream/${jid}`, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);

        if (event.type === "step_start") {
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
      // Only treat as error if we haven't received a complete event yet
      if (isRunning) {
        setAgentError("Connection lost. The analysis may still be running — please refresh and check your reports.");
        setIsRunning(false);
      }
      es.close();
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setJobId(null);
    setCompletedSteps([]);
    setActiveStep(null);
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
    setReportId(null);
    setAgentError(null);
    setIsRunning(false);
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

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Data Centre Site Finder</h2>
          <p className="text-slate-500 mt-1 text-sm">
            AI-powered analysis across European power markets. Provide your requirements and our agent
            screens countries, fetches live grid data, and ranks the best locations for your deployment.
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
                {/* Power requirement */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="power" className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-500" />
                      Power Requirement
                    </Label>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{form.powerRequirementMW} MW</span>
                  </div>
                  <Slider
                    id="power"
                    min={1}
                    max={500}
                    step={1}
                    value={[form.powerRequirementMW]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, powerRequirementMW: v }))}
                    className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
                    placeholder="e.g. Tier III+ facility, proximity to financial hub, specific country preferences..."
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

        {/* Agent progress */}
        {(isRunning || (completedSteps.length > 0 && !isDone)) && !agentError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                Analysing European Power Markets…
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedSteps.map((step) => (
                <AgentStepRow key={step.step} step={step} isActive={false} />
              ))}
              {activeStep && (
                <AgentStepRow
                  step={{ step: completedSteps.length + 1, title: activeStep.title, description: activeStep.description, durationMs: 0, outputSummary: "" }}
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
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{content.executiveSummary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {content.shortlistedCountries.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Ranked sites */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                Ranked Site Recommendations
              </h3>
              <div className="space-y-4">
                {content.rankedSites.map((site) => (
                  <SiteCard key={site.rank} site={site} />
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
