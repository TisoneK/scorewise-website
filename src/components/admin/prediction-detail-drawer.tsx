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

  // Reset input when the drawer opens to a different prediction.
  useEffect(() => {
    setBetCodeInput(prediction?.bet_code || "");
    setSaveMsg(null);
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
              <h2 className="text-sm font-bold truncate">
                {prediction.home_team || "Unknown"} vs {prediction.away_team || "Unknown"}
              </h2>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {prediction.match_id}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Top summary cards */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">
                  Recommendation
                </p>
                <RecommendationBadge rec={prediction.recommendation} />
              </div>
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">Confidence</p>
                <ConfidenceBadge level={prediction.confidence} />
              </div>
              <div className="bg-background/50 rounded-md p-2 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground">Line</p>
                <p className="text-xs font-mono text-neon-cyan">
                  {prediction.bookmaker_line ?? "—"}
                </p>
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

            {/* Betslip Code editor (admin sets the Linebet/Paripesa/1xbet booking code) */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Ticket className="w-3 h-3" />
                Betslip Code
              </h3>
              <div className="bg-background/50 rounded p-2 border border-border/40 space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Paste a booking code from <span className="text-foreground">Linebet</span>, <span className="text-foreground">Paripesa</span>, <span className="text-foreground">1xbet</span>, etc. Users will see it in the footer of the prediction card with a copy button.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={betCodeInput}
                    onChange={(e) => setBetCodeInput(e.target.value)}
                    placeholder="e.g. SD:OP-12345"
                    className="font-mono text-xs h-8 bg-background"
                    disabled={saving}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    onClick={saveBetCode}
                    disabled={saving}
                    className="h-8 gap-1 shrink-0"
                  >
                    <Save className="w-3 h-3" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
                {saveMsg && (
                  <p className={`text-[10px] ${saveMsg.kind === "ok" ? "text-neon-green" : "text-neon-red"}`}>
                    {saveMsg.text}
                  </p>
                )}
              </div>
            </div>

            {/* 10-step pipeline timeline */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                10-Step Pipeline
              </h3>
              <div className="space-y-1.5">
                {steps.map((s, i) => (
                  <div key={s.num} className="flex items-center gap-2">
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`w-7 h-7 rounded-full border-2 ${stepColor(
                          s.status,
                        )} flex items-center justify-center text-[10px] font-bold`}
                      >
                        {s.num}
                      </div>
                      {i < steps.length - 1 && (
                        <div className="absolute top-7 w-0.5 h-3 bg-border/40" />
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-between gap-2 pb-3">
                      <div className="flex items-center gap-2">
                        {s.icon}
                        <span className="text-xs font-medium">{s.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[60%] text-right">
                        {s.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Numerical inputs */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Database className="w-3 h-3" />
                Numerical Inputs
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Average rate</span>
                  <p className="font-mono text-neon-green">
                    {prediction.average_rate.toFixed(3)}
                  </p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Bookmaker line</span>
                  <p className="font-mono text-neon-cyan">
                    {prediction.bookmaker_line ?? "—"}
                  </p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Above line</span>
                  <p className="font-mono">{prediction.matches_above}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Below line</span>
                  <p className="font-mono">{prediction.matches_below}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Increment test</span>
                  <p className="font-mono">{prediction.increment_test}</p>
                </div>
                <div className="bg-background/50 rounded p-2 border border-border/40">
                  <span className="text-muted-foreground">Decrement test</span>
                  <p className="font-mono">{prediction.decrement_test}</p>
                </div>
              </div>
            </div>

            {/* H2H totals array */}
            {prediction.h2h_totals.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  H2H Totals ({prediction.h2h_totals.length} values)
                </h3>
                <div className="bg-background/50 rounded p-2 border border-border/40 max-h-32 overflow-y-auto">
                  <p className="text-[11px] font-mono text-muted-foreground break-all">
                    [{prediction.h2h_totals.join(", ")}]
                  </p>
                </div>
              </div>
            )}

            {/* Rate values array */}
            {prediction.rate_values.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  Rate Values ({prediction.rate_values.length} values)
                </h3>
                <div className="bg-background/50 rounded p-2 border border-border/40 max-h-32 overflow-y-auto">
                  <p className="text-[11px] font-mono text-muted-foreground break-all">
                    [{prediction.rate_values.join(", ")}]
                  </p>
                </div>
              </div>
            )}

            {/* Validation errors */}
            {prediction.validation_errors.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Validation Errors
                </h3>
                <div className="bg-destructive/5 border border-destructive/30 rounded p-2 space-y-1">
                  {prediction.validation_errors.map((e, i) => (
                    <p key={i} className="text-[11px] font-mono text-destructive">
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Raw JSON
              </h3>
              <pre className="bg-background/50 rounded p-2 border border-border/40 text-[10px] font-mono overflow-auto max-h-96 text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(prediction, null, 2)}
              </pre>
            </div>
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
