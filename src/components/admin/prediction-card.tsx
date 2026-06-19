/**
 * PredictionCard — user-facing card showing ONLY what matters to a bettor.
 *
 * Clean, mobile-first layout:
 *   ┌──────────────────────────────────────┐
 *   │ NBL1 NORTH · Australia               │
 *   │                                      │
 *   │ Townsville Heat                      │
 *   │                       20/06 · 10:00  │
 *   │ Cairns Marlins                       │
 *   │                                      │
 *   │ ─────────────────────────────────── │
 *   │ OVER 186.5  @ 1.85     [HIGH]        │
 *   │ Winner: Townsville Heat              │
 *   └──────────────────────────────────────┘
 *
 * No algorithm internals. No truncation. Full team names.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "./badges";

export function PredictionCard({
  prediction: p,
}: {
  prediction: Prediction;
  detailed?: boolean;
}) {
  const hasWinner = p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION";
  const isOver = p.recommendation?.toUpperCase() === "OVER";

  // Format the prediction line: "OVER 186.5 @ 1.85" or "UNDER 194.5 @ 2.04"
  const rec = p.recommendation?.toUpperCase() || "";
  const line = p.bookmaker_line ? p.bookmaker_line.toString() : "";
  // The engine doesn't currently store over_odds/under_odds on the prediction
  // output — they come from the input. For now we show the line only.
  // TODO: pass over_odds/under_odds through the pipeline to the response.

  return (
    <Card className="bg-card/80 border-border/50 hover:border-neon-green/20 transition-all duration-200 overflow-hidden">
      <CardContent className="p-4">

        {/* League + Country — top badge row */}
        {(p.league || p.country) && (
          <div className="flex items-center gap-1.5 mb-3">
            {p.league && (
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {p.league}
              </span>
            )}
            {p.league && p.country && (
              <span className="text-[10px] text-muted-foreground/40">·</span>
            )}
            {p.country && (
              <span className="text-[10px] text-muted-foreground/70 shrink-0">
                {p.country}
              </span>
            )}
          </div>
        )}

        {/* Teams — stacked vertically, full names, no truncation */}
        <div className="space-y-0.5 mb-3">
          <p className="font-bold text-sm sm:text-base leading-tight">
            {p.home_team || "Home Team"}
          </p>
          <div className="flex items-center gap-2 py-0.5">
            <div className="flex-1 h-px bg-border/30" />
            {(p.date || p.time) && (
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {[p.date, p.time].filter(Boolean).join(" · ")}
              </span>
            )}
            <div className="flex-1 h-px bg-border/30" />
          </div>
          <p className="font-bold text-sm sm:text-base leading-tight">
            {p.away_team || "Away Team"}
          </p>
        </div>

        {/* Prediction section */}
        <div className="border-t border-border/30 pt-3 space-y-2">

          {/* OVER/UNDER + line + odds + confidence */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <RecommendationBadge rec={p.recommendation} />
              {line && (
                <span className="text-sm font-bold font-mono text-neon-cyan">
                  {line}
                </span>
              )}
              {/* Show the relevant odds based on the recommendation */}
              {isOver && p.over_odds && (
                <span className="text-xs font-mono text-muted-foreground">
                  @ {p.over_odds}
                </span>
              )}
              {!isOver && p.under_odds && (
                <span className="text-xs font-mono text-muted-foreground">
                  @ {p.under_odds}
                </span>
              )}
            </div>
            <ConfidenceBadge level={p.confidence} />
          </div>

          {/* Winner prediction + winner odds */}
          {hasWinner && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Trophy className="w-3 h-3 text-neon-cyan shrink-0" />
              <span className="text-xs text-muted-foreground">Winner:</span>
              <span className="text-xs font-bold text-foreground">
                {p.team_winner === "HOME_TEAM"
                  ? p.home_team || "Home"
                  : p.away_team || "Away"}
              </span>
              {p.team_winner === "HOME_TEAM" && p.home_odds && (
                <span className="text-xs font-mono text-muted-foreground">
                  @ {p.home_odds}
                </span>
              )}
              {p.team_winner === "AWAY_TEAM" && p.away_odds && (
                <span className="text-xs font-mono text-muted-foreground">
                  @ {p.away_odds}
                </span>
              )}
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
      <CardContent className="p-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-1/3 bg-muted/50" />
          <Skeleton className="h-5 w-3/4 bg-muted/50" />
          <Skeleton className="h-3 w-1/2 bg-muted/50" />
          <Skeleton className="h-5 w-2/3 bg-muted/50" />
          <div className="border-t border-border/30 pt-3 space-y-2">
            <Skeleton className="h-6 w-full bg-muted/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
