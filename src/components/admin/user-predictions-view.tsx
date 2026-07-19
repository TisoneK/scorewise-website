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
import { signOut, useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, AlertTriangle, LogOut, Calendar, Flame, User, Settings, ChevronDown, CheckCircle2, XCircle, Target, Coins, Activity } from "lucide-react";
import type { StoredPredictions, Prediction } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { PredictionCard, PredictionCardSkeleton } from "./prediction-card";
import { PublicStatsBanner } from "./public-stats-banner";
import { computeReducedRiskOutcome, computeWinnerOutcome } from "@/lib/result-utils";
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
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string })?.name || "User";
  const userEmail = (session?.user as { email?: string })?.email || "";
  const userInitial = userName.charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState<StoredPredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState<ConfFilter>("ALL");
  const [recFilter, setRecFilter] = useState<RecFilter>("ALL");
  // Expanded date groups — dates the user has manually expanded.
  // Today + tomorrow are expanded by DEFAULT. All other dates start collapsed.
  // User can click any date header to toggle expand/collapse.
  // We track the OVERRIDES from default behavior, not the collapsed state directly,
  // so that adding new dates (e.g. when a new day arrives) get the correct default.
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  // Mounted state — prevents SSR hydration mismatch from time-based functions
  // (computeEffectiveStatus, timeToKickoff, isTodayLocal all use new Date())
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /** Toggle a date group between expanded/collapsed. */
  const toggleDateCollapse = (dateKey: string, isToday: boolean, isTomorrow: boolean) => {
    const isDefaultExpanded = isToday || isTomorrow;
    if (isDefaultExpanded) {
      // Default is expanded → toggling collapses it
      setCollapsedDates((prev) => {
        const next = new Set(prev);
        if (next.has(dateKey)) next.delete(dateKey); // un-collapse → back to default expanded
        else next.add(dateKey); // collapse
        return next;
      });
    } else {
      // Default is collapsed → toggling expands it
      setExpandedDates((prev) => {
        const next = new Set(prev);
        if (next.has(dateKey)) next.delete(dateKey); // un-expand → back to default collapsed
        else next.add(dateKey); // expand
        return next;
      });
    }
  };

  /** Check if a date group should be collapsed.
   *  Default: today + tomorrow are expanded, all others collapsed.
   *  User can override by clicking the date header. */
  const isDateCollapsed = (dateKey: string, isToday: boolean, isTomorrow: boolean): boolean => {
    const isDefaultExpanded = isToday || isTomorrow;
    if (isDefaultExpanded) {
      // Default expanded — collapsed only if user explicitly collapsed it
      return collapsedDates.has(dateKey);
    } else {
      // Default collapsed — expanded only if user explicitly expanded it
      return !expandedDates.has(dateKey);
    }
  };

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

  // ── Strength scoring (reusable for per-date top picks) ──────────────
  /** Compute O/U pick strength score for a prediction. */
  const computeOUStrength = useCallback((p: Prediction): number => {
    const avgRate = Math.abs(p.average_rate || 0);
    const above = p.matches_above || 0;
    const below = p.matches_below || 0;
    const total = above + below;
    const isOver = p.recommendation?.toUpperCase() === "OVER";
    const isUnder = p.recommendation?.toUpperCase() === "UNDER";
    const rateStrength = Math.min(avgRate / 20, 1.0);
    const agreeCount = isOver ? above : isUnder ? below : 0;
    const consistency = total > 0 ? agreeCount / total : 0;
    const testAligned = isOver
      ? Math.min((p.increment_test || 0) / 5, 1.0)
      : isUnder
        ? Math.min((p.decrement_test || 0) / 5, 1.0)
        : 0;
    const winnerBonus = p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION" ? 0.15 : 0;
    return (rateStrength * 0.40) + (consistency * 0.35) + (testAligned * 0.20) + winnerBonus;
  }, []);

  /** Compute 1X2 pick strength score for a prediction. */
  const computeWinStrength = useCallback((p: Prediction): number => {
    const w = p.team_winner?.toUpperCase();
    const isHome = w === "HOME_TEAM";
    const isAway = w === "AWAY_TEAM";
    const odds = isHome ? p.home_odds : isAway ? p.away_odds : null;
    const oddsStrength = odds && odds > 0 ? Math.min(1.5 / Number(odds), 1.0) : 0;
    const h2h = p.winning_streak_data;
    let h2hStrength = 0;
    if (h2h && h2h.total_h2h_matches > 0) {
      const pickedWins = isHome ? h2h.home_team_h2h_wins : h2h.away_team_h2h_wins;
      h2hStrength = pickedWins / h2h.total_h2h_matches;
    }
    const homeRecent = h2h?.home_team_recent_wins || 0;
    const awayRecent = h2h?.away_team_recent_wins || 0;
    const totalRecent = homeRecent + awayRecent;
    const recentStrength = totalRecent > 0 ? (isHome ? homeRecent : awayRecent) / totalRecent : 0;
    const streak = isHome ? (h2h?.home_team_winning_streak || 0) : (h2h?.away_team_winning_streak || 0);
    const streakBonus = Math.min(streak / 5, 1.0) * 0.15;
    const ouBonus = p.confidence?.toUpperCase() === "HIGH" &&
                    (p.recommendation === "OVER" || p.recommendation === "UNDER") ? 0.10 : 0;
    return (oddsStrength * 0.40) + (h2hStrength * 0.30) + (recentStrength * 0.15) + streakBonus + ouBonus;
  }, []);

  /** Get top picks (O/U + 1X2) for a specific set of predictions.
   *  - For today/tomorrow (excludeFinal=true): only upcoming/live matches
   *  - For past dates (excludeFinal=false): include all matches (for tracking) */
  const getTopPicksForGroup = useCallback((predictions: Prediction[], excludeFinal: boolean) => {
    const ou = predictions
      .filter((p) => {
        if (p.confidence?.toUpperCase() !== "HIGH") return false;
        const r = p.recommendation?.toUpperCase();
        if (r !== "OVER" && r !== "UNDER") return false;
        if (excludeFinal && (p.result_status === "FINAL" || p.result_status === "POSTPONED" || p.result_status === "CANCELLED")) return false;
        return true;
      })
      .map((p) => ({ ...p, _strength: computeOUStrength(p) }))
      .sort((a, b) => (b._strength || 0) - (a._strength || 0))
      .slice(0, 3);

    const win = predictions
      .filter((p) => {
        if (p.team_winner_confidence?.toUpperCase() !== "HIGH") return false;
        const w = p.team_winner?.toUpperCase();
        if (w !== "HOME_TEAM" && w !== "AWAY_TEAM") return false;
        if (excludeFinal && (p.result_status === "FINAL" || p.result_status === "POSTPONED" || p.result_status === "CANCELLED")) return false;
        return true;
      })
      .map((p) => ({ ...p, _strength: computeWinStrength(p) }))
      .sort((a, b) => (b._strength || 0) - (a._strength || 0))
      .slice(0, 3);

    return { ou, win };
  }, [computeOUStrength, computeWinStrength]);

  // ── Today's top picks — used for per-date rendering (computed inline per group)
  // The getTopPicksForGroup function above is called per date group in the render.

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

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-neon-green/30 border-t-neon-green animate-spin mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Loading predictions...</p>
        </div>
      </div>
    );
  }

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
          {/* User menu dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 rounded-full hover:bg-card/80 transition-colors p-1 sm:px-2"
              aria-label="User menu"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-neon-green">{userInitial}</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <>
                {/* Click-away overlay */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />

                {/* Menu */}
                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-card border border-border/40 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* User info header */}
                  <div className="px-3 py-2.5 border-b border-border/30 bg-background/40">
                    <p className="text-xs font-bold truncate">{userName}</p>
                    {userEmail && <p className="text-[10px] text-muted-foreground truncate">{userEmail}</p>}
                  </div>

                  {/* Menu items */}
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-neon-red hover:bg-neon-red/10 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5" style={{ paddingRight: "max(1rem, env(safe-area-inset-right))" }}>

        {/* Title */}
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Predictions</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Basketball predictions for today's matches
            <span className="ml-2 text-[10px] text-muted-foreground/60">· times shown in your local TZ ({tzAbbr})</span>
          </p>
        </div>

        {/* SYSTEM TRACK RECORD — split into two SEPARATE cards per user request:
            1) Over/Under track record (totals algorithm)
            2) Win track record (winner algorithm — moneyline / 1X2)
            These are intentionally NOT combined so users can see how each
            market is performing independently. */}
        <PublicStatsBanner algorithm="totals" />
        <PublicStatsBanner algorithm="winner" />

        {/* ════════ PERFORMANCE SUMMARY + RECENT FORM ════════ */}
        {/* Compact stats bar with W/L/Hit Rate/ROI + form dots */}
        {(() => {
          if (!data?.predictions) return null;
          let wins = 0, losses = 0, profit = 0, staked = 0;
          const form: ("W" | "L")[] = [];
          const settled = data.predictions
            .filter((p) => {
              const ou = computeReducedRiskOutcome(p);
              const win = computeWinnerOutcome(p);
              return ou !== "MISSING" || win !== "MISSING";
            })
            .sort((a, b) => {
              const da = parseMatchDateTime(a.date, a.time);
              const db = parseMatchDateTime(b.date, b.time);
              if (da && db) return da.getTime() - db.getTime();
              return 0;
            });
          // Count each settled bet SEPARATELY — a single match usually has
          // BOTH an O/U bet AND a 1X2 bet, each with its own outcome.
          // Collapsing them with "any-win-is-a-win" logic (the old code)
          // silently dropped the LOSS whenever one side won, so users saw
          // "1 lost" when actually two bets had settled (1 lost + 1 won).
          // PUSH outcomes (total === line, bet refunded) are skipped — no
          // profit/loss, no form dot — matching the existing UI which only
          // renders W (green) / L (red) dots.
          for (const p of settled) {
            const ou = computeReducedRiskOutcome(p);
            const win = computeWinnerOutcome(p);

            // O/U outcome (one bet)
            if (ou === "WIN" || ou === "LOSS") {
              staked++;
              if (ou === "WIN") {
                wins++;
                const r = p.recommendation?.toUpperCase();
                const od = r === "OVER" ? (p.reduced_over_odds ?? p.over_odds) : r === "UNDER" ? (p.reduced_under_odds ?? p.under_odds) : null;
                profit += od ? Number(od) - 1 : 0;
                form.push("W");
              } else {
                losses++;
                profit -= 1;
                form.push("L");
              }
            }

            // Winner (1X2) outcome (another bet — counted independently)
            if (win === "WIN" || win === "LOSS") {
              staked++;
              if (win === "WIN") {
                wins++;
                const w = p.team_winner?.toUpperCase();
                const wod = w === "HOME_TEAM" ? p.home_odds : w === "AWAY_TEAM" ? p.away_odds : null;
                profit += wod ? Number(wod) - 1 : 0;
                form.push("W");
              } else {
                losses++;
                profit -= 1;
                form.push("L");
              }
            }
          }
          if (wins + losses === 0) return null;
          const hitRate = ((wins / (wins + losses)) * 100).toFixed(1);
          const roi = staked > 0 ? ((profit / staked) * 100).toFixed(1) : "0.0";
          const last15 = form.slice(-15);
          const hitTone = Number(hitRate) >= 55 ? "text-neon-green" : Number(hitRate) >= 45 ? "text-neon-yellow" : "text-neon-red";
          const roiTone = Number(roi) >= 0 ? "text-neon-green" : "text-neon-red";

          return (
            <div className="rounded-xl border-2 border-border bg-card/90 overflow-hidden">
              {/* Stats row */}
              <div className="grid grid-cols-4 divide-x divide-border/30">
                <div className="p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle2 className="w-3 h-3 text-neon-green" />
                  </div>
                  <p className="text-base font-black font-mono text-neon-green">{wins}</p>
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Wins</p>
                </div>
                <div className="p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <XCircle className="w-3 h-3 text-neon-red" />
                  </div>
                  <p className="text-base font-black font-mono text-neon-red">{losses}</p>
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Losses</p>
                </div>
                <div className="p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Target className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className={`text-base font-black font-mono ${hitTone}`}>{hitRate}%</p>
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Hit Rate</p>
                </div>
                <div className="p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Coins className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className={`text-base font-black font-mono ${roiTone}`}>{Number(roi) >= 0 ? "+" : ""}{roi}%</p>
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wider">ROI</p>
                </div>
              </div>
              {/* Form dots */}
              {last15.length > 0 && (
                <div className="border-t border-border/30 px-3 py-2 flex items-center gap-2 bg-background/30">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0">Form</span>
                  <span className="text-[8px] text-muted-foreground/50 shrink-0">L15</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {last15.map((r, i) => (
                      <span key={i} className={`w-2.5 h-2.5 rounded-sm ${r === "W" ? "bg-neon-green" : "bg-neon-red"}`} />
                    ))}
                  </div>
                  <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                    {last15.filter((r) => r === "W").length}W / {last15.filter((r) => r === "L").length}L
                  </span>
                </div>
              )}
            </div>
          );
        })()}

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
          <div className="space-y-6">
            {/* All predictions label */}
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm text-muted-foreground font-semibold uppercase tracking-wide">All Predictions</p>
              <p className="text-xs text-muted-foreground">{totalCount} total</p>
            </div>

            {/* Grouped predictions (by local date, sorted by relevance) */}
            {grouped.map((group) => {
              // Check if this group is today/tomorrow — for default expand/collapse
              const firstPred = group.predictions[0];
              const groupDate = firstPred ? parseMatchDateTime(firstPred.date, firstPred.time) : null;
              const isTodayGroup = !!(groupDate && isTodayLocal(groupDate));
              const isTomorrowGroup = !!(groupDate && isTomorrowLocal(groupDate));
              const collapsed = isDateCollapsed(group.dateKey, isTodayGroup, isTomorrowGroup);

              return (
              <div key={group.dateKey} className="space-y-3">
                {/* Date header — clickable to expand/collapse, same bg card as prediction cards */}
                <button
                  type="button"
                  onClick={() => toggleDateCollapse(group.dateKey, isTodayGroup, isTomorrowGroup)}
                  className="flex items-center gap-2 w-full text-left rounded-lg border-2 bg-card/90 px-3 py-2.5 transition-all hover:border-neon-green/40"
                >
                  <Calendar className={`w-4 h-4 shrink-0 ${isTodayGroup ? "text-neon-green" : isTomorrowGroup ? "text-neon-cyan" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-bold uppercase tracking-wide ${isTodayGroup ? "text-neon-green" : isTomorrowGroup ? "text-neon-cyan" : "text-foreground"}`}>
                    {group.label}
                  </span>
                  {isTodayGroup && (
                    <span className="text-[9px] font-black text-neon-green bg-neon-green/20 border border-neon-green/40 px-1.5 py-0.5 rounded-full">
                      TODAY
                    </span>
                  )}
                  {isTomorrowGroup && (
                    <span className="text-[9px] font-bold text-neon-cyan bg-neon-cyan/20 border border-neon-cyan/40 px-1.5 py-0.5 rounded-full">
                      TOMORROW
                    </span>
                  )}
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] text-muted-foreground/70 font-medium">{group.predictions.length} match{group.predictions.length !== 1 ? "es" : ""}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${collapsed ? "" : "rotate-180"} ${isTodayGroup ? "text-neon-green" : isTomorrowGroup ? "text-neon-cyan" : "text-muted-foreground"}`} />
                </button>
                {/* Cards — hidden when collapsed */}
                {!collapsed && (() => {
                  // Compute top picks for this date group
                  // For today/tomorrow: exclude FINAL (only upcoming/live)
                  // For past dates: include all (for tracking historical performance)
                  const excludeFinal = isTodayGroup || isTomorrowGroup;
                  const groupTopPicks = getTopPicksForGroup(group.predictions, excludeFinal);
                  const hasTopPicks = groupTopPicks.ou.length > 0 || groupTopPicks.win.length > 0;
                  const totalTopPicks = groupTopPicks.ou.length + groupTopPicks.win.length;

                  return (
                    <div className="pt-1 space-y-3">
                      {/* ── Per-date Top Picks sub-section ── */}
                      {hasTopPicks && (
                        <div className="rounded-lg border-2 border-neon-green/30 bg-card/60 overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-green/5 border-b border-neon-green/15">
                            <Flame className="w-3 h-3 text-neon-green shrink-0" />
                            <span className="text-[10px] font-bold text-neon-green uppercase tracking-wider">Top Picks</span>
                            <span className="text-[9px] text-neon-green/80 bg-neon-green/10 px-1.5 py-0.5 rounded-full font-bold border border-neon-green/20 shrink-0">
                              {totalTopPicks}
                            </span>
                          </div>
                          {/* O/U picks */}
                          {groupTopPicks.ou.length > 0 && (
                            <div className="border-b border-border/20">
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-neon-green/5">
                                <div className="w-0.5 h-2.5 rounded-full bg-neon-green shrink-0" />
                                <span className="text-[9px] font-bold text-neon-green/80 uppercase tracking-wider">O/U</span>
                              </div>
                              <div className="p-2 space-y-2">
                                {groupTopPicks.ou.map((p, i) => (
                                  <PredictionCard key={p.match_id} prediction={p} rank={i + 1} />
                                ))}
                              </div>
                            </div>
                          )}
                          {/* 1X2 picks */}
                          {groupTopPicks.win.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-neon-cyan/5">
                                <div className="w-0.5 h-2.5 rounded-full bg-neon-cyan shrink-0" />
                                <span className="text-[9px] font-bold text-neon-cyan/80 uppercase tracking-wider">1X2</span>
                              </div>
                              <div className="p-2 space-y-2">
                                {groupTopPicks.win.map((p, i) => (
                                  <PredictionCard key={p.match_id} prediction={p} rank={i + 1} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── All matches ── */}
                      {hasTopPicks && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">All Matches</span>
                          <div className="flex-1 h-px bg-border/30" />
                          <span className="text-[10px] text-muted-foreground/50">{group.predictions.length} total</span>
                        </div>
                      )}
                      <div className="grid gap-2 sm:gap-3">
                        {group.predictions.map((p) => <PredictionCard key={p.match_id} prediction={p} />)}
                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
