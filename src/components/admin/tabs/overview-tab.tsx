/**
 * OverviewTab — betting tracker dashboard.
 *
 * Shows betting performance metrics:
 *   Row 1: KPI cards (Wins, Losses, Hit Rate, ROI, Current Streak, Total Bets)
 *   Row 2: Split track records (O/U + 1X2) + Today's Top Picks summary
 *   Row 3: Recent settled bets table (WON/LOST outcomes)
 *
 * Infrastructure (scraper/engine/pipeline) moved to Services tab.
 */

"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Coins,
  Flame,
  Snowflake,
  Activity,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trophy,
  ChevronRight,
} from "lucide-react";
import type { Prediction } from "@/lib/types";
import { computeOverUnderOutcome, computeReducedRiskOutcome, computeWinnerOutcome, computeEffectiveStatus } from "@/lib/result-utils";
import { parseMatchDateTime, formatLocalDateLong } from "@/lib/timezone";
import { ConfidenceBadge, RecommendationBadge } from "../badges";

export interface OverviewTabProps {
  preds: Prediction[];
  totalPreds: number;
  successCount: number;
  failCount: number;
  successRate: number;
  highConf: number;
  overRecs: number;
  underRecs: number;
  loadingPred: boolean;
  fetchAllPredictions: () => void;
  // Kept for backwards compat but not used in the betting tracker view
  serviceStatus: unknown;
  feedEvents: unknown[];
  feedLoading: boolean;
  setDrawerPrediction: (p: Prediction | null) => void;
}

