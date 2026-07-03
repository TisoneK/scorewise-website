/**
 * PredictionDetailDrawer — slide-in panel showing full detail for a prediction.
 *
 * Extracted from src/app/page.tsx during Phase B modularization.
 *
 * Triggered by clicking any prediction row on the Overview or Predictions tabs.
 * Shows the full 10-step pipeline timeline, numerical inputs, H2H totals,
 * rate values, validation errors, and the raw JSON dump.
 *
 * Also includes an editable "Betslip Code" section at the top — admins paste
 * a Linebet/Paripesa/1xbet booking code here, and it shows up in the footer
 * of every PredictionCard for that match (with a copy-to-clipboard button).
 */

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
  Activity as ActivityIcon,
  Percent,
  BarChart2,
  Layers,
  TestTube,
  TrendingUp,
  Target,
  Trophy,
  Shield,
  GitBranch,
  Database,
  FileText,
  Ticket,
  Save,
  ExternalLink,
  Coins,
  Clock,
} from "lucide-react";
import type { Prediction } from "@/lib/types";
import { BasketballIcon } from "./icons";
import { ConfidenceBadge, RecommendationBadge } from "./badges";
import { relativeTime } from "@/lib/admin/formatters";

export function PredictionDetailDrawer({
  prediction,
  onClose,
}: {
  prediction: Prediction | null;
  onClose: () => void;
}) {
  // Betslip code editor state — must be declared before the early return so
  // React's hook rules are satisfied (hooks can't be conditional).
  const [betCodeInput, setBetCodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "h2h" | "odds" | "result" | "pipeline">("overview");

  // Reset input + tab when the drawer opens to a different prediction.
  useEffect(() => {
    setBetCodeInput(prediction?.bet_code || "");
    setSaveMsg(null);
    setActiveTab("overview");
  }, [prediction?.match_id, prediction?.bet_code]);

  if (!prediction) return null;

  const saveBetCode = async () => {
    if (!prediction) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/predictions/bet-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: prediction.match_id, betCode: betCodeInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSaveMsg({ kind: "ok", text: "Saved — users will see this code on the prediction card." });
      // Optimistically update the local prediction object so the card UI reflects the change immediately.
      prediction.bet_code = betCodeInput.trim() || null;
    } catch (e) {
      setSaveMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      num: "01",
      name: "Validate",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      status: prediction.validation_errors.length === 0 ? "ok" : "warn",
      detail:
        prediction.validation_errors.length === 0
          ? "All checks passed"
          : `${prediction.validation_errors.length} validation issue(s)`,
    },
    {
      num: "02",
      name: "H2H Totals",
      icon: <ActivityIcon className="w-3.5 h-3.5" />,
      status: "ok",
      detail: `${prediction.h2h_totals.length} H2H match(es) collected`,
    },
    {
      num: "03",
      name: "Rate Values",
      icon: <Percent className="w-3.5 h-3.5" />,
      status: "ok",
      detail: `${prediction.rate_values.length} rate value(s) computed`,
    },
    {
      num: "04",
      name: "Average Rate",
      icon: <BarChart2 className="w-3.5 h-3.5" />,
      status: "ok",
      detail: `Average: ${prediction.average_rate.toFixed(2)}`,
    },
    {
      num: "05",
      name: "Match Counting",
      icon: <Layers className="w-3.5 h-3.5" />,
      status: "ok",
      detail: `${prediction.matches_above} above / ${prediction.matches_below} below line`,
    },
    {
      num: "06",
      name: "Test Adjustments",
      icon: <TestTube className="w-3.5 h-3.5" />,
      status: "ok",
      detail: `+${prediction.increment_test} / -${prediction.decrement_test}`,
    },
    {
      num: "07",
      name: "Winning Patterns",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      status: prediction.winning_streak_data ? "ok" : "warn",
      detail: prediction.winning_streak_data
        ? "Pattern data collected"
        : "No streak data",
    },
    {
      num: "08",
      name: "Recommendation",
      icon: <Target className="w-3.5 h-3.5" />,
      status: prediction.recommendation ? "ok" : "warn",
      detail: prediction.recommendation || "No recommendation",
    },
    {
      num: "09",
      name: "Team Winner",
      icon: <Trophy className="w-3.5 h-3.5" />,
      status: prediction.team_winner ? "ok" : "warn",
      detail: prediction.team_winner || "No winner predicted",
    },
    {
      num: "10",
      name: "Confidence",
      icon: <Shield className="w-3.5 h-3.5" />,
      status: prediction.confidence ? "ok" : "warn",
      detail: prediction.confidence || "No confidence level",
    },
  ];

  const stepColor = (s: string) =>
    s === "ok"
      ? "text-neon-green border-neon-green/40 bg-neon-green/5"
      : s === "warn"
        ? "text-neon-yellow border-neon-yellow/40 bg-neon-yellow/5"
        : "text-destructive border-destructive/40 bg-destructive/5";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-card border-l border-border/40 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <BasketballIcon className="w-5 h-5 text-neon-green shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold truncate">
                  {prediction.home_team || "Unknown"} vs {prediction.away_team || "Unknown"}
                </h2>
                <a
                  href={`https://www.flashscore.co.ke/match/${prediction.match_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/40 hover:text-neon-cyan transition-colors shrink-0"
                  title="Open match on Flashscore"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {prediction.match_id}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/40 bg-background/30 overflow-x-auto">
          {([
            { key: "overview", label: "Overview", icon: <ActivityIcon className="w-3 h-3" /> },
            { key: "h2h", label: "H2H Matches", icon: <Layers className="w-3 h-3" /> },
            { key: "odds", label: "Odds", icon: <Coins className="w-3 h-3" /> },
            { key: "result", label: "Result", icon: <Trophy className="w-3 h-3" /> },
            { key: "pipeline", label: "Pipeline", icon: <GitBranch className="w-3 h-3" /> },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-neon-green/10 text-neon-green border border-neon-green/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body — tabbed content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">

          {/* ════════ OVERVIEW TAB ════════ */}
          {activeTab === "overview" && (
            <>
            {/* Top summary cards */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">Recommendation</p>
                <RecommendationBadge rec={prediction.recommendation} />
              </div>
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">Confidence</p>
                <ConfidenceBadge level={prediction.confidence} />
              </div>
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">Line</p>
                <p className="text-xs font-mono text-neon-cyan">{prediction.bookmaker_line ?? "—"}</p>
              </div>
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">Status</p>
                {prediction.success ? (
                  <Badge variant="outline" className="text-[9px] border-neon-green/30 text-neon-green">OK</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] border-neon-red/30 text-neon-red">ERR</Badge>
                )}
              </div>
            </div>

            {/* Match info */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <ActivityIcon className="w-3 h-3" /> Match Info
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">League</span>
                  <p className="font-medium truncate">{prediction.league || "—"}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Country</span>
                  <p className="font-medium truncate">{prediction.country || "—"}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-mono">{prediction.date || "—"}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Time</span>
                  <p className="font-mono">{prediction.time || "—"}</p>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Quick Stats
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-background/50 rounded p-2 border border-border/40 text-center">
                  <p className="text-[9px] text-muted-foreground">Avg Rate</p>
                  <p className={`font-mono font-bold ${prediction.average_rate >= 7 ? "text-neon-green" : prediction.average_rate <= -7 ? "text-neon-red" : "text-foreground"}`}>{prediction.average_rate.toFixed(2)}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40 text-center">
                  <p className="text-[9px] text-muted-foreground">Above/Below</p>
                  <p className="font-mono"><span className="text-neon-green">{prediction.matches_above}</span>/<span className="text-neon-red">{prediction.matches_below}</span></p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40 text-center">
                  <p className="text-[9px] text-muted-foreground">Tests ±/∓</p>
                  <p className="font-mono">{prediction.increment_test}/{prediction.decrement_test}</p>
                </div>
              </div>
            </div>

            {/* Betslip Code editor */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Ticket className="w-3 h-3" /> Betslip Code
              </h3>
              <div className="bg-background/50 rounded p-2 border border-border/40 space-y-2">
                <div className="flex gap-2">
                  <Input value={betCodeInput} onChange={(e) => setBetCodeInput(e.target.value)} placeholder="e.g. SD:OP-12345" className="font-mono text-xs h-8 bg-background" disabled={saving} />
                  <Button size="sm" variant="default" onClick={saveBetCode} disabled={saving} className="h-8 gap-1 shrink-0">
                    <Save className="w-3 h-3" />{saving ? "Saving..." : "Save"}
                  </Button>
                </div>
                {saveMsg && <p className={`text-[10px] ${saveMsg.kind === "ok" ? "text-neon-green" : "text-neon-red"}`}>{saveMsg.text}</p>}
              </div>
            </div>
            </>
          )}

          {/* ════════ H2H MATCHES TAB ════════ */}
          {activeTab === "h2h" && (
            <>
            {/* H2H Winning Patterns */}
            {prediction.winning_streak_data && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> H2H Winning Patterns
                </h3>
                <div className="bg-background/50 rounded p-3 border border-border/40 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground truncate mb-1">{prediction.home_team || "Home"}</p>
                      <p className="text-2xl font-black font-mono text-neon-green">{prediction.winning_streak_data.home_team_h2h_wins}W</p>
                      <p className="text-[9px] text-muted-foreground/60">streak: {prediction.winning_streak_data.home_team_winning_streak}</p>
                      <p className="text-[9px] text-muted-foreground/60">recent: {prediction.winning_streak_data.home_team_recent_wins}/3</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground truncate mb-1">{prediction.away_team || "Away"}</p>
                      <p className="text-2xl font-black font-mono text-neon-red">{prediction.winning_streak_data.away_team_h2h_wins}W</p>
                      <p className="text-[9px] text-muted-foreground/60">streak: {prediction.winning_streak_data.away_team_winning_streak}</p>
                      <p className="text-[9px] text-muted-foreground/60">recent: {prediction.winning_streak_data.away_team_recent_wins}/3</p>
                    </div>
                  </div>
                  <div className="text-center text-[10px] text-muted-foreground/60 pt-2 border-t border-border/20">
                    {prediction.winning_streak_data.total_h2h_matches} total H2H matches
                  </div>
                </div>
              </div>
            )}

            {/* H2H Matches — Flashscore-style breakdown */}
            {prediction.h2h_totals.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Previous Meetings — {prediction.h2h_totals.length} H2H matches
                </h3>
                <div className="bg-background/50 rounded border border-border/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30 text-[10px] text-muted-foreground">
                        <th className="text-left p-2">#</th>
                        <th className="text-left p-2">Matchup</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-right p-2">Line</th>
                        <th className="text-right p-2">Diff</th>
                        <th className="text-right p-2">O/U</th>
                        <th className="text-right p-2">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prediction.h2h_totals.map((total, i) => {
                        const line = prediction.bookmaker_line ?? 0;
                        const diff = total - line;
                        const isOver = total > line;
                        const rateValue = prediction.rate_values[i];
                        const isMostRecent = i === prediction.h2h_totals.length - 1;
                        return (
                          <tr key={i} className={`border-b border-border/10 hover:bg-card/40 ${isMostRecent ? "bg-neon-cyan/5" : ""}`}>
                            <td className="p-2 text-muted-foreground font-mono text-[10px]">
                              {i + 1}{isMostRecent && <span className="text-neon-cyan ml-1">←</span>}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] truncate max-w-[100px]">{prediction.home_team || "Home"}</span>
                                <span className="text-muted-foreground/40 text-[9px]">vs</span>
                                <span className="text-[10px] truncate max-w-[100px]">{prediction.away_team || "Away"}</span>
                              </div>
                              <p className="text-[8px] text-muted-foreground/50 truncate">{prediction.league || ""} · {prediction.country || ""}</p>
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-sm">{total}</td>
                            <td className="p-2 text-right font-mono text-muted-foreground">{line}</td>
                            <td className={`p-2 text-right font-mono ${diff > 0 ? "text-neon-green" : diff < 0 ? "text-neon-red" : "text-muted-foreground"}`}>
                              {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                            </td>
                            <td className="p-2 text-right">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isOver ? "text-neon-green bg-neon-green/10" : "text-neon-red bg-neon-red/10"}`}>
                                {isOver ? "OVER" : "UNDER"}
                              </span>
                            </td>
                            <td className={`p-2 text-right font-mono text-[10px] ${rateValue > 0 ? "text-neon-green" : rateValue < 0 ? "text-neon-red" : "text-muted-foreground"}`}>
                              {rateValue > 0 ? "+" : ""}{rateValue.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const avgLine = prediction.bookmaker_line ?? 0;
                        const avgTotal = prediction.h2h_totals.reduce((a, b) => a + b, 0) / prediction.h2h_totals.length;
                        const avgRate = prediction.rate_values.length > 0 ? prediction.rate_values.reduce((a, b) => a + b, 0) / prediction.rate_values.length : 0;
                        return (
                          <tr className="border-t-2 border-border/30 bg-background/30">
                            <td colSpan={2} className="p-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Summary</td>
                            <td className="p-2 text-right font-mono font-bold text-sm">{avgTotal.toFixed(1)}</td>
                            <td className="p-2 text-right font-mono text-muted-foreground">{avgLine}</td>
                            <td className="p-2 text-right font-mono text-muted-foreground">{(avgTotal - avgLine).toFixed(1)}</td>
                            <td className="p-2 text-right"><span className="text-[9px] text-muted-foreground">{prediction.matches_above}O/{prediction.matches_below}U</span></td>
                            <td className="p-2 text-right font-mono text-[10px] text-muted-foreground">avg: {avgRate.toFixed(1)}</td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
                <p className="text-[9px] text-muted-foreground/50 mt-1.5">
                  Most recent match highlighted · Ordered oldest → newest · Summary row shows averages
                </p>
              </div>
            )}

            {/* Rate values array */}
            {prediction.rate_values.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Percent className="w-3 h-3" /> Rate Values
                </h3>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <div className="flex flex-wrap gap-1">
                    {prediction.rate_values.map((rv, i) => (
                      <span key={i} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${rv > 0 ? "text-neon-green bg-neon-green/5" : rv < 0 ? "text-neon-red bg-neon-red/5" : "text-muted-foreground"}`}>
                        {rv > 0 ? "+" : ""}{rv.toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </>
          )}

          {/* ════════ ODDS TAB ════════ */}
          {activeTab === "odds" && (
            <>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Coins className="w-3 h-3" /> All Odds & Alternative Lines
              </h3>
              <div className="bg-background/50 rounded p-3 border border-border/40 space-y-3">
                {/* Standard O/U */}
                <div className="grid grid-cols-4 gap-2 text-xs items-center pb-2 border-b border-border/20">
                  <span className="text-muted-foreground">Standard</span>
                  <div className="text-center"><p className="text-[9px] text-muted-foreground">OVER</p><p className="font-mono text-neon-green font-bold">{prediction.over_odds ?? "—"}</p></div>
                  <div className="text-center"><p className="text-[9px] text-muted-foreground">LINE</p><p className="font-mono text-neon-cyan font-bold text-sm">{prediction.bookmaker_line ?? "—"}</p></div>
                  <div className="text-center"><p className="text-[9px] text-muted-foreground">UNDER</p><p className="font-mono text-neon-red font-bold">{prediction.under_odds ?? "—"}</p></div>
                </div>
                {/* Reduced-risk OVER */}
                {prediction.reduced_over_total != null && (
                  <div className="grid grid-cols-4 gap-2 text-xs items-center pb-2 border-b border-border/20">
                    <span className="text-neon-green font-bold">Reduced OVER</span>
                    <div className="text-center"><p className="text-[9px] text-muted-foreground">ODDS</p><p className="font-mono text-neon-green">{prediction.reduced_over_odds ?? "—"}</p></div>
                    <div className="text-center"><p className="text-[9px] text-muted-foreground">LINE</p><p className="font-mono text-neon-green font-bold text-sm">{prediction.reduced_over_total}</p></div>
                    <div className="text-center"><p className="text-[9px] text-muted-foreground">SHIFT</p><p className="font-mono text-muted-foreground">{(prediction.reduced_over_total - (prediction.bookmaker_line || 0)).toFixed(1)}</p></div>
                  </div>
                )}
                {/* Reduced-risk UNDER */}
                {prediction.reduced_under_total != null && (
                  <div className="grid grid-cols-4 gap-2 text-xs items-center pb-2 border-b border-border/20">
                    <span className="text-neon-red font-bold">Reduced UNDER</span>
                    <div className="text-center"><p className="text-[9px] text-muted-foreground">SHIFT</p><p className="font-mono text-muted-foreground">{(prediction.reduced_under_total - (prediction.bookmaker_line || 0)).toFixed(1)}</p></div>
                    <div className="text-center"><p className="text-[9px] text-muted-foreground">LINE</p><p className="font-mono text-neon-red font-bold text-sm">{prediction.reduced_under_total}</p></div>
                    <div className="text-center"><p className="text-[9px] text-muted-foreground">ODDS</p><p className="font-mono text-neon-red">{prediction.reduced_under_odds ?? "—"}</p></div>
                  </div>
                )}
                {/* 1X2 */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="text-center bg-background/40 rounded p-2">
                    <p className="text-[9px] text-muted-foreground">HOME (1)</p>
                    <p className="font-mono font-bold text-lg">{prediction.home_odds ?? "—"}</p>
                    <p className="text-[9px] text-muted-foreground/60 truncate">{prediction.home_team || ""}</p>
                  </div>
                  <div className="text-center bg-background/40 rounded p-2">
                    <p className="text-[9px] text-muted-foreground">AWAY (2)</p>
                    <p className="font-mono font-bold text-lg">{prediction.away_odds ?? "—"}</p>
                    <p className="text-[9px] text-muted-foreground/60 truncate">{prediction.away_team || ""}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 1X2 Prediction */}
            {prediction.team_winner && prediction.team_winner !== "NO_WINNER_PREDICTION" && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> 1X2 Prediction
                </h3>
                <div className="bg-background/50 rounded p-3 border border-border/40 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Predicted Winner:</span>
                    <span className="font-bold text-neon-cyan">
                      {prediction.team_winner === "HOME_TEAM" ? prediction.home_team : prediction.team_winner === "AWAY_TEAM" ? prediction.away_team : prediction.team_winner}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Confidence:</span>
                    <ConfidenceBadge level={prediction.team_winner_confidence} />
                  </div>
                </div>
              </div>
            )}
            </>
          )}

          {/* ════════ RESULT TAB ════════ */}
          {activeTab === "result" && (
            <>
            {prediction.result_status && prediction.result_status !== "PENDING" ? (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> Match Result
                </h3>
                <div className="bg-background/50 rounded p-3 border border-border/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <Badge variant="outline" className={`text-[9px] ${prediction.result_status === "FINAL" ? "border-neon-green/30 text-neon-green" : prediction.result_status === "LIVE" ? "border-neon-red/30 text-neon-red" : "border-border/40"}`}>
                      {prediction.result_status}
                    </Badge>
                  </div>
                  {prediction.home_score != null && prediction.away_score != null && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground truncate">{prediction.home_team || "Home"}</p>
                          <p className="text-3xl font-black font-mono">{prediction.home_score}</p>
                        </div>
                        <div className="flex items-center justify-center">
                          <span className="text-muted-foreground/40 text-lg">-</span>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground truncate">{prediction.away_team || "Away"}</p>
                          <p className="text-3xl font-black font-mono">{prediction.away_score}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border/20">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Total</p>
                          <p className="font-mono font-bold">{Number(prediction.home_score) + Number(prediction.away_score)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Line</p>
                          <p className="font-mono">{prediction.bookmaker_line}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Diff</p>
                          <p className={`font-mono ${(Number(prediction.home_score) + Number(prediction.away_score) - (prediction.bookmaker_line || 0)) >= 0 ? "text-neon-green" : "text-neon-red"}`}>
                            {(Number(prediction.home_score) + Number(prediction.away_score) - (prediction.bookmaker_line || 0)).toFixed(1)}
                          </p>
                        </div>
                      </div>
                      {prediction.result_updated_at && (
                        <p className="text-[10px] text-muted-foreground/60 text-center">Updated: {relativeTime(prediction.result_updated_at)}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No result yet</p>
                <p className="text-xs text-muted-foreground/50">Match hasn't been played or result not scraped</p>
              </div>
            )}
            </>
          )}

          {/* ════════ PIPELINE TAB ════════ */}
          {activeTab === "pipeline" && (
            <>
            {/* 10-step pipeline timeline */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <GitBranch className="w-3 h-3" /> 10-Step Pipeline
              </h3>
              <div className="space-y-1.5">
                {steps.map((s, i) => (
                  <div key={s.num} className="flex items-center gap-2">
                    <div className="relative flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full border-2 ${stepColor(s.status)} flex items-center justify-center text-[10px] font-bold`}>
                        {s.num}
                      </div>
                      {i < steps.length - 1 && <div className="absolute top-7 w-0.5 h-3 bg-border/40" />}
                    </div>
                    <div className="flex-1 flex items-center justify-between gap-2 pb-3">
                      <div className="flex items-center gap-2">{s.icon}<span className="text-xs font-medium">{s.name}</span></div>
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[60%] text-right">{s.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Numerical inputs */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Database className="w-3 h-3" /> Numerical Inputs
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-background/50 rounded p-2 border border-border/40"><span className="text-muted-foreground">Average rate</span><p className="font-mono text-neon-green">{prediction.average_rate.toFixed(3)}</p></div>
                <div className="bg-background/50 rounded p-2 border border-border/40"><span className="text-muted-foreground">Bookmaker line</span><p className="font-mono text-neon-cyan">{prediction.bookmaker_line ?? "—"}</p></div>
                <div className="bg-background/50 rounded p-2 border border-border/40"><span className="text-muted-foreground">Above line</span><p className="font-mono">{prediction.matches_above}</p></div>
                <div className="bg-background/50 rounded p-2 border border-border/40"><span className="text-muted-foreground">Below line</span><p className="font-mono">{prediction.matches_below}</p></div>
                <div className="bg-background/50 rounded p-2 border border-border/40"><span className="text-muted-foreground">Increment test</span><p className="font-mono">{prediction.increment_test}</p></div>
                <div className="bg-background/50 rounded p-2 border border-border/40"><span className="text-muted-foreground">Decrement test</span><p className="font-mono">{prediction.decrement_test}</p></div>
              </div>
            </div>

            {/* Validation errors */}
            {prediction.validation_errors.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Validation Errors
                </h3>
                <div className="bg-destructive/5 border border-destructive/30 rounded p-2 space-y-1">
                  {prediction.validation_errors.map((e, i) => <p key={i} className="text-[11px] font-mono text-destructive">{e}</p>)}
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Raw JSON
              </h3>
              <pre className="bg-background/50 rounded p-2 border border-border/40 text-[10px] font-mono overflow-auto max-h-96 text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(prediction, null, 2)}
              </pre>
            </div>
            </>
          )}

          </div>
        </ScrollArea>
        {/* Footer */}
        <div className="p-3 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-mono">
            Created:{" "}
            {prediction.created_at ? relativeTime(prediction.created_at) : "—"}
          </span>
          <span className="font-mono">Scope: {prediction.scope}</span>
        </div>
      </div>
    </>
  );
}
