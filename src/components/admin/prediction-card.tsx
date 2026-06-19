/**
 * PredictionCard — user-facing card showing ONLY what matters to a bettor.
 *
 * Shows: teams, league, country, date, time, prediction (OVER/UNDER/NO_BET),
 * confidence, bookmaker line + odds, and which team wins.
 *
 * Does NOT show: average_rate, matches_above/below, dec/inc tests,
 * h2h_totals, rate_values, winning_streak_data, or any algorithm internals.
 * Those are admin-only data exposed in the PredictionDetailDrawer.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, MapPin, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "./badges";

export function PredictionCard({
  prediction: p,
}: {
  prediction: Prediction;
  detailed?: boolean;
}) {
  const isOver = p.recommendation?.toUpperCase() === "OVER";
  const isUnder = p.recommendation?.toUpperCase() === "UNDER";
  const isNoBet = p.recommendation?.toUpperCase() === "NO_BET";
  const hasWinner = p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION";

  return (
    <Card className="bg-card/80 border-border/50 hover:border-neon-green/20 transition-all duration-200 overflow-hidden">
      <CardContent className="p-4 sm:p-5">

        {/* League + Country badge */}
        {(p.league || p.country) && (
          <div className="flex items-center gap-2 mb-3">
            {p.league && (
              <Badge variant="outline" className="text-[9px] border-border/50 text-muted-foreground">
                {p.league}
              </Badge>
            )}
            {p.country && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" />{p.country}
              </span>
            )}
          </div>
        )}

        {/* Teams + date/time */}
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* Home team */}
          <div className="min-w-0 flex-1 text-left">
            <p className="font-bold text-sm sm:text-base truncate">{p.home_team || "Home"}</p>
          </div>

          {/* Center: date/time + VS */}
          <div className="shrink-0 text-center px-2">
            {p.date && (
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                <Calendar className="w-2.5 h-2.5" />{p.date}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/50 font-mono">vs</p>
            {p.time && (
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />{p.time}
              </p>
            )}
          </div>

          {/* Away team */}
          <div className="min-w-0 flex-1 text-right">
            <p className="font-bold text-sm sm:text-base truncate">{p.away_team || "Away"}</p>
          </div>
        </div>

        {/* Prediction section */}
        <div className="space-y-2 border-t border-border/30 pt-3">
          {/* Total points prediction */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Total Points</span>
            <div className="flex items-center gap-2">
              <RecommendationBadge rec={p.recommendation} />
              <ConfidenceBadge level={p.confidence} />
            </div>
          </div>

          {/* Bookmaker line + odds */}
          {p.bookmaker_line && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Bookmaker Line</span>
              <span className="text-sm font-bold font-mono text-neon-cyan">
                {p.bookmaker_line}
              </span>
            </div>
          )}

          {/* Team winner prediction */}
          {hasWinner && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Predicted Winner</span>
              <Badge variant="outline" className="text-[10px] border-neon-cyan/30 text-neon-cyan">
                <Trophy className="w-2.5 h-2.5 mr-1" />
                {p.team_winner === "HOME_TEAM"
                  ? p.home_team || "Home"
                  : p.away_team || "Away"}
              </Badge>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

export function PredictionCardSkeleton() {
  return (
    <Card className="bg-card/80 border-border/50">
      <CardContent className="p-4 sm:p-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-1/3 bg-muted/50" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-1/3 bg-muted/50" />
            <Skeleton className="h-3 w-12 bg-muted/50" />
            <Skeleton className="h-5 w-1/3 bg-muted/50" />
          </div>
          <div className="border-t border-border/30 pt-3 space-y-2">
            <Skeleton className="h-5 w-full bg-muted/50" />
            <Skeleton className="h-5 w-full bg-muted/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
