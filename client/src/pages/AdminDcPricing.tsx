import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle, XCircle, Zap } from "lucide-react";

interface Job {
  id: string;
  jobType: string;
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  targetsTotal: number;
  targetsSuccess: number;
  targetsFailed: number;
  recordsSaved: number;
  status: string;
  errorSummary?: string;
}

interface Snapshot {
  id: string;
  operatorName: string;
  region?: string;
  country: string;
  pricePerKwh?: number;
  capacityMw?: number;
  pueRating?: number;
  confidence: string;
  snapshotDate: string;
  notes?: string;
  dataSource: string;
}

interface Discrepancy {
  id: string;
  operatorName: string;
  region?: string;
  country: string;
  field: string;
  spreadPercent?: number;
  status: string;
  sourceA: Record<string, any>;
  sourceB: Record<string, any>;
}

export function AdminDcPricing() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const [statusRes, snapshotsRes, queueRes] = await Promise.all([
        fetch("/api/admin/dc-pricing/status"),
        fetch("/api/admin/dc-pricing/snapshots"),
        fetch("/api/admin/dc-pricing/queue"),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setJobs(data.recentJobs || []);
      }
      if (snapshotsRes.ok) {
        const data = await snapshotsRes.json();
        setSnapshots(data.snapshots || []);
      }
      if (queueRes.ok) {
        const data = await queueRes.json();
        setDiscrepancies(data.discrepancies || []);
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    } finally {
      setLoading(false);
    }
  }

  async function triggerScrape() {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/dc-pricing/run", { method: "POST" });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 1000));
        await fetchStatus();
      }
    } catch (err) {
      console.error("Failed to trigger scrape:", err);
    } finally {
      setRunning(false);
    }
  }

  async function resolveDiscrepancy(id: string, status: string, note: string) {
    try {
      const res = await fetch(`/api/admin/dc-pricing/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolutionNote: note }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error("Failed to resolve discrepancy:", err);
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-600">Loading...</div>;
  }

  const latestJob = jobs[0];

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-amber-600" />
        <h1 className="text-2xl font-bold text-slate-900">DC Pricing Pipeline</h1>
      </div>

      {/* Panel 1: Scraping Status */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Zap className="w-4 h-4" /> Scraping Status
        </h2>

        {latestJob && (
          <div className="bg-slate-50 rounded p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-slate-600">Last job: {latestJob.jobType}</span>
              <span
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  latestJob.status === "success"
                    ? "bg-emerald-100 text-emerald-800"
                    : latestJob.status === "partial"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                }`}
              >
                {latestJob.status}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Targets</p>
                <p className="font-mono font-bold">
                  {latestJob.targetsSuccess}/{latestJob.targetsTotal}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Records</p>
                <p className="font-mono font-bold">{latestJob.recordsSaved}</p>
              </div>
              <div>
                <p className="text-slate-500">Started</p>
                <p className="font-mono text-xs">
                  {new Date(latestJob.startedAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Duration</p>
                <p className="font-mono text-xs">
                  {latestJob.completedAt
                    ? `${Math.round(
                        (new Date(latestJob.completedAt).getTime() - new Date(latestJob.startedAt).getTime()) / 1000
                      )}s`
                    : "running"}
                </p>
              </div>
            </div>
            {latestJob.errorSummary && (
              <div className="bg-red-50 border border-red-200 rounded p-2">
                <p className="text-xs text-red-700">{latestJob.errorSummary}</p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={triggerScrape}
          disabled={running}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded transition"
        >
          {running ? "Running..." : "Run Scrape Now"}
        </button>

        <div className="text-xs text-slate-500 space-y-1">
          <p>
            <span className="font-semibold">Recent activity:</span> {jobs.length} jobs recorded
          </p>
        </div>
      </div>

      {/* Panel 2: Pricing Records */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Recent Pricing Records
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Operator</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Region</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">€/kWh</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Capacity</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Confidence</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                    No records yet
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{snap.operatorName}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{snap.region || "—"}</td>
                    <td className="px-3 py-2 font-mono font-bold">{snap.pricePerKwh ? snap.pricePerKwh.toFixed(3) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{snap.capacityMw ? snap.capacityMw.toFixed(0) : "—"}MW</td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          snap.confidence === "high"
                            ? "bg-emerald-100 text-emerald-800"
                            : snap.confidence === "medium"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {snap.confidence}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {new Date(snap.snapshotDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel 3: Review Queue */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" /> Data Quality Review Queue
        </h2>

        {discrepancies.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
            <p>All discrepancies resolved!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {discrepancies.map((disc) => (
              <div
                key={disc.id}
                className="border border-amber-200 bg-amber-50 rounded p-3 space-y-2"
              >
                <div className="font-semibold text-sm text-slate-900">
                  {disc.operatorName} {disc.region && `(${disc.region})`}: {disc.field} spread{" "}
                  <span className="text-amber-700 font-bold">{disc.spreadPercent?.toFixed(1)}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white rounded p-2">
                    <p className="text-slate-600 font-semibold">Source A</p>
                    <p className="font-mono">{JSON.stringify(disc.sourceA.value)}</p>
                    <p className="text-slate-500 text-xs">{disc.sourceA.source}</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-slate-600 font-semibold">Source B</p>
                    <p className="font-mono">{JSON.stringify(disc.sourceB.value)}</p>
                    <p className="text-slate-500 text-xs">{disc.sourceB.source}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveDiscrepancy(disc.id, "resolved", "Confirmed")}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1 rounded"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => resolveDiscrepancy(disc.id, "dismissed", "Dismissed as acceptable variance")}
                    className="flex-1 bg-slate-400 hover:bg-slate-500 text-white text-xs py-1 rounded"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
