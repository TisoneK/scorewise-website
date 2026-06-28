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
import { TrendingUp, TrendingDown, Star, Trophy, Calendar, Ticket, Copy, Check, Radio, Clock } from "lucide-react";
import type { Prediction } from "@/lib/types";
import {
  parseMatchDateTime,
  formatLocalDateTime,
  getTimezoneAbbr,
} from "@/lib/timezone";
import { computeOverUnderOutcome, computeWinnerOutcome, computeEffectiveStatus } from "@/lib/result-utils";
import { timeToKickoff } from "@/lib/countdown";

/** Map a confidence label to a star count (0-5) for the visual rating. */
function confStars(conf: string): number {
  if (conf === "HIGH") return 5;
  if (conf === "MEDIUM") return 3;
  if (conf === "LOW") return 1;
  return 0;
}

export function PredictionCard({
  prediction: p,
  rank,
  showLeague = true,
  showDateTime = true,
  showBetCode = true,
}: {
  prediction: Prediction;
  rank?: number;
  showLeague?: boolean;
  showDateTime?: boolean;
  showBetCode?: boolean;
}) {
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

  const conf = p.confidence?.toUpperCase() || "";
  const confColor =
    conf === "HIGH"
      ? "text-neon-green"
      : conf === "MEDIUM"
        ? "text-neon-yellow"
        : conf === "LOW"
          ? "text-muted-foreground"
          : "text-muted-foreground/50";
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
    <div className={`rounded-lg bg-card/80 border-2 transition-all overflow-hidden ${
      rank !== undefined
        ? "border-neon-green/40 hover:border-neon-green/60 hover:shadow-[0_0_16px_-4px_rgba(34,197,94,0.3)]"
        : "border-border/60 hover:border-neon-green/40"
    }`}>

      {/* HEADER — league + local date/time on LEFT, countdown on RIGHT */}
      {(showLeague && leagueBits) || (showDateTime && matchDate) ? (
        <div className="px-3 py-1.5 bg-background/40 border-b border-border/20">
          <div className="flex items-center justify-between gap-2">
            {/* LEFT: league + date/time */}
            <p className="text-[10px] text-muted-foreground/70 truncate text-left">
              {[
                showLeague && leagueBits,
                showDateTime && matchDate && (
                  <span key="dt" className="inline-flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5 inline" />
                    {formatLocalDateTime(matchDate)}{" "}
                    <span className="text-muted-foreground/50">{tzAbbr}</span>
                  </span>
                ),
              ]
                .filter(Boolean)
                .map((node, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1.5 text-muted-foreground/30">•</span>}
                    {node}
                  </span>
                ))}
            </p>
            {/* RIGHT: Countdown badge — shows time to kickoff or time since kickoff.
                Only rendered after mount to avoid SSR hydration mismatch.
                Hidden for FINAL matches (irrelevant — match is over). */}
            {showDateTime && mounted && !isFinal && (() => {
              const countdown = timeToKickoff(p.date, p.time);
              if (!countdown) return null;
              const isPast = countdown.includes("ago");
              const isNow = countdown.includes("now");
              // For past matches (LIVE/AWAITING), only show if within 3 hours
              // — beyond that it's irrelevant ("started 21h ago" is useless)
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

      {/* MAIN ROW — teams + prediction + confidence */}
      <div className="flex items-center gap-3 p-3">
        {/* Optional rank badge (Top Picks only) — stylish podium-style badge */}
        {rank !== undefined && (
          <div className="shrink-0 flex flex-col items-center self-stretch justify-center">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 ${
              rank === 1
                ? "bg-neon-green/15 border-neon-green/50 shadow-[0_0_12px_-2px_rgba(34,197,94,0.5)]"
                : rank === 2
                  ? "bg-neon-cyan/15 border-neon-cyan/50 shadow-[0_0_12px_-2px_rgba(34,211,238,0.4)]"
                  : "bg-neon-yellow/10 border-neon-yellow/40 shadow-[0_0_12px_-2px_rgba(234,179,8,0.3)]"
            }`}>
              <span className={`text-sm font-black ${
                rank === 1 ? "text-neon-green" : rank === 2 ? "text-neon-cyan" : "text-neon-yellow"
              }`}>{rank}</span>
            </div>
            <span className="text-[7px] text-muted-foreground/50 uppercase tracking-wider font-bold mt-0.5">
              {rank === 1 ? "top" : "pick"}
            </span>
          </div>
        )}

        {/* Teams + prediction (flex-1, allows team names to wrap) */}
        <div className="flex-1 min-w-0">
          {/* Teams — NO truncate, allow wrapping so full names are visible */}
          <p className="font-bold text-xs sm:text-sm leading-tight break-words">
            {p.home_team || "Home"}{" "}
            <span className="text-muted-foreground/50 mx-0.5">vs</span>{" "}
            {p.away_team || "Away"}
          </p>
          {/* Prediction + line + odds (totals row) */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {(isOver || isUnder) && (
              <span className={`flex items-center gap-0.5 text-xs font-bold ${accentColor}`}>
                {isOver ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {p.recommendation}
              </span>
            )}
            {p.bookmaker_line != null && (
              <span className="text-sm font-black font-mono text-neon-cyan">
                {p.bookmaker_line}
              </span>
            )}
            {odds != null && (
              <span className="text-[10px] font-mono text-muted-foreground">@{odds}</span>
            )}
          </div>
          {/* Win prediction — stacked BELOW totals, not beside */}
          {hasWinner && winnerName && (
            <div className="flex items-center gap-0.5 mt-1 text-[10px] text-muted-foreground">
              <Trophy className="w-2.5 h-2.5 text-neon-cyan" />
              {winnerName}
              {winnerOdds != null && <span className="font-mono">@{winnerOdds}</span>}
            </div>
          )}
          {/* Result line — shows status (LIVE/AWAITING/PENDING) + full score
              with full team names + outcome badges (WON/LOST/PUSH) */}
          {(isLive || isFinal || isAwaiting) && (
            <div className={`flex items-center gap-1.5 mt-1.5 text-[11px] font-bold flex-wrap ${
              isLive ? "text-neon-red" : isAwaiting ? "text-neon-yellow" : "text-foreground"
            }`}>
              {isLive && <Radio className="w-3 h-3 animate-pulse shrink-0" />}
              {isAwaiting && <Clock className="w-3 h-3 shrink-0" />}
              {p.home_score != null && p.away_score != null ? (
                <span className="font-mono">
                  {p.home_team || "Home"} {p.home_score} - {p.away_score} {p.away_team || "Away"}
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide">
                  {isLive ? "Live" : isAwaiting ? "Awaiting result" : "Pending"}
                </span>
              )}
              {/* Outcome badges — only for FINAL matches */}
              {isFinal && ouOutcome !== "MISSING" && (() => {
                const ouTone = ouOutcome === "WIN" ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : ouOutcome === "LOSS" ? "border-neon-red/40 bg-neon-red/10 text-neon-red" : "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow";
                const ouLabel = ouOutcome === "WIN" ? "WON ✓" : ouOutcome === "LOSS" ? "LOST ✗" : "PUSH";
                return (
                  <span className={`px-1.5 py-0 rounded text-[9px] border font-bold ${ouTone}`}>
                    {p.recommendation} {ouLabel}
                  </span>
                );
              })()}
              {isFinal && winOutcome !== "MISSING" && (() => {
                const winTone = winOutcome === "WIN" ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : winOutcome === "LOSS" ? "border-neon-red/40 bg-neon-red/10 text-neon-red" : "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow";
                const winLabel = winOutcome === "WIN" ? "WON ✓" : winOutcome === "LOSS" ? "LOST ✗" : "PUSH";
                return (
                  <span className={`px-1.5 py-0 rounded text-[9px] border font-bold ${winTone}`}>
                    WIN {winLabel}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Confidence — stars + label (right) */}
        <div className="shrink-0 text-right self-start mt-0.5">
          <div className="flex items-center gap-0.5 justify-end">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-2.5 h-2.5 ${
                  i < confStars(conf)
                    ? "text-neon-green fill-neon-green"
                    : "text-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <p className={`text-[9px] font-bold mt-0.5 ${confColor}`}>
            {conf || "—"}
          </p>
        </div>
      </div>

      {/* FOOTER — betslip code + copy button at the BOTTOM */}
      {showBetCode && (
        <div className="px-3 py-1.5 bg-background/40 border-t border-border/20">
          {betCode ? (
            <button
              type="button"
              onClick={handleCopy}
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