export function OverviewTab({
  preds,
  totalPreds,
  loadingPred,
  fetchAllPredictions,
  setDrawerPrediction,
}: OverviewTabProps) {
  const [formCount, setFormCount] = useState(15);

  // ── Build settled bets array with outcomes (sorted chronologically) ──
  const settledBets = useMemo(() => {
    return preds
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
      })
      .map((p) => {
        const ou = computeReducedRiskOutcome(p);
        const win = computeWinnerOutcome(p);
        // O/U outcome
        const ouResult = ou === "WIN" ? "W" as const : ou === "LOSS" ? "L" as const : null;
        const winResult = win === "WIN" ? "W" as const : win === "LOSS" ? "L" as const : null;
        // O/U profit
        let ouProfit = 0;
        if (ou === "WIN") {
          const r = p.recommendation?.toUpperCase();
          const od = r === "OVER" ? (p.reduced_over_odds ?? p.over_odds) : r === "UNDER" ? (p.reduced_under_odds ?? p.under_odds) : null;
          ouProfit = od ? Number(od) - 1 : 0;
        } else if (ou === "LOSS") {
          ouProfit = -1;
        }
        // 1X2 profit
        let winProfit = 0;
        if (win === "WIN") {
          const w = p.team_winner?.toUpperCase();
          const od = w === "HOME_TEAM" ? p.home_odds : w === "AWAY_TEAM" ? p.away_odds : null;
          winProfit = od ? Number(od) - 1 : 0;
        } else if (win === "LOSS") {
          winProfit = -1;
        }
        return {
          match: p,
          ou: ouResult,
          win: winResult,
          ouProfit,
          winProfit,
          ouPush: ou === "PUSH",
        };
      });
  }, [preds]);

  // ── Stats computed from the LAST N settled bets (based on formCount) ──
  const stats = useMemo(() => {
    // Get last N bets that have an O/U outcome for O/U stats
    const ouSettled = settledBets.filter((b) => b.ou !== null);
    const ouRecent = ouSettled.slice(-formCount);
    const ouWins = ouRecent.filter((b) => b.ou === "W").length;
    const ouLosses = ouRecent.filter((b) => b.ou === "L").length;
    const ouPushes = ouRecent.filter((b) => b.ouPush).length;
    const ouStaked = ouWins + ouLosses;
    const ouProfit = ouRecent.reduce((sum, b) => sum + b.ouProfit, 0);
    const ouPending = preds.filter((p) => {
      const r = p.recommendation?.toUpperCase();
      return (r === "OVER" || r === "UNDER") && computeReducedRiskOutcome(p) === "MISSING";
    }).length;

    // 1X2 stats from last N bets
    const winSettled = settledBets.filter((b) => b.win !== null);
    const winRecent = winSettled.slice(-formCount);
    const winWins = winRecent.filter((b) => b.win === "W").length;
    const winLosses = winRecent.filter((b) => b.win === "L").length;
    const winStaked = winWins + winLosses;
    const winProfit = winRecent.reduce((sum, b) => sum + b.winProfit, 0);
    const winPending = preds.filter((p) => {
      const w = p.team_winner?.toUpperCase();
      return (w === "HOME_TEAM" || w === "AWAY_TEAM") && computeWinnerOutcome(p) === "MISSING";
    }).length;

    // Totals (across ALL settled, not just last N)
    const totalWins = ouSettled.filter((b) => b.ou === "W").length + winSettled.filter((b) => b.win === "W").length;
    const totalLosses = ouSettled.filter((b) => b.ou === "L").length + winSettled.filter((b) => b.win === "L").length;
    const totalResolved = totalWins + totalLosses + ouSettled.filter((b) => b.ouPush).length;
    const totalStaked = ouSettled.length + winSettled.length;
    const totalProfit = ouSettled.reduce((s, b) => s + b.ouProfit, 0) + winSettled.reduce((s, b) => s + b.winProfit, 0);
    const hitRate = totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

    // Streak (across all settled, not just last N)
    let streakType: "W" | "L" | null = null;
    let streakLen = 0;
    for (let i = settledBets.length - 1; i >= 0; i--) {
      const b = settledBets[i];
      const outcomes: ("W" | "L")[] = [];
      if (b.ou) outcomes.push(b.ou);
      if (b.win) outcomes.push(b.win);
      if (outcomes.length === 0) continue;
      const last = outcomes[outcomes.length - 1];
      if (streakType === null) { streakType = last; streakLen = 1; }
      else if (last === streakType) streakLen++;
      else break;
    }

    // Form arrays (full, sliced at render)
    const ouForm = ouSettled.map((b) => b.ou!);
    const winForm = winSettled.map((b) => b.win!);

    // Recent N arrays with match info for tooltips
    const ouRecentWithMatches = ouRecent;
    const winRecentWithMatches = winRecent;

    return {
      ouWins, ouLosses, ouPushes, ouPending, ouProfit, ouStaked,
      winWins, winLosses, winPending, winProfit, winStaked,
      totalWins, totalLosses, totalResolved, totalStaked, totalProfit,
      hitRate, roi, streakType, streakLen, ouForm, winForm,
      ouRecentWithMatches, winRecentWithMatches,
    };
  }, [settledBets, formCount, preds]);

  // Recent settled bets (last 20)
  const recentSettled = preds
    .filter((p) => {
      const ou = computeReducedRiskOutcome(p);
      const win = computeWinnerOutcome(p);
      return ou !== "MISSING" || win !== "MISSING";
    })
    .sort((a, b) => {
      const da = parseMatchDateTime(a.date, a.time);
      const db = parseMatchDateTime(b.date, b.time);
      if (da && db) return db.getTime() - da.getTime();
      return 0;
    })
    .slice(0, 20);

  const hitTone = stats.hitRate >= 55 ? "text-neon-green" : stats.hitRate >= 45 ? "text-neon-yellow" : "text-neon-red";
  const roiTone = stats.roi >= 0 ? "text-neon-green" : "text-neon-red";

  return (
    <>
      {/* Row 1: Betting KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Wins</span>
            </div>
            <p className="text-xl font-black font-mono text-neon-green">{stats.totalWins}</p>
            <p className="text-[9px] text-muted-foreground/60">O/U: {stats.ouWins} · 1X2: {stats.winWins}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <XCircle className="w-3.5 h-3.5 text-neon-red" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Losses</span>
            </div>
            <p className="text-xl font-black font-mono text-neon-red">{stats.totalLosses}</p>
            <p className="text-[9px] text-muted-foreground/60">O/U: {stats.ouLosses} · 1X2: {stats.winLosses}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Hit Rate</span>
            </div>
            <p className={`text-xl font-black font-mono ${hitTone}`}>{stats.hitRate.toFixed(1)}%</p>
            <p className="text-[9px] text-muted-foreground/60">{stats.totalWins}W / {stats.totalLosses}L</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Coins className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">ROI</span>
            </div>
            <p className={`text-xl font-black font-mono ${roiTone}`}>{stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}%</p>
            <p className="text-[9px] text-muted-foreground/60">{stats.totalProfit >= 0 ? "+" : ""}{stats.totalProfit.toFixed(2)}u on {stats.totalStaked}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {stats.streakType === "W" ? <Flame className="w-3.5 h-3.5 text-neon-green" /> : stats.streakType === "L" ? <Snowflake className="w-3.5 h-3.5 text-neon-red" /> : <Activity className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Streak</span>
            </div>
            <p className={`text-xl font-black font-mono ${stats.streakType === "W" ? "text-neon-green" : stats.streakType === "L" ? "text-neon-red" : "text-muted-foreground"}`}>
              {stats.streakType ?? "—"}{stats.streakLen || ""}
            </p>
            <p className="text-[9px] text-muted-foreground/60">{stats.streakType === "W" ? "Hot" : stats.streakType === "L" ? "Cold" : "No bets"}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-neon-cyan" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Settled</span>
            </div>
            <p className="text-xl font-black font-mono text-foreground">{stats.totalResolved}</p>
            <p className="text-[9px] text-muted-foreground/60">of {totalPreds} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Split performance — O/U vs 1X2 (each with its own recent form) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* O/U Performance */}
        <Card className="bg-card/60 border-neon-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-neon-green" />
              Over / Under
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-lg font-black font-mono text-neon-green">{stats.ouWins}</p>
                <p className="text-[9px] text-muted-foreground">Wins</p>
              </div>
              <div>
                <p className="text-lg font-black font-mono text-neon-red">{stats.ouLosses}</p>
                <p className="text-[9px] text-muted-foreground">Losses</p>
              </div>
              <div>
                <p className="text-lg font-black font-mono text-neon-yellow">{stats.ouPushes}</p>
                <p className="text-[9px] text-muted-foreground">Pushes</p>
              </div>
              <div>
                <p className={`text-lg font-black font-mono ${stats.ouStaked > 0 ? (stats.ouProfit >= 0 ? "text-neon-green" : "text-neon-red") : "text-muted-foreground"}`}>
                  {stats.ouStaked > 0 ? `${stats.ouProfit >= 0 ? "+" : ""}${stats.ouProfit.toFixed(2)}u` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">Profit</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Hit Rate: <span className="font-bold text-foreground">{stats.ouWins + stats.ouLosses > 0 ? ((stats.ouWins / (stats.ouWins + stats.ouLosses)) * 100).toFixed(1) : "0.0"}%</span></span>
              <span>ROI: <span className={`font-bold ${stats.ouStaked > 0 ? (stats.ouProfit >= 0 ? "text-neon-green" : "text-neon-red") : "text-muted-foreground"}`}>{stats.ouStaked > 0 ? `${((stats.ouProfit / stats.ouStaked) * 100).toFixed(1)}%` : "—"}</span></span>
              <span>Pending: {stats.ouPending}</span>
            </div>
            {/* O/U Recent form dots — customizable count + hover tooltips */}
            {stats.ouRecentWithMatches.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-border/20">
                <select
                  value={formCount}
                  onChange={(e) => setFormCount(Number(e.target.value))}
                  className="bg-background border border-border/30 rounded text-[9px] h-5 px-1 text-muted-foreground"
                >
                  <option value={5}>L5</option>
                  <option value={10}>L10</option>
                  <option value={15}>L15</option>
                  <option value={20}>L20</option>
                  <option value={30}>L30</option>
                </select>
                <div className="flex items-center gap-1 flex-wrap">
                  {stats.ouRecentWithMatches.map((b, i) => {
                    const p = b.match;
                    const total = (p.home_score != null && p.away_score != null) ? Number(p.home_score) + Number(p.away_score) : null;
                    const line = p.recommendation === "OVER" ? (p.reduced_over_total ?? p.bookmaker_line) : (p.reduced_under_total ?? p.bookmaker_line);
                    return (
                      <span
                        key={i}
                        className={`w-2.5 h-2.5 rounded-sm cursor-help ${b.ou === "W" ? "bg-neon-green" : "bg-neon-red"}`}
                        title={`${p.home_team || "Home"} vs ${p.away_team || "Away"}\n${p.recommendation} ${line ?? "?"} @ ${(p.recommendation === "OVER" ? p.reduced_over_odds ?? p.over_odds : p.reduced_under_odds ?? p.under_odds) ?? "?"}\nScore: ${p.home_score ?? "?"}-${p.away_score ?? "?"} (Total: ${total ?? "?"})\nResult: ${b.ou === "W" ? "WON" : "LOST"} (${b.ouProfit >= 0 ? "+" : ""}${b.ouProfit.toFixed(2)}u)\nDate: ${p.date || "?"}`}
                      />
                    );
                  })}
                </div>
                <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                  {stats.ouWins}W / {stats.ouLosses}L
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 1X2 Performance */}
        <Card className="bg-card/60 border-neon-cyan/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-neon-cyan" />
              1X2 (Moneyline)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-black font-mono text-neon-green">{stats.winWins}</p>
                <p className="text-[9px] text-muted-foreground">Wins</p>
              </div>
              <div>
                <p className="text-lg font-black font-mono text-neon-red">{stats.winLosses}</p>
                <p className="text-[9px] text-muted-foreground">Losses</p>
              </div>
              <div>
                <p className={`text-lg font-black font-mono ${stats.winStaked > 0 ? (stats.winProfit >= 0 ? "text-neon-green" : "text-neon-red") : "text-muted-foreground"}`}>
                  {stats.winStaked > 0 ? `${stats.winProfit >= 0 ? "+" : ""}${stats.winProfit.toFixed(2)}u` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">Profit</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Hit Rate: <span className="font-bold text-foreground">{stats.winWins + stats.winLosses > 0 ? ((stats.winWins / (stats.winWins + stats.winLosses)) * 100).toFixed(1) : "0.0"}%</span></span>
              <span>ROI: <span className={`font-bold ${stats.winStaked > 0 ? (stats.winProfit >= 0 ? "text-neon-green" : "text-neon-red") : "text-muted-foreground"}`}>{stats.winStaked > 0 ? `${((stats.winProfit / stats.winStaked) * 100).toFixed(1)}%` : "—"}</span></span>
              <span>Pending: {stats.winPending}</span>
            </div>
            {/* 1X2 Recent form dots — same formCount + hover tooltips */}
            {stats.winRecentWithMatches.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-border/20">
                <span className="text-[9px] text-muted-foreground/50 shrink-0">L{formCount}</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {stats.winRecentWithMatches.map((b, i) => {
                    const p = b.match;
                    const winnerName = p.team_winner === "HOME_TEAM" ? p.home_team : p.team_winner === "AWAY_TEAM" ? p.away_team : "?";
                    const winnerOdds = p.team_winner === "HOME_TEAM" ? p.home_odds : p.team_winner === "AWAY_TEAM" ? p.away_odds : null;
                    return (
                      <span
                        key={i}
                        className={`w-2.5 h-2.5 rounded-sm cursor-help ${b.win === "W" ? "bg-neon-green" : "bg-neon-red"}`}
                        title={`${p.home_team || "Home"} vs ${p.away_team || "Away"}\n1X2: ${winnerName} @ ${winnerOdds ?? "?"}\nScore: ${p.home_score ?? "?"}-${p.away_score ?? "?"}\nResult: ${b.win === "W" ? "WON" : "LOST"} (${b.winProfit >= 0 ? "+" : ""}${b.winProfit.toFixed(2)}u)\nDate: ${p.date || "?"}`}
                      />
                    );
                  })}
                </div>
                <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                  {stats.winWins}W / {stats.winLosses}L
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent settled bets */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-neon-cyan" />
              Recent Settled Bets
              <span className="text-[10px] text-muted-foreground font-normal">
                last 20 · click for detail
              </span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAllPredictions}
              disabled={loadingPred}
              className="gap-1 text-xs text-muted-foreground"
            >
              <RefreshCw className={`w-3 h-3 ${loadingPred ? "animate-spin" : ""}`} />
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            {/* Skeletons only before the FIRST load — background refreshes
                keep the table rendered so the page doesn't flicker. */}
            {loadingPred && preds.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full bg-muted/30" />
                ))}
              </div>
            ) : recentSettled.length === 0 ? (
              <div className="py-12 text-center">
                <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No settled bets yet</p>
                <p className="text-xs text-muted-foreground/50">Bets will appear here once matches finish</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Match</TableHead>
                    <TableHead className="text-xs">Pick</TableHead>
                    <TableHead className="text-xs">Line</TableHead>
                    <TableHead className="text-xs">Score</TableHead>
                    <TableHead className="text-xs">Result</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSettled.map((p) => {
                    const ouOutcome = computeReducedRiskOutcome(p);
                    const winOutcome = computeWinnerOutcome(p);
                    const hasScores = p.home_score != null && p.away_score != null;
                    const matchDate = parseMatchDateTime(p.date, p.time);
                    return (
                      <TableRow
                        key={p.match_id}
                        className="border-border/20 hover:bg-card/80 cursor-pointer transition-colors"
                        onClick={() => setDrawerPrediction(p)}
                      >
                        <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {matchDate ? formatLocalDateLong(matchDate).substring(0, 12) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium truncate max-w-[120px]">{p.home_team || "—"}</div>
                          <div className="text-muted-foreground truncate max-w-[120px]">vs {p.away_team || "—"}</div>
                        </TableCell>
                        <TableCell>
                          {p.recommendation && p.recommendation !== "NO_BET" ? (
                            <RecommendationBadge rec={p.recommendation} />
                          ) : p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION" ? (
                            <Badge variant="outline" className="text-[9px] border-neon-cyan/30 text-neon-cyan">1X2</Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-neon-cyan font-mono text-xs whitespace-nowrap">
                          {p.reduced_under_total && p.recommendation === "UNDER" ? p.reduced_under_total
                            : p.reduced_over_total && p.recommendation === "OVER" ? p.reduced_over_total
                            : p.bookmaker_line ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {hasScores ? `${p.home_score}-${p.away_score}` : "—"}
                        </TableCell>
                        <TableCell>
                          {ouOutcome !== "MISSING" && (
                            <Badge variant="outline" className={`text-[9px] mr-1 ${ouOutcome === "WIN" ? "border-neon-green/30 text-neon-green" : ouOutcome === "LOSS" ? "border-neon-red/30 text-neon-red" : "border-neon-yellow/30 text-neon-yellow"}`}>
                              {p.recommendation} {ouOutcome === "WIN" ? "✓" : ouOutcome === "LOSS" ? "✗" : "P"}
                            </Badge>
                          )}
                          {winOutcome !== "MISSING" && (
                            <Badge variant="outline" className={`text-[9px] ${winOutcome === "WIN" ? "border-neon-green/30 text-neon-green" : "border-neon-red/30 text-neon-red"}`}>
                              1X2 {winOutcome === "WIN" ? "✓" : "✗"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}
