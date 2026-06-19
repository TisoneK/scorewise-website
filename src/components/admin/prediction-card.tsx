/**
 * PredictionCard — unified compact card for both Top Picks and All Predictions.
 *
 * Design (matches the Top Picks card the user liked):
 *   Single horizontal row:
 *     [#badge]  Home vs Away    OVER 187.5 @1.83   ★★★★★ HIGH
 *
 *   Optional footer (showLeague / showDateTime):
 *     NBL1 SOUTH · AUSTRALIA  •  Fri, Jun 19 · 14:30 EAT
 *
 * - rank?: number — if provided, shows a green rank badge (for Top Picks).
 * - showLeague?: boolean — show the league/country footer line (default true).
 * - showDateTime?: boolean — show local date/time in the footer (default true).
 *
 * Times are converted from UTC (scraper source) to the viewer's local TZ
 * via src/lib/timezone.ts. A short TZ abbreviation is shown so the user
 * knows what zone they're seeing.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Star, Trophy, Calendar } from "lucide-react";
import type { Prediction } from "@/lib/types";
import {
  parseMatchDateTime,
  formatLocalDateTime,
  getTimezoneAbbr,
} from "@/lib/timezone";

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
}: {
  prediction: Prediction;
  rank?: number;
  showLeague?: boolean;
  showDateTime?: boolean;
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
  const showFooter = (showLeague && leagueBits) || (showDateTime && matchDate);

  return (
    <div className="rounded-lg bg-card/80 border border-border/40 hover:border-neon-green/20 transition-all overflow-hidden">
      {/* Main row — compact horizontal layout */}
      <div className="flex items-center gap-3 p-3">
        {/* Optional rank badge (Top Picks only) */}
        {rank !== undefined && (
          <div className="shrink-0 w-7 h-7 rounded-full bg-neon-green/10 border border-neon-green/30 flex items-center justify-center">
            <span className="text-xs font-black text-neon-green">{rank}</span>
          </div>
        )}

        {/* Match info + prediction (left/center, flex-1) */}
        <div className="flex-1 min-w-0">
          {/* Teams */}
          <p className="font-bold text-xs sm:text-sm leading-tight truncate">
            {p.home_team || "Home"}{" "}
            <span className="text-muted-foreground/50 mx-0.5">vs</span>{" "}
            {p.away_team || "Away"}
          </p>
          {/* Prediction + line + odds + winner */}
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
            {hasWinner && winnerName && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Trophy className="w-2.5 h-2.5 text-neon-cyan" />
                {winnerName}
                {winnerOdds != null && <span className="font-mono">@{winnerOdds}</span>}
              </span>
            )}
          </div>
        </div>

        {/* Confidence — stars + label (right) */}
        <div className="shrink-0 text-right">
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

      {/* Footer — league + local date/time */}
      {showFooter && (
        <div className="px-3 py-1.5 bg-background/40 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground/70 truncate text-center">
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
        </div>
      )}
    </div>
  );
}

export function PredictionCardSkeleton() {
  return (
    <div className="rounded-lg bg-card/80 border border-border/40 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="w-7 h-7 rounded-full bg-muted/40" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-3/4 bg-muted/40" />
          <Skeleton className="h-3 w-1/2 bg-muted/40" />
        </div>
        <Skeleton className="h-6 w-16 bg-muted/40" />
      </div>
      <div className="px-3 py-1.5 bg-background/40 border-t border-border/20">
        <Skeleton className="h-2 w-2/3 mx-auto bg-muted/40" />
      </div>
    </div>
  );
}
