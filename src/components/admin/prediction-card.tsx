/**
 * PredictionCard + PredictionCardSkeleton — used by UserPredictionsView.
 *
 * Extracted from src/app/page.tsx during Phase E modularization.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "./badges";

export function PredictionCard({
  prediction,
  detailed,
}: {
  prediction: Prediction;
  detailed?: boolean;
}) {
  return (
    <Card className="bg-card/80 border-border/50 hover:border-neon-green/20 transition-all duration-200 overflow-hidden group">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground/60">
                #{prediction.match_id.slice(0, 8)}
              </span>
              {prediction.team_winner &&
                prediction.team_winner !== "NO_WINNER_PREDICTION" && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-neon-cyan/30 text-neon-cyan/70"
                  >
                    {prediction.team_winner.replace(/_/g, " ")}
                  </Badge>
                )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <RecommendationBadge rec={prediction.recommendation} />
              <ConfidenceBadge level={prediction.confidence} />
            </div>
            {detailed && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
                <div>
                  <span className="text-muted-foreground">Bookmaker Line: </span>
                  <span className="font-mono text-neon-cyan">
                    {prediction.bookmaker_line ?? "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg Rate: </span>
                  <span className="font-mono">
                    {prediction.average_rate.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Above: </span>
                  <span className="text-neon-green font-mono">
                    {prediction.matches_above}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Below: </span>
                  <span className="text-neon-red font-mono">
                    {prediction.matches_below}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {prediction.success ? (
              <div className="flex items-center gap-1.5 text-neon-green">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-xs font-bold">PASS</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-neon-red">
                <XCircle className="w-5 h-5" />
                <span className="text-xs font-bold">FAIL</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PredictionCardSkeleton() {
  return (
    <Card className="bg-card/80 border-border/50">
      <CardContent className="p-5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/3 bg-muted/50" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 bg-muted/50" />
            <Skeleton className="h-6 w-12 bg-muted/50" />
          </div>
          <Skeleton className="h-3 w-1/2 bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );
}
