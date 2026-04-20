import { Switch, Route, useRoute, useSearch } from "wouter";
import { queryClient, isEmbedMode } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import PowerTrends from "@/pages/PowerTrends";
import AuthPage from "@/pages/AuthPage";
import Methodology from "@/pages/Methodology";
import AuditLogs from "@/pages/AuditLogs";
import PowerInfrastructure from "@/pages/PowerInfrastructure";
import ResearchAgent from "@/pages/ResearchAgent";
import { Loader2 } from "lucide-react";
import { IframeStorageGate } from "@/components/IframeStorageGate";

function ResetPasswordPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";
  return <AuthPage initialMode="reset" resetToken={token} />;
}

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={PowerTrends} />
      <Route path="/power-trends" component={PowerTrends} />
      <Route path="/power-map" component={PowerInfrastructure} />
      <Route path="/research-agent" component={ResearchAgent} />
      <Route path="/methodology" component={Methodology} />
      <Route path="/audit-logs" component={AuditLogs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isResetPassword] = useRoute("/reset-password");

  if (isResetPassword) {
    return <ResetPasswordPage />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated && !isEmbedMode) {
    return <AuthPage />;
  }

  return <AuthenticatedRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <IframeStorageGate>
          <AppContent />
        </IframeStorageGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
