/**
 * UserPredictionsView — non-admin user view (predictions only, no controls).
 *
 * Extracted from src/app/page.tsx during Phase E modularization.
 *
 * Shows a searchable, filterable list of successful predictions for users
 * who aren't admins. Auto-refreshes every 60 seconds.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, AlertTriangle, LogOut } from "lucide-react";
import type { StoredPredictions } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { PredictionCard, PredictionCardSkeleton } from "./prediction-card";

type ConfFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type RecFilter = "ALL" | "OVER" | "UNDER";

export function UserPredictionsView() {
  const [data, setData] = useState<StoredPredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState<ConfFilter>("ALL");
  const [recFilter, setRecFilter] = useState<RecFilter>("ALL");

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch("/api/predictions");
      if (!res.ok) throw new Error("Failed to load predictions");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 60000);
    return () => clearInterval(interval);
  }, [fetchPredictions]);

  const filtered = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions.filter((p) => {
      if (
        search &&
        !p.match_id.toLowerCase().includes(search.toLowerCase()) &&
        !(p.team_winner || "").toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (confFilter !== "ALL" && p.confidence?.toUpperCase() !== confFilter)
        return false;
      if (recFilter !== "ALL" && p.recommendation?.toUpperCase() !== recFilter)
        return false;
      return true;
    });
  }, [data, search, confFilter, recFilter]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/30 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BasketballIcon className="w-5 h-5 text-neon-green" />
            <span className="font-black text-lg">ScoreWise</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-black">Predictions</h1>
          <p className="text-sm text-muted-foreground">
            Basketball OVER/UNDER predictions backed by historical data analysis
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search match ID or team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border/50"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={confFilter}
              onValueChange={(v) => setConfFilter(v as ConfFilter)}
            >
              <SelectTrigger className="w-[120px] bg-card border-border/50">
                <SelectValue placeholder="Confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Levels</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={recFilter}
              onValueChange={(v) => setRecFilter(v as RecFilter)}
            >
              <SelectTrigger className="w-[120px] bg-card border-border/50">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="OVER">OVER</SelectItem>
                <SelectItem value="UNDER">UNDER</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <PredictionCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card className="bg-card/60 border-neon-red/30">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-neon-red mx-auto mb-3" />
              <p className="font-semibold text-neon-red mb-1">
                Failed to load predictions
              </p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={fetchPredictions} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">
                No predictions match your filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filtered.length} prediction{filtered.length !== 1 ? "s" : ""}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchPredictions}
                className="gap-1.5 text-muted-foreground"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
            </div>
            <div className="grid gap-3">
              {filtered.map((p) => (
                <PredictionCard key={p.match_id} prediction={p} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
