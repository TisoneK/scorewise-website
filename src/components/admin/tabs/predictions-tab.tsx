/**
 * PredictionsTab — the "All Predictions" tab content.
 *
 * Shows a full-width table of every prediction with ALL available data.
 * Per-row click → opens PredictionDetailDrawer for the full pipeline breakdown.
 */

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  Download,
  Loader2,
  ChevronRight,
  Database,
} from "lucide-react";
import type { Prediction, StoredPredictions } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "../badges";

export interface PredictionsTabProps {
  preds: Prediction[];
  totalPreds: number;
  successCount: number;
  failCount: number;
  loadingPred: boolean;
  allPredictionsData: StoredPredictions | null;
  fetchAllPredictions: () => void;
  handleDownloadPredictions: () => void;
  setDrawerPrediction: (p: Prediction | null) => void;
}

export function PredictionsTab({
  preds,
  totalPreds,
  successCount,
  failCount,
  loadingPred,
  allPredictionsData,
  fetchAllPredictions,
  handleDownloadPredictions,
  setDrawerPrediction,
}: PredictionsTabProps) {
  const cols = 19; // total columns for colSpan
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">All Predictions</h2>
          <p className="text-sm text-muted-foreground">
            Complete prediction data — {totalPreds} total, {successCount} processed, {failCount} errors
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAllPredictions}
            disabled={loadingPred}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPred ? "animate-spin" : ""}`} />
            Reload
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPredictions}
            disabled={!allPredictionsData}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
        </div>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs whitespace-nowrap">Match ID</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Time</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Country</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">League</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Home Team</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Away Team</TableHead>
                  <TableHead className="text-xs">Rec</TableHead>
                  <TableHead className="text-xs">Conf</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Line</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Avg Rate</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Above</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Below</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Dec Test</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Inc Test</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Winner</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">H2H</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPred ? (
                  <TableRow>
                    <TableCell colSpan={cols + 2} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : preds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cols + 2} className="py-12">
                      <div className="empty-state">
                        <Database className="empty-state-icon" />
                        <p className="empty-state-title">No predictions available</p>
                        <p className="empty-state-subtitle">Run a scrape from the Services tab to generate predictions</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  preds.map((p) => (
                    <TableRow
                      key={p.match_id}
                      className="border-border/20 hover:bg-card/80 cursor-pointer transition-colors"
                      onClick={() => setDrawerPrediction(p)}
                    >
                      <TableCell className="font-mono text-xs">{p.match_id.slice(0, 10)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.date || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.time || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.country || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.league || "—"}</TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{p.home_team || "—"}</TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{p.away_team || "—"}</TableCell>
                      <TableCell><RecommendationBadge rec={p.recommendation} /></TableCell>
                      <TableCell><ConfidenceBadge level={p.confidence} /></TableCell>
                      <TableCell className="text-neon-cyan font-mono text-xs">{p.bookmaker_line ?? "—"}</TableCell>
                      <TableCell className={`font-mono text-xs ${p.average_rate >= 7 ? "text-neon-green" : p.average_rate <= -7 ? "text-neon-red" : "text-muted-foreground"}`}>
                        {p.average_rate.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-xs text-neon-green font-mono">{p.matches_above}</TableCell>
                      <TableCell className="text-xs text-neon-red font-mono">{p.matches_below}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{p.decrement_test}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{p.increment_test}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION"
                          ? p.team_winner.replace(/_/g, " ").toLowerCase()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {p.h2h_totals.length > 0 ? `[${p.h2h_totals.join(",")}]` : "—"}
                      </TableCell>
                      <TableCell>
                        {p.success ? (
                          <Badge variant="outline" className="text-[9px] border-neon-green/30 text-neon-green">OK</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] border-neon-red/30 text-neon-red">ERR</Badge>
                        )}
                      </TableCell>
                      <TableCell><ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
