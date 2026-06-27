"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, Coins, Flame, Snowflake, Activity, TrendingUp } from "lucide-react";

/**
 * Shape returned by `/api/analytics` for public users.
 * Both `totals` and `winner` use this shape.
 */
interface PublicStats {
  totalPredictions: number; resolved: number; pending: number;
  wins: number; losses: number; pushes: number;
  hitRate: number; roiPercent: number; totalStaked: number; totalProfit: number;
  currentStreak: { type: "W" | "L" | "P" | null; length: number };
  longestWinStreak: number; longestLossStreak: number;
  recentForm: ("W" | "L" | "P")[];
  byRecommendation: Record<"OVER" | "UNDER", { wins: number; losses: number; pushes: number; hitRate: number; profit: number; total: number; roiPercent: number; pending: number }>;
}

interface PublicStatsResponse {
  updated_at: string;
  role: string;
  totals: PublicStats;
  winner: PublicStats;
}

type AlgorithmKey = "totals" | "winner";

interface PublicStatsBannerProps {
  /** Which algorithm bucket to render. Defaults to "totals" (Over/Under). */
  algorithm?: AlgorithmKey;
}

const ALG_META: Record<AlgorithmKey, { title: string; subtitle: string; tone: string; iconBg: string; iconColor: string }> = {
  totals: {
    title: "Over / Under Track Record",
    subtitle: "Totals market — picks on OVER or UNDER the bookmaker line",
    tone: "border-neon-green/20",
    iconBg: "bg-neon-green/10 border border-neon-green/20",
    iconColor: "text-neon-green",
  },
  winner: {
    title: "Win Track Record",
    subtitle: "Moneyline / 1X2 — picks on HOME_TEAM or AWAY_TEAM winner",
    tone: "border-neon-cyan/20",
    iconBg: "bg-neon-cyan/10 border border-neon-cyan/20",
    iconColor: "text-neon-cyan",
  },
};

export function PublicStatsBanner({ algorithm = "totals" }: PublicStatsBannerProps) {
  const [data, setData] = useState<PublicStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchStats = useCallback(async () => {
    try { const res = await fetch("/api/analytics"); if (!res.ok) throw new Error(); const j = (await res.json()) as PublicStatsResponse; setData(j); setError(false); }
    catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchStats(); const id = setInterval(fetchStats, 5 * 60 * 1000); return () => clearInterval(id); }, [fetchStats]);

  const meta = ALG_META[algorithm];

  if (loading) return (
    <Card className={`bg-card/60 border-border/40 animate-pulse`}>
      <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({length:4}).map((_,i)=>(<div key={i} className="space-y-2"><div className="h-2.5 w-20 bg-muted/40 rounded" /><div className="h-6 w-16 bg-muted/40 rounded" /></div>))}
      </CardContent>
    </Card>
  );

  // Wrong shape (admin response, or older API without split) — don't render
  if (error || !data || !data[algorithm]) return null;

  const d = data[algorithm];
  // No resolved bets for this algorithm yet — hide the card entirely so users
  // don't see a blank "0% / 0W / 0L" panel for a market we haven't graded.
  if (d.resolved === 0) return null;

  const hitTone = d.hitRate >= 55 ? "text-neon-green" : d.hitRate >= 45 ? "text-neon-yellow" : "text-neon-red";
  const roiTone = d.roiPercent >= 0 ? "text-neon-green" : "text-neon-red";
  const st = d.currentStreak.type;
  const rf = d.recentForm.slice(-15);

  return (
    <Card className={`bg-gradient-to-br from-card/80 to-card/40 ${meta.tone}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-6 h-6 rounded-md ${meta.iconBg} flex items-center justify-center`}>
            <Activity className={`w-3.5 h-3.5 ${meta.iconColor}`} />
          </div>
          <h3 className="text-sm font-bold">{meta.title}</h3>
          <Badge variant="outline" className={`text-[9px] ${meta.tone} ${meta.iconColor} bg-${algorithm === "totals" ? "neon-green" : "neon-cyan"}/5`}>LIVE</Badge>
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{d.resolved} resolved · {d.pending} pending</span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 -mt-2 mb-3">{meta.subtitle}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-background/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1"><Target className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Hit Rate</span></div>
            <p className={`text-2xl font-black font-mono ${hitTone}`}>{d.hitRate.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground/70">{d.wins}W / {d.losses}L{d.pushes > 0 ? ` / ${d.pushes}P` : ""}</p>
          </div>
          <div className="bg-background/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1"><Coins className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">ROI (1u flat)</span></div>
            <p className={`text-2xl font-black font-mono ${roiTone}`}>{d.roiPercent >= 0 ? "+" : ""}{d.roiPercent.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground/70">{d.totalProfit >= 0 ? "+" : ""}{d.totalProfit.toFixed(2)}u on {d.totalStaked} bets</p>
          </div>
          <div className="bg-background/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {st === "W" ? <Flame className="w-3 h-3 text-neon-green" /> : st === "L" ? <Snowflake className="w-3 h-3 text-neon-red" /> : <Activity className="w-3 h-3 text-muted-foreground" />}
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Current Streak</span>
            </div>
            <p className={`text-2xl font-black font-mono ${st === "W" ? "text-neon-green" : st === "L" ? "text-neon-red" : st === "P" ? "text-neon-yellow" : "text-muted-foreground"}`}>{st ?? "—"}{d.currentStreak.length || ""}</p>
            <p className="text-[10px] text-muted-foreground/70">{st === "W" ? "Hot streak" : st === "L" ? "Cold streak — be cautious" : st === "P" ? "Push run" : "No resolved bets yet"}</p>
          </div>
          <div className="bg-background/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1"><TrendingUp className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Longest W Run</span></div>
            <p className="text-2xl font-black font-mono text-neon-green">{d.longestWinStreak}</p>
            <p className="text-[10px] text-muted-foreground/70">Longest L: {d.longestLossStreak}</p>
          </div>
        </div>

        {/* Per-recommendation breakdown — only meaningful for Over/Under (OVER vs UNDER).
            For winner, the engine stores HOME_TEAM/AWAY_TEAM inside team_winner, not
            inside byRecommendation, so this row is omitted for the winner card. */}
        {algorithm === "totals" && d.byRecommendation && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(["OVER", "UNDER"] as const).map((rec) => {
              const b = d.byRecommendation[rec];
              if (!b) return null;
              const tone = b.hitRate >= 55 ? "text-neon-green" : b.hitRate >= 45 ? "text-neon-yellow" : "text-neon-red";
              return (
                <div key={rec} className="bg-background/40 rounded-lg p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{rec}</p>
                    <p className="text-[10px] text-muted-foreground/70">{b.wins}W / {b.losses}L{b.pushes > 0 ? ` / ${b.pushes}P` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-base font-black font-mono ${tone}`}>{b.hitRate.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground/70">{b.profit >= 0 ? "+" : ""}{b.profit.toFixed(2)}u</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Recent Form</span>
            <span className="text-[10px] text-muted-foreground/60">last 15 (oldest → newest)</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {rf.length === 0 && <span className="text-[11px] text-muted-foreground/60">No form yet.</span>}
            {rf.map((r, i) => (
              <TooltipProvider key={i} delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`w-3 h-3 rounded-sm cursor-help ${r === "W" ? "bg-neon-green" : r === "L" ? "bg-neon-red" : "bg-neon-yellow/70"}`} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[10px]">{r === "W" ? "Win" : r === "L" ? "Loss" : "Push (refund)"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-1.5">Based on {d.resolved} resolved matches · updates every 5 min</p>
        </div>
      </CardContent>
    </Card>
  );
}
