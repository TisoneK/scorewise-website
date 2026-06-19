/**
 * PredictionCard + PredictionCardSkeleton — used by UserPredictionsView.
 *
 * Mobile-first card design showing match info, recommendation, and key stats.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, MapPin, Trophy } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "./badges";

export function PredictionCard({
  prediction,
}: {
  prediction: Prediction;
  detailed?: boolean;
}) {
  return (
    <Card className="bg-card/80 border-border/50 hover:border-neon-green/20 transition-all duration-200 overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        {/* Top row: match ID + status */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs text-muted-foreground/60">
            #{prediction.match_id.slice(0, 10)}
          </span>
          {prediction.league && (
            <Badge variant="outline" className="text-[9px] border-border/50 text-muted-foreground">
              {prediction.league}
            </Badge>
          )}
        </div>

        {/* Teams */}
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{prediction.home_team || "Unknown"}</p>
              {prediction.country && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" />{prediction.country}
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono shrink-0">vs</span>
            <div className="min-w-0 flex-1 text-right">
              <p className="font-semibold text-sm truncate">{prediction.away_team || "Unknown"}</p>
              {prediction.date && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                  <Calendar className="w-2.5 h-2.5" />{prediction.date}
                  {prediction.time && <><Clock className="w-2.5 h-2.5 ml-1" />{prediction.time}</>}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recommendation + Confidence */}
        <div className="flex items-center gap-2 mb-3">
          <RecommendationBadge rec={prediction.recommendation} />
          <ConfidenceBadge level={prediction.confidence} />
          {prediction.team_winner && prediction.team_winner !== "NO_WINNER_PREDICTION" && (
            <Badge variant="outline" className="text-[9px] border-neon-cyan/30 text-neon-cyan">
              <Trophy className="w-2.5 h-2.5 mr-1" />
              {prediction.team_winner.replace(/_/g, " ").toLowerCase()}
            </Badge>
          )}
        </div>

        {/* Stats grid — 2 cols on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-background/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Line</p>
            <p className="text-sm font-bold font-mono text-neon-cyan">
              {prediction.bookmaker_line ?? "—"}
            </p>
          </div>
          <div className="bg-background/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Avg Rate</p>
            <p className={`text-sm font-bold font-mono ${
              prediction.average_rate >= 7 ? "text-neon-green"
              : prediction.average_rate <= -7 ? "text-neon-red"
              : "text-foreground"
            }`}>
              {prediction.average_rate.toFixed(1)}
            </p>
          </div>
          <div className="bg-background/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Above</p>
            <p className="text-sm font-bold font-mono text-neon-green">
              {prediction.matches_above}
            </p>
          </div>
          <div className="bg-background/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Below</p>
            <p className="text-sm font-bold font-mono text-neon-red">
              {prediction.matches_below}
            </p>
          </div>
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
          <Skeleton className="h-3 w-1/4 bg-muted/50" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-1/3 bg-muted/50" />
            <Skeleton className="h-3 w-8 bg-muted/50" />
            <Skeleton className="h-5 w-1/3 bg-muted/50" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 bg-muted/50" />
            <Skeleton className="h-6 w-12 bg-muted/50" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 bg-muted/50 rounded-md" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
