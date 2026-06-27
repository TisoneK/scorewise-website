/**
 * SignInPage + SignupPage — authentication pages.
 *
 * Extracted from src/app/page.tsx during Phase E modularization.
 *
 * SignInPage renders a login form and toggles to SignupPage when the user
 * clicks "Create one". SignupPage calls /api/auth/signup then returns to
 * the sign-in view.
 *
 * Auth providers:
 * - Credentials (email + password) — always available
 * - Google OAuth — available when GOOGLE_CLIENT_ID env var is set
 *   (auto-creates user on first sign-in, no separate signup needed)
 */

"use client";

import React, { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowRight, UserPlus, Eye, EyeOff, Lock, LogOut, HelpCircle } from "lucide-react";
import { BasketballIcon } from "./icons";

/** Official Google "G" logo — multi-color SVG per Google brand guidelines. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (result?.error) {
      toast.error("Invalid email or password");
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    // signIn with redirect:true — Google OAuth requires a full page redirect
    await signIn("google", { callbackUrl: "/" });
    // No need to setGoogleLoading(false) — page redirects
  };

  if (showSignup) {
    return <SignupPage onBack={() => setShowSignup(false)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Subtle background gradient glow — fills the empty space intentionally */}
      <div className="absolute inset-0 bg-gradient-to-br from-neon-green/5 via-transparent to-neon-cyan/5 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md bg-card/90 border-border/50 shadow-2xl backdrop-blur-xl relative z-10">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-neon-green/10 border border-neon-green/20 flex items-center justify-center glow-green">
            <BasketballIcon className="w-8 h-8 text-neon-green" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">ScoreWise</CardTitle>
          <CardDescription className="text-sm">Basketball Predictions Dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {/* ── Google Sign-In (shown first — lowest friction) ── */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full bg-white text-gray-900 hover:bg-gray-50 border border-gray-300 font-semibold h-11 transition-all mb-3"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <GoogleIcon className="mr-2.5" />
            )}
            Continue with Google
          </Button>

          {/* ── Divider ── */}
          <div className="relative my-4">
            <Separator className="bg-border/30" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-card px-3 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
              or
            </span>
          </div>

          {/* ── Credentials form ── */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Password</Label>
                <button
                  type="button"
                  onClick={() => toast.info("Contact admin@scorewise.ke to reset your password")}
                  className="text-[10px] text-muted-foreground hover:text-neon-green transition-colors"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background border-border/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-neon-green text-background hover:bg-neon-green/85 font-bold h-11 transition-all"
              disabled={loading || googleLoading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Sign In
            </Button>
          </form>
          <div className="text-center mt-4">
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button
                onClick={() => setShowSignup(true)}
                className="text-neon-green hover:underline font-medium"
              >
                Create one
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SignupPage({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Signup failed");
        return;
      }
      toast.success("Account created! You can now sign in.");
      onBack();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-neon-green/5 via-transparent to-neon-cyan/5 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md bg-card/90 border-border/50 shadow-2xl backdrop-blur-xl relative z-10">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-neon-green/10 border border-neon-green/20 flex items-center justify-center glow-green">
            <BasketballIcon className="w-8 h-8 text-neon-green" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">Create Account</CardTitle>
          <CardDescription className="text-sm">Join ScoreWise to access predictions</CardDescription>
        </CardHeader>
        <CardContent>
          {/* ── Google Sign-In ── */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full bg-white text-gray-900 hover:bg-gray-50 border border-gray-300 font-semibold h-11 transition-all mb-3"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <GoogleIcon className="mr-2.5" />
            )}
            Continue with Google
          </Button>

          <div className="relative my-4">
            <Separator className="bg-border/30" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-card px-3 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
              or
            </span>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background border-border/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-background border-border/50"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-neon-green text-background hover:bg-neon-green/85 font-bold h-11 transition-all"
              disabled={loading || googleLoading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Create Account
            </Button>
          </form>
          <div className="text-center mt-4">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <button
                onClick={onBack}
                className="text-neon-green hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Re-export for backwards compat (some places may import signOut from this module)
export { signOut, LogOut };
