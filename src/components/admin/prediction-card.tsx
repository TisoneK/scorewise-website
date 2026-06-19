/**
 * PredictionCard — clean, modern, betting-app style card.
 *
 * Design principles:
 * - Teams are the HERO — large, bold, full names (no truncation)
 * - Prediction is the ACTION — colored, prominent
 * - Odds are inline — "OVER 186.5 @ 1.85" reads naturally
 * - Winner is secondary but clear
 * - Date/time is subtle, at the bottom
 * - Cards have clear visual separation
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Prediction } from "@/lib/types";

export function PredictionCard({
  prediction: p,
}: {
  prediction: Prediction;
  detailed?: boolean;
}) {
  const rec = p.recommendation?.toUpperCase() || "";
  const isOver = rec === "OVER";
  const isUnder = rec === "UNDER";
  const hasWinner = p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION";
  const winnerName = p.team_winner === "HOME_TEAM"
    ? p.home_team
    : p.team_winner === "AWAY_TEAM"
      ? p.away_team
      : null;
  const winnerOdds = p.team_winner === "HOME_TEAM"
    ? p.home_odds
    : p.team_winner === "AWAY_TEAM"
      ? p.away_odds
      : null;

  // Confidence color
  const conf = p.confidence?.toUpperCase() || "";
  const confColor = conf === "HIGH" ? "text-neon-green" : conf === "MEDIUM" ? "text-neon-yellow" : "text-muted-foreground";

  // Prediction accent color
  const accentColor = isOver ? "text-neon-green" : isUnder ? "text-neon-red" : "text-muted-foreground";

  return (
    <Card className="bg-card border-border/40 overflow-hidden transition-all duration-200 hover:border-neon-green/20">
      <CardContent className="p-0">

        {/* League bar — thin accent strip at top */}
        {(p.league || p.country) && (
          <div className="px-4 py-1.5 bg-background/50 border-b border-border/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center truncate">
              {[p.league, p.country].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}

        {/* Match section — teams side by side */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            {/* Home team */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg leading-tight break-words">
                {p.home_team || "Home"}
              </p>
            </div>

            {/* VS badge */}
            <div className="shrink-0 pt-1">
              <span className="text-[10px] font-black text-muted-foreground/30 tracking-widest">
                VS
              </span>
            </div>

            {/* Away team */}
            <div className="flex-1 min-w-0 text-right">
              <p className="font-bold text-base sm:text-lg leading-tight break-words">
                {p.away_team || "Away"}
              </p>
            </div>
          </div>
        </div>

        {/* Prediction section — colored band */}
        <div className="px-4 py-3 border-t border-border/20">

          {/* Main prediction: OVER/UNDER + line + odds */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {/* Prediction badge */}
              {isOver && (
                <span className={`flex items-center gap-1 font-bold text-sm ${accentColor}`}>
                  <TrendingUp className="w-4 h-4" />
                  OVER
                </span>
              )}
              {isUnder && (
                <span className={`flex items-center gap-1 font-bold text-sm ${accentColor}`}>
                  <TrendingDown className="w-4 h-4" />
                  UNDER
                </span>
              )}

              {/* Line */}
              {p.bookmaker_line && (
                <span className="text-lg font-black font-mono text-neon-cyan">
                  {p.bookmaker_line}
                </span>
              )}

              {/* Odds */}
              {isOver && p.over_odds && (
                <span className="text-xs font-mono text-muted-foreground">
                  @{p.over_odds}
                </span>
              )}
              {isUnder && p.under_odds && (
                <span className="text-xs font-mono text-muted-foreground">
                  @{p.under_odds}
                </span>
              )}
            </div>

            {/* Confidence — text only, no badge clutter */}
            <span className={`text-xs font-bold ${confColor}`}>
              {conf}
            </span>
          </div>

          {/* Winner prediction */}
          {hasWinner && winnerName && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Winner:</span>
                <span className="text-xs font-bold text-foreground">
                  {winnerName}
                </span>
                {winnerOdds && (
                  <span className="text-xs font-mono text-muted-foreground">
                    @{winnerOdds}
                  </span>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Date/time — footer */}
        {(p.date || p.time) && (
          <div className="px-4 py-2 bg-background/30 border-t border-border/20">
            <p className="text-[10px] text-muted-foreground/60 font-mono text-center">
              {[p.date, p.time].filter(Boolean).join("  ·  ")}
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

export function PredictionCardSkeleton() {
  return (
    <Card className="bg-card border-border/40 overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 py-1.5 bg-background/50 border-b border-border/30">
          <Skeleton className="h-3 w-1/2 mx-auto bg-muted/40" />
        </div>
        <div className="px-4 pt-4 pb-2">
          <div className="flex justify-between">
            <Skeleton className="h-6 w-1/3 bg-muted/40" />
            <Skeleton className="h-6 w-1/3 bg-muted/40" />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-border/20">
          <Skeleton className="h-5 w-2/3 bg-muted/40 mb-2" />
          <Skeleton className="h-4 w-1/2 bg-muted/40" />
        </div>
        <div className="px-4 py-2 bg-background/30 border-t border-border/20">
          <Skeleton className="h-3 w-1/3 mx-auto bg-muted/40" />
        </div>
      </CardContent>
    </Card>
  );
}
