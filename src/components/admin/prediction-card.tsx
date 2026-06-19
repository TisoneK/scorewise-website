/**
 * PredictionCard — user-facing card showing ONLY what matters to a bettor.
 *
 * Design based on reference: teams side-by-side with VS in center,
 * league/country at top, prediction + odds below.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ NBL1 NORTH · Australia                    │
 *   │                                          │
 *   │ Townsville Heat    VS    Cairns Marlins   │
 *   │                                          │
 *   │ ─────────────────────────────────────── │
 *   │ [OVER] 186.5 @ 1.85            [HIGH]    │
 *   │ 🏆 Winner: Townsville Heat @ 1.48       │
 *   │                                          │
 *   │ 20/06/2026 · 10:00                       │
 *   └──────────────────────────────────────────┘
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
  const line = p.bookmaker_line ? p.bookmaker_line.toString() : "";

  return (
    <Card className="bg-card/80 border-border/50 hover:border-neon-green/20 transition-all duration-200 overflow-hidden">
      <CardContent className="p-4">

        {/* League + Country header */}
        {(p.league || p.country) && (
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {p.league && (
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {p.league}
              </span>
            )}
            {p.league && p.country && (
              <span className="text-[10px] text-muted-foreground/40">·</span>
            )}
            {p.country && (
              <span className="text-[10px] text-muted-foreground/70">
                {p.country}
              </span>
            )}
          </div>
        )}

        {/* Teams — side by side with VS in center (like the reference design) */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Home team — left aligned */}
          <div className="flex-1 min-w-0 text-left">
            <p className="font-bold text-sm sm:text-base leading-tight break-words">
              {p.home_team || "Home"}
            </p>
          </div>

          {/* VS — center */}
          <div className="shrink-0 px-1">
            <span className="text-[10px] font-bold text-muted-foreground/50 tracking-wider">
              VS
            </span>
          </div>

          {/* Away team — right aligned */}
          <div className="flex-1 min-w-0 text-right">
            <p className="font-bold text-sm sm:text-base leading-tight break-words">
              {p.away_team || "Away"}
            </p>
          </div>
        </div>

        {/* Date + Time — centered, below teams */}
        {(p.date || p.time) && (
          <div className="text-center mb-3">
            <span className="text-[10px] text-muted-foreground font-mono">
              {[p.date, p.time].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border/30 pt-3 space-y-2">

          {/* Prediction row: OVER/UNDER + line + odds  |  confidence */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <RecommendationBadge rec={p.recommendation} />
              {line && (
                <span className="text-sm font-bold font-mono text-neon-cyan">
                  {line}
                </span>
              )}
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

          {/* Winner prediction + odds */}
          {hasWinner && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Trophy className="w-3 h-3 text-neon-cyan shrink-0" />
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
              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide">
                Predicted Winner
              </span>
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
          <div className="text-center">
            <Skeleton className="h-3 w-1/3 mx-auto bg-muted/50" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-1/3 bg-muted/50" />
            <Skeleton className="h-3 w-6 bg-muted/50" />
            <Skeleton className="h-5 w-1/3 bg-muted/50" />
          </div>
          <div className="text-center">
            <Skeleton className="h-3 w-1/4 mx-auto bg-muted/50" />
          </div>
          <div className="border-t border-border/30 pt-3 space-y-2">
            <Skeleton className="h-6 w-full bg-muted/50" />
            <Skeleton className="h-5 w-3/4 bg-muted/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
