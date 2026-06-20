/**
 * UserPredictionsView — non-admin user view.
 *
 * Features:
 * - Top Picks section (HIGH confidence only, today's LOCAL matches, sorted by time)
 * - Full predictions list grouped by LOCAL date, sorted by LOCAL time
 * - Search + filter controls
 * - Auto-refresh every 60 seconds
 * - All times shown in the user's local timezone (converted from UTC source)
 *
 * Both Top Picks and All Predictions use the same PredictionCard component
 * so they look identical — the only difference is Top Picks cards have a
 * rank badge (#1, #2, ...).
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, AlertTriangle, LogOut, Calendar, Flame } from "lucide-react";
import type { StoredPredictions, Prediction } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { PredictionCard, PredictionCardSkeleton } from "./prediction-card";
import {
  parseMatchDateTime,
  isTodayLocal,
  localDateKey,
  formatLocalDateLong,
  getTimezoneAbbr,
} from "@/lib/timezone";

type ConfFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type RecFilter = "ALL" | "OVER" | "UNDER";

/** Check if a Date is tomorrow in the user's local timezone. */
function isTomorrowLocal(d: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  );
}

/** Check if a Date is yesterday in the user's local timezone. */
function isYesterdayLocal(d: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * Sort key: prioritizes TODAY first, then TOMORROW, then YESTERDAY, then
 * everything else (past and far-future). Within each priority bucket,
 * sorts by time (earliest first).
 *
 * This ensures users always see today's predictions at the top — not
 * buried under yesterday's finished matches or mixed with next week's.
 */
function relevanceSortKey(p: Prediction): string {
  const d = parseMatchDateTime(p.date, p.time);
  if (!d) return "9_9999-99-99T99:99";

  // Priority prefix: 0 = today, 1 = tomorrow, 2 = yesterday, 3 = everything else
  let prefix = "3";
  if (isTodayLocal(d)) prefix = "0";
  else if (isTomorrowLocal(d)) prefix = "1";
  else if (isYesterdayLocal(d)) prefix = "2";

  // Within each bucket, sort by time (ISO string = chronological)
  return `${prefix}_${d.toISOString()}`;
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

  // Top picks: HIGH confidence, today's LOCAL matches, sorted by local time.
  // "Today" means today in the user's local timezone, not UTC.
  const topPicks = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions
      .filter((p) => {
        if (p.confidence?.toUpperCase() !== "HIGH") return false;
        if (!p.recommendation || p.recommendation.toUpperCase() === "NO_BET") return false;
        const d = parseMatchDateTime(p.date, p.time);
        if (!d) return false;
        if (!isTodayLocal(d)) return false;
        return true;
      })
      .sort((a, b) => relevanceSortKey(a).localeCompare(relevanceSortKey(b)));
  }, [data]);

  // All predictions: filtered, sorted, grouped by LOCAL date.
  const grouped = useMemo(() => {
    if (!data?.predictions) return [];
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

    const sorted = [...filtered].sort((a, b) => relevanceSortKey(a).localeCompare(relevanceSortKey(b)));

    // Group by LOCAL date (not UTC date) so a match at 23:30 UTC (= 02:30 next-day EAT)
    // shows up under tomorrow's group for a Kenyan user.
    const groups: { dateKey: string; label: string; predictions: Prediction[] }[] = [];
    for (const p of sorted) {
      const d = parseMatchDateTime(p.date, p.time);
      const dateKey = d ? localDateKey(d) : "unknown";
      const label = d ? formatLocalDateLong(d) : "Unknown Date";
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateKey === dateKey) {
        lastGroup.predictions.push(p);
      } else {
        groups.push({ dateKey, label, predictions: [p] });
      }
    }
    return groups;
  }, [data, search, confFilter, recFilter]);

  const totalCount = grouped.reduce((sum, g) => sum + g.predictions.length, 0);
  const tzAbbr = getTimezoneAbbr();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">

        {/* Title */}
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Predictions</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Basketball OVER/UNDER predictions backed by historical data analysis
            <span className="ml-2 text-[10px] text-muted-foreground/60">· times shown in your local TZ ({tzAbbr})</span>
          </p>
        </div>

        {/* TOP PICKS — featured section */}
        {!loading && !error && topPicks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-neon-green" />
              <h2 className="text-sm font-bold text-foreground">Today&apos;s Top Picks</h2>
              <span className="text-[10px] text-muted-foreground bg-neon-green/10 px-1.5 py-0.5 rounded-full text-neon-green font-bold">
                {topPicks.length}
              </span>
              <div className="flex-1 h-px bg-border/30" />
            </div>
            <div className="grid gap-2">
              {topPicks.map((p, i) => (
                <PredictionCard key={p.match_id} prediction={p} rank={i + 1} />
              ))}
            </div>
          </div>
        )}

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search team, league, country..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50 h-9 sm:h-10" />
          </div>
          <div className="flex gap-2">
            <Select value={confFilter} onValueChange={(v) => setConfFilter(v as ConfFilter)}>
              <SelectTrigger className="w-[110px] sm:w-[120px] bg-card border-border/50 h-9 sm:h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Levels</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recFilter} onValueChange={(v) => setRecFilter(v as RecFilter)}>
              <SelectTrigger className="w-[100px] sm:w-[120px] bg-card border-border/50 h-9 sm:h-10"><SelectValue /></SelectTrigger>
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
          <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <PredictionCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card className="bg-card/60 border-neon-red/30">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-neon-red mx-auto mb-3" />
              <p className="font-semibold text-neon-red mb-1">Failed to load predictions</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={fetchPredictions} className="gap-2"><RefreshCw className="w-4 h-4" />Try Again</Button>
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
            {/* All predictions label */}
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm text-muted-foreground font-semibold uppercase tracking-wide">All Predictions</p>
              <p className="text-xs text-muted-foreground">{totalCount} total</p>
            </div>

            {/* Grouped predictions (by local date, sorted by relevance) */}
            {grouped.map((group) => {
              // Check if this group is today — add a highlight badge
              const firstPred = group.predictions[0];
              const groupDate = firstPred ? parseMatchDateTime(firstPred.date, firstPred.time) : null;
              const isTodayGroup = groupDate && isTodayLocal(groupDate);
              const isTomorrowGroup = groupDate && isTomorrowLocal(groupDate);

              return (
              <div key={group.dateKey} className="space-y-2">
                {/* Date header — highlighted for today */}
                <div className="flex items-center gap-2 pt-2">
                  <Calendar className={`w-3.5 h-3.5 shrink-0 ${isTodayGroup ? "text-neon-green" : isTomorrowGroup ? "text-neon-cyan" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-bold uppercase tracking-wide ${isTodayGroup ? "text-neon-green" : isTomorrowGroup ? "text-neon-cyan" : "text-foreground"}`}>
                    {group.label}
                  </span>
                  {isTodayGroup && (
                    <span className="text-[9px] font-black text-neon-green bg-neon-green/10 border border-neon-green/30 px-1.5 py-0.5 rounded-full">
                      TODAY
                    </span>
                  )}
                  {isTomorrowGroup && (
                    <span className="text-[9px] font-bold text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/30 px-1.5 py-0.5 rounded-full">
                      TOMORROW
                    </span>
                  )}
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] text-muted-foreground/50">{group.predictions.length} match{group.predictions.length !== 1 ? "es" : ""}</span>
                </div>
                {/* Cards */}
                <div className="grid gap-2 sm:gap-3">
                  {group.predictions.map((p) => <PredictionCard key={p.match_id} prediction={p} />)}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
