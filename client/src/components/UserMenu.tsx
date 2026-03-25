import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, User } from "lucide-react";
import { Link } from "wouter";

export function UserMenu() {
  const { user, logout, isLoggingOut } = useAuth();

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      {user.email === "andrew.mccreath@1giglabs.com" && (
        <Link href="/audit-logs">
          <Button variant="ghost" size="sm" className="text-sm font-medium text-slate-600 hover:text-primary" data-testid="button-audit-logs">
            <Shield className="w-4 h-4 mr-1" />
            Audit Log
          </Button>
        </Link>
      )}
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
        <User className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs text-slate-600 dark:text-slate-300 max-w-[150px] truncate" data-testid="text-user-email">
          {user.email}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => logout()}
        disabled={isLoggingOut}
        className="text-sm text-slate-500 hover:text-red-600"
        data-testid="button-logout"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
