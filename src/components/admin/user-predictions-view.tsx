/**
 * UserPredictionsView — non-admin user view (predictions only, no controls).
 *
 * Predictions are grouped by date and sorted by time within each group.
 * Auto-refreshes every 60 seconds.
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
import { Search, RefreshCw, AlertTriangle, LogOut, Calendar } from "lucide-react";
import type { StoredPredictions, Prediction } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { PredictionCard, PredictionCardSkeleton } from "./prediction-card";

type ConfFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type RecFilter = "ALL" | "OVER" | "UNDER";

/** Format a date string (e.g. "19.06.2026" or "2026-06-19") into a readable label. */
function formatDateLabel(dateStr: string): string {
  if (!dateStr) return "Unknown Date";
  try {
    // Handle DD.MM.YYYY format
    const parts = dateStr.split(".");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
    }
    // Handle ISO format
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/** Parse time string to comparable minutes. "10:30" → 630. */
function parseTime(timeStr: string): number {
  if (!timeStr) return 9999; // no time = sort last
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 9999;
}

/** Parse date string to a comparable value. Earlier = smaller. */
function parseDate(dateStr: string): string {
  if (!dateStr) return "9999-99-99";
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

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

  // Filter + sort predictions by date then time
  const grouped = useMemo(() => {
    if (!data?.predictions) return [];

    // 1. Filter
    const filtered = data.predictions.filter((p) => {
      if (search) {
        const s = search.toLowerCase();
        const haystack = [p.match_id, p.home_team || "", p.away_team || "", p.country || "", p.league || ""].join(" ").toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      if (confFilter !== "ALL" && p.confidence?.toUpperCase() !== confFilter) return false;
      if (recFilter !== "ALL" && p.recommendation?.toUpperCase() !== recFilter) return false;
      return true;
    });

    // 2. Sort by date, then time
    const sorted = [...filtered].sort((a, b) => {
      const dateA = parseDate(a.date || "");
      const dateB = parseDate(b.date || "");
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return parseTime(a.time || "") - parseTime(b.time || "");
    });

    // 3. Group by date
    const groups: { date: string; label: string; predictions: Prediction[] }[] = [];
    for (const p of sorted) {
      const dateKey = p.date || "Unknown Date";
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.date === dateKey) {
        lastGroup.predictions.push(p);
      } else {
        groups.push({ date: dateKey, label: formatDateLabel(dateKey), predictions: [p] });
      }
    }

    return groups;
  }, [data, search, confFilter, recFilter]);

  const totalCount = grouped.reduce((sum, g) => sum + g.predictions.length, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neon-green/10 border border-neon-green/20">
              <BasketballIcon className="w-4 h-4 text-neon-green" />
            </div>
            <span className="font-black text-base sm:text-lg tracking-tight">ScoreWise</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut()} className="gap-1 text-muted-foreground hover:text-foreground px-2 sm:px-3">
            <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">

        {/* Title */}
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Predictions</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Basketball OVER/UNDER predictions backed by historical data analysis
          </p>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search team, league, country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border/50 h-9 sm:h-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={confFilter} onValueChange={(v) => setConfFilter(v as ConfFilter)}>
              <SelectTrigger className="w-[110px] sm:w-[120px] bg-card border-border/50 h-9 sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Levels</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recFilter} onValueChange={(v) => setRecFilter(v as RecFilter)}>
              <SelectTrigger className="w-[100px] sm:w-[120px] bg-card border-border/50 h-9 sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="OVER">OVER</SelectItem>
                <SelectItem value="UNDER">UNDER</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => <PredictionCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <Card className="bg-card/60 border-neon-red/30">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-neon-red mx-auto mb-3" />
              <p className="font-semibold text-neon-red mb-1">Failed to load predictions</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={fetchPredictions} className="gap-2">
                <RefreshCw className="w-4 h-4" />Try Again
              </Button>
            </CardContent>
          </Card>
        ) : totalCount === 0 ? (
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No predictions match your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">

            {/* Count + refresh */}
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {totalCount} prediction{totalCount !== 1 ? "s" : ""}
              </p>
              <Button variant="ghost" size="sm" onClick={fetchPredictions} className="gap-1.5 text-muted-foreground px-2">
                <RefreshCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            {/* Grouped predictions */}
            {grouped.map((group) => (
              <div key={group.date} className="space-y-2">

                {/* Date header */}
                <div className="flex items-center gap-2 pt-2">
                  <Calendar className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] text-muted-foreground/50">
                    {group.predictions.length} match{group.predictions.length !== 1 ? "es" : ""}
                  </span>
                </div>

                {/* Cards for this date */}
                <div className="grid gap-2 sm:gap-3">
                  {group.predictions.map((p) => (
                    <PredictionCard key={p.match_id} prediction={p} />
                  ))}
                </div>

              </div>
            ))}

          </div>
        )}
      </main>
    </div>
  );
}
