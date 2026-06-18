/**
 * AnalyticsTab — prediction analytics with charts.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Shows pie charts (Success/Failed, Confidence, OVER/UNDER), bar chart
 * (H2H total points distribution), area chart (average rate distribution),
 * radar chart (winning streak), a metrics summary card, and a per-prediction
 * H2H detail table.
 */

"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import {
  CheckCircle2,
  Shield,
  TrendingUp,
  BarChart2,
  Percent,
  Target,
  Gauge,
  Layers,
} from "lucide-react";
import type { Prediction } from "@/lib/types";

const CHART_COLORS = {
  green: "#00ff88",
  red: "#ff3366",
  yellow: "#ffcc00",
  cyan: "#00ccff",
  purple: "#8855ff",
  greenMuted: "rgba(0,255,136,0.15)",
  redMuted: "rgba(255,51,102,0.15)",
  yellowMuted: "rgba(255,204,0,0.15)",
  cyanMuted: "rgba(0,204,255,0.15)",
};

export interface AnalyticsTabProps {
  preds: Prediction[];
  totalPreds: number;
  successCount: number;
  failCount: number;
  successRate: number;
  highConf: number;
  overRecs: number;
  underRecs: number;
}

export function AnalyticsTab({
  preds,
  totalPreds,
  successCount,
  failCount,
  successRate,
  highConf,
  overRecs,
  underRecs,
}: AnalyticsTabProps) {
  const successPieData = useMemo(
    () => [
      { name: "Success", value: successCount, color: CHART_COLORS.green },
      { name: "Failed", value: failCount, color: CHART_COLORS.red },
    ],
    [successCount, failCount],
  );

  const confPieData = useMemo(
    () => [
      { name: "HIGH", value: highConf, color: CHART_COLORS.green },
      {
        name: "MEDIUM",
        value: preds.filter((p) => p.confidence?.toUpperCase() === "MEDIUM").length,
        color: CHART_COLORS.yellow,
      },
      {
        name: "LOW",
        value: preds.filter((p) => p.confidence?.toUpperCase() === "LOW").length,
        color: CHART_COLORS.red,
      },
    ],
    [preds, highConf],
  );

  const recPieData = useMemo(
    () => [
      { name: "OVER", value: overRecs, color: CHART_COLORS.green },
      { name: "UNDER", value: underRecs, color: CHART_COLORS.red },
    ],
    [overRecs, underRecs],
  );

  const h2hDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    preds.forEach((p) => {
      if (p.h2h_totals)
        p.h2h_totals.forEach((v) => {
          const bucket = `${Math.floor(v / 10) * 10}-${Math.floor(v / 10) * 10 + 9}`;
          buckets[bucket] = (buckets[bucket] || 0) + 1;
        });
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([range, count]) => ({ range, count }));
  }, [preds]);

  const rateDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    preds.forEach((p) => {
      const rounded = Math.round(p.average_rate);
      const label = rounded.toString();
      buckets[label] = (buckets[label] || 0) + 1;
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([rate, count]) => ({ rate, count }));
  }, [preds]);

  const radarData = useMemo(() => {
    const p = preds.find((p) => p.winning_streak_data);
    if (!p?.winning_streak_data) return [];
    const ws = p.winning_streak_data;
    return [
      { metric: "Home H2H Wins", value: ws.home_team_h2h_wins, full: ws.total_h2h_matches },
      { metric: "Away H2H Wins", value: ws.away_team_h2h_wins, full: ws.total_h2h_matches },
      { metric: "Home Recent", value: ws.home_team_recent_wins, full: 5 },
      { metric: "Away Recent", value: ws.away_team_recent_wins, full: 5 },
      { metric: "Home Streak", value: ws.home_team_winning_streak, full: 5 },
      { metric: "Away Streak", value: ws.away_team_winning_streak, full: 5 },
    ];
  }, [preds]);

  const renderCustomLabel = ({
    name,
    percent,
  }: {
    name: string;
    percent: number;
  }) => `${name} ${(percent * 100).toFixed(0)}%`;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Prediction Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Visual breakdown of prediction performance and patterns
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-neon-green" /> Success vs Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={successPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={renderCustomLabel}
                  labelLine={false}
                  fontSize={11}
                >
                  {successPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-neon-yellow" /> Confidence Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={confPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={renderCustomLabel}
                  labelLine={false}
                  fontSize={11}
                >
                  {confPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-neon-green" /> OVER vs UNDER
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={recPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={renderCustomLabel}
                  labelLine={false}
                  fontSize={11}
                >
                  {recPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-neon-cyan" /> H2H Total Points Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={h2hDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#8888a0" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8888a0" }} />
                <RTooltip
                  contentStyle={{
                    background: "#12121a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" fill={CHART_COLORS.cyan} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Percent className="w-4 h-4 text-neon-green" /> Average Rate Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={rateDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="rate" tick={{ fontSize: 10, fill: "#8888a0" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8888a0" }} />
                <RTooltip
                  contentStyle={{
                    background: "#12121a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={CHART_COLORS.green}
                  fill={CHART_COLORS.greenMuted}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {radarData.length > 0 && (
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-neon-cyan" /> Winning Streak Radar
              </CardTitle>
              <CardDescription>Latest prediction with streak data</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 9, fill: "#8888a0" }}
                  />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar
                    name="Value"
                    dataKey="value"
                    stroke={CHART_COLORS.cyan}
                    fill={CHART_COLORS.cyanMuted}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-neon-cyan" /> Prediction Metrics
            </CardTitle>
            <CardDescription>
              Key performance indicators across all predictions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Success Rate</span>
                <span className="font-mono font-bold text-neon-green">
                  {successRate}%
                </span>
              </div>
              <Progress value={successRate} className="h-2 [&>div]:bg-neon-green" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">High Confidence Rate</span>
                <span className="font-mono font-bold text-neon-green">
                  {totalPreds > 0 ? Math.round((highConf / totalPreds) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={totalPreds > 0 ? (highConf / totalPreds) * 100 : 0}
                className="h-2 [&>div]:bg-neon-green"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">UNDER Prediction Rate</span>
                <span className="font-mono font-bold text-neon-red">
                  {totalPreds > 0 ? Math.round((underRecs / totalPreds) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={totalPreds > 0 ? (underRecs / totalPreds) * 100 : 0}
                className="h-2 [&>div]:bg-neon-red"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">OVER Prediction Rate</span>
                <span className="font-mono font-bold text-neon-green">
                  {totalPreds > 0 ? Math.round((overRecs / totalPreds) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={totalPreds > 0 ? (overRecs / totalPreds) * 100 : 0}
                className="h-2 [&>div]:bg-neon-green"
              />
            </div>
            <Separator className="bg-border/30" />
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Total H2H Games
                </p>
                <p className="text-xl font-black text-neon-cyan">{totalPreds}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Below Line Rate
                </p>
                <p className="text-xl font-black text-neon-red">
                  {preds.length > 0
                    ? Math.round(
                        (preds.reduce((s, p) => s + p.matches_below, 0) /
                          preds.reduce(
                            (s, p) => s + p.matches_above + p.matches_below,
                            0,
                          )) *
                          100,
                      )
                    : 0}
                  %
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {preds.some((p) => p.h2h_totals && p.h2h_totals.length > 0) && (
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-neon-cyan" /> H2H Match Details
            </CardTitle>
            <CardDescription>
              Individual historical match totals per prediction
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs">Match</TableHead>
                    <TableHead className="text-xs">Line</TableHead>
                    <TableHead className="text-xs">H2H Totals</TableHead>
                    <TableHead className="text-xs">Above</TableHead>
                    <TableHead className="text-xs">Below</TableHead>
                    <TableHead className="text-xs">Rate Values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preds
                    .filter((p) => p.h2h_totals && p.h2h_totals.length > 0)
                    .map((p) => (
                      <TableRow
                        key={p.match_id}
                        className="border-border/20 hover:bg-card/80"
                      >
                        <TableCell className="font-mono text-xs">
                          {p.match_id.slice(0, 12)}
                        </TableCell>
                        <TableCell className="text-neon-cyan font-semibold">
                          {p.bookmaker_line}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {p.h2h_totals.join(", ")}
                        </TableCell>
                        <TableCell className="text-xs text-neon-green">
                          {p.matches_above}
                        </TableCell>
                        <TableCell className="text-xs text-neon-red">
                          {p.matches_below}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {p.rate_values.map((v) => v.toFixed(1)).join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </>
  );
}
