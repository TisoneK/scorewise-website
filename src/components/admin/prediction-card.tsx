"use client";

/**
 * PredictionCard — unified compact card for both Top Picks and All Predictions.
 *
 * Layout (top to bottom):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ HEADER: NBL1 SOUTH · AUSTRALIA  •  Fri, Jun 19 · 14:30 EAT │  ← league + local time
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ [#1]  Mt Gambier vs Kilsyth     UNDER 187.5 @1.83   ★★★★★ │  ← teams + prediction + confidence
 *   │                                🏆 Mt Gambier @1.67   HIGH  │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ FOOTER: 🎫 SD:OP-12345   [Copy]                            │  ← betslip code + copy button
 *   └─────────────────────────────────────────────────────────────┘
 *
 * - rank?: number — if provided, shows a green rank badge (Top Picks only).
 * - showLeague / showDateTime: optional header controls (default true).
 * - showBetCode: optional footer control (default true).
 *
 * Team names are NOT truncated — they wrap to multiple lines so full names
 * are always visible (e.g. "Warwick Senators W vs Kalamunda Eastern Suns W").
 *
 * Times are converted from UTC (scraper source) to the viewer's local TZ
 * via src/lib/timezone.ts.
 */

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Star, Trophy, Calendar, Ticket, Copy, Check, Radio, Clock, ChevronRight } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "./badges";
import {
  parseMatchDateTime,
  formatLocalDateTime,
  getTimezoneAbbr,
} from "@/lib/timezone";
import { computeOverUnderOutcome, computeReducedRiskOutcome, computeWinnerOutcome, computeEffectiveStatus } from "@/lib/result-utils";
import { useOddsFormat, formatOdds } from "@/lib/odds-format";
import { useFavoriteTeams, matchHasFavorite } from "@/lib/favorites";
import { timeToKickoff } from "@/lib/countdown";

