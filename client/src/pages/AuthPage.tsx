import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, UserPlus, KeyRound, ArrowLeft, CheckCircle } from "lucide-react";
import logoPath from "@/assets/1giglabs-logo.png";

const BLOCKED_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "live.com", "msn.com", "me.com", "mac.com", "googlemail.com",
];

function validateWorkEmail(email: string): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  if (BLOCKED_DOMAINS.includes(domain)) {
    return `Personal email addresses (@${domain}) are not accepted. Please use your work email.`;
  }
  return null;
}

type Mode = "login" | "register" | "forgot" | "forgot-sent" | "reset" | "reset-done";

interface AuthPageProps {
  initialMode?: Mode;
  resetToken?: string;
}

export default function AuthPage({ initialMode, resetToken }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const emailError = mode === "register" ? validateWorkEmail(email) : null;

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Login Failed", description: err.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setMode("forgot-sent");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setMode("reset-done");
    },
    onError: (err: Error) => {
      toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else if (mode === "register") {
      if (emailError) return;
      registerMutation.mutate({ email, password, firstName, lastName });
    } else if (mode === "forgot") {
      forgotMutation.mutate({ email });
    } else if (mode === "reset") {
      if (!resetToken) return;
      resetMutation.mutate({ token: resetToken, password: newPassword });
    }
  };

  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    forgotMutation.isPending ||
    resetMutation.isPending;

  const renderHeader = () => {
    if (mode === "forgot") return { title: "Forgot password?", desc: "Enter your work email and we'll send you a reset link." };
    if (mode === "forgot-sent") return { title: "Check your email", desc: "" };
    if (mode === "reset") return { title: "Set new password", desc: "Choose a new password for your account." };
    if (mode === "reset-done") return { title: "Password updated", desc: "" };
    if (mode === "register") return { title: "Create Account", desc: "Register with your work email to get started" };
    return { title: "Sign In", desc: "Sign in with your work email to access reports" };
  };

  const { title, desc } = renderHeader();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex justify-center">
            <img src={logoPath} alt="1GigLabs" className="h-12" data-testid="img-logo" />
          </div>
          <div>
            <CardTitle className="text-2xl" data-testid="text-auth-title">{title}</CardTitle>
            {desc && <CardDescription className="mt-1">{desc}</CardDescription>}
          </div>
        </CardHeader>
        <CardContent>

          {/* Forgot-sent confirmation */}
          {mode === "forgot-sent" && (
            <div className="text-center space-y-5">
              <div className="flex justify-center">
                <CheckCircle className="w-14 h-14 text-green-500" />
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">
                If <strong>{email}</strong> is registered, you'll receive a password reset link shortly. Check your spam folder if you don't see it.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setMode("login")} data-testid="button-back-login">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
              </Button>
            </div>
          )}

          {/* Reset-done confirmation */}
          {mode === "reset-done" && (
            <div className="text-center space-y-5">
              <div className="flex justify-center">
                <CheckCircle className="w-14 h-14 text-green-500" />
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">
                Your password has been updated. You can now sign in with your new password.
              </p>
              <Button className="w-full" onClick={() => { setMode("login"); setLocation("/"); }} data-testid="button-go-login">
                <LogIn className="w-4 h-4 mr-2" /> Sign In
              </Button>
            </div>
          )}

          {/* Forms */}
          {(mode === "login" || mode === "register" || mode === "forgot" || mode === "reset") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      data-testid="input-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      data-testid="input-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      placeholder="Smith"
                    />
                  </div>
                </div>
              )}

              {(mode === "login" || mode === "register" || mode === "forgot") && (
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    data-testid="input-email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailTouched(true); }}
                    onBlur={() => setEmailTouched(true)}
                    required
                    placeholder="you@company.com"
                    className={emailTouched && emailError ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  {emailTouched && emailError ? (
                    <p className="text-xs text-red-600 font-medium" data-testid="text-email-error">{emailError}</p>
                  ) : mode === "register" ? (
                    <p className="text-xs text-muted-foreground">Personal email addresses (Gmail, Yahoo, etc.) are not accepted</p>
                  ) : null}
                </div>
              )}

              {(mode === "login" || mode === "register") && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    data-testid="input-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder={mode === "register" ? "Minimum 8 characters" : "Enter your password"}
                  />
                  {mode === "login" && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-primary hover:underline"
                        data-testid="link-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {mode === "reset" && (
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    data-testid="input-new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || (mode === "register" && !!emailError)}
                data-testid="button-auth-submit"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : mode === "login" ? (
                  <LogIn className="h-4 w-4 mr-2" />
                ) : mode === "register" ? (
                  <UserPlus className="h-4 w-4 mr-2" />
                ) : mode === "forgot" ? (
                  <KeyRound className="h-4 w-4 mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {mode === "login" ? "Sign In"
                  : mode === "register" ? "Create Account"
                  : mode === "forgot" ? "Send Reset Link"
                  : "Set New Password"}
              </Button>

              {mode === "forgot" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-slate-500"
                  onClick={() => setMode("login")}
                  data-testid="button-back-from-forgot"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
                </Button>
              )}
            </form>
          )}

          {/* Switch between login / register */}
          {(mode === "login" || mode === "register") && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("register")}
                    className="text-primary hover:underline font-medium"
                    data-testid="link-switch-register"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="text-primary hover:underline font-medium"
                    data-testid="link-switch-login"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
