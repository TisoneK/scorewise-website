/**
 * SignInPage + SignupPage — authentication pages.
 *
 * Extracted from src/app/page.tsx during Phase E modularization.
 *
 * SignInPage renders a login form and toggles to SignupPage when the user
 * clicks "Create one". SignupPage calls /api/auth/signup then returns to
 * the sign-in view.
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
import { Loader2, Lock, UserPlus, LogOut } from "lucide-react";
import { BasketballIcon } from "./icons";

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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

  if (showSignup) {
    return <SignupPage onBack={() => setShowSignup(false)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md bg-card/80 border-border/50 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-neon-green/10 flex items-center justify-center">
            <BasketballIcon className="w-8 h-8 text-neon-green" />
          </div>
          <CardTitle className="text-2xl font-black">ScoreWise</CardTitle>
          <CardDescription>Basketball Predictions Dashboard</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background border-border/50"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-neon-green text-background hover:bg-neon-green/90 font-bold"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              Sign In
            </Button>
          </form>
          <Separator className="my-4 bg-border/30" />
          <div className="text-center">
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
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md bg-card/80 border-border/50 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-neon-green/10 flex items-center justify-center">
            <BasketballIcon className="w-8 h-8 text-neon-green" />
          </div>
          <CardTitle className="text-2xl font-black">Create Account</CardTitle>
          <CardDescription>Join ScoreWise to access predictions</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Input
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-background border-border/50"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-neon-green text-background hover:bg-neon-green/90 font-bold"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Create Account
            </Button>
          </form>
          <Separator className="my-4 bg-border/30" />
          <div className="text-center">
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
