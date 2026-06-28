"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, Coins, Flame, Snowflake, Activity, TrendingUp, ChevronDown } from "lucide-react";

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

const ALG_META: Record<AlgorithmKey, {
  title: string;
  shortTitle: string;
  subtitle: string;
  tone: string;
  iconBg: string;
  iconColor: string;
  accent: "neon-green" | "neon-cyan";
}> = {
  totals: {
    title: "Over / Under Track Record",
    shortTitle: "O/U Record",
    subtitle: "Totals market — picks on OVER or UNDER the bookmaker line",
    tone: "border-neon-green/20",
    iconBg: "bg-neon-green/10 border border-neon-green/20",
    iconColor: "text-neon-green",
    accent: "neon-green",
  },
  winner: {
    title: "1X2 Track Record",
    shortTitle: "1X2 Record",
    subtitle: "Moneyline / 1X2 — picks on HOME_TEAM or AWAY_TEAM winner",
    tone: "border-neon-cyan/20",
    iconBg: "bg-neon-cyan/10 border border-neon-cyan/20",
    iconColor: "text-neon-cyan",
    accent: "neon-cyan",
  },
};

export function PublicStatsBanner({ algorithm = "totals" }: PublicStatsBannerProps) {
  const [data, setData] = useState<PublicStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fetchStats = useCallback(async () => {
    try { const res = await fetch("/api/analytics"); if (!res.ok) throw new Error(); const j = (await res.json()) as PublicStatsResponse; setData(j); setError(false); }
    catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchStats(); const id = setInterval(fetchStats, 5 * 60 * 1000); return () => clearInterval(id); }, [fetchStats]);

  const meta = ALG_META[algorithm];

  if (loading) return (
    <Card className="bg-card/60 border-border/40 animate-pulse">
      <CardContent className="p-0">
        <div className="px-3 py-2 border-b border-border/20"><div className="h-3 w-32 bg-muted/40 rounded" /></div>
        <div className="px-3 py-3"><div className="h-4 w-full bg-muted/40 rounded" /></div>
        <div className="px-3 py-1.5 border-t border-border/20"><div className="h-2 w-24 bg-muted/40 rounded mx-auto" /></div>
      </CardContent>
    </Card>
  );

  if (error || !data || !data[algorithm]) return null;

  const d = data[algorithm];
  if (d.resolved === 0) return null;

  const hitTone = d.hitRate >= 55 ? "text-neon-green" : d.hitRate >= 45 ? "text-neon-yellow" : "text-neon-red";
  const roiTone = d.roiPercent >= 0 ? "text-neon-green" : "text-neon-red";
  const st = d.currentStreak.type;
  const streakTone = st === "W" ? "text-neon-green" : st === "L" ? "text-neon-red" : st === "P" ? "text-neon-yellow" : "text-muted-foreground";
  const streakIcon = st === "W" ? <Flame className="w-3 h-3 text-neon-green" /> : st === "L" ? <Snowflake className="w-3 h-3 text-neon-red" /> : null;

  // Recent form — last 5 in collapsed, last 15 in expanded
  const rfCollapsed = d.recentForm.slice(-5);
  const rfExpanded = d.recentForm.slice(-15);

  // Helper: render a row of recent-form dots
  const renderFormDots = (form: ("W"|"L"|"P")[], size: "sm"|"md") => {
    const dotSize = size === "sm" ? "w-2 h-2" : "w-3 h-3";
    if (form.length === 0) return <span className="text-[10px] text-muted-foreground/60">No form yet.</span>;
    return (
      <div className="flex flex-wrap items-center gap-1 justify-center">
        {form.map((r, i) => (
          <TooltipProvider key={i} delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`${dotSize} rounded-sm cursor-help ${r === "W" ? "bg-neon-green" : r === "L" ? "bg-neon-red" : "bg-neon-yellow/70"}`} />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px]">{r === "W" ? "Win" : r === "L" ? "Loss" : "Push (refund)"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    );
  };

  return (
    <Card className={`bg-gradient-to-br from-card/80 to-card/40 ${meta.tone} overflow-hidden`}>

      {/* ════════ HEADER ════════ */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border/20 cursor-pointer hover:bg-background/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-6 h-6 rounded-md ${meta.iconBg} flex items-center justify-center shrink-0`}>
          <Activity className={`w-3.5 h-3.5 ${meta.iconColor}`} />
        </div>
        <h3 className="text-xs sm:text-sm font-bold truncate">
          {expanded ? meta.title : meta.shortTitle}
        </h3>
        <Badge variant="outline" className={`text-[9px] ${meta.tone} ${meta.iconColor} bg-${meta.accent}/5 shrink-0`}>LIVE</Badge>
        <span className="text-[10px] text-muted-foreground/60 ml-auto hidden sm:inline shrink-0">
          {d.resolved} resolved
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* ════════ BODY ════════ */}
      {expanded ? (
        // ── EXPANDED BODY — full 4-tile grid ──
        <div className="p-3">
          <p className="text-[10px] text-muted-foreground/70 mb-3">{meta.subtitle}</p>
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
                {streakIcon || <Activity className="w-3 h-3 text-muted-foreground" />}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Current Streak</span>
              </div>
              <p className={`text-2xl font-black font-mono ${streakTone}`}>{st ?? "—"}{d.currentStreak.length || ""}</p>
              <p className="text-[10px] text-muted-foreground/70">{st === "W" ? "Hot streak" : st === "L" ? "Cold streak — be cautious" : st === "P" ? "Push run" : "No resolved bets yet"}</p>
            </div>
            <div className="bg-background/40 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1"><TrendingUp className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Longest W Run</span></div>
              <p className="text-2xl font-black font-mono text-neon-green">{d.longestWinStreak}</p>
              <p className="text-[10px] text-muted-foreground/70">Longest L: {d.longestLossStreak}</p>
            </div>
          </div>

          {/* Per-recommendation breakdown — totals only */}
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
        </div>
      ) : (
        // ── COLLAPSED BODY — compact 3-stat row ──
        // Uses flex-1 on each stat so they share width equally and the
        // STREAK column can't get pushed off-screen by floating overlays.
        // min-w-0 allows graceful shrinking on very narrow viewports.
        <div className="px-3 py-2.5">
          <div className="flex items-stretch gap-1">
            {/* Hit Rate */}
            <div className="text-center flex-1 min-w-0 py-1">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Hit Rate</p>
              <p className={`text-base font-black font-mono ${hitTone}`}>{d.hitRate.toFixed(1)}%</p>
            </div>
            <div className="w-px bg-border/30 self-stretch" />
            {/* ROI */}
            <div className="text-center flex-1 min-w-0 py-1">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">ROI</p>
              <p className={`text-base font-black font-mono ${roiTone}`}>{d.roiPercent >= 0 ? "+" : ""}{d.roiPercent.toFixed(1)}%</p>
            </div>
            <div className="w-px bg-border/30 self-stretch" />
            {/* Streak */}
            <div className="text-center flex-1 min-w-0 py-1">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Streak</p>
              <div className="flex items-center justify-center gap-0.5">
                {streakIcon}
                <p className={`text-base font-black font-mono ${streakTone}`}>{st ?? "—"}{d.currentStreak.length || ""}</p>
              </div>
            </div>
            <div className="w-px bg-border/30 self-stretch hidden sm:block" />
            {/* W/L summary — hidden on very small screens */}
            <div className="text-center flex-1 min-w-0 py-1 hidden sm:block">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Record</p>
              <p className="text-base font-black font-mono text-foreground">{d.wins}-{d.losses}{d.pushes > 0 ? `-${d.pushes}` : ""}</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════ FOOTER — recent form track (always visible) ════════ */}
      <div className="px-3 py-1.5 border-t border-border/20 bg-background/30">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold shrink-0 leading-none">
            Form
          </span>
          {expanded ? (
            <span className="text-[9px] text-muted-foreground/40 shrink-0 leading-none">last 15 (oldest → newest)</span>
          ) : (
            <span className="text-[9px] text-muted-foreground/40 shrink-0 leading-none">L5</span>
          )}
          <div className="flex-1 flex items-center justify-center gap-1">
            {renderFormDots(expanded ? rfExpanded : rfCollapsed, expanded ? "md" : "sm")}
          </div>
          {expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="text-[9px] text-muted-foreground hover:text-foreground underline shrink-0 leading-none"
            >
              collapse
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
