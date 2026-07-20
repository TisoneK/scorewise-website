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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, AlertTriangle, LogOut, Calendar, Flame, User, Settings, ChevronDown, CheckCircle2, XCircle, Target, Coins, Activity, Clock, BarChart3, LayoutGrid, Bell, Info, LifeBuoy, Mail } from "lucide-react";
import type { StoredPredictions, Prediction } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { PredictionCard, PredictionCardSkeleton } from "./prediction-card";
import { PublicStatsBanner } from "./public-stats-banner";
import { computeReducedRiskOutcome, computeWinnerOutcome } from "@/lib/result-utils";
import { timeToKickoff } from "@/lib/countdown";
import { useOddsFormat, setOddsFormat, formatOdds, type OddsFormat } from "@/lib/odds-format";
import { getDefaultTab, setDefaultTab, getAlertsEnabled, setAlertsEnabled, getAlertsLead, setAlertsLead, type DefaultTab } from "@/lib/user-prefs";
import { useFavoriteTeams, toggleFavoriteTeam, matchHasFavorite } from "@/lib/favorites";
import { Star } from "lucide-react";
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
  // Active bottom-nav tab.
  const [view, setView] = useState<"predictions" | "results" | "stats" | "menu">("predictions");
  // Match detail overlay — set when a user taps a prediction card.
  const [selected, setSelected] = useState<Prediction | null>(null);
  // Menu tab sub-page.
  const [menuPage, setMenuPage] = useState<"root" | "settings" | "profile" | "notifications" | "support" | "about">("root");
  const oddsFmt = useOddsFormat();
  const [data, setData] = useState<StoredPredictions | null>(null);
  // Settings-driven prefs (mirrored from localStorage).
  const [defaultTab, setDefaultTabState] = useState<DefaultTab>("predictions");
  const [alertsOn, setAlertsOn] = useState(false);
  const [alertsLead, setAlertsLeadState] = useState(30);
  const notifiedRef = useRef<Set<string>>(new Set());

  // On mount: load prefs + apply default tab.
  useEffect(() => {
    setDefaultTabState(getDefaultTab());
    setAlertsOn(getAlertsEnabled());
    setAlertsLeadState(getAlertsLead());
    const t = getDefaultTab();
    if (t !== "predictions") setView(t);
  }, []);

  // Kickoff alerts — while the app is open, fire a browser notification for
  // upcoming HIGH-confidence picks crossing the lead-time threshold.
  useEffect(() => {
    if (!alertsOn || typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    for (const p of data?.predictions ?? []) {
      const high = p.confidence?.toUpperCase() === "HIGH" || p.team_winner_confidence?.toUpperCase() === "HIGH";
      if (!high) continue;
      // When the user has favorites, only alert for matches involving one.
      if (favs.length > 0 && !matchHasFavorite(favs, p.home_team, p.away_team)) continue;
      const d = parseMatchDateTime(p.date, p.time);
      if (!d) continue;
      const mins = (d.getTime() - now) / 60000;
      if (mins > 0 && mins <= alertsLead && !notifiedRef.current.has(p.match_id)) {
        notifiedRef.current.add(p.match_id);
        try { new Notification("ScoreWise — pick starting soon", { body: `${p.home_team || "Home"} vs ${p.away_team || "Away"} tips off in ~${Math.round(mins)}m` }); } catch {}
      }
    }
  }, [data, alertsOn, alertsLead]);

  const enableAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm === "granted") { setAlertsEnabled(true); setAlertsOn(true); }
    else { setAlertsEnabled(false); setAlertsOn(false); }
  };
  const disableAlerts = () => { setAlertsEnabled(false); setAlertsOn(false); };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState<ConfFilter>("ALL");
  const [recFilter, setRecFilter] = useState<RecFilter>("ALL");
  // "Starting soon" time-window filter (borrowed pattern). Values are minutes
  // to kickoff; null = no window filter.
  const [soonFilter, setSoonFilter] = useState<number | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const favs = useFavoriteTeams();
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

  // ── Pick of the Day — the single strongest UPCOMING HIGH-confidence pick
  // across both markets (Linebet "best offer of the day" borrow). Reuses the
  // same strength scoring as Top Picks.
  const pickOfDay = useMemo(() => {
    const preds = data?.predictions ?? [];
    const now = Date.now();
    let best: { p: Prediction; market: "ou" | "win"; strength: number } | null = null;
    for (const p of preds) {
      if (p.result_status === "FINAL" || p.result_status === "POSTPONED" || p.result_status === "CANCELLED") continue;
      const d = parseMatchDateTime(p.date, p.time);
      if (d && d.getTime() < now) continue; // already started — not a fresh call
      if (p.confidence?.toUpperCase() === "HIGH" && (p.recommendation === "OVER" || p.recommendation === "UNDER")) {
        const s = computeOUStrength(p);
        if (!best || s > best.strength) best = { p, market: "ou", strength: s };
      }
      if (p.team_winner_confidence?.toUpperCase() === "HIGH" && (p.team_winner === "HOME_TEAM" || p.team_winner === "AWAY_TEAM")) {
        const s = computeWinStrength(p);
        if (!best || s > best.strength) best = { p, market: "win", strength: s };
      }
    }
    return best;
  }, [data, computeOUStrength, computeWinStrength]);

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
      if (favOnly && !matchHasFavorite(favs, p.home_team, p.away_team)) return false;
      // Starting-soon window: keep only matches that tip off within N minutes
      // from now (and haven't started yet).
      if (soonFilter != null) {
        const d = parseMatchDateTime(p.date, p.time);
        if (!d) return false;
        const minsToTip = (d.getTime() - Date.now()) / 60000;
        if (minsToTip < 0 || minsToTip > soonFilter) return false;
      }
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
  }, [data, search, confFilter, recFilter, soonFilter, favOnly, favs]);

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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-28 space-y-5" style={{ paddingRight: "max(1rem, env(safe-area-inset-right))" }}>

        {/* Title — per active tab */}
        {(() => {
          const t = {
            predictions: ["Predictions", "Basketball predictions for today's matches"],
            results: ["Results", "How our settled picks have landed"],
            stats: ["Stats", "System track record across markets"],
            menu: ["Menu", "Account & preferences"],
          }[view];
          return (
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">{t[0]}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t[1]}
                <span className="ml-2 text-[10px] text-muted-foreground/60">· times in your local TZ ({tzAbbr})</span>
              </p>
            </div>
          );
        })()}

        {view === "results" && <ResultsHistory predictions={data?.predictions ?? []} />}

        {view === "menu" && menuPage === "root" && (
          <div className="space-y-3">
            <button onClick={() => setMenuPage("profile")} className="w-full text-left rounded-xl border border-border/40 bg-card/70 p-4 hover:border-neon-green/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0">
                  <span className="text-lg font-black text-neon-green">{userInitial}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{userName}</p>
                  {userEmail && <p className="text-xs text-muted-foreground truncate">{userEmail}</p>}
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </div>
            </button>
            {/* Menu rows — icon-circle style */}
            <div className="rounded-xl border border-border/40 bg-card/70 divide-y divide-border/20 overflow-hidden">
              <button onClick={() => setMenuPage("profile")} className="w-full flex items-center gap-3 p-4 hover:bg-background/40 transition-colors">
                <span className="w-9 h-9 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-neon-green" /></span>
                <span className="text-sm font-semibold">Personal profile</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 ml-auto" />
              </button>
              <button onClick={() => setMenuPage("notifications")} className="w-full flex items-center gap-3 p-4 hover:bg-background/40 transition-colors">
                <span className="w-9 h-9 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><Bell className="w-4 h-4 text-neon-green" /></span>
                <div className="text-left min-w-0"><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-muted-foreground truncate">Matches you'll be alerted about</p></div>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button onClick={() => setMenuPage("settings")} className="w-full flex items-center gap-3 p-4 hover:bg-background/40 transition-colors">
                <span className="w-9 h-9 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><Settings className="w-4 h-4 text-neon-green" /></span>
                <span className="text-sm font-semibold">Settings</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 ml-auto" />
              </button>
              <button onClick={() => setMenuPage("support")} className="w-full flex items-center gap-3 p-4 hover:bg-background/40 transition-colors">
                <span className="w-9 h-9 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><LifeBuoy className="w-4 h-4 text-neon-green" /></span>
                <div className="text-left min-w-0"><p className="text-sm font-semibold">Help &amp; support</p><p className="text-xs text-muted-foreground truncate">Contact us and we'll help</p></div>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button onClick={() => setMenuPage("about")} className="w-full flex items-center gap-3 p-4 hover:bg-background/40 transition-colors">
                <span className="w-9 h-9 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><Info className="w-4 h-4 text-neon-green" /></span>
                <div className="text-left min-w-0"><p className="text-sm font-semibold">About &amp; legal</p><p className="text-xs text-muted-foreground truncate">How it works, terms, responsible play</p></div>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
            </div>
            <button onClick={() => signOut()} className="w-full flex items-center gap-3 rounded-xl border border-neon-red/30 bg-neon-red/5 p-4 text-neon-red hover:bg-neon-red/10 transition-colors">
              <span className="w-9 h-9 rounded-full bg-neon-red/10 border border-neon-red/20 flex items-center justify-center shrink-0"><LogOut className="w-4 h-4" /></span>
              <span className="text-sm font-semibold">Log out</span>
            </button>
          </div>
        )}

        {view === "menu" && menuPage === "profile" && (
          <UserProfile userInitial={userInitial} onBack={() => setMenuPage("root")} />
        )}

        {view === "menu" && menuPage === "notifications" && (() => {
          const upcoming = (data?.predictions ?? [])
            .filter((p) => matchHasFavorite(favs, p.home_team, p.away_team))
            .filter((p) => { const d = parseMatchDateTime(p.date, p.time); return d && d.getTime() > Date.now(); })
            .sort((a, b) => (parseMatchDateTime(a.date, a.time)?.getTime() ?? 0) - (parseMatchDateTime(b.date, b.time)?.getTime() ?? 0));
          return (
            <div className="space-y-3">
              <button onClick={() => setMenuPage("root")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronDown className="w-5 h-5 rotate-90" /> Menu</button>
              <div className="rounded-xl border border-border/40 bg-card/70 p-3 text-xs text-muted-foreground">
                {alertsOn ? `Kickoff alerts are ON — ${alertsLead} min before a favourite tips off.` : "Kickoff alerts are OFF. Turn them on in Settings → Alerts."}
              </div>
              {favs.length === 0 ? (
                <div className="rounded-xl border border-border/40 bg-card/60 p-8 text-center">
                  <Star className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Favourite a team to get alerts for its matches.</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Tap a match, then star a team.</p>
                </div>
              ) : upcoming.length === 0 ? (
                <div className="rounded-xl border border-border/40 bg-card/60 p-8 text-center"><p className="text-sm text-muted-foreground">No upcoming matches for your favourite teams.</p></div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((p) => (
                    <button key={p.match_id} onClick={() => setSelected(p)} className="w-full text-left rounded-xl border border-border/40 bg-card/70 p-3 hover:border-neon-green/40 transition-colors flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 fill-neon-yellow text-neon-yellow shrink-0" />
                      <p className="text-sm font-bold truncate">{p.home_team} <span className="text-muted-foreground/50">vs</span> {p.away_team}</p>
                      <span className="ml-auto text-[10px] font-bold text-neon-cyan shrink-0">⏱ {timeToKickoff(p.date, p.time)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {view === "menu" && menuPage === "support" && (
          <div className="space-y-4">
            <button onClick={() => setMenuPage("root")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronDown className="w-5 h-5 rotate-90" /> Menu</button>
            <div className="rounded-xl border border-border/40 bg-card/70 p-5 text-center">
              <span className="w-12 h-12 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center mx-auto mb-3"><LifeBuoy className="w-5 h-5 text-neon-green" /></span>
              <p className="text-sm font-bold">Need a hand?</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Questions about a prediction, your account, or the app? Reach the team and we'll help.</p>
              <a href="mailto:support@scorewise-ke.com?subject=ScoreWise%20support" className="inline-flex items-center gap-2 rounded-lg border border-neon-green/40 bg-neon-green/15 text-neon-green px-4 h-10 text-sm font-semibold">
                <Mail className="w-4 h-4" /> Email support
              </a>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center">We usually reply within a day.</p>
          </div>
        )}

        {view === "menu" && menuPage === "about" && (
          <div className="space-y-4">
            <button onClick={() => setMenuPage("root")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronDown className="w-5 h-5 rotate-90" /> Menu</button>
            <div className="rounded-xl border border-border/40 bg-card/70 p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><BasketballIcon className="w-5 h-5 text-neon-green" /></span>
              <div><p className="text-sm font-bold">ScoreWise</p><p className="text-xs text-muted-foreground">Data-driven basketball predictions</p></div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1">How it works</p>
              <div className="rounded-xl border border-border/40 bg-card/70 p-4 text-xs text-muted-foreground leading-relaxed">
                We scrape upcoming matches and their odds, run a statistical model over head-to-head history and recent form, and publish the picks it's most confident in — for both totals (Over/Under) and the moneyline (1X2). Each pick shows the evidence behind it. We don't take bets: you copy the betslip code to your own bookmaker.
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1">Responsible play</p>
              <div className="rounded-xl border border-neon-yellow/25 bg-neon-yellow/5 p-4 text-xs text-muted-foreground leading-relaxed">
                Predictions are informational and never guaranteed. Only stake what you can afford to lose. Betting is 18+. If it stops being fun, take a break.
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/70 divide-y divide-border/20">
              <div className="flex items-center gap-3 p-4"><span className="text-sm">Terms &amp; conditions</span><span className="ml-auto text-xs text-muted-foreground">Informational service</span></div>
              <div className="flex items-center gap-3 p-4"><span className="text-sm">Version</span><span className="ml-auto text-xs font-mono text-muted-foreground">ScoreWise web</span></div>
            </div>
          </div>
        )}

        {view === "menu" && menuPage === "settings" && (
          <div className="space-y-5">
            <button onClick={() => setMenuPage("root")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className="w-5 h-5 rotate-90" /> Menu
            </button>

            {/* Alerts */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1 flex items-center gap-1.5"><Bell className="w-3 h-3" /> Alerts</p>
              <div className="rounded-xl border border-border/40 bg-card/70 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Kickoff alerts</p>
                    <p className="text-xs text-muted-foreground">Browser notification before a top pick tips off (while the app is open).</p>
                  </div>
                  <button onClick={() => (alertsOn ? disableAlerts() : enableAlerts())}
                    className={`ml-auto shrink-0 w-12 h-7 rounded-full border transition-colors relative ${alertsOn ? "bg-neon-green/20 border-neon-green/40" : "bg-background border-border/50"}`}
                    aria-label="Toggle kickoff alerts" aria-pressed={alertsOn}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${alertsOn ? "left-6 bg-neon-green" : "left-0.5 bg-muted-foreground"}`} />
                  </button>
                </div>
                {alertsOn && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Lead time</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[15, 30, 60].map((m) => (
                        <button key={m} onClick={() => { setAlertsLead(m); setAlertsLeadState(m); }}
                          className={`rounded-lg border p-2 text-xs font-bold transition-colors ${alertsLead === m ? "border-neon-green/50 bg-neon-green/10 text-neon-green" : "border-border/50 bg-background/40 text-foreground"}`}>
                          {m} min
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Display */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1 flex items-center gap-1.5"><Settings className="w-3 h-3" /> Display</p>
              <div className="rounded-xl border border-border/40 bg-card/70 divide-y divide-border/20">
                <div className="p-4">
                  <p className="text-sm font-semibold mb-1">Odds format</p>
                  <p className="text-xs text-muted-foreground mb-3">How odds are shown across the app.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ v: "decimal", ex: "1.85" }, { v: "fractional", ex: "17/20" }, { v: "american", ex: "+185" }] as const).map((o) => (
                      <button key={o.v} onClick={() => setOddsFormat(o.v as OddsFormat)}
                        className={`rounded-lg border p-2.5 text-center transition-colors ${oddsFmt === o.v ? "border-neon-green/50 bg-neon-green/10" : "border-border/50 bg-background/40 hover:border-border"}`}>
                        <p className={`text-xs font-bold capitalize ${oddsFmt === o.v ? "text-neon-green" : "text-foreground"}`}>{o.v}</p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{o.ex}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold mb-1">Opening tab</p>
                  <p className="text-xs text-muted-foreground mb-3">Which tab to show when you open the app.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ v: "predictions", l: "Picks" }, { v: "results", l: "Results" }, { v: "stats", l: "Stats" }] as const).map((o) => (
                      <button key={o.v} onClick={() => { setDefaultTab(o.v as DefaultTab); setDefaultTabState(o.v as DefaultTab); }}
                        className={`rounded-lg border p-2.5 text-xs font-bold transition-colors ${defaultTab === o.v ? "border-neon-green/50 bg-neon-green/10 text-neon-green" : "border-border/50 bg-background/40 text-foreground"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* About */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1">About</p>
              <div className="rounded-xl border border-border/40 bg-card/70 divide-y divide-border/20">
                <div className="flex items-center gap-3 p-4">
                  <span className="w-9 h-9 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0"><BasketballIcon className="w-4 h-4 text-neon-green" /></span>
                  <div><p className="text-sm font-semibold">ScoreWise</p><p className="text-xs text-muted-foreground">Basketball predictions</p></div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground">Predictions are informational only. Always gamble responsibly — 18+.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "stats" && (<>
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
          // Combined current streak (trailing run of same outcome) for the
          // header — mirrors the O/U + 1X2 cards.
          let sType: "W" | "L" | null = null, sLen = 0;
          for (let i = form.length - 1; i >= 0; i--) {
            if (sType === null) { sType = form[i]; sLen = 1; }
            else if (form[i] === sType) sLen++;
            else break;
          }

          return (
            <div className="rounded-xl border border-border/40 bg-card/70 overflow-hidden">
              {/* Slim header — matches the O/U + 1X2 cards */}
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <Activity className="w-3.5 h-3.5 text-foreground shrink-0" />
                <h3 className="text-[11px] font-bold truncate">Overall Record</h3>
                <span className="text-[8px] font-bold text-foreground/60 shrink-0">● LIVE</span>
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  {sType === "W" && <Flame className="w-3 h-3 text-neon-green" />}
                  <span className={`text-[10px] font-black font-mono ${sType === "W" ? "text-neon-green" : sType === "L" ? "text-neon-red" : "text-muted-foreground"}`}>{sType ?? "—"}{sLen || ""}</span>
                </span>
                <span className="text-[9px] text-muted-foreground/50 shrink-0 hidden sm:inline">{wins + losses} resolved</span>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-4 divide-x divide-border/30 border-t border-border/20">
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
        </>)}

        {view === "predictions" && (<>
        {/* Pick of the Day hero — the single strongest upcoming pick */}
        {pickOfDay && (() => {
          const { p, market } = pickOfDay;
          const rec = p.recommendation?.toUpperCase();
          const line = rec === "OVER" ? (p.reduced_over_total ?? p.bookmaker_line) : rec === "UNDER" ? (p.reduced_under_total ?? p.bookmaker_line) : null;
          const ouOdds = rec === "OVER" ? (p.reduced_over_odds ?? p.over_odds) : rec === "UNDER" ? (p.reduced_under_odds ?? p.under_odds) : null;
          const w = p.team_winner?.toUpperCase();
          const winnerName = w === "HOME_TEAM" ? p.home_team : p.away_team;
          const winnerOdds = w === "HOME_TEAM" ? p.home_odds : p.away_odds;
          const pickLabel = market === "ou" ? `${rec} ${line ?? ""}` : winnerName;
          const pickOdds = market === "ou" ? ouOdds : winnerOdds;
          const cd = timeToKickoff(p.date, p.time);
          const streak = p.winning_streak_data;
          const reason = market === "ou"
            ? (p.matches_above != null && p.matches_below != null ? `${p.matches_above}▲ / ${p.matches_below}▼ vs line` : "HIGH confidence")
            : (streak ? `H2H ${streak.home_team_h2h_wins ?? 0}–${streak.away_team_h2h_wins ?? 0}` : "HIGH confidence");
          return (
            <button
              onClick={() => setSelected(p)}
              className="w-full text-left rounded-xl overflow-hidden border border-neon-green/40 bg-gradient-to-br from-neon-green/10 to-card/40 hover:from-neon-green/15 transition-colors"
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-neon-green/15">
                <Flame className="w-3.5 h-3.5 text-neon-green" />
                <span className="text-[10px] font-black text-neon-green uppercase tracking-[0.15em]">Pick of the Day</span>
                {cd && <span className="ml-auto text-[10px] text-neon-cyan font-bold">⏱ {cd}</span>}
              </div>
              <div className="p-3">
                <p className="text-sm font-black leading-tight break-words">{p.home_team || "Home"} <span className="text-muted-foreground/50">vs</span> {p.away_team || "Away"}</p>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className={`text-lg font-black ${market === "ou" ? "text-neon-green" : "text-neon-cyan"}`}>{pickLabel}</span>
                  {pickOdds != null && <span className="text-sm font-mono text-muted-foreground">@ {formatOdds(Number(pickOdds), oddsFmt)}</span>}
                  <span className="ml-auto text-[10px] font-semibold text-muted-foreground">{reason}</span>
                </div>
              </div>
            </button>
          );
        })()}

        {/* Starting-soon time-window chips — jump to matches about to tip off */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {favs.length > 0 && (
            <button
              onClick={() => setFavOnly((v) => !v)}
              className={`shrink-0 text-xs font-semibold px-3 h-8 rounded-full border transition-colors flex items-center gap-1 ${
                favOnly ? "bg-neon-yellow/15 border-neon-yellow/40 text-neon-yellow" : "bg-card border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className={`w-3 h-3 ${favOnly ? "fill-neon-yellow" : ""}`} /> Favorites
            </button>
          )}
          {([
            { label: "All", mins: null },
            { label: "30 min", mins: 30 },
            { label: "1 hour", mins: 60 },
            { label: "3 hours", mins: 180 },
            { label: "6 hours", mins: 360 },
          ] as const).map((opt) => {
            const active = soonFilter === opt.mins;
            return (
              <button
                key={opt.label}
                onClick={() => setSoonFilter(opt.mins)}
                className={`shrink-0 text-xs font-semibold px-3 h-8 rounded-full border transition-colors ${
                  active
                    ? "bg-neon-green/15 border-neon-green/40 text-neon-green"
                    : "bg-card border-border/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.mins === null ? opt.label : `⏱ ${opt.label}`}
              </button>
            );
          })}
        </div>

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
                                  <PredictionCard key={p.match_id} prediction={p} rank={i + 1} onSelect={setSelected} />
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
                                  <PredictionCard key={p.match_id} prediction={p} rank={i + 1} onSelect={setSelected} />
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
                        {group.predictions.map((p) => <PredictionCard key={p.match_id} prediction={p} onSelect={setSelected} />)}
                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })}
          </div>
        )}
        </>)}
      </main>

      {/* Bottom tab navigation (Linebet borrow #2) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/40 bg-card/95 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {([
            { v: "predictions", label: "Picks", Icon: Flame },
            { v: "results", label: "Results", Icon: Clock },
            { v: "stats", label: "Stats", Icon: BarChart3 },
            { v: "menu", label: "Menu", Icon: LayoutGrid },
          ] as const).map(({ v, label, Icon }) => {
            const active = view === v;
            return (
              <button
                key={v}
                onClick={() => { setView(v); setMenuPage("root"); }}
                className={`flex flex-col items-center justify-center gap-0.5 h-14 transition-colors ${active ? "text-neon-green" : "text-muted-foreground hover:text-foreground"}`}
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`w-5 h-5 ${active ? "" : "opacity-80"}`} />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Match detail overlay (Linebet borrow #5) */}
      {selected && <MatchDetail prediction={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/**
 * MatchDetail — full-screen detail for a tapped prediction (Linebet borrow #5).
 *
 * Teams + kickoff countdown, the pick with its effective line/odds, the bet
 * code to copy, the head-to-head evidence behind the call, and the result if
 * settled. Reuses data already on the prediction — nothing new fetched.
 */
function MatchDetail({ prediction: p, onClose }: { prediction: Prediction; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const oddsFmt = useOddsFormat();
  const favs = useFavoriteTeams();
  const rec = p.recommendation?.toUpperCase();
  const isOU = rec === "OVER" || rec === "UNDER";
  const line = rec === "OVER" ? (p.reduced_over_total ?? p.bookmaker_line)
    : rec === "UNDER" ? (p.reduced_under_total ?? p.bookmaker_line) : p.bookmaker_line;
  const ouOdds = rec === "OVER" ? (p.reduced_over_odds ?? p.over_odds) : rec === "UNDER" ? (p.reduced_under_odds ?? p.under_odds) : null;
  const w = p.team_winner?.toUpperCase();
  const winnerName = w === "HOME_TEAM" ? p.home_team : w === "AWAY_TEAM" ? p.away_team : null;
  const winnerOdds = w === "HOME_TEAM" ? p.home_odds : w === "AWAY_TEAM" ? p.away_odds : null;
  const md = parseMatchDateTime(p.date, p.time);
  const countdown = timeToKickoff(p.date, p.time);
  const settled = p.result_status === "FINAL" && p.home_score != null && p.away_score != null;
  const streak = p.winning_streak_data;

  const copyCode = async () => {
    if (!p.bet_code) return;
    try { await navigator.clipboard.writeText(p.bet_code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="text-center">
      <p className="text-base font-black font-mono">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 h-12 border-b border-border/40 bg-card/95 backdrop-blur-md">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" aria-label="Back">
          <ChevronDown className="w-5 h-5 rotate-90" /> Back
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground/70 truncate">{[p.league, p.country].filter(Boolean).join(" · ")}</span>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        {/* Teams + countdown */}
        <div className="rounded-xl border border-border/40 bg-card/70 p-4 text-center">
          <p className="text-lg font-black leading-tight break-words">{p.home_team || "Home"} <span className="text-muted-foreground/50">vs</span> {p.away_team || "Away"}</p>
          {/* Favorite either team */}
          <div className="flex items-center justify-center gap-2 mt-2">
            {[p.home_team, p.away_team].filter(Boolean).map((team) => {
              const on = matchHasFavorite(favs, team, null);
              return (
                <button key={team} onClick={() => toggleFavoriteTeam(team)}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 h-7 rounded-full border transition-colors ${on ? "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                  <Star className={`w-3 h-3 ${on ? "fill-neon-yellow" : ""}`} /> {team}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {md ? md.toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
          </p>
          {countdown && !settled && (
            <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan">⏱ {countdown}</span>
          )}
          {settled && (
            <p className="mt-2 text-2xl font-black font-mono">{p.home_score} <span className="text-muted-foreground/50">–</span> {p.away_score}</p>
          )}
        </div>

        {/* The pick(s) */}
        {isOU && line != null && (
          <div className="rounded-xl border border-neon-green/30 bg-neon-green/5 p-4">
            <p className="text-[10px] font-bold text-neon-green uppercase tracking-wider mb-1">Totals pick</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black">{rec} {line}</span>
              {ouOdds != null && <span className="text-sm font-mono text-muted-foreground">@ {formatOdds(Number(ouOdds), oddsFmt)}</span>}
              {p.recommendation_confidence && <span className="ml-auto text-[10px] font-bold text-neon-green">{p.recommendation_confidence} confidence</span>}
            </div>
          </div>
        )}
        {winnerName && (
          <div className="rounded-xl border border-neon-cyan/30 bg-neon-cyan/5 p-4">
            <p className="text-[10px] font-bold text-neon-cyan uppercase tracking-wider mb-1">Moneyline pick</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black">{winnerName}</span>
              {winnerOdds != null && <span className="text-sm font-mono text-muted-foreground">@ {formatOdds(Number(winnerOdds), oddsFmt)}</span>}
              {p.team_winner_confidence && <span className="ml-auto text-[10px] font-bold text-neon-cyan">{p.team_winner_confidence} confidence</span>}
            </div>
          </div>
        )}

        {/* Bet code */}
        {p.bet_code && (
          <button onClick={copyCode} className="w-full rounded-xl border border-border/40 bg-card/70 p-4 flex items-center gap-3 hover:border-neon-green/40 transition-colors">
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Betslip code — tap to copy</p>
              <p className="text-lg font-black font-mono text-neon-green">{p.bet_code}</p>
            </div>
            <span className={`ml-auto text-xs font-semibold ${copied ? "text-neon-green" : "text-muted-foreground"}`}>{copied ? "Copied ✓" : "Copy"}</span>
          </button>
        )}

        {/* Evidence behind the call */}
        <div className="rounded-xl border border-border/40 bg-card/70 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/20 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-foreground" /><h3 className="text-[11px] font-bold">The evidence</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/30">
            <Stat label="Avg rate" value={p.average_rate != null ? Number(p.average_rate).toFixed(1) : "—"} />
            <Stat label="Above line" value={p.matches_above ?? "—"} />
            <Stat label="Below line" value={p.matches_below ?? "—"} />
          </div>
          {streak && (
            <div className="grid grid-cols-2 divide-x divide-border/30 border-t border-border/20">
              <div className="p-3 text-center">
                <p className="text-sm font-bold font-mono">{streak.home_team_h2h_wins ?? 0} – {streak.away_team_h2h_wins ?? 0}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">H2H wins (of {streak.total_h2h_matches ?? 0})</p>
              </div>
              <div className="p-3 text-center">
                <p className="text-sm font-bold font-mono">{streak.home_team_recent_wins ?? 0} – {streak.away_team_recent_wins ?? 0}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Recent form</p>
              </div>
            </div>
          )}
          {Array.isArray(p.h2h_totals) && p.h2h_totals.length > 0 && (
            <div className="px-3 py-2.5 border-t border-border/20">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Recent head-to-head totals</p>
              <div className="flex flex-wrap gap-1.5">
                {p.h2h_totals.slice(0, 12).map((t, i) => (
                  <span key={i} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${line != null && t > line ? "border-neon-green/30 text-neon-green" : "border-neon-red/30 text-neon-red"}`}>{t}</span>
                ))}
              </div>
              {line != null && <p className="text-[9px] text-muted-foreground/60 mt-1.5">green = over {line}, red = under</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ResultsHistory — settled-picks feed (Linebet "Bet history" borrow).
 *
 * Each settled market outcome is its own row (a match with both an O/U and a
 * 1X2 pick contributes two), with a WIN/LOSS/PUSH status dot, the pick, its
 * line + odds, and the result — topped by a "Statistics for the period"
 * summary (picks · hit rate · ROI). Reuses the same grading + profit math as
 * the rest of the app (computeReducedRiskOutcome / computeWinnerOutcome).
 */
function ResultsHistory({ predictions }: { predictions: Prediction[] }) {
  const [period, setPeriod] = useState<7 | 30 | 0>(30); // days; 0 = all
  const oddsFmt = useOddsFormat();

  const entries = useMemo(() => {
    const cutoff = period === 0 ? 0 : Date.now() - period * 86400_000;
    type Row = {
      key: string; date: Date | null; market: "O/U" | "1X2";
      home: string; away: string; pick: string; line: number | null;
      odds: number | null; outcome: "WIN" | "LOSS" | "PUSH";
    };
    const rows: Row[] = [];
    for (const p of predictions) {
      if (p.result_status !== "FINAL") continue;
      const d = parseMatchDateTime(p.date, p.time);
      if (period !== 0 && (!d || d.getTime() < cutoff)) continue;
      const home = p.home_team || "Home", away = p.away_team || "Away";

      // O/U market
      const rec = p.recommendation?.toUpperCase();
      if (rec === "OVER" || rec === "UNDER") {
        const ou = computeReducedRiskOutcome(p);
        if (ou === "WIN" || ou === "LOSS" || ou === "PUSH") {
          const line = rec === "OVER" ? (p.reduced_over_total ?? p.bookmaker_line) : (p.reduced_under_total ?? p.bookmaker_line);
          const odds = rec === "OVER" ? (p.reduced_over_odds ?? p.over_odds) : (p.reduced_under_odds ?? p.under_odds);
          rows.push({ key: p.match_id + "-ou", date: d, market: "O/U", home, away, pick: `${rec} ${line ?? "?"}`, line: line ?? null, odds: odds ?? null, outcome: ou });
        }
      }
      // 1X2 market
      const w = p.team_winner?.toUpperCase();
      if (w === "HOME_TEAM" || w === "AWAY_TEAM") {
        const win = computeWinnerOutcome(p); // 1X2 has no PUSH
        if (win === "WIN" || win === "LOSS") {
          const odds = w === "HOME_TEAM" ? p.home_odds : p.away_odds;
          rows.push({ key: p.match_id + "-win", date: d, market: "1X2", home, away, pick: w === "HOME_TEAM" ? home : away, line: null, odds: odds ?? null, outcome: win });
        }
      }
    }
    rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    return rows;
  }, [predictions, period]);

  const stats = useMemo(() => {
    let wins = 0, losses = 0, pushes = 0, profit = 0;
    for (const r of entries) {
      if (r.outcome === "PUSH") { pushes++; continue; }
      if (r.outcome === "WIN") { wins++; profit += r.odds && r.odds > 1 ? r.odds - 1 : 0; }
      else { losses++; profit -= 1; }
    }
    const settled = wins + losses;
    return { total: entries.length, wins, losses, pushes, hitRate: settled ? (wins / settled) * 100 : 0, roi: settled ? (profit / settled) * 100 : 0, profit };
  }, [entries]);

  const hitTone = stats.hitRate >= 55 ? "text-neon-green" : stats.hitRate >= 45 ? "text-neon-yellow" : "text-neon-red";
  const roiTone = stats.roi >= 0 ? "text-neon-green" : "text-neon-red";

  return (
    <div className="space-y-3">
      {/* Period chips */}
      <div className="flex items-center gap-1.5">
        {([{ l: "7 days", v: 7 }, { l: "30 days", v: 30 }, { l: "All", v: 0 }] as const).map((o) => (
          <button key={o.v} onClick={() => setPeriod(o.v)}
            className={`text-xs font-semibold px-3 h-8 rounded-full border transition-colors ${period === o.v ? "bg-neon-green/15 border-neon-green/40 text-neon-green" : "bg-card border-border/50 text-muted-foreground hover:text-foreground"}`}>
            {o.l}
          </button>
        ))}
      </div>

      {/* Statistics for the period */}
      <div className="rounded-xl border border-border/40 bg-card/70 overflow-hidden">
        <div className="px-3 py-1.5 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-foreground shrink-0" />
          <h3 className="text-[11px] font-bold">Statistics for the period</h3>
          <span className="ml-auto text-[9px] text-muted-foreground/50">{stats.total} pick{stats.total !== 1 ? "s" : ""}</span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border/30 border-t border-border/20">
          <div className="p-2.5 text-center"><div className="flex items-center justify-center mb-0.5"><CheckCircle2 className="w-3 h-3 text-neon-green" /></div><p className="text-base font-black font-mono text-neon-green">{stats.wins}</p><p className="text-[8px] text-muted-foreground uppercase tracking-wider">Wins</p></div>
          <div className="p-2.5 text-center"><div className="flex items-center justify-center mb-0.5"><XCircle className="w-3 h-3 text-neon-red" /></div><p className="text-base font-black font-mono text-neon-red">{stats.losses}</p><p className="text-[8px] text-muted-foreground uppercase tracking-wider">Losses</p></div>
          <div className="p-2.5 text-center"><div className="flex items-center justify-center mb-0.5"><Target className="w-3 h-3 text-muted-foreground" /></div><p className={`text-base font-black font-mono ${hitTone}`}>{stats.hitRate.toFixed(1)}%</p><p className="text-[8px] text-muted-foreground uppercase tracking-wider">Hit Rate</p></div>
          <div className="p-2.5 text-center"><div className="flex items-center justify-center mb-0.5"><Coins className="w-3 h-3 text-muted-foreground" /></div><p className={`text-base font-black font-mono ${roiTone}`}>{stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}%</p><p className="text-[8px] text-muted-foreground uppercase tracking-wider">ROI</p></div>
        </div>
      </div>

      {/* Settled rows */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">No settled picks in this period yet.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Results appear here once matches finish.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((r) => {
            const won = r.outcome === "WIN", push = r.outcome === "PUSH";
            return (
              <div key={r.key} className="rounded-xl border border-border/40 bg-card/70 overflow-hidden flex">
                {/* status rail */}
                <div className={`w-1 shrink-0 ${won ? "bg-neon-green" : push ? "bg-neon-yellow" : "bg-neon-red"}`} />
                <div className="flex-1 p-3">
                  <div className="flex items-center gap-2">
                    {won ? <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" /> : push ? <Activity className="w-4 h-4 text-neon-yellow shrink-0" /> : <XCircle className="w-4 h-4 text-neon-red shrink-0" />}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground shrink-0">{r.market}</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{r.date ? r.date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—"}</span>
                  </div>
                  <p className="text-sm font-bold mt-1.5 leading-tight break-words">{r.home} <span className="text-muted-foreground/50 mx-0.5">vs</span> {r.away}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className={`font-bold font-mono ${won ? "text-neon-green" : push ? "text-neon-yellow" : "text-neon-red"}`}>{r.pick}</span>
                    {r.odds != null && <span className="text-[10px] font-mono text-muted-foreground">@{formatOdds(Number(r.odds), oddsFmt)}</span>}
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${won ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : push ? "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow" : "border-neon-red/40 bg-neon-red/10 text-neon-red"}`}>
                      {won ? "WON ✓" : push ? "PUSH" : "LOST ✗"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * UserProfile — Linebet-style "Personal profile" (Menu → Personal profile).
 * Account block (id, email, password change, registration date) + editable
 * Personal information (name, phone, country, city). Loads from and saves to
 * /api/user/profile; password changes go through /api/user/password.
 */
interface ProfileData {
  id: string; email: string; role: string;
  name: string; phone: string; country: string; city: string;
  createdAt: string; passwordManaged: boolean;
}
function UserProfile({ userInitial, onBack }: { userInitial: string; onBack: () => void }) {
  const [p, setP] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", country: "", city: "" });
  const [saving, setSaving] = useState(false);
  // Change-password (asks for confirmation now)
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (!res.ok) return;
      const d = (await res.json()) as ProfileData;
      setP(d);
      setForm({ name: d.name, phone: d.phone, country: d.country, city: d.city });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: setState runs after the first await
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setEditing(false); load(); }
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    setPwMsg(null);
    if (pwNew.length < 8) { setPwMsg({ ok: false, text: "New password must be at least 8 characters." }); return; }
    if (pwNew !== pwConfirm) { setPwMsg({ ok: false, text: "New passwords don't match." }); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/user/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pwCur, newPassword: pwNew }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPwMsg({ ok: true, text: "Password changed." });
      setPwCur(""); setPwNew(""); setPwConfirm(""); setPwOpen(false);
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally { setPwSaving(false); }
  };

  const Row = ({ label, sub, value, action }: { label: string; sub?: string; value?: React.ReactNode; action?: React.ReactNode }) => (
    <div className="flex items-start gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
      <div className="ml-auto text-right shrink-0">{action ?? <span className="text-sm text-muted-foreground">{value}</span>}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronDown className="w-5 h-5 rotate-90" /> Menu
      </button>

      {loading || !p ? (
        <div className="rounded-xl border border-border/40 bg-card/70 p-8 text-center text-sm text-muted-foreground">Loading profile…</div>
      ) : (
        <>
          {/* Header card */}
          <div className="rounded-xl border border-border/40 bg-card/70 p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-neon-green/10 border border-neon-green/20 flex items-center justify-center shrink-0">
              <span className="text-xl font-black text-neon-green">{userInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{p.name || "Your profile"}</p>
              <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-neon-green/30 text-neon-green bg-neon-green/5">{p.role}</span>
            </div>
          </div>

          {/* Account */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1">Account</p>
            <div className="rounded-xl border border-border/40 bg-card/70 divide-y divide-border/20">
              <Row label="Account number" value={<span className="font-mono text-xs">id: {p.id.slice(0, 12)}</span>} />
              <Row label="Email" sub={p.email} />
              <Row label="Password" sub={p.passwordManaged ? "Managed by Google" : undefined}
                action={p.passwordManaged ? <span className="text-xs text-muted-foreground">Google</span> :
                  <button onClick={() => { setPwOpen((v) => !v); setPwMsg(null); }} className="text-sm font-semibold text-neon-green">Change</button>} />
              {pwOpen && !p.passwordManaged && (
                <div className="p-4 space-y-2.5 bg-background/30">
                  <Input type="password" placeholder="Current password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} className="bg-background border-border/50 h-9" autoComplete="current-password" />
                  <Input type="password" placeholder="New password (min 8 chars)" value={pwNew} onChange={(e) => setPwNew(e.target.value)} className="bg-background border-border/50 h-9" autoComplete="new-password" />
                  <Input type="password" placeholder="Confirm new password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} className="bg-background border-border/50 h-9" autoComplete="new-password" />
                  {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-neon-green" : "text-neon-red"}`}>{pwMsg.text}</p>}
                  <Button onClick={changePassword} disabled={pwSaving || !pwCur || pwNew.length < 8 || !pwConfirm} className="w-full h-9 bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25">
                    {pwSaving ? "Saving…" : "Update password"}
                  </Button>
                </div>
              )}
              <Row label="Registration date" value={new Date(p.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })} />
            </div>
          </div>

          {/* Personal information */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Personal information</p>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="text-xs font-semibold text-neon-green">Edit</button>
              ) : (
                <button onClick={() => { setEditing(false); setForm({ name: p.name, phone: p.phone, country: p.country, city: p.city }); }} className="text-xs text-muted-foreground">Cancel</button>
              )}
            </div>
            <div className="rounded-xl border border-border/40 bg-card/70 divide-y divide-border/20">
              {([
                { k: "name", label: "Name" },
                { k: "phone", label: "Phone number" },
                { k: "country", label: "Country" },
                { k: "city", label: "City" },
              ] as const).map(({ k, label }) => (
                <div key={k} className="flex items-center gap-3 p-4">
                  <p className="text-sm font-semibold shrink-0">{label}</p>
                  {editing ? (
                    <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={label} className="ml-auto max-w-[55%] bg-background border-border/50 h-9 text-right" />
                  ) : (
                    <span className="ml-auto text-sm text-muted-foreground truncate">{p[k] || "—"}</span>
                  )}
                </div>
              ))}
              {editing && (
                <div className="p-4">
                  <Button onClick={save} disabled={saving || !form.name.trim()} className="w-full h-9 bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25">
                    {saving ? "Saving…" : "Save details"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
