/**
 * OverviewTab — the command center Overview tab content.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Layout:
 *   Row 1: 6 KPI cards
 *   Row 2: LiveEventFeed (left) + 3 ServiceHealthCards (right)
 *   Row 3: PipelineFlow
 *   Row 4: Compact recent predictions table (clickable → drawer)
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Target,
  Shield,
  TrendingUp,
  TrendingDown,
  Wifi,
  Search,
  Cpu,
  Globe,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import type { Prediction, ServiceStatus } from "@/lib/types";
import type { FeedEvent } from "@/lib/admin/types";
import { StatCard } from "../primitives";
import { ConfidenceBadge, RecommendationBadge } from "../badges";
import { LiveEventFeed } from "../live-event-feed";
import { ServiceHealthCard } from "../service-health-card";
import { PipelineFlow } from "../pipeline-flow";

export interface OverviewTabProps {
  // Predictions data
  preds: Prediction[];
  totalPreds: number;
  successCount: number;
  failCount: number;
  successRate: number;
  highConf: number;
  overRecs: number;
  underRecs: number;
  loadingPred: boolean;
  fetchAllPredictions: () => void;
  // Service status
  serviceStatus: {
    scraper: ServiceStatus;
    engine: ServiceStatus;
    scraperUrl: string;
    engineUrl: string;
  } | null;
  // Live event feed
  feedEvents: FeedEvent[];
  feedLoading: boolean;
  // Prediction drawer trigger
  setDrawerPrediction: (p: Prediction | null) => void;
}

export function OverviewTab({
  preds,
  totalPreds,
  successCount,
  failCount,
  successRate,
  highConf,
  overRecs,
  underRecs,
  loadingPred,
  fetchAllPredictions,
  serviceStatus,
  feedEvents,
  feedLoading,
  setDrawerPrediction,
}: OverviewTabProps) {
  return (
    <>
      {/* Row 1: 6 KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Total Predictions"
          value={totalPreds}
          icon={<Database className="w-4 h-4 text-neon-green" />}
          color="text-neon-green"
          sub={`${successCount}✓ ${failCount}✗`}
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          icon={<Target className="w-4 h-4 text-neon-green" />}
          color="text-neon-green"
          sub={`${successCount} of ${totalPreds}`}
        />
        <StatCard
          title="High Confidence"
          value={highConf}
          icon={<Shield className="w-4 h-4 text-neon-yellow" />}
          color="text-neon-yellow"
          sub={totalPreds > 0 ? `${Math.round((highConf / totalPreds) * 100)}%` : "—"}
        />
        <StatCard
          title="OVER Recs"
          value={overRecs}
          icon={<TrendingUp className="w-4 h-4 text-neon-green" />}
          color="text-neon-green"
          sub={totalPreds > 0 ? `${Math.round((overRecs / totalPreds) * 100)}%` : "—"}
        />
        <StatCard
          title="UNDER Recs"
          value={underRecs}
          icon={<TrendingDown className="w-4 h-4 text-neon-red" />}
          color="text-neon-red"
          sub={totalPreds > 0 ? `${Math.round((underRecs / totalPreds) * 100)}%` : "—"}
        />
        <StatCard
          title="Services Online"
          value={
            [
              serviceStatus?.scraper?.status === "online" ? 1 : 0,
              serviceStatus?.engine?.status === "online" ? 1 : 0,
              1,
            ].reduce((a, b) => a + b, 0)
          }
          icon={<Wifi className="w-4 h-4 text-neon-cyan" />}
          color="text-neon-cyan"
          sub="of 3 services"
        />
      </div>

      {/* Row 2: Live Event Feed + Service Health cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveEventFeed events={feedEvents} loading={feedLoading} />
        <div className="space-y-3">
          <ServiceHealthCard
            label="FlashScore Scraper"
            icon={<Search className="w-4 h-4 text-neon-cyan" />}
            status={serviceStatus?.scraper?.status || "offline"}
            lastRun={serviceStatus?.scraper?.lastRun || null}
          />
          <ServiceHealthCard
            label="ScoreWise Engine"
            icon={<Cpu className="w-4 h-4 text-neon-green" />}
            status={serviceStatus?.engine?.status || "offline"}
            predictions={serviceStatus?.engine?.predictions ?? 0}
          />
          <ServiceHealthCard
            label="Website (Vercel)"
            icon={<Globe className="w-4 h-4 text-neon-yellow" />}
            status="online"
          />
        </div>
      </div>

      {/* Row 3: Pipeline flow */}
      <PipelineFlow
        scrapeCount={serviceStatus?.scraper?.lastRun?.complete_matches ?? 0}
        ingestCount={serviceStatus?.engine?.predictions ?? 0}
        predictCount={totalPreds}
        pushCount={totalPreds}
      />

      {/* Row 4: Compact recent predictions table */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-neon-cyan" />
              Recent Predictions
              <span className="text-[10px] text-muted-foreground font-normal">
                click any row for full pipeline detail
              </span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAllPredictions}
              disabled={loadingPred}
              className="gap-1 text-xs text-muted-foreground"
            >
              <RefreshCw className={`w-3 h-3 ${loadingPred ? "animate-spin" : ""}`} />
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            {loadingPred ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full bg-muted/30" />
                ))}
              </div>
            ) : preds.length === 0 ? (
              <div className="empty-state py-12">
                <Database className="empty-state-icon" />
                <p className="empty-state-title">No predictions yet</p>
                <p className="empty-state-subtitle">Run a scrape to populate the pipeline</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs">Match</TableHead>
                    <TableHead className="text-xs">Teams</TableHead>
                    <TableHead className="text-xs">Rec</TableHead>
                    <TableHead className="text-xs">Conf</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Line</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Avg Rate</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">A/B</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preds.map((p) => (
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
                      <TableCell className="text-neon-cyan font-mono text-xs whitespace-nowrap">
                        {p.bookmaker_line ?? "—"}
                      </TableCell>
                      <TableCell className={`font-mono text-xs whitespace-nowrap ${p.average_rate >= 7 ? "text-neon-green" : p.average_rate <= -7 ? "text-neon-red" : "text-muted-foreground"}`}>
                        {p.average_rate.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className="text-neon-green">{p.matches_above}</span>/<span className="text-neon-red">{p.matches_below}</span>
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
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}
