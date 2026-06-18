/**
 * PredictionsTab — the "All Predictions" tab content.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Shows a full-width table of every prediction (passed + failed) with
 * per-row click → opens PredictionDetailDrawer.
 */

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  CheckCircle2,
  XCircle,
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
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">All Predictions</h2>
          <p className="text-sm text-muted-foreground">
            Complete prediction data including failed validations
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
            Export JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card/60 border border-border/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black">{totalPreds}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
        <div className="bg-card/60 border border-neon-green/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-green">{successCount}</p>
          <p className="text-[10px] text-muted-foreground">Processed</p>
        </div>
        <div className="bg-card/60 border border-neon-red/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-red">{failCount}</p>
          <p className="text-[10px] text-muted-foreground">Errors</p>
        </div>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs">Match</TableHead>
                  <TableHead className="text-xs">Teams</TableHead>
                  <TableHead className="text-xs">Rec</TableHead>
                  <TableHead className="text-xs">Conf</TableHead>
                  <TableHead className="text-xs">Line</TableHead>
                  <TableHead className="text-xs">Winner</TableHead>
                  <TableHead className="text-xs">Above/Below</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPred ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-muted-foreground"
                    >
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : preds.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-12"
                    >
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
                      <TableCell className="font-mono text-xs">
                        {p.match_id.slice(0, 12)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.home_team || "—"}</div>
                        <div className="text-muted-foreground">vs {p.away_team || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <RecommendationBadge rec={p.recommendation} />
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge level={p.confidence} />
                      </TableCell>
                      <TableCell className="text-neon-cyan font-mono text-xs">
                        {p.bookmaker_line ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION"
                          ? p.team_winner.replace(/_/g, " ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="text-neon-green">{p.matches_above}</span>
                        /
                        <span className="text-neon-red">{p.matches_below}</span>
                      </TableCell>
                      <TableCell>
                        {p.success ? (
                          <Badge variant="outline" className="text-[9px] border-neon-green/30 text-neon-green">OK</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] border-neon-red/30 text-neon-red">ERR</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}
