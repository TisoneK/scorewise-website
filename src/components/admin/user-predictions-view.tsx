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
import { Search, RefreshCw, AlertTriangle, LogOut, Calendar, Flame, User, Settings, ChevronDown } from "lucide-react";
import type { StoredPredictions, Prediction } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { PredictionCard, PredictionCardSkeleton } from "./prediction-card";
import { PublicStatsBanner } from "./public-stats-banner";
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

  // ── Top Over/Under Picks: 3 BEST OVER/UNDER picks for today ───────────
  // Strict criteria:
  //   1. HIGH confidence
  //   2. recommendation is OVER or UNDER (excludes NO_BET and Win picks)
  //   3. Today's match (user's local timezone)
  //   4. Not already FINAL/POSTPONED/CANCELLED
  //   5. Ranked by composite strength score (rate signal + consistency + test alignment)
  //   6. Limited to at most 3 picks
  const topOUPicks = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions
      .filter((p) => {
        if (p.confidence?.toUpperCase() !== "HIGH") return false;
        const r = p.recommendation?.toUpperCase();
        if (r !== "OVER" && r !== "UNDER") return false;
        const d = parseMatchDateTime(p.date, p.time);
        if (!d || !isTodayLocal(d)) return false;
        if (p.result_status === "FINAL" || p.result_status === "POSTPONED" || p.result_status === "CANCELLED") return false;
        return true;
      })
      .map((p) => {
        const avgRate = Math.abs(p.average_rate || 0);
        const above = p.matches_above || 0;
        const below = p.matches_below || 0;
        const total = above + below;
        const isOver = p.recommendation?.toUpperCase() === "OVER";
        const isUnder = p.recommendation?.toUpperCase() === "UNDER";

        // 1. Rate signal strength: |avg_rate| / 20 (cap 1.0)
        const rateStrength = Math.min(avgRate / 20, 1.0);

        // 2. Consistency ratio: how many historical matches agree with the rec
        const agreeCount = isOver ? above : isUnder ? below : 0;
        const consistency = total > 0 ? agreeCount / total : 0;

        // 3. Test alignment: OVER wants high increment_test, UNDER wants high decrement_test
        const testAligned = isOver
          ? Math.min((p.increment_test || 0) / 5, 1.0)
          : isUnder
            ? Math.min((p.decrement_test || 0) / 5, 1.0)
            : 0;

        // 4. Winner bonus: extra signal if engine also picked a winner
        const winnerBonus = p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION" ? 0.15 : 0;

        const strength = (rateStrength * 0.40) + (consistency * 0.35) + (testAligned * 0.20) + winnerBonus;
        return { ...p, _strength: strength };
      })
      .sort((a, b) => (b._strength || 0) - (a._strength || 0))
      .slice(0, 3);
  }, [data]);

  // ── Top Win Picks: 3 BEST WIN (moneyline) picks for today ─────────────
  // Strict criteria:
  //   1. team_winner_confidence is HIGH (separate from over/under confidence)
  //   2. team_winner is HOME_TEAM or AWAY_TEAM (excludes NO_WINNER_PREDICTION)
  //   3. Today's match (user's local timezone)
  //   4. Not already FINAL/POSTPONED/CANCELLED
  //   5. Ranked by composite strength score (odds value + h2h dominance + streak)
  //   6. Limited to at most 3 picks
  const topWinPicks = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions
      .filter((p) => {
        if (p.team_winner_confidence?.toUpperCase() !== "HIGH") return false;
        const w = p.team_winner?.toUpperCase();
        if (w !== "HOME_TEAM" && w !== "AWAY_TEAM") return false;
        const d = parseMatchDateTime(p.date, p.time);
        if (!d || !isTodayLocal(d)) return false;
        if (p.result_status === "FINAL" || p.result_status === "POSTPONED" || p.result_status === "CANCELLED") return false;
        return true;
      })
      .map((p) => {
        const w = p.team_winner?.toUpperCase();
        const isHome = w === "HOME_TEAM";
        const isAway = w === "AWAY_TEAM";

        // 1. Odds value (0-1): lower decimal odds = stronger pick (more likely).
        //    Odds of 1.20 → very strong (0.83). Odds of 3.00 → weak (0.33).
        const odds = isHome ? p.home_odds : isAway ? p.away_odds : null;
        const oddsStrength = odds && odds > 0 ? Math.min(1.5 / Number(odds), 1.0) : 0;

        // 2. H2H dominance (0-1): how often the picked team wins head-to-head
        //    Uses winning_streak_data.h2h_totals_wins / total_h2h_matches
        const h2h = p.winning_streak_data;
        let h2hStrength = 0;
        if (h2h && h2h.total_h2h_matches > 0) {
          const pickedWins = isHome ? h2h.home_team_h2h_wins : h2h.away_team_h2h_wins;
          h2hStrength = pickedWins / h2h.total_h2h_matches;
        }

        // 3. Recent form (0-1): how many of the picked team's recent matches they won
        const homeRecent = h2h?.home_team_recent_wins || 0;
        const awayRecent = h2h?.away_team_recent_wins || 0;
        const totalRecent = homeRecent + awayRecent;
        const recentStrength = totalRecent > 0
          ? (isHome ? homeRecent : awayRecent) / totalRecent
          : 0;

        // 4. Winning streak bonus (0-0.15): extra points if picked team is on a hot streak
        const streak = isHome ? (h2h?.home_team_winning_streak || 0) : (h2h?.away_team_winning_streak || 0);
        const streakBonus = Math.min(streak / 5, 1.0) * 0.15;

        // 5. Over/Under alignment bonus (0-0.10): if the O/U recommendation also
        //    points the same direction (high-scoring → favours stronger team),
        //    that's a small extra signal of match control
        const ouBonus = p.confidence?.toUpperCase() === "HIGH" &&
                        (p.recommendation === "OVER" || p.recommendation === "UNDER")
          ? 0.10
          : 0;

        // Weighted: 40% odds + 30% h2h + 15% recent + 15% streak + 10% ou alignment
        const strength = (oddsStrength * 0.40) + (h2hStrength * 0.30) + (recentStrength * 0.15) + streakBonus + ouBonus;
        return { ...p, _strength: strength };
      })
      .sort((a, b) => (b._strength || 0) - (a._strength || 0))
      .slice(0, 3);
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

        {/* ════════ TOP PICKS (unified card) ════════ */}
        {/* Single card with two internal sections:
            - Over/Under (totals) — green accent
            - Win (moneyline) — cyan accent
            Each sub-section only renders when it has picks.
            If NEITHER has picks, show a single "No top picks today" message.
            No algorithm jargon, no "HIGH confidence" exposure. */}
        {!loading && !error && (topOUPicks.length > 0 || topWinPicks.length > 0) && (
          <section className="rounded-xl border border-border/40 bg-gradient-to-br from-card/60 to-card/30 overflow-hidden">
            {/* Header — single unified title */}
            <header className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-background/30">
              <div className="w-6 h-6 rounded-md bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0">
                <Flame className="w-3.5 h-3.5 text-neon-green" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Top Picks</h2>
              <span className="text-[9px] text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded-full font-bold border border-neon-green/20 shrink-0">
                {topOUPicks.length + topWinPicks.length} PICK{(topOUPicks.length + topWinPicks.length) !== 1 ? "S" : ""}
              </span>
            </header>

            {/* ── Sub-section: Over/Under (only if picks exist) ── */}
            {topOUPicks.length > 0 && (
              <div className="border-b border-border/20">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-green/5">
                  <div className="w-1 h-3 rounded-full bg-neon-green shrink-0" />
                  <span className="text-[10px] font-bold text-neon-green uppercase tracking-wider">Over / Under</span>
                  <span className="text-[9px] text-muted-foreground/50 ml-auto">{topOUPicks.length} pick{topOUPicks.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="p-3 space-y-2">
                  {topOUPicks.map((p, i) => (
                    <PredictionCard key={p.match_id} prediction={p} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Sub-section: Win (only if picks exist) ── */}
            {topWinPicks.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-cyan/5">
                  <div className="w-1 h-3 rounded-full bg-neon-cyan shrink-0" />
                  <span className="text-[10px] font-bold text-neon-cyan uppercase tracking-wider">1X2</span>
                  <span className="text-[9px] text-muted-foreground/50 ml-auto">{topWinPicks.length} pick{topWinPicks.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="p-3 space-y-2">
                  {topWinPicks.map((p, i) => (
                    <PredictionCard key={p.match_id} prediction={p} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <footer className="px-3 py-1.5 border-t border-border/20 bg-background/30 flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Today's best</span>
              <span className="text-[9px] text-muted-foreground/40">Browse all below</span>
            </footer>
          </section>
        )}

        {/* ── No top picks today (only when BOTH sections are empty) ── */}
        {!loading && !error && topOUPicks.length === 0 && topWinPicks.length === 0 && data?.predictions && data.predictions.length > 0 && (
          <Card className="bg-card/40 border-border/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">No top picks today.</p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Browse all predictions below ↓</p>
            </CardContent>
          </Card>
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
                {!collapsed && (
                  <div className="grid gap-2 sm:gap-3 pt-1">
                    {group.predictions.map((p) => <PredictionCard key={p.match_id} prediction={p} />)}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
