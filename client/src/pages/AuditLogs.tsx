import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ArrowLeft, Clock, User, Activity, AlertCircle } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { Footer } from "@/components/Footer";
import logoUrl from "@/assets/1giglabs-logo.png";
import type { AuditLog } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const ACTION_COLORS: Record<string, string> = {
  login: "border-green-200 text-green-700 bg-green-50",
  logout: "border-slate-200 text-slate-600 bg-slate-50",
  register: "border-blue-200 text-blue-700 bg-blue-50",
  reset_password: "border-amber-200 text-amber-700 bg-amber-50",
  generate_report: "border-purple-200 text-purple-700 bg-purple-50",
  view_report: "border-sky-200 text-sky-700 bg-sky-50",
  delete: "border-red-200 text-red-700 bg-red-50",
};

function actionColor(action: string) {
  for (const key of Object.keys(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key)) return ACTION_COLORS[key];
  }
  return "border-slate-200 text-slate-600 bg-slate-50";
}

const ALLOWED_EMAIL = "andrew.mccreath@1giglabs.com";

export default function AuditLogs() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user && user.email !== ALLOWED_EMAIL) {
      navigate("/");
    }
  }, [user, navigate]);

  const { data: logs, isLoading, isError } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
    enabled: user?.email === ALLOWED_EMAIL,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="https://1giglabs.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white p-2 rounded-lg hover:opacity-90 transition-opacity">
            <img src={logoUrl} alt="1GigLabs" className="h-8 w-auto object-contain" />
          </a>
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50" data-testid="button-back-to-app">
                <ArrowLeft className="w-4 h-4" />
                Back to Power Trends
              </button>
            </Link>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
            <p className="text-sm text-slate-500">System access and activity history</p>
          </div>
          {logs && (
            <Badge variant="outline" className="ml-auto text-slate-500 border-slate-200" data-testid="badge-log-count">
              {logs.length} {logs.length === 1 ? "entry" : "entries"}
            </Badge>
          )}
        </div>

        {isLoading && (
          <div className="space-y-3" data-testid="skeleton-audit-logs">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <Card className="border-red-100 bg-red-50/40" data-testid="error-audit-logs">
            <CardContent className="p-6 flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">Failed to load audit logs. Please try refreshing the page.</p>
            </CardContent>
          </Card>
        )}

        {logs && logs.length === 0 && (
          <Card className="border-slate-100">
            <CardContent className="p-10 text-center text-slate-400 text-sm" data-testid="text-no-logs">
              No audit log entries found.
            </CardContent>
          </Card>
        )}

        {logs && logs.length > 0 && (
          <Card className="border-slate-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-audit-logs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Timestamp</span>
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />User</span>
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" />Action</span>
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Entity</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors" data-testid={`row-audit-${log.id}`}>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap font-mono text-xs">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-700 max-w-[200px] truncate" data-testid={`text-audit-email-${log.id}`}>
                          {log.userEmail || <span className="text-slate-400 italic">system</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant="outline" className={`text-xs ${actionColor(log.action)}`} data-testid={`badge-action-${log.id}`}>
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">
                          <span className="font-medium text-slate-600">{log.entityType}</span>
                          {log.entityId && <span className="text-slate-400 ml-1">#{log.entityId}</span>}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 font-mono text-xs whitespace-nowrap">
                          {log.ipAddress || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