export function PredictionCard({
  prediction: p,
  rank,
  showLeague = true,
  showDateTime = true,
  showBetCode = true,
  onSelect,
}: {
  prediction: Prediction;
  rank?: number;
  showLeague?: boolean;
  showDateTime?: boolean;
  showBetCode?: boolean;
  /** When provided, the whole card is tappable and opens the match detail. */
  onSelect?: (p: Prediction) => void;
}) {
  const oddsFmt = useOddsFormat();
  const favs = useFavoriteTeams();
  const isFav = matchHasFavorite(favs, p.home_team, p.away_team);
  const rec = p.recommendation?.toUpperCase() || "";
  const isOver = rec === "OVER";
  const isUnder = rec === "UNDER";
  const hasWinner = !!p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION";
  const winnerName =
    p.team_winner === "HOME_TEAM"
      ? p.home_team
      : p.team_winner === "AWAY_TEAM"
        ? p.away_team
        : null;
  const winnerOdds =
    p.team_winner === "HOME_TEAM"
      ? p.home_odds
      : p.team_winner === "AWAY_TEAM"
        ? p.away_odds
        : null;
  const odds = isOver ? p.over_odds : isUnder ? p.under_odds : null;
  // Effective O/U line. For users the reduced_* fields are stripped by the
  // API, so this is just the bookmaker line (single line, no exposure).
  const reducedLine = isOver ? p.reduced_over_total : isUnder ? p.reduced_under_total : null;
  const reducedOdds = isOver ? p.reduced_over_odds : isUnder ? p.reduced_under_odds : null;
  const effectiveLine = reducedLine ?? p.bookmaker_line;
  const effectiveOdds = reducedOdds ?? odds;

  const accentColor = isOver
    ? "text-neon-green"
    : isUnder
      ? "text-neon-red"
      : "text-muted-foreground";

  const matchDate = parseMatchDateTime(p.date, p.time);
  const tzAbbr = getTimezoneAbbr();
  const leagueBits = [p.league, p.country].filter(Boolean).join(" · ");

  // Result state — uses computeEffectiveStatus() so LIVE shows automatically
  // when the match kicks off (based on start time), without needing a manual
  // DB update. FINAL still requires a stored final score.
  const effectiveStatus = computeEffectiveStatus(p);
  const isLive = effectiveStatus === "LIVE";
  const isFinal = effectiveStatus === "FINAL";
  const isAwaiting = effectiveStatus === "AWAITING_RESULT";
  const ouOutcome = computeOverUnderOutcome(p);
  const ouReducedOutcome = computeReducedRiskOutcome(p);
  const winOutcome = computeWinnerOutcome(p);
  // Show result line for LIVE (with live score if available), FINAL (with
  // final score + outcome badges), or AWAITING_RESULT (subtle "awaiting" hint)
  const showResult = isLive || isFinal;

  // Copy-to-clipboard state
  const [copied, setCopied] = useState(false);
  // Mounted state — countdown uses Date.now() which differs between server
  // and client, so we only render it after mount to avoid hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const betCode = p.bet_code || null;

  const handleCopy = async () => {
    if (!betCode) return;
    try {
      await navigator.clipboard.writeText(betCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = betCode;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div
      onClick={onSelect ? () => onSelect(p) : undefined}
      className={`rounded-lg bg-card/90 border-2 transition-all overflow-hidden ${onSelect ? "cursor-pointer" : ""} ${
      rank !== undefined
        ? "border-neon-green/50 hover:border-neon-green/70 hover:shadow-[0_0_16px_-4px_rgba(34,197,94,0.3)]"
        : "border-border hover:border-neon-green/40"
    }`}>

      {/* HEADER — league on LEFT, date/time + status/countdown on RIGHT
          (matches the admin card layout). */}
      {(showLeague && leagueBits) || (showDateTime && matchDate) ? (
        <div className="px-3 py-1.5 bg-background/40 border-b border-border/20 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground/70 truncate text-left">
            {showLeague ? (leagueBits || "Unknown league") : ""}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {showDateTime && matchDate && (
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                {formatLocalDateTime(matchDate)}
                <span className="text-muted-foreground/40">{tzAbbr}</span>
              </span>
            )}
            {isFinal && (
              <Badge variant="outline" className="text-[8px] border-neon-green/30 text-neon-green">FINAL</Badge>
            )}
            {isLive && (
              <Badge variant="outline" className="text-[8px] border-neon-red/30 text-neon-red animate-pulse">LIVE</Badge>
            )}
            {/* Countdown — only for upcoming matches, only after mount
                (avoids SSR hydration mismatch). */}
            {showDateTime && mounted && !isFinal && !isLive && (() => {
              const countdown = timeToKickoff(p.date, p.time);
              if (!countdown) return null;
              const isPast = countdown.includes("ago");
              const isNow = countdown.includes("now");
              if (isPast && !isNow) {
                const hoursMatch = countdown.match(/(\d+)h/);
                const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
                if (hours >= 3) return null;
              }
              const isSoon = countdown.includes("in") && parseInt(countdown.replace(/[^0-9]/g, "")) <= 30;
              const color = isNow || isPast
                ? "text-neon-red border-neon-red/30 bg-neon-red/5"
                : isSoon
                  ? "text-neon-yellow border-neon-yellow/30 bg-neon-yellow/5"
                  : "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5";
              return (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${color} shrink-0`}>
                  {isNow || isPast ? "🔴 " : "⏱ "}{countdown}
                </span>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* BODY — teams + predictions + badges (matches the admin card body) */}
      <div className="p-3 space-y-2">
        {/* Teams — optional rank pill + fav star, no truncation */}
        <p className="font-bold text-sm leading-tight break-words">
          {rank !== undefined && (
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded mr-1.5 -mt-0.5 text-[10px] font-black align-middle border ${
              rank === 1
                ? "bg-neon-green/15 border-neon-green/50 text-neon-green"
                : rank === 2
                  ? "bg-neon-cyan/15 border-neon-cyan/50 text-neon-cyan"
                  : "bg-neon-yellow/10 border-neon-yellow/40 text-neon-yellow"
            }`}>{rank}</span>
          )}
          {isFav && <Star className="w-3 h-3 fill-neon-yellow text-neon-yellow inline mr-1 -mt-0.5" />}
          {p.home_team || "Home"} <span className="text-muted-foreground/50 mx-0.5">vs</span> {p.away_team || "Away"}
        </p>

        {/* O/U prediction row — single collapsed line for users (reduced_*
            fields are stripped server-side, so effectiveLine == bookmaker_line
            and no strikethrough is shown). */}
        {(isOver || isUnder) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`flex items-center gap-1 text-xs font-bold ${accentColor}`}>
              {isOver ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {p.recommendation}
            </span>
            {effectiveLine != null && (
              <span className="text-sm font-black font-mono text-neon-cyan">{effectiveLine}</span>
            )}
            {effectiveOdds != null && (
              <span className="text-[10px] font-mono text-muted-foreground">@{formatOdds(Number(effectiveOdds), oddsFmt)}</span>
            )}
            {isFinal && ouOutcome !== "MISSING" && (() => {
              const ouTone = ouOutcome === "WIN" ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : ouOutcome === "LOSS" ? "border-neon-red/40 bg-neon-red/10 text-neon-red" : "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow";
              const ouLabel = ouOutcome === "WIN" ? "WON ✓" : ouOutcome === "LOSS" ? "LOST ✗" : "PUSH";
              return <span className={`px-1.5 py-0 rounded text-[9px] border font-bold ${ouTone}`}>{ouLabel}</span>;
            })()}
          </div>
        )}

        {/* 1X2 prediction row */}
        {hasWinner && winnerName && (
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            <Trophy className="w-2.5 h-2.5 text-neon-cyan" />
            <span className="font-bold">{winnerName}</span>
            {winnerOdds != null && <span className="font-mono">@{formatOdds(Number(winnerOdds), oddsFmt)}</span>}
            {isFinal && winOutcome !== "MISSING" && (() => {
              const winTone = winOutcome === "WIN" ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : "border-neon-red/40 bg-neon-red/10 text-neon-red";
              const winLabel = winOutcome === "WIN" ? "WON ✓" : "LOST ✗";
              return <span className={`px-1.5 py-0 rounded text-[9px] border font-bold ${winTone}`}>{winLabel}</span>;
            })()}
          </div>
        )}

        {/* Result line — score + total + difference from the line */}
        {(isLive || isFinal || isAwaiting) && (() => {
          const hasScores = p.home_score != null && p.away_score != null;
          const total = hasScores ? Number(p.home_score) + Number(p.away_score) : null;
          const line = effectiveLine != null ? Number(effectiveLine) : null;
          const diff = (total != null && line != null) ? total - line : null;
          const diffStr = diff != null ? (diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : null;
          const diffDirection = diff != null ? (diff >= 0 ? "OVER" : "UNDER") : null;
          const diffTone = (() => {
            if (diff == null || !(isOver || isUnder)) return "";
            const isUnderRec = p.recommendation?.toUpperCase() === "UNDER";
            const predictionWon = (isUnderRec && diff < 0) || (!isUnderRec && diff >= 0);
            return predictionWon ? "text-neon-green" : "text-neon-red";
          })();

          return (
            <div className={`flex items-center gap-2 text-[11px] font-bold flex-wrap ${
              isLive ? "text-neon-red" : isAwaiting ? "text-neon-yellow" : "text-foreground"
            }`}>
              {isLive && <Radio className="w-3 h-3 animate-pulse shrink-0" />}
              {isAwaiting && <Clock className="w-3 h-3 shrink-0" />}
              {hasScores ? (
                <span className="font-mono">
                  {p.home_team || "Home"} {p.home_score} - {p.away_score} {p.away_team || "Away"}
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide">
                  {isLive ? "Live" : isAwaiting ? "Awaiting result" : "Pending"}
                </span>
              )}
              {isFinal && hasScores && total != null && line != null && (
                <span className="text-[10px] text-muted-foreground/80 font-mono">
                  Total: <span className="text-foreground font-bold">{total}</span>
                  {" · "}Line: <span className="text-neon-cyan">{line}</span>
                  {" · "}<span className={diffTone}>{diffStr} {diffDirection}</span>
                </span>
              )}
            </div>
          );
        })()}

        {/* Bottom row — confidence + recommendation badges (matches admin) */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/10">
          <ConfidenceBadge level={p.confidence} />
          {p.recommendation && p.recommendation !== "NO_BET" && <RecommendationBadge rec={p.recommendation} />}
          {onSelect && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 ml-auto" />}
        </div>
      </div>

      {/* FOOTER — betslip code + copy button (user-only affordance) */}
      {showBetCode && (
        <div className="px-3 py-1.5 bg-background/40 border-t border-border/20">
          {betCode ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className="w-full flex items-center justify-center gap-2 group/betcode"
              aria-label="Copy betslip code"
            >
              <Ticket className="w-3 h-3 text-neon-cyan shrink-0" />
              <span className="text-[11px] font-mono font-bold text-foreground tracking-wide truncate">
                {betCode}
              </span>
              {copied ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-neon-green shrink-0">
                  <Check className="w-3 h-3" />Copied
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground group-hover/betcode:text-neon-cyan transition-colors shrink-0">
                  <Copy className="w-3 h-3" />Copy
                </span>
              )}
            </button>
          ) : (
            <p className="text-[10px] text-muted-foreground/40 text-center italic">
              No betslip code yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PredictionCardSkeleton() {
  return (
    <div className="rounded-lg bg-card/80 border border-border/40 overflow-hidden">
      <div className="px-3 py-1.5 bg-background/40 border-b border-border/20">
        <Skeleton className="h-2 w-2/3 mx-auto bg-muted/40" />
      </div>
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="w-7 h-7 rounded-full bg-muted/40" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-3/4 bg-muted/40" />
          <Skeleton className="h-3 w-1/2 bg-muted/40" />
        </div>
        <Skeleton className="h-6 w-16 bg-muted/40" />
      </div>
      <div className="px-3 py-1.5 bg-background/40 border-t border-border/20">
        <Skeleton className="h-2 w-1/3 mx-auto bg-muted/40" />
      </div>
    </div>
  );
}
