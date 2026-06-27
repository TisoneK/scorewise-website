"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, Coins, Flame, Snowflake, Activity, TrendingUp } from "lucide-react";

interface PublicStats {
  totalPredictions: number; resolved: number; pending: number;
  wins: number; losses: number; pushes: number;
  hitRate: number; roiPercent: number; totalStaked: number; totalProfit: number;
  currentStreak: { type: "W" | "L" | "P" | null; length: number };
  longestWinStreak: number; longestLossStreak: number;
  recentForm: ("W" | "L" | "P")[];
}

export function PublicStatsBanner() {
  const [data, setData] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchStats = useCallback(async () => {
    try { const res = await fetch("/api/analytics"); if (!res.ok) throw new Error(); const j = await res.json(); setData(j); setError(false); }
    catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchStats(); const id = setInterval(fetchStats, 5 * 60 * 1000); return () => clearInterval(id); }, [fetchStats]);
  if (loading) return (<Card className="bg-card/60 border-border/40 animate-pulse"><CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({length:4}).map((_,i)=>(<div key={i} className="space-y-2"><div className="h-2.5 w-20 bg-muted/40 rounded" /><div className="h-6 w-16 bg-muted/40 rounded" /></div>))}</CardContent></Card>);
  if (error || !data) return null;
  if (data.resolved === 0) return null;
  const hitTone = data.hitRate >= 55 ? "text-neon-green" : data.hitRate >= 45 ? "text-neon-yellow" : "text-neon-red";
  const roiTone = data.roiPercent >= 0 ? "text-neon-green" : "text-neon-red";
  const st = data.currentStreak.type;
  const rf = data.recentForm.slice(-15);
  return (
    <Card className="bg-gradient-to-br from-card/80 to-card/40 border-neon-green/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-neon-green/10 border border-neon-green/20 flex items-center justify-center"><Activity className="w-3.5 h-3.5 text-neon-green" /></div>
          <h3 className="text-sm font-bold">System Track Record</h3>
          <Badge variant="outline" className="text-[9px] border-neon-green/30 text-neon-green bg-neon-green/5">LIVE</Badge>
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{data.resolved} resolved · {data.pending} pending</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-background/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><Target className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Hit Rate</span></div><p className={`text-2xl font-black font-mono ${hitTone}`}>{data.hitRate.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground/70">{data.wins}W / {data.losses}L{data.pushes > 0 ? ` / ${data.pushes}P` : ""}</p></div>
          <div className="bg-background/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><Coins className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">ROI (1u flat)</span></div><p className={`text-2xl font-black font-mono ${roiTone}`}>{data.roiPercent >= 0 ? "+" : ""}{data.roiPercent.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground/70">{data.totalProfit >= 0 ? "+" : ""}{data.totalProfit.toFixed(2)}u on {data.totalStaked} bets</p></div>
          <div className="bg-background/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1">{st === "W" ? <Flame className="w-3 h-3 text-neon-green" /> : st === "L" ? <Snowflake className="w-3 h-3 text-neon-red" /> : <Activity className="w-3 h-3 text-muted-foreground" />}<span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Current Streak</span></div><p className={`text-2xl font-black font-mono ${st === "W" ? "text-neon-green" : st === "L" ? "text-neon-red" : st === "P" ? "text-neon-yellow" : "text-muted-foreground"}`}>{st ?? "—"}{data.currentStreak.length || ""}</p><p className="text-[10px] text-muted-foreground/70">{st === "W" ? "Hot streak" : st === "L" ? "Cold streak — be cautious" : st === "P" ? "Push run" : "No resolved bets yet"}</p></div>
          <div className="bg-background/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><TrendingUp className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Longest W Run</span></div><p className="text-2xl font-black font-mono text-neon-green">{data.longestWinStreak}</p><p className="text-[10px] text-muted-foreground/70">Longest L: {data.longestLossStreak}</p></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Recent Form</span><span className="text-[10px] text-muted-foreground/60">last 15 (oldest → newest)</span></div>
          <div className="flex flex-wrap gap-1">
            {rf.length === 0 && <span className="text-[11px] text-muted-foreground/60">No form yet.</span>}
            {rf.map((r, i) => (<TooltipProvider key={i} delayDuration={150}><Tooltip><TooltipTrigger asChild><span className={`w-3 h-3 rounded-sm cursor-help ${r === "W" ? "bg-neon-green" : r === "L" ? "bg-neon-red" : "bg-neon-yellow/70"}`} /></TooltipTrigger><TooltipContent side="top" className="text-[10px]">{r === "W" ? "Win" : r === "L" ? "Loss" : "Push (refund)"}</TooltipContent></Tooltip></TooltipProvider>))}
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-1.5">Based on {data.resolved} resolved matches · updates every 5 min</p>
        </div>
      </CardContent>
    </Card>
  );
}
